import crypto from 'crypto';
import { OrderRecord } from '../types/entities';
import { PaymentIntentRecord, PaymentIntentStatus, PaymentProviderId, IdempotencyRecord } from '../types/payment';
import { AppError } from '../types/errors';
import {
  IOrderRepository,
  IPaymentIntentRepository,
  IWebhookEventRepository,
  IIdempotencyRepository,
} from '../repositories/interfaces';
import { PaymentProviderRegistry } from '../payments/registry';
import { OrderExpiryPolicy } from './orderExpiryPolicy';
import { canTransition, isTerminal } from '../payments/stateMachine';
import { PaymentCredentials, WebhookRequest } from '../payments/providerAdapter';
import { PaymentsConfig } from '../config/payments';

export interface WebhookResult {
  status: number;
  body: Record<string, unknown>;
}

// PaymentService talks to the order repository directly rather than through
// OrderService, so OrderService (which depends on this via OrderExpiryPolicy
// indirectly) and PaymentService never form a cycle.
export class PaymentService {
  constructor(
    private orderRepository: IOrderRepository,
    private paymentIntentRepository: IPaymentIntentRepository,
    private webhookEventRepository: IWebhookEventRepository,
    private idempotencyRepository: IIdempotencyRepository,
    private providerRegistry: PaymentProviderRegistry,
    private expiryPolicy: OrderExpiryPolicy,
    private cfg: PaymentsConfig,
  ) {}

  getLatestIntent(orderId: string): PaymentIntentRecord | null {
    return this.latestIntentFor(orderId) ?? null;
  }

  listIntents(orderId: string): PaymentIntentRecord[] {
    return this.paymentIntentRepository.findByOrderId(orderId);
  }

  async createIntent(
    orderId: string,
    userId: string,
    provider: PaymentProviderId,
    credentials: PaymentCredentials,
    idempotencyKey: string,
  ): Promise<PaymentIntentRecord> {
    const order = this.orderRepository.findById(orderId);
    if (!order || order.userId !== userId) {
      throw new AppError('ORDER_NOT_FOUND', 'Order not found');
    }

    const reconciled = this.expiryPolicy.reconcile(order);
    if (reconciled.status === 'finished') throw new AppError('ORDER_ALREADY_PAID', 'Order is already paid');
    if (reconciled.status !== 'submited') throw new AppError('CHECKOUT_NOT_STARTED', 'Order is not in checkout');
    if (!reconciled.checkoutAmount || reconciled.checkoutAmount <= 0) {
      throw new AppError('INVALID_CHECKOUT_AMOUNT', 'Order has no valid price lock');
    }

    const scopedKey = `${userId}:${idempotencyKey}`;
    const fingerprint = this.fingerprint(orderId, provider, reconciled.checkoutAmount, credentials);
    const existing = this.idempotencyRepository.find(scopedKey);
    if (existing) {
      if (existing.requestFingerprint !== fingerprint) {
        throw new AppError('IDEMPOTENCY_KEY_REUSE', 'Idempotency key reused with different parameters');
      }
      if (existing.intentId === null) {
        throw new AppError('IDEMPOTENCY_REQUEST_IN_PROGRESS', 'A request with this idempotency key is already in progress');
      }
      const replay = this.paymentIntentRepository.findById(existing.intentId);
      if (replay) return replay;
    }

    const reservation: IdempotencyRecord = { scopedKey, requestFingerprint: fingerprint, intentId: null, createdAt: Date.now() };
    if (this.idempotencyRepository.reserve(reservation) === 'exists') {
      throw new AppError('IDEMPOTENCY_REQUEST_IN_PROGRESS', 'A request with this idempotency key is already in progress');
    }

    try {
      const latest = this.latestIntentFor(orderId);
      if (latest) {
        if (latest.status === 'succeeded') throw new AppError('ORDER_ALREADY_PAID', 'Order is already paid');
        if (latest.status === 'processing') throw new AppError('PAYMENT_IN_PROGRESS', 'A payment is already being processed for this order');
        if (latest.status === 'requires_action') {
          // Abandoned redirect (e.g. a closed PayPal tab) - supersede it so the user isn't wedged.
          if (latest.externalRef) {
            await this.providerRegistry.get(latest.provider).cancel?.({ intentId: latest.id, externalRef: latest.externalRef, amount: latest.amount });
          }
          this.applyTransition(latest, 'canceled');
        }
      }

      const intentId = `pi_${crypto.randomBytes(8).toString('hex')}`;
      const adapter = this.providerRegistry.get(provider);
      const result = await adapter.createPayment({
        intentId,
        orderId,
        amount: reconciled.checkoutAmount,
        returnUrl: `${this.cfg.publicAppBaseUrl}/checkout/${orderId}`,
        cancelUrl: `${this.cfg.publicAppBaseUrl}/checkout/${orderId}`,
        credentials,
      });

      const now = Date.now();
      const status: PaymentIntentStatus =
        result.outcome === 'succeeded' ? 'succeeded' :
        result.outcome === 'failed' ? 'failed' :
        result.outcome === 'requires_action' ? 'requires_action' : 'processing';

      // requires_action carries its redirect target as a separate top-level
      // field on the adapter result - fold it into the persisted details so
      // the frontend can read it back from the intent later (e.g. on refresh).
      const methodDetails = result.outcome === 'requires_action' && result.details.method === 'paypal'
        ? { ...result.details, approvalUrl: result.redirectUrl }
        : result.details;

      const intent: PaymentIntentRecord = {
        id: intentId,
        orderId,
        provider,
        status,
        amount: reconciled.checkoutAmount,
        methodDetails,
        externalRef: result.externalId !== null ? { provider, id: result.externalId } : null,
        failureCode: result.outcome === 'failed' ? result.code : null,
        failureMessage: result.outcome === 'failed' ? result.message : null,
        idempotencyKey,
        needsReconciliation: false,
        createdAt: now,
        updatedAt: now,
        lastEventOccurredAt: now,
      };
      this.paymentIntentRepository.create(intent);
      this.idempotencyRepository.complete(scopedKey, intent.id);

      if (status === 'processing' || status === 'requires_action') {
        this.pauseOrder(reconciled);
      } else if (status === 'failed') {
        this.resumeOrderAfterFailure(reconciled);
      } else if (status === 'succeeded') {
        this.finishOrder(reconciled);
      }

      return intent;
    } catch (err) {
      this.idempotencyRepository.release(scopedKey);
      throw err;
    }
  }

