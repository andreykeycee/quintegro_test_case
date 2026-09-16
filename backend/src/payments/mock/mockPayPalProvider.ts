import crypto from 'crypto';
import {
  PaymentProviderAdapter,
  CreatePaymentRequest,
  CreatePaymentResult,
  ConfirmPaymentRequest,
  ParsedWebhookEvent,
  WebhookRequest,
} from '../providerAdapter';
import { PayPalMethodDetails } from '../../types/payment';
import { PaymentsConfig } from '../../config/payments';
import { resolvePayPalVerdict } from './testValues';
import { MockWebhookDispatcher } from './mockWebhookDispatcher';
import { verify } from '../signature';

export interface PayPalApprovalSession {
  token: string;
  intentId: string;
  externalId: string;
  amount: number;
  payerEmail: string;
  returnUrl: string;
  cancelUrl: string;
  decided: boolean;
}

// The approval page this drives is served by OUR backend, deliberately: a
// real redirect leaves your origin entirely, so the mock should too. Swapping
// in live PayPal later only changes the URL createPayment returns.
export class MockPayPalProvider implements PaymentProviderAdapter {
  readonly id = 'paypal' as const;
  readonly supports = { redirect: true };

  private sessions = new Map<string, PayPalApprovalSession>();

  constructor(private cfg: PaymentsConfig, private dispatcher: MockWebhookDispatcher) {}

  async createPayment(req: CreatePaymentRequest): Promise<CreatePaymentResult> {
    if (req.credentials.method !== 'paypal') {
      throw new Error('MockPayPalProvider received non-paypal credentials');
    }
    const c = req.credentials;
    const externalId = `PAYPAL-ORDER-${crypto.randomBytes(6).toString('hex')}`;
    const token = crypto.randomBytes(12).toString('hex');

    this.sessions.set(token, {
      token,
      intentId: req.intentId,
      externalId,
      amount: req.amount,
      payerEmail: c.payerEmail,
      returnUrl: req.returnUrl,
      cancelUrl: req.cancelUrl,
      decided: false,
    });

    return {
      outcome: 'requires_action',
      externalId,
      redirectUrl: `${this.cfg.publicApiBaseUrl}/api/payments/mock/paypal/${token}`,
      details: { method: 'paypal', payerEmail: c.payerEmail, payerId: null, approvalUrl: null },
    };
  }

  getSession(token: string): PayPalApprovalSession | undefined {
    return this.sessions.get(token);
  }

  decide(token: string, decision: 'approve' | 'cancel'): { redirectTo: string } | null {
    const session = this.sessions.get(token);
    if (!session || session.decided) return null;
    session.decided = true;

    if (decision === 'cancel') {
      this.dispatcher.cancelFor(session.intentId);
      return { redirectTo: `${session.cancelUrl}?intent=${session.intentId}&paypal=cancel` };
    }
    return { redirectTo: `${session.returnUrl}?intent=${session.intentId}&paypal=return` };
  }

  async confirm(req: ConfirmPaymentRequest): Promise<CreatePaymentResult> {
    const session = [...this.sessions.values()].find(s => s.externalId === req.externalRef.id);
    const emptyDetails: PayPalMethodDetails = { method: 'paypal', payerEmail: '', payerId: null, approvalUrl: null };
    if (!session) {
      return { outcome: 'failed', externalId: req.externalRef.id, code: 'processing_error', message: 'PayPal session not found', details: emptyDetails };
    }

    const verdict = resolvePayPalVerdict(session.payerEmail);
    const payerId = `PAYER-${crypto.randomBytes(4).toString('hex')}`;
    const details: PayPalMethodDetails = { method: 'paypal', payerEmail: session.payerEmail, payerId, approvalUrl: null };

    this.dispatcher.schedule({
      provider: 'paypal',
      intentId: req.intentId,
      externalId: session.externalId,
      amount: req.amount,
      type: verdict.kind === 'approve' ? 'payment.succeeded' : 'payment.failed',
      failure: verdict.kind === 'decline' ? { code: verdict.code, message: verdict.message } : undefined,
      delayMs: this.cfg.mockWebhookDelayMs,
    });

    return { outcome: 'processing', externalId: session.externalId, details };
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
      provider: 'paypal',
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
