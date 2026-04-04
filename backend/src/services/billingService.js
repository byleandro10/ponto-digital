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

const MANAGED_STATUSES = [
  BILLING_STATUS.TRIAL,
  BILLING_STATUS.ACTIVE,
  BILLING_STATUS.PAST_DUE,
  BILLING_STATUS.PAUSED,
];

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

function toDateOrNull(value) {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

function safeString(value) {
  if (!value) return null;
  return String(value);
}

function getLatestPriceId(stripeSubscription) {
  return stripeSubscription?.items?.data?.[0]?.price?.id || null;
}

function getLatestPaymentIntent(stripeSubscription) {
  return stripeSubscription?.latest_invoice?.payment_intent || null;
}

function getLatestInvoiceId(stripeSubscription) {
  return safeString(stripeSubscription?.latest_invoice?.id || stripeSubscription?.latest_invoice || null);
}

function getTrialState(company, subscription, now = new Date()) {
  const trialEndsAt = subscription?.trialEndsAt || company.trialEndsAt;
  const trialStillOpen = trialEndsAt && new Date(trialEndsAt) > now;
  const isTrialActive = Boolean(
    (company.subscriptionStatus === BILLING_STATUS.TRIAL || subscription?.status === BILLING_STATUS.TRIAL) &&
    trialStillOpen
  );

  return {
    trialEndsAt: trialStillOpen ? new Date(trialEndsAt) : null,
    isTrialActive,
  };
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
  if (['draft', 'open', 'uncollectible'].includes(invoice.status)) return 'PENDING';
  if (['void', 'deleted'].includes(invoice.status)) return 'REJECTED';
  return 'REJECTED';
}

function mapPaymentIntentStatus(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'succeeded') return 'APPROVED';
  if (['processing', 'requires_confirmation', 'requires_capture', 'requires_action'].includes(normalized)) return 'PENDING';
  return 'REJECTED';
}

function normalizeLegacyFields(data = {}) {
  return {
    ...data,
    ...(Object.prototype.hasOwnProperty.call(data, 'stripeSubscriptionId')
      ? { mpPreapprovalId: data.stripeSubscriptionId }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(data, 'stripeCustomerId')
      ? { mpCustomerId: data.stripeCustomerId }
      : {}),
  };
}

function buildSubscriptionWriteModel({
  plan,
  stripeCustomerId,
  stripeSubscription,
  trialEndsAtOverride,
  setupIntentId,
  now = new Date(),
}) {
  const paymentIntent = getLatestPaymentIntent(stripeSubscription);
  const trialEndsAt = trialEndsAtOverride
    || (stripeSubscription?.trial_end ? new Date(stripeSubscription.trial_end * 1000) : null);
  const status = mapStripeSubscriptionStatus(stripeSubscription.status, trialEndsAt, now);

  return normalizeLegacyFields({
    plan,
    status,
    trialEndsAt: status === BILLING_STATUS.TRIAL ? trialEndsAt : null,
    currentPeriodStart: stripeSubscription.current_period_start
      ? new Date(stripeSubscription.current_period_start * 1000)
      : now,
    currentPeriodEnd: stripeSubscription.current_period_end
      ? new Date(stripeSubscription.current_period_end * 1000)
      : (trialEndsAt || addMonths(now, 1)),
    gracePeriodEnd: status === BILLING_STATUS.PAST_DUE ? addDays(now, GRACE_PERIOD_DAYS) : null,
    stripeCustomerId,
    stripeSubscriptionId: stripeSubscription.id,
    stripePriceId: getLatestPriceId(stripeSubscription),
    stripePaymentMethodId: safeString(stripeSubscription.default_payment_method || null),
    stripeLatestInvoiceId: getLatestInvoiceId(stripeSubscription),
    stripeSetupIntentId: setupIntentId || null,
    cancelledAt: status === BILLING_STATUS.CANCELLED ? new Date() : null,
    ...(paymentIntent ? { stripeLatestInvoiceId: safeString(paymentIntent.invoice || getLatestInvoiceId(stripeSubscription)) } : {}),
  });
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
    stripeSubscriptionId: subscription.stripeSubscriptionId || subscription.mpPreapprovalId,
    stripeCustomerId: subscription.stripeCustomerId || subscription.mpCustomerId,
    stripePriceId: subscription.stripePriceId || null,
    stripePaymentMethodId: subscription.stripePaymentMethodId || null,
    stripeLatestInvoiceId: subscription.stripeLatestInvoiceId || null,
  };
}

