const { stripe, stripeSecretKey } = require('../config/stripe');
const { PLAN_NAMES, PLAN_PRICES } = require('../config/billingConfig');

function assertStripeConfigured() {
  if (!stripe || !stripeSecretKey) {
    throw new Error('STRIPE_SECRET_KEY nao configurada.');
  }
}

function toStripeAmount(planKey) {
  return Math.round(Number(PLAN_PRICES[planKey] || 0) * 100);
}

function getPriceData(planKey) {
  return {
    currency: 'brl',
    unit_amount: toStripeAmount(planKey),
    recurring: { interval: 'month' },
    product_data: {
      name: `Ponto Digital - Plano ${PLAN_NAMES[planKey] || planKey}`,
    },
  };
}

async function createSetupIntent({ metadata = {} } = {}) {
  assertStripeConfigured();
  return stripe.setupIntents.create({
    payment_method_types: ['card'],
    usage: 'off_session',
    metadata,
  });
}

async function createCustomer({ email, name, companyId, companyName }) {
  assertStripeConfigured();
  return stripe.customers.create({
    email,
    name,
    metadata: {
      companyId,
      companyName,
    },
  });
}

async function attachPaymentMethod({ customerId, paymentMethodId }) {
  assertStripeConfigured();

  try {
    await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
  } catch (error) {
    const message = error?.raw?.message || error.message || '';
    if (!message.toLowerCase().includes('already attached')) {
      throw error;
    }
  }

  await stripe.customers.update(customerId, {
    invoice_settings: {
      default_payment_method: paymentMethodId,
    },
  });
}

async function createSubscription({ customerId, paymentMethodId, planKey, trialEnd, metadata = {} }) {
  assertStripeConfigured();

  const payload = {
    customer: customerId,
    items: [{ price_data: getPriceData(planKey) }],
    default_payment_method: paymentMethodId,
    collection_method: 'charge_automatically',
    payment_settings: {
      save_default_payment_method: 'on_subscription',
    },
    metadata,
    expand: ['latest_invoice.payment_intent', 'pending_setup_intent'],
  };

  if (trialEnd) {
    payload.trial_end = Math.floor(new Date(trialEnd).getTime() / 1000);
  }

  return stripe.subscriptions.create(payload);
}

async function updateSubscriptionPaymentMethod({ subscriptionId, paymentMethodId }) {
  assertStripeConfigured();
  return stripe.subscriptions.update(subscriptionId, {
    default_payment_method: paymentMethodId,
  });
}

async function cancelSubscription(subscriptionId) {
  assertStripeConfigured();
  return stripe.subscriptions.cancel(subscriptionId);
}

async function retrieveSubscription(subscriptionId) {
  assertStripeConfigured();
  return stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['latest_invoice.payment_intent'],
  });
}

async function retrieveInvoice(invoiceId) {
  assertStripeConfigured();
  return stripe.invoices.retrieve(invoiceId, {
    expand: ['payment_intent', 'subscription'],
  });
}

function constructWebhookEvent(payload, signature, secret) {
  assertStripeConfigured();
  return stripe.webhooks.constructEvent(payload, signature, secret);
}

module.exports = {
  createSetupIntent,
  createCustomer,
  attachPaymentMethod,
  createSubscription,
  updateSubscriptionPaymentMethod,
  cancelSubscription,
  retrieveSubscription,
  retrieveInvoice,
  constructWebhookEvent,
  toStripeAmount,
};
