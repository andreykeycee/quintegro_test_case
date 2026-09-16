import { PaymentIntentStatus } from '../types/payment';

export const TERMINAL_STATUSES: readonly PaymentIntentStatus[] = ['succeeded', 'failed', 'canceled', 'expired'];

export const isTerminal = (status: PaymentIntentStatus): boolean =>
  TERMINAL_STATUSES.includes(status);

const ALLOWED: Record<PaymentIntentStatus, readonly PaymentIntentStatus[]> = {
  // A real PSP can decide a card needs 3DS after submission (-> requires_action),
  // and requires_action -> processing covers the post-approval capture leg.
  processing: ['requires_action', 'succeeded', 'failed', 'canceled', 'expired'],
  requires_action: ['processing', 'succeeded', 'failed', 'canceled', 'expired'],
  succeeded: [],
  failed: [],
  canceled: [],
  expired: [],
};

export type TransitionRejectionReason = 'terminal_state' | 'illegal_transition' | 'noop';

export type TransitionOutcome =
  | { ok: true }
  | { ok: false; reason: TransitionRejectionReason };

// Returns a rejection reason rather than throwing: the webhook path must
// log-and-200 an out-of-order or duplicate event, not crash on it.
export function canTransition(from: PaymentIntentStatus, to: PaymentIntentStatus): TransitionOutcome {
  if (from === to) return { ok: false, reason: 'noop' };
  if (isTerminal(from)) return { ok: false, reason: 'terminal_state' };
  return ALLOWED[from].includes(to) ? { ok: true } : { ok: false, reason: 'illegal_transition' };
}
