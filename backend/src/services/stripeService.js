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
      metadata: { planKey },
    },
  };
}

async function createSetupIntent({ customerId, metadata = {} } = {}) {
  assertStripeConfigured();
  const payload = {
    automatic_payment_methods: {
      enabled: true,
      allow_redirects: 'never',
    },
    usage: 'off_session',
    metadata,
  };

  if (customerId) {
    payload.customer = customerId;
  }

  return stripe.setupIntents.create(payload);
}

async function retrieveSetupIntent(setupIntentId) {
  assertStripeConfigured();
  return stripe.setupIntents.retrieve(setupIntentId);
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

async function updateCustomer(customerId, data = {}) {
  assertStripeConfigured();
  return stripe.customers.update(customerId, data);
}

async function attachPaymentMethod({ customerId, paymentMethodId }) {
  assertStripeConfigured();

  try {
    await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
  } catch (error) {
    const code = error?.code || '';
    const message = String(error?.raw?.message || error.message || '').toLowerCase();
    const alreadyAttached = code === 'resource_already_exists' || message.includes('already attached');
    if (!alreadyAttached) {
      throw error;
    }
  }

  await stripe.customers.update(customerId, {
    invoice_settings: {
      default_payment_method: paymentMethodId,
    },
  });
}

async function retrievePaymentMethod(paymentMethodId) {
  assertStripeConfigured();
  return stripe.paymentMethods.retrieve(paymentMethodId);
}

async function detachPaymentMethod(paymentMethodId) {
  assertStripeConfigured();
  return stripe.paymentMethods.detach(paymentMethodId);
}

async function createSubscription({
  customerId,
  paymentMethodId,
  planKey,
  trialEnd,
  metadata = {},
}) {
  assertStripeConfigured();

  const payload = {
    customer: customerId,
    items: [{ price_data: getPriceData(planKey) }],
    default_payment_method: paymentMethodId,
    collection_method: 'charge_automatically',
    payment_behavior: 'default_incomplete',
    payment_settings: {
      payment_method_types: ['card'],
      save_default_payment_method: 'on_subscription',
    },
    metadata,
    expand: ['latest_invoice.payment_intent', 'pending_setup_intent', 'items.data.price'],
  };

  if (trialEnd) {
    payload.trial_end = Math.floor(new Date(trialEnd).getTime() / 1000);
  }

  return stripe.subscriptions.create(payload);
}

async function updateSubscription({
  subscriptionId,
  paymentMethodId,
  planKey,
  metadata = {},
  trialEnd,
}) {
  assertStripeConfigured();
  const currentSubscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['items.data.price'],
  });

  const payload = {
    default_payment_method: paymentMethodId,
    payment_behavior: 'default_incomplete',
    payment_settings: {
      payment_method_types: ['card'],
      save_default_payment_method: 'on_subscription',
    },
    proration_behavior: 'create_prorations',
    metadata,
    items: currentSubscription.items.data.map((item, index) => ({
      id: item.id,
      ...(index === 0 ? { price_data: getPriceData(planKey) } : { deleted: true }),
    })),
    expand: ['latest_invoice.payment_intent', 'pending_setup_intent', 'items.data.price'],
  };

  if (trialEnd) {
    payload.trial_end = Math.floor(new Date(trialEnd).getTime() / 1000);
  }

  return stripe.subscriptions.update(subscriptionId, payload);
}

async function cancelSubscription(subscriptionId) {
  assertStripeConfigured();
  return stripe.subscriptions.cancel(subscriptionId);
}

async function retrieveSubscription(subscriptionId) {
  assertStripeConfigured();
  return stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['latest_invoice.payment_intent', 'pending_setup_intent', 'items.data.price'],
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
  retrieveSetupIntent,
  createCustomer,
  updateCustomer,
  attachPaymentMethod,
  retrievePaymentMethod,
  detachPaymentMethod,
  createSubscription,
  updateSubscription,
  cancelSubscription,
  retrieveSubscription,
  retrieveInvoice,
  constructWebhookEvent,
  toStripeAmount,
};
