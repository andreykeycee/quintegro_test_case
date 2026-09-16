import { Router } from 'express';
import { PaymentWebhookController } from '../controllers/paymentWebhookController';

export function createPaymentRoutes(controller: PaymentWebhookController): Router {
  const router = Router();

  /**
   * @swagger
   * /payments/webhook/{provider}:
   *   post:
   *     summary: Receive an asynchronous payment status update from a provider
   *     description: Authenticated via an HMAC signature header, not a JWT - a payment provider has no user token.
   *     tags: [Payments]
   *     parameters:
   *       - in: path
   *         name: provider
   *         required: true
   *         schema:
   *           type: string
   *           enum: [local_bank, paypal]
   *     responses:
   *       200:
   *         description: Event processed, or safely ignored as a duplicate/stale/terminal-state event
   *       400:
   *         description: Invalid or missing signature
   *       404:
   *         description: Unknown provider or payment intent
   */
  router.post('/webhook/:provider', (req, res) => controller.handleWebhook(req, res));

  /**
   * @swagger
   * /payments/mock/paypal/{token}:
   *   get:
   *     summary: Mock PayPal approval page (development/testing only)
   *     tags: [Payments]
   *     parameters:
   *       - in: path
   *         name: token
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: HTML approval page
   *       404:
   *         description: Unknown or already-decided session
   */
  router.get('/mock/paypal/:token', (req, res) => controller.renderMockPayPalPage(req, res));

  /**
   * @swagger
   * /payments/mock/paypal/{token}:
   *   post:
   *     summary: Submit the mock PayPal approve/cancel decision
   *     tags: [Payments]
   *     parameters:
   *       - in: path
   *         name: token
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       302:
   *         description: Redirect back to the app's return or cancel URL
   *       404:
   *         description: Unknown or already-decided session
   */
  router.post('/mock/paypal/:token', (req, res) => controller.handleMockPayPalDecision(req, res));

  return router;
}
