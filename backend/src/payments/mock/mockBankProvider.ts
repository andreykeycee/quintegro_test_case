import crypto from 'crypto';
import {
  PaymentProviderAdapter,
  CreatePaymentRequest,
  CreatePaymentResult,
  ConfirmPaymentRequest,
  ParsedWebhookEvent,
  WebhookRequest,
} from '../providerAdapter';
import { CardMethodDetails } from '../../types/payment';
import { PaymentsConfig } from '../../config/payments';
import { resolveCardVerdict, detectBrand } from './testValues';
import { MockWebhookDispatcher } from './mockWebhookDispatcher';
import { verify } from '../signature';

export class MockBankProvider implements PaymentProviderAdapter {
  readonly id = 'local_bank' as const;
  readonly supports = { redirect: false };

  constructor(private cfg: PaymentsConfig, private dispatcher: MockWebhookDispatcher) {}

  async createPayment(req: CreatePaymentRequest): Promise<CreatePaymentResult> {
    if (req.credentials.method !== 'local_bank') {
      throw new Error('MockBankProvider received non-card credentials');
    }
    const c = req.credentials;
    const digits = c.cardNumber.replace(/\D/g, '');

    const details: CardMethodDetails = {
      method: 'local_bank',
      last4: digits.slice(-4),
      brand: detectBrand(digits),
      expMonth: c.expMonth,
      expYear: c.expYear,
      holderName: c.holderName,
    };

    const verdict = resolveCardVerdict({ cardNumber: digits, cvv: c.cvv, expMonth: c.expMonth, expYear: c.expYear });
    const externalId = `bank_txn_${crypto.randomBytes(6).toString('hex')}`;

    if (verdict.kind === 'sync_decline') {
      return { outcome: 'failed', externalId: null, code: verdict.code, message: verdict.message, details };
    }

    if (verdict.kind === 'async_pending') {
      // Deliberately never scheduled - exercises the payment-pause cap.
      return { outcome: 'processing', externalId, details };
    }

    this.dispatcher.schedule({
      provider: 'local_bank',
      intentId: req.intentId,
      externalId,
      amount: req.amount,
      type: verdict.kind === 'async_approve' ? 'payment.succeeded' : 'payment.failed',
      failure: verdict.kind === 'async_decline' ? { code: verdict.code, message: verdict.message } : undefined,
      delayMs: verdict.kind === 'async_approve' && verdict.delayMs ? verdict.delayMs : this.cfg.mockWebhookDelayMs,
    });

    return { outcome: 'processing', externalId, details };
  }

  async cancel(req: ConfirmPaymentRequest): Promise<void> {
    this.dispatcher.cancelFor(req.intentId);
  }

  parseWebhook(req: WebhookRequest): ParsedWebhookEvent | null {
    if (!verify(req.rawBody, req.headers['x-mock-signature'], this.cfg.paymentsSecret)) return null;

    let body: any;
    try {
      body = JSON.parse(req.rawBody);
    } catch {
      return null;
    }

    return {
      provider: 'local_bank',
      eventId: body.eventId,
      type: body.type,
      occurredAt: body.occurredAt,
      intentId: body.intentId ?? null,
      externalId: body.externalId,
      amount: body.amount ?? null,
      failure: body.failure,
    };
  }
}
