import { PaymentFailureCode } from '../../types/payment';

// Every magic value the mocks respond to lives in this one file so it's
// greppable, documentable, and deletable in a single commit when the real
// providers land.

export function luhnValid(digits: string): boolean {
  if (!digits.length) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    const d = parseInt(digits[i], 10);
    if (Number.isNaN(d)) return false;
    let value = d;
    if (shouldDouble) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

export function detectBrand(digits: string): 'visa' | 'mastercard' | 'amex' | 'unknown' {
  if (/^4/.test(digits)) return 'visa';
  if (/^5[1-5]/.test(digits)) return 'mastercard';
  if (/^3[47]/.test(digits)) return 'amex';
  return 'unknown';
}

export interface CardCredentials {
  cardNumber: string; // digits only
  cvv: string;
  expMonth: number;
  expYear: number;
}

export type CardVerdict =
  | { kind: 'sync_decline'; code: PaymentFailureCode; message: string }
  | { kind: 'async_approve'; delayMs?: number }
  | { kind: 'async_decline'; code: PaymentFailureCode; message: string }
  | { kind: 'async_pending' }; // never resolves - exercises the pause cap

/**
 * | Input                          | Outcome                                        |
 * |---------------------------------|-------------------------------------------------|
 * | 4242 4242 4242 4242 (any Luhn)  | succeeds via webhook ~2.5s                       |
 * | ends 0002                       | async card_declined                              |
 * | ends 0341                       | sync fail at create, no webhook ever             |
 * | ends 9995                       | async insufficient_funds                         |
 * | cvv 999                         | async incorrect_cvc                              |
 * | ends 0119                       | succeeds after ~12s (long-pending / pause tests) |
 * | ends 0010                       | stays processing forever (pause-cap test)        |
 * | past expiry / fails Luhn        | sync expired_card / invalid_card_number          |
 */
export function resolveCardVerdict(c: CardCredentials): CardVerdict {
  const now = new Date();
  const expired = c.expYear < now.getFullYear() || (c.expYear === now.getFullYear() && c.expMonth < now.getMonth() + 1);
  if (expired) {
    return { kind: 'sync_decline', code: 'expired_card', message: 'Card has expired' };
  }
  if (!luhnValid(c.cardNumber)) {
    return { kind: 'sync_decline', code: 'invalid_card_number', message: 'Card number failed validation' };
  }

  const last4 = c.cardNumber.slice(-4);

  if (last4 === '0341') {
    return { kind: 'sync_decline', code: 'card_declined', message: 'Card declined' };
  }
  if (last4 === '0002') {
    return { kind: 'async_decline', code: 'card_declined', message: 'Card declined by issuer' };
  }
  if (last4 === '9995') {
    return { kind: 'async_decline', code: 'insufficient_funds', message: 'Insufficient funds' };
  }
  if (c.cvv === '999') {
    return { kind: 'async_decline', code: 'incorrect_cvc', message: 'Incorrect CVC' };
  }
  if (last4 === '0119') {
    return { kind: 'async_approve', delayMs: 12_000 };
  }
  if (last4 === '0010') {
    return { kind: 'async_pending' };
  }
  return { kind: 'async_approve' };
}

export type PayPalVerdict =
  | { kind: 'approve' }
  | { kind: 'decline'; code: PaymentFailureCode; message: string };

/**
 * | Input                     | Outcome                                  |
 * |----------------------------|-------------------------------------------|
 * | buyer@paypal.test          | approve -> succeeded                      |
 * | declined@paypal.test       | approve -> payer_declined                 |
 * | cancel@paypal.test         | approval page defaults to Cancel          |
 */
export function resolvePayPalVerdict(payerEmail: string): PayPalVerdict {
  if (payerEmail === 'declined@paypal.test') {
    return { kind: 'decline', code: 'payer_declined', message: 'Payer declined the payment' };
  }
  return { kind: 'approve' };
}
