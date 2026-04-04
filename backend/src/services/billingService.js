const prisma = require('../config/database');
const stripeService = require('./stripeService');
const {
  TRIAL_DAYS,
  GRACE_PERIOD_DAYS,
  PLAN_PRICES,
  PLAN_NAMES,
  BILLING_STATUS,
  normalizePlanKey,
} = require('../config/billingConfig');

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date, months) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

async function getCompanyWithBilling(companyId) {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) {
    throw new BillingError('Empresa nao encontrada.', 404);
  }

  const subscription = await prisma.subscription.findFirst({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
  });

  return { company, subscription };
}

async function getBillingUser({ companyId, userId }) {
  const user = await prisma.user.findFirst({
    where: { id: userId, companyId },
    select: { id: true, email: true, name: true, companyId: true },
  });

  if (!user) {
    throw new BillingError('Usuario autenticado nao encontrado para operacao de billing.', 404);
  }

  return user;
}

function assertPaymentMethod(paymentMethodId) {
  if (!paymentMethodId) {
    throw new BillingError('Metodo de pagamento da Stripe e obrigatorio.', 400);
  }
}

function getTrialState(company, subscription, now = new Date()) {
  const trialEndsAt = subscription?.trialEndsAt || company.trialEndsAt;
  const isTrialActive = Boolean(
    company.subscriptionStatus === BILLING_STATUS.TRIAL &&
    trialEndsAt &&
    new Date(trialEndsAt) > now
  );

  return {
    trialEndsAt: trialEndsAt ? new Date(trialEndsAt) : null,
    isTrialActive,
  };
}

async function ensureExistingTrialSubscription(tx, { companyId, plan, companyTrialEndsAt }) {
  const existing = await tx.subscription.findFirst({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
  });

  if (existing) {
    return existing;
  }

  const now = new Date();
  return tx.subscription.create({
    data: {
      companyId,
      plan,
      status: BILLING_STATUS.TRIAL,
      trialStart: now,
      trialEndsAt: companyTrialEndsAt,
      currentPeriodStart: now,
      currentPeriodEnd: companyTrialEndsAt,
    },
  });
}

function mapStripeSubscriptionStatus(status, trialEndsAt, now = new Date()) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'trialing') return BILLING_STATUS.TRIAL;
  if (normalized === 'active') {
    if (trialEndsAt && new Date(trialEndsAt) > now) {
      return BILLING_STATUS.TRIAL;
    }
    return BILLING_STATUS.ACTIVE;
  }
  if (['past_due', 'unpaid', 'incomplete'].includes(normalized)) return BILLING_STATUS.PAST_DUE;
  if (normalized === 'paused') return BILLING_STATUS.PAUSED;
  if (['canceled', 'incomplete_expired'].includes(normalized)) return BILLING_STATUS.CANCELLED;
  return BILLING_STATUS.EXPIRED;
}

function mapInvoiceStatus(invoice) {
  if (invoice.paid || invoice.status === 'paid') return 'APPROVED';
  if (invoice.status === 'open' || invoice.status === 'draft') return 'PENDING';
  if (invoice.status === 'void' || invoice.status === 'uncollectible') return 'REJECTED';
  return 'REJECTED';
}

function formatSubscriptionResponse(subscription) {
  const now = new Date();
  const trialDaysLeft = subscription.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(subscription.trialEndsAt) - now) / 86400000))
    : 0;

  return {
    id: subscription.id,
    plan: subscription.plan,
    planName: PLAN_NAMES[subscription.plan] || subscription.plan,
    status: subscription.status,
    trialStart: subscription.trialStart,
    trialEndsAt: subscription.trialEndsAt,
    trialDaysLeft,
    currentPeriodStart: subscription.currentPeriodStart,
    currentPeriodEnd: subscription.currentPeriodEnd,
    gracePeriodEnd: subscription.gracePeriodEnd,
    createdAt: subscription.createdAt,
    stripeSubscriptionId: subscription.mpPreapprovalId,
    stripeCustomerId: subscription.mpCustomerId,
  };
}

