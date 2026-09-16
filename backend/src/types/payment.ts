export type PaymentProviderId = 'local_bank' | 'paypal';

export type PaymentIntentStatus =
  | 'processing'        // handed to the provider, awaiting a webhook
  | 'requires_action'   // PayPal: the customer must visit approvalUrl
  | 'succeeded'
  | 'failed'
  | 'canceled'
  | 'expired';

export type PaymentFailureCode =
  | 'card_declined'
  | 'insufficient_funds'
  | 'expired_card'
  | 'incorrect_cvc'
  | 'invalid_card_number'
  | 'processing_error'
  | 'payer_declined';

export interface CardMethodDetails {
  method: 'local_bank';
  last4: string;
  brand: 'visa' | 'mastercard' | 'amex' | 'unknown';
  expMonth: number;
  expYear: number;
  holderName: string;
}

export interface PayPalMethodDetails {
  method: 'paypal';
  payerEmail: string;
  payerId: string | null;      // unknown until the customer approves
  approvalUrl: string | null;  // non-null only while requires_action
}

// Discriminated union rather than a flat optional bag: makes illegal
// combinations (e.g. a card intent with an approvalUrl) unrepresentable,
// and maps 1:1 onto the GraphQL PaymentMethodDetails union.
export type PaymentMethodDetails = CardMethodDetails | PayPalMethodDetails;

export interface ExternalRef {
  provider: PaymentProviderId;
  id: string;
}

export const externalRefKey = (ref: ExternalRef): string => `${ref.provider}:${ref.id}`;

export interface PaymentIntentRecord {
  id: string;
  orderId: string;
  provider: PaymentProviderId;
  status: PaymentIntentStatus;

  amount: number; // snapshotted from the order's price lock, never recomputed

  methodDetails: PaymentMethodDetails;
  externalRef: ExternalRef | null;

  failureCode: PaymentFailureCode | null;
  failureMessage: string | null;
  idempotencyKey: string | null;
  needsReconciliation: boolean; // money moved but we didn't credit it -> refund owed

  createdAt: number;
  updatedAt: number;
  lastEventOccurredAt: number; // provider's clock, guards against out-of-order webhooks
}

export interface IdempotencyRecord {
  scopedKey: string;           // `${userId}:${idempotencyKey}`
  requestFingerprint: string;  // HMAC of the canonicalized request, never the raw PAN
  intentId: string | null;     // null while the request is still in flight
  createdAt: number;
}