  async confirmIntent(orderId: string, userId: string, intentId: string): Promise<PaymentIntentRecord> {
    const order = this.orderRepository.findById(orderId);
    if (!order || order.userId !== userId) throw new AppError('ORDER_NOT_FOUND', 'Order not found');
    this.expiryPolicy.reconcile(order);

    const intent = this.paymentIntentRepository.findById(intentId);
    if (!intent || intent.orderId !== orderId) throw new AppError('INTENT_NOT_FOUND', 'Payment intent not found');
    if (intent.status !== 'requires_action') return intent; // idempotent no-op

    const adapter = this.providerRegistry.get(intent.provider);
    if (!adapter.confirm) throw new AppError('CONFIRM_NOT_SUPPORTED', 'This provider does not support confirmation');
    if (!intent.externalRef) throw new AppError('INTENT_NOT_FOUND', 'Payment intent has no provider reference');

    const result = await adapter.confirm({ intentId: intent.id, externalRef: intent.externalRef, amount: intent.amount });
    const status: PaymentIntentStatus = result.outcome === 'succeeded' ? 'succeeded' : result.outcome === 'failed' ? 'failed' : 'processing';

    const updated = this.applyTransition(intent, status, {
      failureCode: result.outcome === 'failed' ? result.code : null,
      failureMessage: result.outcome === 'failed' ? result.message : null,
    });

    const currentOrder = this.orderRepository.findById(orderId);
    if (currentOrder) {
      if (status === 'succeeded') this.finishOrder(currentOrder);
      else if (status === 'failed') this.resumeOrderAfterFailure(currentOrder);
      // 'processing' -> stays paused, nothing to do.
    }

    return updated;
  }

  async cancelIntent(orderId: string, userId: string, intentId: string): Promise<PaymentIntentRecord> {
    const order = this.orderRepository.findById(orderId);
    if (!order || order.userId !== userId) throw new AppError('ORDER_NOT_FOUND', 'Order not found');

    const intent = this.paymentIntentRepository.findById(intentId);
    if (!intent || intent.orderId !== orderId) throw new AppError('INTENT_NOT_FOUND', 'Payment intent not found');
    if (isTerminal(intent.status)) return intent;

    const adapter = this.providerRegistry.get(intent.provider);
    if (intent.externalRef) {
      await adapter.cancel?.({ intentId: intent.id, externalRef: intent.externalRef, amount: intent.amount });
    }
    const updated = this.applyTransition(intent, 'canceled');
    this.resumeOrderAfterFailure(order);
    return updated;
  }

