const TRIAL_DAYS = 30;
const GRACE_PERIOD_DAYS = 3;

const PLAN_PRICES = {
  BASIC: 49,
  PROFESSIONAL: 99,
  ENTERPRISE: 199,
};

const PLAN_NAMES = {
  BASIC: 'Basico',
  PROFESSIONAL: 'Profissional',
  ENTERPRISE: 'Empresarial',
};

const BILLING_STATUS = {
  TRIAL: 'TRIAL',
  ACTIVE: 'ACTIVE',
  PAST_DUE: 'PAST_DUE',
  CANCELLED: 'CANCELLED',
  PAUSED: 'PAUSED',
  EXPIRED: 'EXPIRED',
};

function normalizePlanKey(plan, fallback = 'BASIC') {
  const normalized = String(plan || fallback).trim().toUpperCase();
  return PLAN_PRICES[normalized] ? normalized : fallback;
}

module.exports = {
  TRIAL_DAYS,
  GRACE_PERIOD_DAYS,
  PLAN_PRICES,
  PLAN_NAMES,
  BILLING_STATUS,
  normalizePlanKey,
};
