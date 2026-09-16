export interface PaymentsConfig {
  checkoutTtlMs: number;        // CHECKOUT_TTL_MS - how long a submitted order holds its price lock
  paymentPauseMaxMs: number;    // PAYMENT_PAUSE_MAX_MS - cap on freezing the clock for an in-flight payment
  mockWebhookDelayMs: number;   // MOCK_WEBHOOK_DELAY_MS - default delay before the mock provider "calls back"
  paymentsSecret: string;       // PAYMENTS_MOCK_SECRET - HMAC key for mock webhook signing + idempotency fingerprints
  internalWebhookUrl: string;   // INTERNAL_WEBHOOK_URL - base URL the mock dispatcher POSTs webhooks to
  publicApiBaseUrl: string;     // PUBLIC_API_BASE_URL - absolute backend URL, used to build the PayPal approval link
  publicAppBaseUrl: string;     // PUBLIC_APP_BASE_URL - absolute frontend URL, used for PayPal return/cancel links
}

export function loadPaymentsConfig(): PaymentsConfig {
  return {
    checkoutTtlMs: Number(process.env.CHECKOUT_TTL_MS) || 600_000,
    paymentPauseMaxMs: Number(process.env.PAYMENT_PAUSE_MAX_MS) || 300_000,
    mockWebhookDelayMs: Number(process.env.MOCK_WEBHOOK_DELAY_MS) || 2_500,
    paymentsSecret: process.env.PAYMENTS_MOCK_SECRET || 'dev-mock-payments-secret-change-in-production',
    internalWebhookUrl: process.env.INTERNAL_WEBHOOK_URL || 'http://localhost:3000/api/payments/webhook',
    publicApiBaseUrl: process.env.PUBLIC_API_BASE_URL || 'http://localhost:3000',
    publicAppBaseUrl: process.env.PUBLIC_APP_BASE_URL || 'http://localhost:3001/runtime',
  };
}