  async handleWebhook(provider: PaymentProviderId, req: WebhookRequest): Promise<WebhookResult> {
    let adapter;
    try {
      adapter = this.providerRegistry.get(provider);
    } catch {
      return { status: 404, body: { error: 'Unknown provider' } };
    }

    const event = adapter.parseWebhook(req);
    if (!event) return { status: 400, body: { error: 'Invalid webhook signature' } };

    if (this.webhookEventRepository.wasProcessed(event.provider, event.eventId)) {
      return { status: 200, body: { received: true, duplicate: true } };
    }

    const intent =
      (event.intentId ? this.paymentIntentRepository.findById(event.intentId) : undefined) ??
      this.paymentIntentRepository.findByExternalRef({ provider: event.provider, id: event.externalId });

    if (!intent) {
      return { status: 404, body: { error: 'Payment intent not found' } };
    }

    this.webhookEventRepository.markProcessed(event.provider, event.eventId);

    const order = this.orderRepository.findById(intent.orderId);
    if (order) this.expiryPolicy.reconcile(order);

    const currentIntent = this.paymentIntentRepository.findById(intent.id)!;

    if (event.occurredAt < currentIntent.lastEventOccurredAt) {
      return { status: 200, body: { received: true, applied: false, reason: 'stale' } };
    }

    const targetStatus: PaymentIntentStatus | null =
      event.type === 'payment.succeeded' ? 'succeeded' :
      event.type === 'payment.failed' ? 'failed' :
      event.type === 'payment.canceled' ? 'canceled' : null;

    if (!targetStatus) {
      return { status: 200, body: { received: true, applied: false, reason: 'ignored_event_type' } };
    }

    const transition = canTransition(currentIntent.status, targetStatus);
    if (!transition.ok) {
      if (targetStatus === 'succeeded' && transition.reason === 'terminal_state') {
        // Money moved for an intent we already released - this is exactly
        // where adapter.refund() would go. Refunds are out of scope, so we
        // flag it loudly instead of pretending it can't happen.
        this.paymentIntentRepository.update({ ...currentIntent, needsReconciliation: true });
        console.error(`[payments] late success on ${currentIntent.status} intent ${currentIntent.id} - refund required`);
      }
      return { status: 200, body: { received: true, applied: false, reason: transition.reason } };
    }

    if (event.amount != null && event.amount !== currentIntent.amount) {
      this.paymentIntentRepository.update({ ...currentIntent, needsReconciliation: true, lastEventOccurredAt: event.occurredAt });
      console.error(`[payments] amount mismatch on intent ${currentIntent.id}`);
      return { status: 200, body: { received: true, applied: false, reason: 'amount_mismatch' } };
    }

    const updated: PaymentIntentRecord = {
      ...currentIntent,
      status: targetStatus,
      failureCode: event.failure?.code ?? null,
      failureMessage: event.failure?.message ?? null,
      lastEventOccurredAt: event.occurredAt,
      updatedAt: Date.now(),
    };
    this.paymentIntentRepository.update(updated);

    if (order) {
      if (targetStatus === 'succeeded') this.finishOrder(order);
      else if (targetStatus === 'failed' || targetStatus === 'canceled') this.resumeOrderAfterFailure(order);
    }

    return { status: 200, body: { received: true, applied: true } };
  }

  private latestIntentFor(orderId: string): PaymentIntentRecord | undefined {
    const all = this.paymentIntentRepository.findByOrderId(orderId);
    return all.length ? all.reduce((a, b) => (a.createdAt > b.createdAt ? a : b)) : undefined;
  }

  // The only function that assigns intent.status outside the webhook path.
  private applyTransition(intent: PaymentIntentRecord, to: PaymentIntentStatus, patch: Partial<PaymentIntentRecord> = {}): PaymentIntentRecord {
    const updated: PaymentIntentRecord = { ...intent, ...patch, status: to, updatedAt: Date.now(), lastEventOccurredAt: Date.now() };
    this.paymentIntentRepository.update(updated);
    return updated;
  }

  private pauseOrder(order: OrderRecord): void {
    if (order.checkoutPausedAt !== undefined) return;
    this.orderRepository.update({ ...order, checkoutPausedAt: Date.now() });
  }

  private finishOrder(order: OrderRecord): void {
    this.orderRepository.update({
      ...order,
      status: 'finished',
      checkoutExpiresAt: undefined,
      checkoutAmount: undefined,
      checkoutPausedAt: undefined,
    });
  }

  // Reopens the order for editing and gives back exactly the time remaining
  // when the payment attempt started, rather than a fresh window - so
  // repeatedly failing can't be used to extend checkout indefinitely.
  private resumeOrderAfterFailure(order: OrderRecord): void {
    const now = Date.now();
    const pausedAt = order.checkoutPausedAt ?? now;
    const extendedExpiresAt = order.checkoutExpiresAt !== undefined ? order.checkoutExpiresAt + (now - pausedAt) : undefined;
    this.orderRepository.update({
      ...order,
      status: order.status === 'submited' ? 'created' : order.status,
      checkoutExpiresAt: extendedExpiresAt,
      checkoutPausedAt: undefined,
    });
  }

  // Never hashes the raw PAN: the PAN space under a Luhn constraint is
  // brute-forceable offline from a leaked hash, so only last4 + expiry go in.
  private fingerprint(orderId: string, provider: PaymentProviderId, amount: number, credentials: PaymentCredentials): string {
    const material = credentials.method === 'local_bank'
      ? { orderId, provider, amount, last4: credentials.cardNumber.replace(/\D/g, '').slice(-4), expMonth: credentials.expMonth, expYear: credentials.expYear }
      : { orderId, provider, amount, payerEmail: credentials.payerEmail };
    return crypto.createHmac('sha256', this.cfg.paymentsSecret).update(JSON.stringify(material)).digest('hex');
  }
}