async function createSubscription({ companyId, userId, plan, paymentMethodId }) {
  const planKey = normalizePlanKey(plan);
  assertPaymentMethod(paymentMethodId);

  const [{ company, subscription }, billingUser] = await Promise.all([
    getCompanyWithBilling(companyId),
    getBillingUser({ companyId, userId }),
  ]);

  if (subscription?.mpPreapprovalId && [BILLING_STATUS.TRIAL, BILLING_STATUS.ACTIVE, BILLING_STATUS.PAST_DUE, BILLING_STATUS.PAUSED].includes(subscription.status)) {
    throw new BillingError('A empresa ja possui uma assinatura configurada na Stripe.', 409);
  }

  const now = new Date();
  const { isTrialActive, trialEndsAt } = getTrialState(company, subscription, now);

  const localSubscription = await prisma.$transaction(async (tx) => ensureExistingTrialSubscription(tx, {
    companyId,
    plan: planKey,
    companyTrialEndsAt: trialEndsAt || addDays(now, TRIAL_DAYS),
  }));

  let stripeCustomerId = subscription?.mpCustomerId || null;
  let stripeSubscription = null;

  try {
    if (!stripeCustomerId) {
      const stripeCustomer = await stripeService.createCustomer({
        email: billingUser.email,
        name: billingUser.name,
        companyId,
        companyName: company.name,
      });
      stripeCustomerId = stripeCustomer.id;
    }

    await stripeService.attachPaymentMethod({
      customerId: stripeCustomerId,
      paymentMethodId,
    });

    stripeSubscription = await stripeService.createSubscription({
      customerId: stripeCustomerId,
      paymentMethodId,
      planKey,
      trialEnd: isTrialActive ? trialEndsAt : null,
      metadata: {
        companyId,
        localSubscriptionId: localSubscription.id,
        plan: planKey,
      },
    });
  } catch (error) {
    throw new BillingError(`Falha ao criar assinatura na Stripe: ${error.message}`, 422);
  }

  const stripeStatus = mapStripeSubscriptionStatus(stripeSubscription.status, trialEndsAt, now);
  const currentPeriodStart = stripeSubscription.current_period_start
    ? new Date(stripeSubscription.current_period_start * 1000)
    : now;
  const currentPeriodEnd = stripeSubscription.current_period_end
    ? new Date(stripeSubscription.current_period_end * 1000)
    : (isTrialActive ? trialEndsAt : addMonths(now, 1));

  const updatedSubscription = await prisma.$transaction(async (tx) => {
    const saved = await tx.subscription.update({
      where: { id: localSubscription.id },
      data: {
        plan: planKey,
        status: stripeStatus,
        trialStart: localSubscription.trialStart || now,
        trialEndsAt: stripeStatus === BILLING_STATUS.TRIAL ? (trialEndsAt || currentPeriodEnd) : null,
        currentPeriodStart,
        currentPeriodEnd,
        gracePeriodEnd: null,
        mpPreapprovalId: stripeSubscription.id,
        mpCustomerId: stripeCustomerId,
        cancelledAt: null,
      },
    });

    await tx.company.update({
      where: { id: companyId },
      data: {
        plan: planKey.toLowerCase(),
        subscriptionStatus: saved.status,
        trialEndsAt: saved.trialEndsAt,
      },
    });

    return saved;
  });

  return formatSubscriptionResponse(updatedSubscription);
}

async function cancelSubscription(companyId) {
  const { subscription } = await getCompanyWithBilling(companyId);
  if (!subscription || [BILLING_STATUS.CANCELLED, BILLING_STATUS.EXPIRED].includes(subscription.status)) {
    throw new BillingError('Nenhuma assinatura ativa encontrada.', 404);
  }

  if (subscription.mpPreapprovalId) {
    try {
      await stripeService.cancelSubscription(subscription.mpPreapprovalId);
    } catch (error) {
      throw new BillingError(`Falha ao cancelar assinatura na Stripe: ${error.message}`, 422);
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.subscription.update({
      where: { id: subscription.id },
      data: { status: BILLING_STATUS.CANCELLED, cancelledAt: new Date() },
    });
    await tx.company.update({
      where: { id: companyId },
      data: { subscriptionStatus: BILLING_STATUS.CANCELLED },
    });
  });

  return { message: 'Assinatura cancelada com sucesso.' };
}

async function getSubscriptionStatus(companyId) {
  await reconcileCompanyBillingState(companyId);

  const subscription = await prisma.subscription.findFirst({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
  });

  if (!subscription) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { plan: true, subscriptionStatus: true, trialEndsAt: true, createdAt: true },
    });
    if (!company) return null;

    return {
      id: null,
      plan: normalizePlanKey(company.plan),
      planName: PLAN_NAMES[normalizePlanKey(company.plan)],
      status: company.subscriptionStatus,
      trialEndsAt: company.trialEndsAt,
      trialDaysLeft: company.trialEndsAt ? Math.max(0, Math.ceil((new Date(company.trialEndsAt) - new Date()) / 86400000)) : 0,
      currentPeriodStart: company.createdAt,
      currentPeriodEnd: company.trialEndsAt,
      gracePeriodEnd: null,
      createdAt: company.createdAt,
    };
  }

  return formatSubscriptionResponse(subscription);
}

