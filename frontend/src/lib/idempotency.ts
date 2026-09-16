// One key per checkout attempt: reused on a retry after a network blip
// (so a duplicate submit replays instead of double-charging), but
// regenerated whenever the user picks a different method or edits the
// card, so a genuine second attempt gets its own key.
export const newIdempotencyKey = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `idem_${Date.now()}_${Math.random().toString(36).slice(2)}`;
};
