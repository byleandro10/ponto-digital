const TRIAL_DAYS = 30;

const SUBSCRIPTION_STATUS = {
  INCOMPLETE: 'INCOMPLETE',
  INCOMPLETE_EXPIRED: 'INCOMPLETE_EXPIRED',
  TRIALING: 'TRIALING',
  ACTIVE: 'ACTIVE',
  PAST_DUE: 'PAST_DUE',
  UNPAID: 'UNPAID',
  CANCELED: 'CANCELED',
};

const BILLING_STATUS = {
  INCOMPLETE: 'INCOMPLETE',
  PENDING: 'PENDING',
  TRIALING: 'TRIALING',
  PAID: 'PAID',
  PAST_DUE: 'PAST_DUE',
  UNPAID: 'UNPAID',
  CANCELED: 'CANCELED',
};

const PLAN_CONFIG = {
  BASIC: {
    key: 'BASIC',
    slug: 'basic',
    name: 'Basico',
    amount: 49,
    stripePriceEnv: 'STRIPE_PRICE_BASIC',
  },
  PROFESSIONAL: {
    key: 'PROFESSIONAL',
    slug: 'professional',
    name: 'Profissional',
    amount: 99,
    stripePriceEnv: 'STRIPE_PRICE_PROFESSIONAL',
  },
  ENTERPRISE: {
    key: 'ENTERPRISE',
    slug: 'enterprise',
    name: 'Empresarial',
    amount: 199,
    stripePriceEnv: 'STRIPE_PRICE_ENTERPRISE',
  },
};

function normalizePlanKey(plan, fallback = 'BASIC') {
  const normalized = String(plan || fallback).trim().toUpperCase();
  return PLAN_CONFIG[normalized] ? normalized : fallback;
}

function getPlanConfig(plan) {
  return PLAN_CONFIG[normalizePlanKey(plan)];
}

function getStripePriceIdForPlan(plan) {
  const planConfig = getPlanConfig(plan);
  const priceId = process.env[planConfig.stripePriceEnv] || '';

  if (!priceId) {
    throw new Error(`Preco da Stripe nao configurado para o plano ${planConfig.key}. Defina ${planConfig.stripePriceEnv}.`);
  }

  return priceId;
}

function getPlanFromStripePriceId(priceId) {
  if (!priceId) return null;

  return Object.values(PLAN_CONFIG).find(
    (planConfig) => process.env[planConfig.stripePriceEnv] === String(priceId)
  ) || null;
}

function mapStripeSubscriptionStatus(status) {
  const normalized = String(status || '').toLowerCase();

  switch (normalized) {
    case 'incomplete':
      return SUBSCRIPTION_STATUS.INCOMPLETE;
    case 'incomplete_expired':
      return SUBSCRIPTION_STATUS.INCOMPLETE_EXPIRED;
    case 'trialing':
      return SUBSCRIPTION_STATUS.TRIALING;
    case 'active':
      return SUBSCRIPTION_STATUS.ACTIVE;
    case 'past_due':
      return SUBSCRIPTION_STATUS.PAST_DUE;
    case 'unpaid':
      return SUBSCRIPTION_STATUS.UNPAID;
    case 'canceled':
      return SUBSCRIPTION_STATUS.CANCELED;
    default:
      return SUBSCRIPTION_STATUS.INCOMPLETE;
  }
}

function mapSubscriptionStatusToBillingStatus(subscriptionStatus, invoicePaid = false) {
  switch (subscriptionStatus) {
    case SUBSCRIPTION_STATUS.TRIALING:
      return BILLING_STATUS.TRIALING;
    case SUBSCRIPTION_STATUS.ACTIVE:
      return invoicePaid ? BILLING_STATUS.PAID : BILLING_STATUS.PAID;
    case SUBSCRIPTION_STATUS.PAST_DUE:
      return BILLING_STATUS.PAST_DUE;
    case SUBSCRIPTION_STATUS.UNPAID:
      return BILLING_STATUS.UNPAID;
    case SUBSCRIPTION_STATUS.CANCELED:
    case SUBSCRIPTION_STATUS.INCOMPLETE_EXPIRED:
      return BILLING_STATUS.CANCELED;
    case SUBSCRIPTION_STATUS.INCOMPLETE:
    default:
      return BILLING_STATUS.INCOMPLETE;
  }
}

function isSubscriptionActive(status) {
  return [SUBSCRIPTION_STATUS.TRIALING, SUBSCRIPTION_STATUS.ACTIVE].includes(status);
}

function isSubscriptionRecoverable(status) {
  return [SUBSCRIPTION_STATUS.PAST_DUE, SUBSCRIPTION_STATUS.UNPAID].includes(status);
}

module.exports = {
  TRIAL_DAYS,
  PLAN_CONFIG,
  PLAN_NAMES: Object.fromEntries(Object.values(PLAN_CONFIG).map((plan) => [plan.key, plan.name])),
  PLAN_PRICES: Object.fromEntries(Object.values(PLAN_CONFIG).map((plan) => [plan.key, plan.amount])),
  SUBSCRIPTION_STATUS,
  BILLING_STATUS,
  normalizePlanKey,
  getPlanConfig,
  getStripePriceIdForPlan,
  getPlanFromStripePriceId,
  mapStripeSubscriptionStatus,
  mapSubscriptionStatusToBillingStatus,
  isSubscriptionActive,
  isSubscriptionRecoverable,
};
