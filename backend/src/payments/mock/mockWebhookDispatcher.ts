import crypto from 'crypto';
import { PaymentProviderId, PaymentFailureCode } from '../../types/payment';
import { PaymentsConfig } from '../../config/payments';
import { sign } from '../signature';
import { Resettable } from '../../repositories/interfaces';

export interface ScheduledWebhook {
  provider: PaymentProviderId;
  intentId: string;
  externalId: string;
  amount: number;
  type: 'payment.succeeded' | 'payment.failed';
  failure?: { code: PaymentFailureCode; message: string };
  delayMs: number;
}

const RETRY_BACKOFF_MS = [1_000, 3_000, 9_000];

// Delivers over real HTTP, not an in-process call - that's the point: it
// exercises body parsing, signature verification, the express route and the
// shared-repository wiring, exactly like a real provider's webhook would.
export class MockWebhookDispatcher implements Resettable {
  private timers = new Map<string, NodeJS.Timeout>();

  constructor(private cfg: PaymentsConfig) {}

  schedule(webhook: ScheduledWebhook): void {
    this.cancelFor(webhook.intentId);
    const timer = setTimeout(() => this.deliver(webhook), webhook.delayMs);
    timer.unref();
    this.timers.set(webhook.intentId, timer);
  }

  cancelFor(intentId: string): void {
    const timer = this.timers.get(intentId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(intentId);
    }
  }

  reset(): void {
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();
  }

  private async deliver(webhook: ScheduledWebhook, attempt = 1): Promise<void> {
    this.timers.delete(webhook.intentId);

    const body = JSON.stringify({
      eventId: `evt_${crypto.randomBytes(8).toString('hex')}`,
      type: webhook.type,
      occurredAt: Date.now(),
      intentId: webhook.intentId,
      externalId: webhook.externalId,
      amount: webhook.amount,
      failure: webhook.failure,
    });
    const signature = sign(body, this.cfg.paymentsSecret);

    const retry = () => {
      if (attempt >= RETRY_BACKOFF_MS.length) return;
      const timer = setTimeout(() => this.deliver(webhook, attempt + 1), RETRY_BACKOFF_MS[attempt - 1]);
      timer.unref();
    };

    try {
      const res = await fetch(`${this.cfg.internalWebhookUrl}/${webhook.provider}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-mock-signature': signature },
        body,
      });
      if (!res.ok) retry();
    } catch {
      retry();
    }
  }
}
