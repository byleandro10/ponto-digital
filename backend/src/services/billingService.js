const prisma = require('../config/database');
const mpService = require('./mercadopagoService');
const {
  TRIAL_DAYS,
  GRACE_PERIOD_DAYS,
  PLAN_PRICES,
  PLAN_NAMES,
  BILLING_STATUS,
  normalizePlanKey,
} = require('../config/billingConfig');

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function getFrontendBaseUrl() {
  return process.env.FRONTEND_URL || process.env.APP_URL || 'https://pontodigital.com.br';
}

function getWebhookUrl() {
  const appUrl = process.env.APP_URL || getFrontendBaseUrl();
  return `${appUrl.replace(/\/+$/, '')}/api/webhooks/mercadopago`;
}

async function getCompanyWithBilling(companyId) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
  });

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

function assertCardPayload({ cardTokenId, paymentMethodId }) {
  if (!cardTokenId) {
    throw new BillingError('Token do cartao e obrigatorio.', 400);
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

async function validateCardForBilling({ companyId, payerEmail, cardTokenId, paymentMethodId, purpose }) {
  // O card_token do Mercado Pago e de uso unico.
  // Neste fluxo, a propria criacao da preapproval e a validacao pratica do cartao.
  // Tentar validar antes queimaria o token e faria a assinatura falhar em seguida.
  return null;
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

function mapPaymentStatus(status) {
  const normalized = String(status || '').toLowerCase();

  if (normalized === 'approved') {
    return 'APPROVED';
  }
  if (['rejected', 'cancelled'].includes(normalized)) {
    return 'REJECTED';
  }
  if (normalized === 'refunded') {
    return 'REFUNDED';
  }
  return 'PENDING';
}

async function createSubscription({ companyId, userId, plan, cardTokenId, paymentMethodId }) {
  const planKey = normalizePlanKey(plan);
  assertCardPayload({ cardTokenId, paymentMethodId });

  const [{ company, subscription }, billingUser] = await Promise.all([
    getCompanyWithBilling(companyId),
    getBillingUser({ companyId, userId }),
  ]);

  const now = new Date();
  const { isTrialActive, trialEndsAt } = getTrialState(company, subscription, now);

  if (subscription?.mpPreapprovalId && [BILLING_STATUS.TRIAL, BILLING_STATUS.ACTIVE, BILLING_STATUS.PAST_DUE, BILLING_STATUS.PAUSED].includes(subscription.status)) {
    throw new BillingError('A empresa ja possui um cartao validado e assinatura recorrente configurada.', 409);
  }

  await validateCardForBilling({
    companyId,
    payerEmail: billingUser.email,
    cardTokenId,
    paymentMethodId,
    purpose: 'assinatura inicial',
  });

  const localSubscription = await prisma.$transaction(async (tx) => ensureExistingTrialSubscription(tx, {
    companyId,
    plan: planKey,
    companyTrialEndsAt: trialEndsAt || addDays(now, TRIAL_DAYS),
  }));

  const firstChargeDate = isTrialActive ? trialEndsAt : now;
  let mpResult;
  try {
    mpResult = await mpService.createPreapproval({
      reason: `Ponto Digital - Plano ${PLAN_NAMES[planKey]}`,
      externalRef: localSubscription.id,
      payerEmail: billingUser.email,
      cardTokenId,
      amount: PLAN_PRICES[planKey],
      backUrl: `${getFrontendBaseUrl().replace(/\/+$/, '')}/admin/subscription`,
      startDate: firstChargeDate,
      notificationUrl: getWebhookUrl(),
    });
  } catch (error) {
    throw new BillingError(`Falha ao criar assinatura no Mercado Pago: ${error.message}`, 422);
  }

  if (!['authorized', 'pending'].includes(String(mpResult.status || '').toLowerCase())) {
    throw new BillingError('O Mercado Pago nao autorizou o cartao informado para a assinatura.', 422);
  }

  const updatedSubscription = await prisma.$transaction(async (tx) => {
    const nextStatus = isTrialActive ? BILLING_STATUS.TRIAL : BILLING_STATUS.ACTIVE;
    const nextPeriodEnd = isTrialActive ? firstChargeDate : addMonths(now, 1);

    const sub = await tx.subscription.update({
      where: { id: localSubscription.id },
      data: {
        plan: planKey,
        status: nextStatus,
        trialStart: localSubscription.trialStart || now,
        trialEndsAt: isTrialActive ? firstChargeDate : null,
        currentPeriodStart: now,
        currentPeriodEnd: nextPeriodEnd,
        gracePeriodEnd: null,
        mpPreapprovalId: mpResult.id?.toString() || null,
        mpCustomerId: mpResult.payer_id?.toString() || null,
        cancelledAt: null,
      },
    });

    await tx.company.update({
      where: { id: companyId },
      data: {
        plan: planKey.toLowerCase(),
        subscriptionStatus: nextStatus,
        trialEndsAt: isTrialActive ? firstChargeDate : null,
      },
    });

    return sub;
  });

  return formatSubscriptionResponse(updatedSubscription);
}

async function cancelSubscription(companyId) {
  const { subscription } = await getCompanyWithBilling(companyId);

  if (!subscription || [BILLING_STATUS.CANCELLED, BILLING_STATUS.EXPIRED].includes(subscription.status)) {
    throw new BillingError('Nenhuma assinatura ativa encontrada.', 404);
  }

  if (subscription.mpPreapprovalId) {
    await mpService.updatePreapprovalStatus(subscription.mpPreapprovalId, 'cancelled');
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

    if (!company) {
      return null;
    }

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
    mpPreapprovalId: subscription.mpPreapprovalId,
  };
}

async function listPayments(companyId, limit = 50) {
  return prisma.payment.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

async function handlePaymentWebhook(paymentId) {
  const mpPayment = await mpService.getPayment(paymentId);
  if (!mpPayment) {
    return;
  }

  const externalRef = String(mpPayment.external_reference || '');
  const preapprovalId = mpPayment.metadata?.preapproval_id ? String(mpPayment.metadata.preapproval_id) : null;

  let subscription = null;
  if (preapprovalId) {
    subscription = await prisma.subscription.findFirst({
      where: { mpPreapprovalId: preapprovalId },
    });
  }
  if (!subscription && externalRef) {
    subscription = await prisma.subscription.findFirst({
      where: {
        OR: [
          { id: externalRef },
          { companyId: externalRef },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  if (!subscription) {
    console.warn('[Billing] Subscription nao encontrada para payment webhook:', paymentId);
    return;
  }

  const internalStatus = mapPaymentStatus(mpPayment.status);
  const mpPaymentId = String(mpPayment.id || paymentId);

  await prisma.payment.upsert({
    where: { mpPaymentId: mpPaymentId },
    create: {
      subscriptionId: subscription.id,
      companyId: subscription.companyId,
      mpPaymentId,
      amount: mpPayment.transaction_amount || 0,
      status: internalStatus,
      paidAt: internalStatus === 'APPROVED' ? new Date(mpPayment.date_approved || Date.now()) : null,
      failureReason: internalStatus === 'REJECTED' ? (mpPayment.status_detail || 'Pagamento recusado pelo Mercado Pago.') : null,
    },
    update: {
      amount: mpPayment.transaction_amount || 0,
      status: internalStatus,
      paidAt: internalStatus === 'APPROVED' ? new Date(mpPayment.date_approved || Date.now()) : null,
      failureReason: internalStatus === 'REJECTED' ? (mpPayment.status_detail || 'Pagamento recusado pelo Mercado Pago.') : null,
    },
  });

  if (internalStatus === 'APPROVED') {
    await activateSubscription(subscription, new Date(mpPayment.date_approved || Date.now()));
  } else if (internalStatus === 'REJECTED') {
    await markAsPastDue(subscription, mpPayment.status_detail || 'Pagamento recusado pelo Mercado Pago.');
  }
}

async function handlePreapprovalWebhook(preapprovalId) {
  const mpPreapproval = await mpService.getPreapproval(preapprovalId);
  if (!mpPreapproval) {
    return;
  }

  const subscription = await prisma.subscription.findFirst({
    where: { mpPreapprovalId: String(preapprovalId) },
  });

  if (!subscription) {
    console.warn('[Billing] Subscription nao encontrada para preapproval webhook:', preapprovalId);
    return;
  }

  const now = new Date();
  let nextStatus = subscription.status;

  switch (String(mpPreapproval.status || '').toLowerCase()) {
    case 'authorized':
      nextStatus = subscription.trialEndsAt && new Date(subscription.trialEndsAt) > now
        ? BILLING_STATUS.TRIAL
        : BILLING_STATUS.ACTIVE;
      break;
    case 'paused':
      nextStatus = BILLING_STATUS.PAUSED;
      break;
    case 'cancelled':
      nextStatus = BILLING_STATUS.CANCELLED;
      break;
    case 'pending':
      nextStatus = subscription.trialEndsAt && new Date(subscription.trialEndsAt) > now
        ? BILLING_STATUS.TRIAL
        : BILLING_STATUS.PAST_DUE;
      break;
    default:
      break;
  }

  if (nextStatus === subscription.status) {
    return;
  }

  await updateSubscriptionAndCompany(subscription.id, subscription.companyId, {
    status: nextStatus,
    cancelledAt: nextStatus === BILLING_STATUS.CANCELLED ? now : null,
    gracePeriodEnd: nextStatus === BILLING_STATUS.ACTIVE ? null : subscription.gracePeriodEnd,
  });
}

async function activateSubscription(subscription, approvedAt = new Date()) {
  await updateSubscriptionAndCompany(subscription.id, subscription.companyId, {
    status: BILLING_STATUS.ACTIVE,
    currentPeriodStart: approvedAt,
    currentPeriodEnd: addMonths(approvedAt, 1),
    gracePeriodEnd: null,
    trialEndsAt: null,
    cancelledAt: null,
  });
}

async function markAsPastDue(subscription, failureReason = null) {
  const gracePeriodEnd = addDays(new Date(), GRACE_PERIOD_DAYS);

  await updateSubscriptionAndCompany(subscription.id, subscription.companyId, {
    status: BILLING_STATUS.PAST_DUE,
    gracePeriodEnd,
  });

  if (failureReason) {
    const latestPayment = await prisma.payment.findFirst({
      where: { subscriptionId: subscription.id },
      orderBy: { createdAt: 'desc' },
    });
    if (latestPayment) {
      await prisma.payment.update({
        where: { id: latestPayment.id },
        data: { failureReason },
      });
    }
  }
}

async function expireSubscription(subscription, reason = null) {
  await updateSubscriptionAndCompany(subscription.id, subscription.companyId, {
    status: BILLING_STATUS.EXPIRED,
    gracePeriodEnd: null,
  });

  if (reason) {
    const latestPayment = await prisma.payment.findFirst({
      where: { subscriptionId: subscription.id },
      orderBy: { createdAt: 'desc' },
    });
    if (latestPayment && !latestPayment.failureReason) {
      await prisma.payment.update({
        where: { id: latestPayment.id },
        data: { failureReason: reason },
      });
    }
  }
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

async function changePlan({ companyId, userId, plan, cardTokenId, paymentMethodId }) {
  const planKey = normalizePlanKey(plan);
  assertCardPayload({ cardTokenId, paymentMethodId });

  const [{ company, subscription }, billingUser] = await Promise.all([
    getCompanyWithBilling(companyId),
    getBillingUser({ companyId, userId }),
  ]);

  if (!subscription) {
    throw new BillingError('Nenhuma assinatura encontrada para alterar o plano.', 404);
  }

  await validateCardForBilling({
    companyId,
    payerEmail: billingUser.email,
    cardTokenId,
    paymentMethodId,
    purpose: 'troca de plano',
  });

  if (subscription.mpPreapprovalId) {
    await mpService.updatePreapprovalStatus(subscription.mpPreapprovalId, 'cancelled');
  }

  const now = new Date();
  const { isTrialActive, trialEndsAt } = getTrialState(company, subscription, now);
  const startDate = isTrialActive ? trialEndsAt : now;

  let mpResult;
  try {
    mpResult = await mpService.createPreapproval({
      reason: `Ponto Digital - Plano ${PLAN_NAMES[planKey]}`,
      externalRef: subscription.id,
      payerEmail: billingUser.email,
      cardTokenId,
      amount: PLAN_PRICES[planKey],
      backUrl: `${getFrontendBaseUrl().replace(/\/+$/, '')}/admin/subscription`,
      startDate,
      notificationUrl: getWebhookUrl(),
    });
  } catch (error) {
    throw new BillingError(`Falha ao atualizar assinatura no Mercado Pago: ${error.message}`, 422);
  }

  if (!['authorized', 'pending'].includes(String(mpResult.status || '').toLowerCase())) {
    throw new BillingError('O Mercado Pago nao autorizou o novo cartao para a troca de plano.', 422);
  }

  await updateSubscriptionAndCompany(subscription.id, companyId, {
    plan: planKey,
    status: isTrialActive ? BILLING_STATUS.TRIAL : BILLING_STATUS.ACTIVE,
    mpPreapprovalId: mpResult.id?.toString() || null,
    mpCustomerId: mpResult.payer_id?.toString() || null,
    trialEndsAt: isTrialActive ? trialEndsAt : null,
    currentPeriodStart: now,
    currentPeriodEnd: isTrialActive ? trialEndsAt : addMonths(now, 1),
    gracePeriodEnd: null,
    cancelledAt: null,
  });

  return {
    message: `Plano alterado para ${PLAN_NAMES[planKey]} com sucesso.`,
    subscription: await getSubscriptionStatus(companyId),
  };
}

async function reactivateSubscription({ companyId, userId, cardTokenId, paymentMethodId, plan }) {
  const planKey = normalizePlanKey(plan);
  assertCardPayload({ cardTokenId, paymentMethodId });

  const [{ subscription }, billingUser] = await Promise.all([
    getCompanyWithBilling(companyId),
    getBillingUser({ companyId, userId }),
  ]);

  await validateCardForBilling({
    companyId,
    payerEmail: billingUser.email,
    cardTokenId,
    paymentMethodId,
    purpose: 'reativacao',
  });

  if (subscription?.mpPreapprovalId) {
    await mpService.updatePreapprovalStatus(subscription.mpPreapprovalId, 'cancelled');
  }

  const targetSubscription = subscription || await prisma.subscription.create({
    data: {
      companyId,
      plan: planKey,
      status: BILLING_STATUS.CANCELLED,
    },
  });

  const now = new Date();
  let mpResult;
  try {
    mpResult = await mpService.createPreapproval({
      reason: `Ponto Digital - Plano ${PLAN_NAMES[planKey]}`,
      externalRef: targetSubscription.id,
      payerEmail: billingUser.email,
      cardTokenId,
      amount: PLAN_PRICES[planKey],
      backUrl: `${getFrontendBaseUrl().replace(/\/+$/, '')}/admin/subscription`,
      startDate: now,
      notificationUrl: getWebhookUrl(),
    });
  } catch (error) {
    throw new BillingError(`Falha ao reativar assinatura no Mercado Pago: ${error.message}`, 422);
  }

  if (!['authorized', 'pending'].includes(String(mpResult.status || '').toLowerCase())) {
    throw new BillingError('O Mercado Pago nao autorizou o cartao informado para a reativacao.', 422);
  }

  await updateSubscriptionAndCompany(targetSubscription.id, companyId, {
    plan: planKey,
    status: BILLING_STATUS.ACTIVE,
    trialStart: null,
    trialEndsAt: null,
    currentPeriodStart: now,
    currentPeriodEnd: addMonths(now, 1),
    gracePeriodEnd: null,
    cancelledAt: null,
    mpPreapprovalId: mpResult.id?.toString() || null,
    mpCustomerId: mpResult.payer_id?.toString() || null,
  });

  return {
    message: `Assinatura reativada com sucesso no plano ${PLAN_NAMES[planKey]}.`,
    subscription: await getSubscriptionStatus(companyId),
  };
}

async function reconcileCompanyBillingState(companyId) {
  const subscription = await prisma.subscription.findFirst({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
  });

  if (!subscription) {
    return null;
  }

  const now = new Date();

  if (subscription.status === BILLING_STATUS.TRIAL && subscription.trialEndsAt && new Date(subscription.trialEndsAt) <= now && !subscription.mpPreapprovalId) {
    await expireSubscription(subscription, 'Trial expirado sem cartao validado para cobranca recorrente.');
    return prisma.subscription.findUnique({ where: { id: subscription.id } });
  }

  if (subscription.status === BILLING_STATUS.PAST_DUE && subscription.gracePeriodEnd && new Date(subscription.gracePeriodEnd) <= now) {
    await expireSubscription(subscription, 'Grace period expirado apos falha de pagamento.');
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
  handlePaymentWebhook,
  handlePreapprovalWebhook,
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
