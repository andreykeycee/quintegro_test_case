import { Request, Response } from 'express';
import { PaymentService } from '../services/paymentService';
import { PaymentProviderRegistry } from '../payments/registry';
import { MockPayPalProvider } from '../payments/mock/mockPayPalProvider';
import { PaymentProviderId } from '../types/payment';

export class PaymentWebhookController {
  constructor(
    private paymentService: PaymentService,
    private providerRegistry: PaymentProviderRegistry,
    private mockPayPalProvider: MockPayPalProvider
  ) {}

  // No JWT check here on purpose - a bank has no user token. Authentication
  // is the HMAC signature, verified inside adapter.parseWebhook.
  async handleWebhook(req: Request, res: Response) {
    const provider = req.params.provider as PaymentProviderId;
    try {
      this.providerRegistry.get(provider);
    } catch {
      return res.status(404).json({ error: 'Unknown provider' });
    }

    const rawBody = (req as any).rawBody as string | undefined;
    if (!rawBody) {
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }

    const result = await this.paymentService.handleWebhook(provider, {
      headers: req.headers as Record<string, string | string[] | undefined>,
      rawBody,
    });
    return res.status(result.status).json(result.body);
  }

  async renderMockPayPalPage(req: Request, res: Response) {
    const session = this.mockPayPalProvider.getSession(req.params.token);
    if (!session || session.decided) {
      return res.status(404).send('Unknown or expired PayPal session');
    }

    const autoCancel = session.payerEmail === 'cancel@paypal.test';
    res.set('content-type', 'text/html').send(`<!doctype html>
<html><head><title>Mock PayPal</title><style>
body{font-family:system-ui,sans-serif;max-width:420px;margin:80px auto;text-align:center}
button{font-size:16px;padding:12px 24px;margin:8px;border-radius:6px;border:none;cursor:pointer}
.approve{background:#0070ba;color:#fff}.cancel{background:#eee;color:#333}
</style></head><body>
<h2>Mock PayPal Checkout</h2>
<p>Pay <strong>$${session.amount.toFixed(2)}</strong> as <strong>${session.payerEmail}</strong></p>
<form method="post" id="approveForm" action="/api/payments/mock/paypal/${session.token}">
  <input type="hidden" name="decision" value="approve">
  <button class="approve" type="submit">Approve payment</button>
</form>
<form method="post" id="cancelForm" action="/api/payments/mock/paypal/${session.token}">
  <input type="hidden" name="decision" value="cancel">
  <button class="cancel" type="submit">Cancel</button>
</form>
${autoCancel ? '<script>document.getElementById("cancelForm").submit();</script>' : ''}
</body></html>`);
  }

  async handleMockPayPalDecision(req: Request, res: Response) {
    const decision = req.body?.decision === 'cancel' ? 'cancel' : 'approve';
    const result = this.mockPayPalProvider.decide(req.params.token, decision);
    if (!result) {
      return res.status(404).send('Unknown or already-decided PayPal session');
    }
    return res.redirect(result.redirectTo);
  }
}