async function listPayments(companyId, limit = 50) {
  return prisma.payment.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

async function upsertInvoicePayment(invoice, subscription) {
  const paymentId = String(invoice.payment_intent || invoice.id);
  return prisma.payment.upsert({
    where: { mpPaymentId: paymentId },
    create: {
      subscriptionId: subscription.id,
      companyId: subscription.companyId,
      mpPaymentId: paymentId,
      amount: (invoice.amount_paid || invoice.amount_due || 0) / 100,
      status: mapInvoiceStatus(invoice),
      paidAt: invoice.status === 'paid' ? new Date((invoice.status_transitions?.paid_at || Math.floor(Date.now() / 1000)) * 1000) : null,
      failureReason: invoice.last_finalization_error?.message || null,
    },
    update: {
      amount: (invoice.amount_paid || invoice.amount_due || 0) / 100,
      status: mapInvoiceStatus(invoice),
      paidAt: invoice.status === 'paid' ? new Date((invoice.status_transitions?.paid_at || Math.floor(Date.now() / 1000)) * 1000) : null,
      failureReason: invoice.last_finalization_error?.message || null,
    },
  });
}

async function findSubscriptionByStripe(stripeSubscriptionId, localSubscriptionId, companyId) {
  if (stripeSubscriptionId) {
    const byStripe = await prisma.subscription.findFirst({ where: { mpPreapprovalId: String(stripeSubscriptionId) } });
    if (byStripe) return byStripe;
  }
  if (localSubscriptionId) {
    const byLocal = await prisma.subscription.findUnique({ where: { id: String(localSubscriptionId) } });
    if (byLocal) return byLocal;
  }
  if (companyId) {
    return prisma.subscription.findFirst({
      where: { companyId: String(companyId) },
      orderBy: { createdAt: 'desc' },
    });
  }
  return null;
}

async function handleStripeInvoiceEvent(invoice) {
  const subscription = await findSubscriptionByStripe(
    invoice.subscription,
    invoice.metadata?.localSubscriptionId,
    invoice.metadata?.companyId
  );

  if (!subscription) {
    console.warn('[Billing] Subscription nao encontrada para invoice webhook:', invoice.id);
    return;
  }

  await upsertInvoicePayment(invoice, subscription);

  if (invoice.status === 'paid') {
    const periodEnd = invoice.lines?.data?.[0]?.period?.end
      ? new Date(invoice.lines.data[0].period.end * 1000)
      : addMonths(new Date(), 1);

    await updateSubscriptionAndCompany(subscription.id, subscription.companyId, {
      status: BILLING_STATUS.ACTIVE,
      currentPeriodStart: new Date(),
      currentPeriodEnd: periodEnd,
      gracePeriodEnd: null,
      trialEndsAt: null,
    });
  } else if (['open', 'uncollectible', 'void'].includes(invoice.status)) {
    const gracePeriodEnd = addDays(new Date(), GRACE_PERIOD_DAYS);
    await updateSubscriptionAndCompany(subscription.id, subscription.companyId, {
      status: BILLING_STATUS.PAST_DUE,
      gracePeriodEnd,
    });
  }
}

async function handleStripeSubscriptionEvent(stripeSubscription) {
  const subscription = await findSubscriptionByStripe(
    stripeSubscription.id,
    stripeSubscription.metadata?.localSubscriptionId,
    stripeSubscription.metadata?.companyId
  );

  if (!subscription) {
    console.warn('[Billing] Subscription local nao encontrada para Stripe:', stripeSubscription.id);
    return;
  }

  const nextStatus = mapStripeSubscriptionStatus(
    stripeSubscription.status,
    stripeSubscription.trial_end ? new Date(stripeSubscription.trial_end * 1000) : subscription.trialEndsAt
  );

  await updateSubscriptionAndCompany(subscription.id, subscription.companyId, {
    status: nextStatus,
    trialEndsAt: stripeSubscription.trial_end ? new Date(stripeSubscription.trial_end * 1000) : null,
    currentPeriodStart: stripeSubscription.current_period_start ? new Date(stripeSubscription.current_period_start * 1000) : subscription.currentPeriodStart,
    currentPeriodEnd: stripeSubscription.current_period_end ? new Date(stripeSubscription.current_period_end * 1000) : subscription.currentPeriodEnd,
    cancelledAt: nextStatus === BILLING_STATUS.CANCELLED ? new Date() : null,
    mpCustomerId: stripeSubscription.customer?.toString() || subscription.mpCustomerId,
    mpPreapprovalId: stripeSubscription.id,
  });
}

async function updateSubscriptionAndCompany(subscriptionId, companyId, data) {
  await prisma.$transaction(async (tx) => {
    const updatedSubscription = await tx.subscription.update({
      where: { id: subscriptionId },
      data,
    });

    await tx.company.update({
      where: { id: companyId },
      data: {
        subscriptionStatus: updatedSubscription.status,
        trialEndsAt: updatedSubscription.trialEndsAt,
        plan: updatedSubscription.plan.toLowerCase(),
      },
    });
  });
}

async function changePlan({ companyId, userId, plan, paymentMethodId }) {
  const planKey = normalizePlanKey(plan);
  assertPaymentMethod(paymentMethodId);

  const [{ subscription }, billingUser] = await Promise.all([
    getCompanyWithBilling(companyId),
    getBillingUser({ companyId, userId }),
  ]);

  if (!subscription) {
    throw new BillingError('Nenhuma assinatura encontrada para alterar o plano.', 404);
  }

  if (subscription.mpPreapprovalId) {
    try {
      await stripeService.cancelSubscription(subscription.mpPreapprovalId);
    } catch (error) {
      throw new BillingError(`Falha ao substituir assinatura na Stripe: ${error.message}`, 422);
    }
  }

  const newSubscription = await createSubscription({
    companyId,
    userId: billingUser.id,
    plan: planKey,
    paymentMethodId,
  });

  return {
    message: `Plano alterado para ${PLAN_NAMES[planKey]} com sucesso.`,
    subscription: newSubscription,
  };
}

async function reactivateSubscription({ companyId, userId, paymentMethodId, plan }) {
  const planKey = normalizePlanKey(plan);
  assertPaymentMethod(paymentMethodId);

  const { subscription } = await getCompanyWithBilling(companyId);
  if (subscription?.mpPreapprovalId) {
    try {
      await stripeService.cancelSubscription(subscription.mpPreapprovalId);
    } catch (error) {
      throw new BillingError(`Falha ao reativar assinatura na Stripe: ${error.message}`, 422);
    }
  }

  const newSubscription = await createSubscription({
    companyId,
    userId,
    plan: planKey,
    paymentMethodId,
  });

  return {
    message: `Assinatura reativada com sucesso no plano ${PLAN_NAMES[planKey]}.`,
    subscription: newSubscription,
  };
}

async function reconcileCompanyBillingState(companyId) {
  const subscription = await prisma.subscription.findFirst({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
  });

  if (!subscription) return null;

  const now = new Date();

  if (subscription.status === BILLING_STATUS.TRIAL && subscription.trialEndsAt && new Date(subscription.trialEndsAt) <= now && !subscription.mpPreapprovalId) {
    await updateSubscriptionAndCompany(subscription.id, subscription.companyId, {
      status: BILLING_STATUS.EXPIRED,
      gracePeriodEnd: null,
    });
    return prisma.subscription.findUnique({ where: { id: subscription.id } });
  }

  if (subscription.status === BILLING_STATUS.PAST_DUE && subscription.gracePeriodEnd && new Date(subscription.gracePeriodEnd) <= now) {
    await updateSubscriptionAndCompany(subscription.id, subscription.companyId, {
      status: BILLING_STATUS.EXPIRED,
      gracePeriodEnd: null,
    });
    return prisma.subscription.findUnique({ where: { id: subscription.id } });
  }

  return subscription;
}

async function reconcileAllSubscriptions() {
  const activeSubscriptions = await prisma.subscription.findMany({
    where: {
      status: { in: [BILLING_STATUS.TRIAL, BILLING_STATUS.ACTIVE, BILLING_STATUS.PAST_DUE, BILLING_STATUS.PAUSED] },
    },
    select: { companyId: true },
  });

  for (const subscription of activeSubscriptions) {
    try {
      await reconcileCompanyBillingState(subscription.companyId);
    } catch (error) {
      console.error('[Billing] Falha ao reconciliar assinatura:', {
        companyId: subscription.companyId,
        message: error.message,
      });
    }
  }
}

class BillingError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'BillingError';
    this.statusCode = statusCode;
  }
}

module.exports = {
  createSubscription,
  cancelSubscription,
  getSubscriptionStatus,
  listPayments,
  handleStripeInvoiceEvent,
  handleStripeSubscriptionEvent,
  changePlan,
  reactivateSubscription,
  reconcileCompanyBillingState,
  reconcileAllSubscriptions,
  BillingError,
  PLAN_PRICES,
  PLAN_NAMES,
  STATUS: BILLING_STATUS,
  TRIAL_DAYS,
  GRACE_PERIOD_DAYS,
};