async function getCompany(companyId) {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) {
    throw new BillingError('Empresa nao encontrada.', 404);
  }
  return company;
}

async function getLatestSubscription(companyId) {
  return prisma.subscription.findFirst({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
  });
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

async function createOrReuseCustomer({ company, billingUser, latestSubscription }) {
  const existingCustomerId = latestSubscription?.stripeCustomerId || latestSubscription?.mpCustomerId || null;
  if (existingCustomerId) {
    await stripeService.updateCustomer(existingCustomerId, {
      email: billingUser.email,
      name: billingUser.name,
      metadata: {
        companyId: company.id,
        companyName: company.name,
      },
    });
    return existingCustomerId;
  }

  const stripeCustomer = await stripeService.createCustomer({
    email: billingUser.email,
    name: billingUser.name,
    companyId: company.id,
    companyName: company.name,
  });

  return stripeCustomer.id;
}

async function ensureLocalSubscriptionRecord({ companyId, plan, latestSubscription, trialEndsAt, createNew = false }) {
  const now = new Date();
  const shouldReuse = !createNew
    && latestSubscription
    && !latestSubscription.stripeSubscriptionId
    && !latestSubscription.mpPreapprovalId
    && [BILLING_STATUS.TRIAL, BILLING_STATUS.EXPIRED, BILLING_STATUS.CANCELLED].includes(latestSubscription.status);

  if (shouldReuse) {
    return prisma.subscription.update({
      where: { id: latestSubscription.id },
      data: {
        plan,
        status: trialEndsAt ? BILLING_STATUS.TRIAL : BILLING_STATUS.PAST_DUE,
        trialStart: latestSubscription.trialStart || now,
        trialEndsAt,
        currentPeriodStart: now,
        currentPeriodEnd: trialEndsAt || addMonths(now, 1),
        gracePeriodEnd: null,
        cancelledAt: null,
      },
    });
  }

  return prisma.subscription.create({
    data: {
      companyId,
      plan,
      status: trialEndsAt ? BILLING_STATUS.TRIAL : BILLING_STATUS.PAST_DUE,
      trialStart: trialEndsAt ? now : null,
      trialEndsAt,
      currentPeriodStart: now,
      currentPeriodEnd: trialEndsAt || addMonths(now, 1),
      gracePeriodEnd: null,
      cancelledAt: null,
    },
  });
}

async function syncSubscriptionAndCompany(subscriptionId, companyId, data) {
  return prisma.$transaction(async (tx) => {
    const updatedSubscription = await tx.subscription.update({
      where: { id: subscriptionId },
      data: normalizeLegacyFields(data),
    });

    await tx.company.update({
      where: { id: companyId },
      data: {
        plan: updatedSubscription.plan.toLowerCase(),
        subscriptionStatus: updatedSubscription.status,
        trialEndsAt: updatedSubscription.trialEndsAt,
      },
    });

    return updatedSubscription;
  });
}

async function saveStripeSubscription({
  localSubscription,
  companyId,
  plan,
  stripeCustomerId,
  stripeSubscription,
  trialEndsAt,
  setupIntentId,
}) {
  const writeModel = buildSubscriptionWriteModel({
    plan,
    stripeCustomerId,
    stripeSubscription,
    trialEndsAtOverride: trialEndsAt,
    setupIntentId,
  });

  const updatedSubscription = await syncSubscriptionAndCompany(localSubscription.id, companyId, {
    ...writeModel,
    trialStart: localSubscription.trialStart || new Date(),
  });

  return formatSubscriptionResponse(updatedSubscription);
}

async function ensurePaymentMethodAttached({ customerId, paymentMethodId }) {
  await stripeService.attachPaymentMethod({
    customerId,
    paymentMethodId,
  });

  const paymentMethod = await stripeService.retrievePaymentMethod(paymentMethodId);
  if (paymentMethod.customer && String(paymentMethod.customer) !== String(customerId)) {
    throw new BillingError('O metodo de pagamento informado pertence a outro cliente da Stripe.', 409);
  }

  return paymentMethod;
}

async function createSubscription({ companyId, userId, plan, paymentMethodId, setupIntentId = null }) {
  const planKey = normalizePlanKey(plan);
  assertPaymentMethod(paymentMethodId);

  const [company, latestSubscription, billingUser] = await Promise.all([
    getCompany(companyId),
    getLatestSubscription(companyId),
    getBillingUser({ companyId, userId }),
  ]);

  if (latestSubscription?.stripeSubscriptionId && MANAGED_STATUSES.includes(latestSubscription.status)) {
    throw new BillingError('A empresa ja possui uma assinatura ativa ou em cobranca na Stripe.', 409);
  }

  const now = new Date();
  const { isTrialActive, trialEndsAt } = getTrialState(company, latestSubscription, now);
  const localSubscription = await ensureLocalSubscriptionRecord({
    companyId,
    plan: planKey,
    latestSubscription,
    trialEndsAt: isTrialActive ? trialEndsAt : null,
  });

  try {
    const stripeCustomerId = await createOrReuseCustomer({ company, billingUser, latestSubscription });
    await ensurePaymentMethodAttached({ customerId: stripeCustomerId, paymentMethodId });

    const stripeSubscription = await stripeService.createSubscription({
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

    return saveStripeSubscription({
      localSubscription,
      companyId,
      plan: planKey,
      stripeCustomerId,
      stripeSubscription,
      trialEndsAt: isTrialActive ? trialEndsAt : null,
      setupIntentId,
    });
  } catch (error) {
    throw new BillingError(`Falha ao criar assinatura na Stripe: ${error.message}`, 422);
  }
}

async function changePlan({ companyId, userId, plan, paymentMethodId, setupIntentId = null }) {
  const planKey = normalizePlanKey(plan);
  assertPaymentMethod(paymentMethodId);

  const [company, subscription, billingUser] = await Promise.all([
    getCompany(companyId),
    getLatestSubscription(companyId),
    getBillingUser({ companyId, userId }),
  ]);

  if (!subscription) {
    throw new BillingError('Nenhuma assinatura encontrada para alterar o plano.', 404);
  }

  if (!subscription.stripeSubscriptionId && !subscription.mpPreapprovalId) {
    return {
      message: `Plano ${PLAN_NAMES[planKey]} configurado com sucesso.`,
      subscription: await createSubscription({ companyId, userId, plan: planKey, paymentMethodId, setupIntentId }),
    };
  }

  const stripeSubscriptionId = subscription.stripeSubscriptionId || subscription.mpPreapprovalId;
  const stripeCustomerId = subscription.stripeCustomerId || subscription.mpCustomerId;
  const { isTrialActive, trialEndsAt } = getTrialState(company, subscription);

  try {
    const customerId = stripeCustomerId || await createOrReuseCustomer({ company, billingUser, latestSubscription: subscription });
    await ensurePaymentMethodAttached({ customerId, paymentMethodId });

    const updatedStripeSubscription = await stripeService.updateSubscription({
      subscriptionId: stripeSubscriptionId,
      paymentMethodId,
      planKey,
      trialEnd: isTrialActive ? trialEndsAt : null,
      metadata: {
        companyId,
        localSubscriptionId: subscription.id,
        plan: planKey,
      },
    });

    const savedSubscription = await saveStripeSubscription({
      localSubscription: subscription,
      companyId,
      plan: planKey,
      stripeCustomerId: customerId,
      stripeSubscription: updatedStripeSubscription,
      trialEndsAt: isTrialActive ? trialEndsAt : null,
      setupIntentId,
    });

    return {
      message: `Plano alterado para ${PLAN_NAMES[planKey]} com sucesso.`,
      subscription: savedSubscription,
    };
  } catch (error) {
    throw new BillingError(`Falha ao atualizar assinatura na Stripe: ${error.message}`, 422);
  }
}

async function reactivateSubscription({ companyId, userId, paymentMethodId, plan, setupIntentId = null }) {
  const planKey = normalizePlanKey(plan);
  assertPaymentMethod(paymentMethodId);

  const subscription = await getLatestSubscription(companyId);
  const stripeSubscriptionId = subscription?.stripeSubscriptionId || subscription?.mpPreapprovalId || null;

  if (subscription && MANAGED_STATUSES.includes(subscription.status)) {
    throw new BillingError('A empresa ja possui uma assinatura gerenciada ativa na Stripe.', 409);
  }

  if (stripeSubscriptionId && ![BILLING_STATUS.CANCELLED, BILLING_STATUS.EXPIRED].includes(subscription.status)) {
    try {
      await stripeService.cancelSubscription(stripeSubscriptionId);
    } catch (error) {
      throw new BillingError(`Falha ao encerrar a assinatura anterior na Stripe: ${error.message}`, 422);
    }
  }

  const nextSubscription = await createSubscription({
    companyId,
    userId,
    plan: planKey,
    paymentMethodId,
    setupIntentId,
  });

  return {
    message: `Assinatura reativada com sucesso no plano ${PLAN_NAMES[planKey]}.`,
    subscription: nextSubscription,
  };
}

async function cancelSubscription(companyId) {
  const subscription = await getLatestSubscription(companyId);
  if (!subscription || [BILLING_STATUS.CANCELLED, BILLING_STATUS.EXPIRED].includes(subscription.status)) {
    throw new BillingError('Nenhuma assinatura ativa encontrada.', 404);
  }

  const stripeSubscriptionId = subscription.stripeSubscriptionId || subscription.mpPreapprovalId || null;

  if (stripeSubscriptionId) {
    try {
      await stripeService.cancelSubscription(stripeSubscriptionId);
    } catch (error) {
      throw new BillingError(`Falha ao cancelar assinatura na Stripe: ${error.message}`, 422);
    }
  }

  await syncSubscriptionAndCompany(subscription.id, companyId, {
    status: BILLING_STATUS.CANCELLED,
    cancelledAt: new Date(),
    gracePeriodEnd: null,
  });

  return { message: 'Assinatura cancelada com sucesso.' };
}

async function getSubscriptionStatus(companyId) {
  await reconcileCompanyBillingState(companyId);

  const subscription = await getLatestSubscription(companyId);
  if (!subscription) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { plan: true, subscriptionStatus: true, trialEndsAt: true, createdAt: true },
    });
    if (!company) return null;

    const planKey = normalizePlanKey(company.plan);
    return {
      id: null,
      plan: planKey,
      planName: PLAN_NAMES[planKey],
      status: company.subscriptionStatus,
      trialEndsAt: company.trialEndsAt,
      trialDaysLeft: company.trialEndsAt ? Math.max(0, Math.ceil((new Date(company.trialEndsAt) - new Date()) / 86400000)) : 0,
      currentPeriodStart: company.createdAt,
      currentPeriodEnd: company.trialEndsAt,
      gracePeriodEnd: null,
      createdAt: company.createdAt,
      stripeSubscriptionId: null,
      stripeCustomerId: null,
      stripePriceId: null,
      stripePaymentMethodId: null,
      stripeLatestInvoiceId: null,
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

async function findSubscriptionByStripeReferences({ stripeSubscriptionId, localSubscriptionId, companyId, stripeCustomerId }) {
  if (stripeSubscriptionId) {
    const byStripe = await prisma.subscription.findFirst({
      where: {
        OR: [
          { stripeSubscriptionId: String(stripeSubscriptionId) },
          { mpPreapprovalId: String(stripeSubscriptionId) },
        ],
      },
    });
    if (byStripe) return byStripe;
  }

  if (localSubscriptionId) {
    const byLocal = await prisma.subscription.findUnique({ where: { id: String(localSubscriptionId) } });
    if (byLocal) return byLocal;
  }

  if (companyId) {
    const byCompany = await prisma.subscription.findFirst({
      where: { companyId: String(companyId) },
      orderBy: { createdAt: 'desc' },
    });
    if (byCompany) return byCompany;
  }

  if (stripeCustomerId) {
    return prisma.subscription.findFirst({
      where: {
        OR: [
          { stripeCustomerId: String(stripeCustomerId) },
          { mpCustomerId: String(stripeCustomerId) },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  return null;
}

async function upsertInvoicePayment(invoice, subscription) {
  const paymentIntentId = safeString(invoice.payment_intent?.id || invoice.payment_intent || null);
  const invoiceId = safeString(invoice.id);
  const paymentMethodId = safeString(invoice.default_payment_method || invoice.payment_settings?.default_payment_method || null);
  const amount = Number((invoice.amount_paid ?? invoice.amount_due ?? 0) / 100);
  const paidAt = invoice.status === 'paid'
    ? new Date((invoice.status_transitions?.paid_at || Math.floor(Date.now() / 1000)) * 1000)
    : null;
  const failureReason = invoice.last_payment_error?.message || invoice.last_finalization_error?.message || null;
  const where = paymentIntentId
    ? { stripePaymentIntentId: paymentIntentId }
    : { mpPaymentId: invoiceId };

  return prisma.payment.upsert({
    where,
    create: {
      subscriptionId: subscription.id,
      companyId: subscription.companyId,
      stripePaymentIntentId: paymentIntentId,
      stripeInvoiceId: invoiceId,
      stripePaymentMethodId: paymentMethodId,
      mpPaymentId: invoiceId,
      amount,
      status: mapInvoiceStatus(invoice),
      paidAt,
      failureReason,
    },
    update: {
      stripeInvoiceId: invoiceId,
      stripePaymentMethodId: paymentMethodId,
      amount,
      status: mapInvoiceStatus(invoice),
      paidAt,
      failureReason,
    },
  });
}

async function upsertPaymentIntentPayment(paymentIntent, subscription) {
  const paymentIntentId = safeString(paymentIntent.id);
  const invoiceId = safeString(paymentIntent.invoice || null);
  const paymentMethodId = safeString(paymentIntent.payment_method || null);
  const amount = Number((paymentIntent.amount || 0) / 100);
  const paidAt = paymentIntent.status === 'succeeded' ? new Date() : null;
  const failureReason = paymentIntent.last_payment_error?.message || null;

  return prisma.payment.upsert({
    where: { stripePaymentIntentId: paymentIntentId },
    create: {
      subscriptionId: subscription.id,
      companyId: subscription.companyId,
      stripePaymentIntentId: paymentIntentId,
      stripeInvoiceId: invoiceId,
      stripePaymentMethodId: paymentMethodId,
      mpPaymentId: paymentIntentId,
      amount,
      status: mapPaymentIntentStatus(paymentIntent.status),
      paidAt,
      failureReason,
    },
    update: {
      stripeInvoiceId: invoiceId,
      stripePaymentMethodId: paymentMethodId,
      amount,
      status: mapPaymentIntentStatus(paymentIntent.status),
      paidAt,
      failureReason,
    },
  });
}

async function handleStripeInvoiceEvent(invoice) {
  const subscription = await findSubscriptionByStripeReferences({
    stripeSubscriptionId: invoice.subscription,
    localSubscriptionId: invoice.metadata?.localSubscriptionId,
    companyId: invoice.metadata?.companyId,
    stripeCustomerId: invoice.customer,
  });

  if (!subscription) {
    console.warn('[Billing] Subscription nao encontrada para invoice webhook:', invoice.id);
    return;
  }

  await upsertInvoicePayment(invoice, subscription);

  const updateData = {
    stripeLatestInvoiceId: safeString(invoice.id),
    stripePaymentMethodId: safeString(invoice.default_payment_method || subscription.stripePaymentMethodId || null),
  };

  if (invoice.status === 'paid') {
    const periodLine = invoice.lines?.data?.find((line) => line.type === 'subscription') || invoice.lines?.data?.[0];
    updateData.status = BILLING_STATUS.ACTIVE;
    updateData.currentPeriodStart = periodLine?.period?.start ? new Date(periodLine.period.start * 1000) : new Date();
    updateData.currentPeriodEnd = periodLine?.period?.end ? new Date(periodLine.period.end * 1000) : addMonths(new Date(), 1);
    updateData.gracePeriodEnd = null;
    updateData.trialEndsAt = null;
  } else if (invoice.status === 'open') {
    updateData.status = BILLING_STATUS.PAST_DUE;
    updateData.gracePeriodEnd = addDays(new Date(), GRACE_PERIOD_DAYS);
  }

  await syncSubscriptionAndCompany(subscription.id, subscription.companyId, updateData);
}

async function handleStripeSubscriptionEvent(stripeSubscription) {
  const subscription = await findSubscriptionByStripeReferences({
    stripeSubscriptionId: stripeSubscription.id,
    localSubscriptionId: stripeSubscription.metadata?.localSubscriptionId,
    companyId: stripeSubscription.metadata?.companyId,
    stripeCustomerId: stripeSubscription.customer,
  });

  if (!subscription) {
    console.warn('[Billing] Subscription local nao encontrada para evento da Stripe:', stripeSubscription.id);
    return;
  }

  const trialEndsAt = stripeSubscription.trial_end ? new Date(stripeSubscription.trial_end * 1000) : null;
  await syncSubscriptionAndCompany(subscription.id, subscription.companyId, {
    ...buildSubscriptionWriteModel({
      plan: normalizePlanKey(stripeSubscription.metadata?.plan || subscription.plan),
      stripeCustomerId: safeString(stripeSubscription.customer || subscription.stripeCustomerId || subscription.mpCustomerId),
      stripeSubscription,
      trialEndsAtOverride: trialEndsAt,
    }),
  });
}

async function handleStripePaymentIntentEvent(paymentIntent) {
  const subscription = await findSubscriptionByStripeReferences({
    stripeSubscriptionId: paymentIntent.metadata?.stripeSubscriptionId,
    localSubscriptionId: paymentIntent.metadata?.localSubscriptionId,
    companyId: paymentIntent.metadata?.companyId,
    stripeCustomerId: paymentIntent.customer,
  });

  if (!subscription) {
    return;
  }

  await upsertPaymentIntentPayment(paymentIntent, subscription);

  if (paymentIntent.status === 'succeeded') {
    await syncSubscriptionAndCompany(subscription.id, subscription.companyId, {
      status: BILLING_STATUS.ACTIVE,
      gracePeriodEnd: null,
      stripePaymentMethodId: safeString(paymentIntent.payment_method || subscription.stripePaymentMethodId || null),
    });
    return;
  }

  if (['requires_payment_method', 'canceled'].includes(String(paymentIntent.status || '').toLowerCase())) {
    await syncSubscriptionAndCompany(subscription.id, subscription.companyId, {
      status: BILLING_STATUS.PAST_DUE,
      gracePeriodEnd: addDays(new Date(), GRACE_PERIOD_DAYS),
      stripePaymentMethodId: safeString(paymentIntent.payment_method || subscription.stripePaymentMethodId || null),
    });
  }
}

async function handleStripeSetupIntentEvent(setupIntent) {
  const subscription = await findSubscriptionByStripeReferences({
    localSubscriptionId: setupIntent.metadata?.localSubscriptionId,
    companyId: setupIntent.metadata?.companyId,
    stripeCustomerId: setupIntent.customer,
  });

  if (!subscription) {
    return;
  }

  const updateData = {
    stripeSetupIntentId: setupIntent.id,
    stripePaymentMethodId: safeString(setupIntent.payment_method || null),
  };

  if (setupIntent.status === 'requires_action') {
    updateData.status = BILLING_STATUS.PAST_DUE;
    updateData.gracePeriodEnd = addDays(new Date(), GRACE_PERIOD_DAYS);
  }

  await syncSubscriptionAndCompany(subscription.id, subscription.companyId, updateData);
}

async function handleStripeCustomerEvent(customer) {
  const companyId = customer.metadata?.companyId;
  if (!companyId) {
    return;
  }

  const subscription = await getLatestSubscription(companyId);
  if (!subscription) {
    return;
  }

  await syncSubscriptionAndCompany(subscription.id, companyId, {
    stripeCustomerId: customer.id,
  });
}

async function handleStripePaymentMethodAttached(paymentMethod) {
  const customerId = safeString(paymentMethod.customer || null);
  if (!customerId) {
    return;
  }

  const subscription = await findSubscriptionByStripeReferences({ stripeCustomerId: customerId });
  if (!subscription) {
    return;
  }

  await syncSubscriptionAndCompany(subscription.id, subscription.companyId, {
    stripePaymentMethodId: paymentMethod.id,
  });
}

async function reconcileCompanyBillingState(companyId) {
  const subscription = await getLatestSubscription(companyId);
  if (!subscription) return null;

  const stripeSubscriptionId = subscription.stripeSubscriptionId || subscription.mpPreapprovalId || null;
  if (stripeSubscriptionId) {
    try {
      const remoteSubscription = await stripeService.retrieveSubscription(stripeSubscriptionId);
      await handleStripeSubscriptionEvent(remoteSubscription);
      return getLatestSubscription(companyId);
    } catch (error) {
      console.warn('[Billing] Falha ao reconciliar assinatura com Stripe:', {
        companyId,
        stripeSubscriptionId,
        message: error.message,
      });
    }
  }

  const now = new Date();

  if (subscription.status === BILLING_STATUS.TRIAL && subscription.trialEndsAt && new Date(subscription.trialEndsAt) <= now) {
    await syncSubscriptionAndCompany(subscription.id, subscription.companyId, {
      status: subscription.stripeSubscriptionId ? BILLING_STATUS.PAST_DUE : BILLING_STATUS.EXPIRED,
      gracePeriodEnd: subscription.stripeSubscriptionId ? addDays(now, GRACE_PERIOD_DAYS) : null,
    });
    return getLatestSubscription(companyId);
  }

  if (subscription.status === BILLING_STATUS.PAST_DUE && subscription.gracePeriodEnd && new Date(subscription.gracePeriodEnd) <= now) {
    await syncSubscriptionAndCompany(subscription.id, subscription.companyId, {
      status: BILLING_STATUS.EXPIRED,
      gracePeriodEnd: null,
    });
    return getLatestSubscription(companyId);
  }

  return subscription;
}

async function reconcileAllSubscriptions() {
  const activeSubscriptions = await prisma.subscription.findMany({
    where: {
      status: { in: MANAGED_STATUSES },
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
  constructor(message, statusCode = 400, details = null) {
    super(message);
    this.name = 'BillingError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

module.exports = {
  addDays,
  addMonths,
  createSubscription,
  cancelSubscription,
  getSubscriptionStatus,
  listPayments,
  handleStripeInvoiceEvent,
  handleStripeSubscriptionEvent,
  handleStripePaymentIntentEvent,
  handleStripeSetupIntentEvent,
  handleStripeCustomerEvent,
  handleStripePaymentMethodAttached,
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
