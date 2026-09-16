import {
  PaymentProviderId,
  PaymentMethodDetails,
  PaymentFailureCode,
  ExternalRef,
} from '../types/payment';

export interface WebhookRequest {
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
}

export type PaymentCredentials =
  | { method: 'local_bank'; cardNumber: string; cvv: string; holderName: string; expMonth: number; expYear: number }
  | { method: 'paypal'; payerEmail: string };

export interface CreatePaymentRequest {
  intentId: string;      // OUR id - must be echoed back as provider metadata so webhooks resolve without a reverse lookup
  orderId: string;
  amount: number;        // the order's price-locked amount, never client-supplied
  returnUrl: string;     // where the customer lands after approving a redirect flow
  cancelUrl: string;
  credentials: PaymentCredentials;
}

export type CreatePaymentResult =
  | { outcome: 'processing'; externalId: string; details: PaymentMethodDetails }
  | { outcome: 'requires_action'; externalId: string; redirectUrl: string; details: PaymentMethodDetails }
  | { outcome: 'succeeded'; externalId: string; details: PaymentMethodDetails }
  | { outcome: 'failed'; externalId: string | null; code: PaymentFailureCode; message: string; details: PaymentMethodDetails };

export interface ConfirmPaymentRequest {
  intentId: string;
  externalRef: ExternalRef;
  amount: number;
}

export interface ParsedWebhookEvent {
  provider: PaymentProviderId;
  eventId: string;
  type: 'payment.succeeded' | 'payment.failed' | 'payment.canceled';
  occurredAt: number;
  intentId: string | null;   // preferred lookup, sent back as metadata
  externalId: string;        // fallback lookup
  amount: number | null;     // verified against the intent before it's ever applied
  failure?: { code: PaymentFailureCode; message: string };
}

export interface PaymentProviderAdapter {
  readonly id: PaymentProviderId;
  readonly supports: { redirect: boolean };

  createPayment(req: CreatePaymentRequest): Promise<CreatePaymentResult>;

  /** Second leg for redirect-style providers. Card providers don't implement it. */
  confirm?(req: ConfirmPaymentRequest): Promise<CreatePaymentResult>;

  /** Best-effort void, e.g. on checkout expiry or supersession. */
  cancel?(req: ConfirmPaymentRequest): Promise<void>;

  /** Parses AND verifies in one call - there is exactly one call site, so there is no way to forget to verify. */
  parseWebhook(req: WebhookRequest): ParsedWebhookEvent | null;
}
