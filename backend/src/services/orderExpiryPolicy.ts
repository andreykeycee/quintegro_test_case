import { OrderRecord } from '../types/entities';
import { IOrderRepository, IPaymentIntentRepository } from '../repositories/interfaces';
import { PaymentProviderRegistry } from '../payments/registry';
import { isTerminal } from '../payments/stateMachine';
import { PaymentsConfig } from '../config/payments';

// Lazy evaluation on read rather than a sweeper timer: nothing needs to
// observe expiry (no stock system, no notifications), so expiry only needs
// to be true when someone looks - which is also what makes fast-forwarding
// via CHECKOUT_TTL_MS trivial to test, and avoids a sweeper outliving the
// data it points at across a /reset/orders call.
export class OrderExpiryPolicy {
  constructor(
    private orderRepository: IOrderRepository,
    private paymentIntentRepository: IPaymentIntentRepository,
    private providerRegistry: PaymentProviderRegistry,
    private cfg: PaymentsConfig,
    private now: () => number = Date.now,
  ) {}

  // Frozen while a payment is in flight, capped at PAYMENT_PAUSE_MAX_MS so a
  // provider that never answers can't wedge the order forever.
  remainingMs(order: OrderRecord): number | null {
    if (order.checkoutExpiresAt === undefined) return null;

    if (order.checkoutPausedAt !== undefined) {
      if (this.now() - order.checkoutPausedAt > this.cfg.paymentPauseMaxMs) return 0;
      return Math.max(0, order.checkoutExpiresAt - order.checkoutPausedAt);
    }
    return Math.max(0, order.checkoutExpiresAt - this.now());
  }

  isExpired(order: OrderRecord): boolean {
    const remaining = this.remainingMs(order);
    return remaining !== null && remaining <= 0;
  }

  /** Idempotent. Returns the (possibly updated) order. */
  reconcile(order: OrderRecord): OrderRecord {
    if (!this.isExpired(order)) return order;

    for (const intent of this.paymentIntentRepository.findByOrderId(order.orderId)) {
      if (isTerminal(intent.status)) continue;
      this.paymentIntentRepository.update({ ...intent, status: 'expired', updatedAt: this.now(), lastEventOccurredAt: this.now() });
      if (intent.externalRef) {
        const adapter = this.providerRegistry.get(intent.provider);
        adapter.cancel?.({ intentId: intent.id, externalRef: intent.externalRef, amount: intent.amount }).catch(() => {});
      }
    }

    const updated: OrderRecord = {
      ...order,
      status: order.status === 'submited' ? 'created' : order.status,
      checkoutExpiresAt: undefined,
      checkoutAmount: undefined,
      checkoutPausedAt: undefined,
    };
    this.orderRepository.update(updated);
    return updated;
  }
}
