const { stripe, stripeSecretKey } = require('../config/stripe');
const { TRIAL_DAYS, getPlanConfig, getOptionalStripePriceIdForPlan } = require('../config/billingConfig');

function assertStripeConfigured() {
  if (!stripe || !stripeSecretKey) {
    throw new Error('STRIPE_SECRET_KEY nao configurada.');
  }
}

function normalizeBaseUrl(value) {
  if (!value) return null;
  return String(value).replace(/\/+$/, '');
}

function getFrontendBaseUrl(fallbackBaseUrl = null) {
  const baseUrl = process.env.FRONTEND_URL || process.env.APP_URL || fallbackBaseUrl;

  if (!baseUrl) {
    throw new Error('FRONTEND_URL ou APP_URL deve estar configurada para billing com Stripe.');
  }

  return normalizeBaseUrl(baseUrl);
}

function buildLineItem(planKey) {
  const priceId = getOptionalStripePriceIdForPlan(planKey);
  if (priceId) {
    return {
      price: priceId,
      quantity: 1,
    };
  }

  const planConfig = getPlanConfig(planKey);

  return {
    price_data: {
      currency: 'brl',
      unit_amount: Math.round(Number(planConfig.amount) * 100),
      recurring: {
        interval: 'month',
      },
      product_data: {
        name: `Ponto Digital - Plano ${planConfig.name}`,
        metadata: {
          planKey,
        },
      },
    },
    quantity: 1,
  };
}

async function createCustomer({ email, name, companyId, companyName, userId }) {
  assertStripeConfigured();

  return stripe.customers.create({
    email,
    name,
    metadata: {
      companyId,
      companyName,
      userId,
    },
  });
}

async function updateCustomer(customerId, data = {}) {
  assertStripeConfigured();
  return stripe.customers.update(customerId, data);
}

async function retrieveCustomer(customerId) {
  assertStripeConfigured();
  return stripe.customers.retrieve(customerId);
}

async function createCheckoutSession({
  customerId,
  customerEmail,
  companyId,
  userId,
  localSubscriptionId,
  planKey,
  frontendBaseUrl,
}) {
  assertStripeConfigured();

  const resolvedFrontendBaseUrl = getFrontendBaseUrl(frontendBaseUrl);

  return stripe.checkout.sessions.create({
    mode: 'subscription',
    ...(customerId ? { customer: customerId } : { customer_email: customerEmail }),
    client_reference_id: companyId,
    billing_address_collection: 'auto',
    payment_method_collection: 'always',
    allow_promotion_codes: true,
    locale: 'auto',
    line_items: [buildLineItem(planKey)],
    metadata: {
      companyId,
      userId,
      localSubscriptionId,
      planKey,
    },
    subscription_data: {
      trial_period_days: TRIAL_DAYS,
      metadata: {
        companyId,
        userId,
        localSubscriptionId,
        planKey,
      },
    },
    success_url: `${resolvedFrontendBaseUrl}/admin/subscription?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${resolvedFrontendBaseUrl}/admin/subscription?checkout=cancelled`,
  });
}

async function retrieveCheckoutSession(sessionId) {
  assertStripeConfigured();
  return stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['subscription', 'customer'],
  });
}

async function createPortalSession({ customerId, returnPath = '/admin/subscription', frontendBaseUrl }) {
  assertStripeConfigured();

  const resolvedFrontendBaseUrl = getFrontendBaseUrl(frontendBaseUrl);
  const normalizedPath = returnPath.startsWith('/') ? returnPath : `/${returnPath}`;

  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${resolvedFrontendBaseUrl}${normalizedPath}`,
  });
}

async function retrieveSubscription(subscriptionId) {
  assertStripeConfigured();
  return stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['items.data.price', 'default_payment_method', 'latest_invoice.payment_intent'],
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
  createCustomer,
  updateCustomer,
  retrieveCustomer,
  createCheckoutSession,
  retrieveCheckoutSession,
  createPortalSession,
  retrieveSubscription,
  retrieveInvoice,
  constructWebhookEvent,
};
