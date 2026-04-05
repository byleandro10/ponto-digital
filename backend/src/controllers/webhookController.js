const prisma = require('../config/database');
const billingService = require('../services/billingService');
const stripeService = require('../services/stripeService');

async function markWebhookEvent(eventId, data) {
  await prisma.webhookEvent.update({
    where: { eventId },
    data,
  });
}

async function reserveWebhookEvent({ eventId, eventType, requestId }) {
  try {
    await prisma.webhookEvent.create({
      data: {
        provider: 'stripe',
        eventId,
        eventType,
        requestId: requestId || null,
        status: 'PROCESSING',
      },
    });

    return { isDuplicate: false };
  } catch (error) {
    if (error.code === 'P2002') {
      return { isDuplicate: true };
    }

    throw error;
  }
}

async function processStripeEvent(event) {
  switch (event.type) {
    case 'checkout.session.completed':
      await billingService.handleCheckoutSessionCompleted(event.data.object);
      return;
    case 'customer.created':
      await billingService.handleStripeCustomerEvent(event.data.object);
      return;
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await billingService.handleStripeSubscriptionEvent(event.data.object);
      return;
    case 'invoice.finalized':
    case 'invoice.paid':
    case 'invoice.payment_failed':
      await billingService.handleStripeInvoiceEvent(event.data.object, event.type);
      return;
    case 'payment_method.attached':
      await billingService.handleStripePaymentMethodAttached(event.data.object);
      return;
    default:
      console.log('[Webhook] Evento Stripe ignorado:', event.type);
  }
}

async function handleStripeWebhook(req, res) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[Webhook] STRIPE_WEBHOOK_SECRET nao configurado.');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const signature = req.headers['stripe-signature'];
  if (!signature) {
    return res.status(400).json({ error: 'Missing Stripe signature' });
  }

  let event;
  try {
    event = stripeService.constructWebhookEvent(req.body, signature, secret);
  } catch (error) {
    console.error('[Webhook] Assinatura invalida do webhook Stripe:', {
      requestId: req.requestId,
      message: error.message,
    });
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  const reservation = await reserveWebhookEvent({
    eventId: event.id,
    eventType: event.type,
    requestId: req.requestId,
  });

  if (reservation.isDuplicate) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    await processStripeEvent(event);

    await markWebhookEvent(event.id, {
      status: 'PROCESSED',
      processedAt: new Date(),
      errorMessage: null,
    });

    return res.status(200).json({ received: true });
  } catch (error) {
    await markWebhookEvent(event.id, {
      status: 'FAILED',
      errorMessage: error.message,
    });

    console.error('[Webhook] Erro ao processar webhook da Stripe:', {
      requestId: req.requestId,
      eventId: event.id,
      eventType: event.type,
      message: error.message,
    });

    return res.status(500).json({ error: 'Webhook processing failed' });
  }
}

module.exports = { handleStripeWebhook };
