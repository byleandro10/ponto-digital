const billingService = require('../services/billingService');
const stripeService = require('../services/stripeService');

async function handleStripeWebhook(req, res) {
  try {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      console.error('[Webhook] STRIPE_WEBHOOK_SECRET nao configurado.');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    const signature = req.headers['stripe-signature'];
    if (!signature) {
      return res.status(400).json({ error: 'Missing Stripe signature' });
    }

    const event = stripeService.constructWebhookEvent(req.body, signature, secret);

    switch (event.type) {
      case 'invoice.payment_succeeded':
      case 'invoice.payment_failed':
        await billingService.handleStripeInvoiceEvent(event.data.object);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await billingService.handleStripeSubscriptionEvent(event.data.object);
        break;
      default:
        console.log('[Webhook] Evento Stripe ignorado:', event.type);
        break;
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('[Webhook] Erro ao processar webhook da Stripe:', error.message);
    return res.status(400).json({ error: 'Webhook processing failed' });
  }
}

module.exports = { handleStripeWebhook };
