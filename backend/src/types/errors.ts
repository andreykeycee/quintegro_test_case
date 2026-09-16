export type ErrorCode =
  | 'ORDER_NOT_FOUND'
  | 'ORDER_ALREADY_PAID'
  | 'CHECKOUT_NOT_STARTED'
  | 'ORDER_LOCKED'
  | 'PAYMENT_IN_PROGRESS'
  | 'INVALID_CHECKOUT_AMOUNT'
  | 'IDEMPOTENCY_KEY_REUSE'
  | 'IDEMPOTENCY_REQUEST_IN_PROGRESS'
  | 'UNKNOWN_PROVIDER'
  | 'CONFIRM_NOT_SUPPORTED'
  | 'INTENT_NOT_FOUND'
  | 'AUTHENTICATION_REQUIRED';

export class AppError extends Error {
  constructor(public code: ErrorCode, message: string) {
    super(message);
    this.name = 'AppError';
  }
}
