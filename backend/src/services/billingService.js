const prisma = require('../config/database');
const stripeService = require('./stripeService');
const {
  TRIAL_DAYS,
  PLAN_PRICES,
  PLAN_NAMES,
  BILLING_STATUS,
  SUBSCRIPTION_STATUS,
  normalizePlanKey,
  getPlanConfig,
  getPlanFromStripePriceId,
  mapStripeSubscriptionStatus,
  mapSubscriptionStatusToBillingStatus,
  isSubscriptionActive,
  isSubscriptionRecoverable,
} = require('../config/billingConfig');

function toDate(value) {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

function fromStripeTimestamp(value) {
  if (!value) return null;
  return new Date(Number(value) * 1000);
}

function asString(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value.id) return String(value.id);
  return String(value);
}

function computeTrialDaysLeft(trialEndsAt) {
  if (!trialEndsAt) return 0;
  const diff = new Date(trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86400000));
}

function getStripePriceId(stripeSubscription) {
  return asString(stripeSubscription?.items?.data?.[0]?.price?.id || null);
}

function getStripePaymentMethodId(stripeSubscription) {
  return asString(
    stripeSubscription?.default_payment_method?.id
      || stripeSubscription?.default_payment_method
      || stripeSubscription?.latest_invoice?.payment_intent?.payment_method
      || null
  );
}

function getStripeInvoiceId(stripeSubscription) {
  return asString(stripeSubscription?.latest_invoice?.id || stripeSubscription?.latest_invoice || null);
}

function resolvePlanKey({ explicitPlan, stripeSubscription, fallbackPlan }) {
  const priceId = getStripePriceId(stripeSubscription);
  const fromPrice = getPlanFromStripePriceId(priceId);
  if (fromPrice) return fromPrice.key;

  return normalizePlanKey(
    explicitPlan
      || stripeSubscription?.metadata?.planKey
      || fallbackPlan
      || 'BASIC'
  );
}

function mapInvoicePaymentStatus(invoice) {
  const normalized = String(invoice?.status || '').toLowerCase();

  if (invoice?.paid || normalized === 'paid') return 'PAID';
  if (['open', 'draft'].includes(normalized)) return 'PENDING';
  if (['uncollectible'].includes(normalized) || invoice?.attempted) return 'FAILED';
  if (normalized === 'void') return 'VOID';
  return 'PENDING';
}

function mapInvoiceBillingStatus(invoice, eventType = null) {
  if (eventType === 'invoice.paid') return BILLING_STATUS.PAID;
  if (eventType === 'invoice.payment_failed') return BILLING_STATUS.PAST_DUE;
  if (eventType === 'invoice.finalized') return BILLING_STATUS.PENDING;

  const normalized = String(invoice?.status || '').toLowerCase();

  if (invoice?.paid || normalized === 'paid') return BILLING_STATUS.PAID;
  if (normalized === 'open') return BILLING_STATUS.PENDING;
  if (normalized === 'uncollectible') return BILLING_STATUS.UNPAID;
  if (normalized === 'void') return BILLING_STATUS.CANCELED;
  return BILLING_STATUS.PENDING;
}

function formatSubscriptionResponse(subscription, companyPlan) {
  if (!subscription) return null;

  const planKey = normalizePlanKey(subscription.plan || companyPlan || 'BASIC');
  const trialEndsAt = subscription.trialEndsAt || null;

  return {
    id: subscription.id,
    plan: planKey,
    planSlug: getPlanConfig(planKey).slug,
    planName: PLAN_NAMES[planKey],
    planPrice: PLAN_PRICES[planKey],
    status: subscription.status,
    billingStatus: subscription.billingStatus,
    trialStart: subscription.trialStart,
    trialEndsAt,
    trialDaysLeft: computeTrialDaysLeft(trialEndsAt),
    currentPeriodStart: subscription.currentPeriodStart,
    currentPeriodEnd: subscription.currentPeriodEnd,
    cancelAtPeriodEnd: Boolean(subscription.cancelAtPeriodEnd),
    cancelledAt: subscription.cancelledAt,
    stripeCustomerId: subscription.stripeCustomerId,
    stripeSubscriptionId: subscription.stripeSubscriptionId,
    stripePriceId: subscription.stripePriceId,
    stripePaymentMethodId: subscription.stripePaymentMethodId,
    stripeCheckoutSessionId: subscription.stripeCheckoutSessionId,
    lastInvoiceId: subscription.lastInvoiceId,
    portalEligible: Boolean(subscription.stripeCustomerId),
  };
}

async function getCompany(companyId) {
  const company = await prisma.company.findUnique({ where: { id: companyId } });

  if (!company) {
    throw new BillingError('Empresa nao encontrada.', 404);
  }

  return company;
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

async function getLatestSubscription(companyId) {
  return prisma.subscription.findFirst({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
  });
}

async function findSubscriptionByStripeReferences({ stripeSubscriptionId, stripeCustomerId, checkoutSessionId, localSubscriptionId, companyId }) {
  if (stripeSubscriptionId) {
    const byStripeId = await prisma.subscription.findUnique({
      where: { stripeSubscriptionId: String(stripeSubscriptionId) },
    });
    if (byStripeId) return byStripeId;
  }

  if (checkoutSessionId) {
    const byCheckoutSession = await prisma.subscription.findFirst({
      where: { stripeCheckoutSessionId: String(checkoutSessionId) },
      orderBy: { createdAt: 'desc' },
    });
    if (byCheckoutSession) return byCheckoutSession;
  }

  if (localSubscriptionId) {
    const byLocalId = await prisma.subscription.findUnique({
      where: { id: String(localSubscriptionId) },
    });
    if (byLocalId) return byLocalId;
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
      where: { stripeCustomerId: String(stripeCustomerId) },
      orderBy: { createdAt: 'desc' },
    });
  }

  return null;
}

async function ensureStripeCustomer({ company, billingUser }) {
  if (company.stripeCustomerId) {
    await stripeService.updateCustomer(company.stripeCustomerId, {
      email: billingUser.email,
      name: billingUser.name,
      metadata: {
        companyId: company.id,
        companyName: company.name,
        userId: billingUser.id,
      },
    });

    return company.stripeCustomerId;
  }

  const stripeCustomer = await stripeService.createCustomer({
    email: billingUser.email,
    name: billingUser.name,
    companyId: company.id,
    companyName: company.name,
    userId: billingUser.id,
  });

  await prisma.company.update({
    where: { id: company.id },
    data: { stripeCustomerId: stripeCustomer.id },
  });

  return stripeCustomer.id;
}

async function ensureCheckoutPlaceholderSubscription({ companyId, planKey, latestSubscription }) {
  if (latestSubscription && !latestSubscription.stripeSubscriptionId && latestSubscription.status === SUBSCRIPTION_STATUS.INCOMPLETE) {
    return prisma.subscription.update({
      where: { id: latestSubscription.id },
      data: {
        plan: planKey,
        billingStatus: BILLING_STATUS.INCOMPLETE,
        status: SUBSCRIPTION_STATUS.INCOMPLETE,
        trialStart: null,
        trialEndsAt: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        cancelledAt: null,
        stripePriceId: null,
        stripePaymentMethodId: null,
        stripeSubscriptionId: null,
        stripeCheckoutSessionId: null,
        lastInvoiceId: null,
      },
    });
  }

  return prisma.subscription.create({
    data: {
      companyId,
      plan: planKey,
      status: SUBSCRIPTION_STATUS.INCOMPLETE,
      billingStatus: BILLING_STATUS.INCOMPLETE,
      cancelAtPeriodEnd: false,
    },
  });
}

function buildStripeSubscriptionSnapshot({ stripeSubscription, fallbackPlanKey, stripeCustomerId, checkoutSessionId }) {
  const status = mapStripeSubscriptionStatus(stripeSubscription.status);
  const planKey = resolvePlanKey({
    explicitPlan: stripeSubscription.metadata?.planKey,
    stripeSubscription,
    fallbackPlan: fallbackPlanKey,
  });

  return {
    planKey,
    companyData: {
      plan: getPlanConfig(planKey).slug,
      subscriptionStatus: status,
      billingStatus: mapSubscriptionStatusToBillingStatus(status),
      trialEndsAt: fromStripeTimestamp(stripeSubscription.trial_end),
      currentPeriodEnd: fromStripeTimestamp(stripeSubscription.current_period_end),
      cancelAtPeriodEnd: Boolean(stripeSubscription.cancel_at_period_end),
      stripeCustomerId: asString(stripeCustomerId || stripeSubscription.customer),
      stripeSubscriptionId: stripeSubscription.id,
      stripePriceId: getStripePriceId(stripeSubscription),
      lastInvoiceId: getStripeInvoiceId(stripeSubscription),
    },
    subscriptionData: {
      plan: planKey,
      status,
      billingStatus: mapSubscriptionStatusToBillingStatus(status),
      trialStart: fromStripeTimestamp(stripeSubscription.trial_start),
      trialEndsAt: fromStripeTimestamp(stripeSubscription.trial_end),
      currentPeriodStart: fromStripeTimestamp(stripeSubscription.current_period_start),
      currentPeriodEnd: fromStripeTimestamp(stripeSubscription.current_period_end),
      cancelAtPeriodEnd: Boolean(stripeSubscription.cancel_at_period_end),
      cancelledAt: fromStripeTimestamp(stripeSubscription.canceled_at),
      stripeCustomerId: asString(stripeCustomerId || stripeSubscription.customer),
      stripeSubscriptionId: stripeSubscription.id,
      stripePriceId: getStripePriceId(stripeSubscription),
      stripePaymentMethodId: getStripePaymentMethodId(stripeSubscription),
      stripeCheckoutSessionId: checkoutSessionId || null,
      lastInvoiceId: getStripeInvoiceId(stripeSubscription),
    },
  };
}

async function persistStripeSubscriptionSnapshot({
  companyId,
  stripeSubscription,
  localSubscriptionId = null,
  checkoutSessionId = null,
  fallbackPlanKey = null,
  stripeCustomerId = null,
}) {
  const snapshot = buildStripeSubscriptionSnapshot({
    stripeSubscription,
    fallbackPlanKey,
    stripeCustomerId,
    checkoutSessionId,
  });

  return prisma.$transaction(async (tx) => {
    let subscription = null;

    if (localSubscriptionId) {
      subscription = await tx.subscription.findUnique({ where: { id: localSubscriptionId } });
    }

    if (!subscription && stripeSubscription.id) {
      subscription = await tx.subscription.findUnique({
        where: { stripeSubscriptionId: stripeSubscription.id },
      });
    }

    if (!subscription && checkoutSessionId) {
      subscription = await tx.subscription.findFirst({
        where: { stripeCheckoutSessionId: checkoutSessionId },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (!subscription) {
      subscription = await tx.subscription.create({
        data: {
          companyId,
          ...snapshot.subscriptionData,
        },
      });
    } else {
      subscription = await tx.subscription.update({
        where: { id: subscription.id },
        data: snapshot.subscriptionData,
      });
    }

    await tx.company.update({
      where: { id: companyId },
      data: snapshot.companyData,
    });

    return subscription;
  });
}

async function createCheckoutSession({ companyId, userId, plan }) {
  const planKey = normalizePlanKey(plan);
  const [company, billingUser, latestSubscription] = await Promise.all([
    getCompany(companyId),
    getBillingUser({ companyId, userId }),
    getLatestSubscription(companyId),
  ]);

  if (
    latestSubscription?.stripeSubscriptionId
    && ![SUBSCRIPTION_STATUS.CANCELED, SUBSCRIPTION_STATUS.INCOMPLETE_EXPIRED].includes(latestSubscription.status)
  ) {
    throw new BillingError('A empresa ja possui uma assinatura gerenciada pela Stripe. Use o portal para alterar a cobranca.', 409);
  }

  const stripeCustomerId = await ensureStripeCustomer({ company, billingUser });
  const placeholderSubscription = await ensureCheckoutPlaceholderSubscription({
    companyId,
    planKey,
    latestSubscription,
  });

  const checkoutSession = await stripeService.createCheckoutSession({
    customerId: stripeCustomerId,
    customerEmail: billingUser.email,
    companyId,
    userId,
    localSubscriptionId: placeholderSubscription.id,
    planKey,
  });

  await prisma.$transaction(async (tx) => {
    await tx.subscription.update({
      where: { id: placeholderSubscription.id },
      data: {
        stripeCustomerId,
        stripeCheckoutSessionId: checkoutSession.id,
      },
    });

    await tx.company.update({
      where: { id: companyId },
      data: {
        plan: getPlanConfig(planKey).slug,
        stripeCustomerId,
        subscriptionStatus: SUBSCRIPTION_STATUS.INCOMPLETE,
        billingStatus: BILLING_STATUS.INCOMPLETE,
        stripeSubscriptionId: null,
        stripePriceId: null,
        trialEndsAt: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        lastInvoiceId: null,
      },
    });
  });

  return {
    checkoutSessionId: checkoutSession.id,
    checkoutUrl: checkoutSession.url,
  };
}

async function syncCheckoutSession({ companyId, sessionId }) {
  const checkoutSession = await stripeService.retrieveCheckoutSession(sessionId);
  const sessionCompanyId = checkoutSession.metadata?.companyId || checkoutSession.client_reference_id;

  if (String(sessionCompanyId || '') !== String(companyId)) {
    throw new BillingError('Sessao de checkout invalida para esta empresa.', 403);
  }

  if (!checkoutSession.subscription) {
    const subscription = await getLatestSubscription(companyId);
    return formatSubscriptionResponse(subscription, (await getCompany(companyId)).plan);
  }

  const stripeSubscription = checkoutSession.subscription.id
    ? checkoutSession.subscription
    : await stripeService.retrieveSubscription(checkoutSession.subscription);

  const savedSubscription = await persistStripeSubscriptionSnapshot({
    companyId,
    stripeSubscription,
    localSubscriptionId: checkoutSession.metadata?.localSubscriptionId || null,
    checkoutSessionId: checkoutSession.id,
    fallbackPlanKey: checkoutSession.metadata?.planKey || null,
    stripeCustomerId: asString(checkoutSession.customer),
  });

  return formatSubscriptionResponse(savedSubscription, getPlanConfig(savedSubscription.plan).slug);
}

async function createPortalSession({ companyId }) {
  const company = await getCompany(companyId);
  const stripeCustomerId = company.stripeCustomerId;

  if (!stripeCustomerId) {
    throw new BillingError('Nenhum cliente Stripe foi encontrado para esta empresa.', 409);
  }

  const session = await stripeService.createPortalSession({
    customerId: stripeCustomerId,
  });

  return { portalUrl: session.url };
}

async function getSubscriptionStatus(companyId) {
  await reconcileCompanyBillingState(companyId);

  const [company, subscription] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId } }),
    getLatestSubscription(companyId),
  ]);

  if (!company) {
    return null;
  }

  if (!subscription) {
    return {
      id: null,
      plan: normalizePlanKey(company.plan),
      planSlug: company.plan,
      planName: PLAN_NAMES[normalizePlanKey(company.plan)],
      planPrice: PLAN_PRICES[normalizePlanKey(company.plan)],
      status: company.subscriptionStatus,
      billingStatus: company.billingStatus,
      trialStart: null,
      trialEndsAt: company.trialEndsAt,
      trialDaysLeft: computeTrialDaysLeft(company.trialEndsAt),
      currentPeriodStart: null,
      currentPeriodEnd: company.currentPeriodEnd,
      cancelAtPeriodEnd: Boolean(company.cancelAtPeriodEnd),
      cancelledAt: null,
      stripeCustomerId: company.stripeCustomerId,
      stripeSubscriptionId: company.stripeSubscriptionId,
      stripePriceId: company.stripePriceId,
      stripePaymentMethodId: null,
      stripeCheckoutSessionId: null,
      lastInvoiceId: company.lastInvoiceId,
      portalEligible: Boolean(company.stripeCustomerId),
    };
  }

  return formatSubscriptionResponse(subscription, company.plan);
}

async function listPayments(companyId, limit = 50) {
  return prisma.payment.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

async function upsertInvoicePayment(invoice, subscription) {
  const invoiceId = asString(invoice.id);
  const paymentIntentId = asString(invoice.payment_intent?.id || invoice.payment_intent || null);
  const paymentMethodId = asString(
    invoice.payment_settings?.default_payment_method
      || invoice.default_payment_method
      || invoice.charge?.payment_method
      || null
  );

  return prisma.payment.upsert({
    where: { stripeInvoiceId: invoiceId },
    create: {
      companyId: subscription.companyId,
      subscriptionId: subscription.id,
      stripeInvoiceId: invoiceId,
      stripePaymentIntentId: paymentIntentId,
      stripePaymentMethodId: paymentMethodId,
      amount: Number((invoice.amount_paid ?? invoice.amount_due ?? 0) / 100),
      status: mapInvoicePaymentStatus(invoice),
      paidAt: invoice.paid ? new Date() : null,
      failureReason: invoice.last_finalization_error?.message || invoice.last_payment_error?.message || null,
    },
    update: {
      stripePaymentIntentId: paymentIntentId,
      stripePaymentMethodId: paymentMethodId,
      amount: Number((invoice.amount_paid ?? invoice.amount_due ?? 0) / 100),
      status: mapInvoicePaymentStatus(invoice),
      paidAt: invoice.paid ? new Date() : null,
      failureReason: invoice.last_finalization_error?.message || invoice.last_payment_error?.message || null,
    },
  });
}

async function handleCheckoutSessionCompleted(session) {
  const companyId = session.metadata?.companyId || session.client_reference_id;
  if (!companyId || !session.subscription) {
    return;
  }

  const stripeSubscription = session.subscription.id
    ? session.subscription
    : await stripeService.retrieveSubscription(session.subscription);

  await persistStripeSubscriptionSnapshot({
    companyId,
    stripeSubscription,
    localSubscriptionId: session.metadata?.localSubscriptionId || null,
    checkoutSessionId: session.id,
    fallbackPlanKey: session.metadata?.planKey || null,
    stripeCustomerId: asString(session.customer),
  });
}

async function handleStripeSubscriptionEvent(stripeSubscription) {
  const existingSubscription = await findSubscriptionByStripeReferences({
    stripeSubscriptionId: stripeSubscription.id,
    localSubscriptionId: stripeSubscription.metadata?.localSubscriptionId,
    companyId: stripeSubscription.metadata?.companyId,
    stripeCustomerId: stripeSubscription.customer,
  });

  const companyId = stripeSubscription.metadata?.companyId || existingSubscription?.companyId;
  if (!companyId) {
    console.warn('[Billing] Evento de subscription sem companyId local:', stripeSubscription.id);
    return;
  }

  await persistStripeSubscriptionSnapshot({
    companyId,
    stripeSubscription,
    localSubscriptionId: existingSubscription?.id || stripeSubscription.metadata?.localSubscriptionId || null,
    fallbackPlanKey: existingSubscription?.plan || stripeSubscription.metadata?.planKey || null,
    stripeCustomerId: asString(stripeSubscription.customer),
  });
}

async function handleStripeInvoiceEvent(invoice, eventType = null) {
  const subscription = await findSubscriptionByStripeReferences({
    stripeSubscriptionId: invoice.subscription,
    companyId: invoice.metadata?.companyId,
    stripeCustomerId: invoice.customer,
  });

  if (!subscription) {
    console.warn('[Billing] Invoice recebida sem assinatura local correspondente:', invoice.id);
    return;
  }

  await upsertInvoicePayment(invoice, subscription);

  if (invoice.subscription) {
    try {
      const stripeSubscription = await stripeService.retrieveSubscription(invoice.subscription);
      await persistStripeSubscriptionSnapshot({
        companyId: subscription.companyId,
        stripeSubscription,
        localSubscriptionId: subscription.id,
        fallbackPlanKey: subscription.plan,
        stripeCustomerId: asString(invoice.customer),
      });
      return;
    } catch (error) {
      console.warn('[Billing] Falha ao buscar subscription apos invoice webhook:', {
        invoiceId: invoice.id,
        stripeSubscriptionId: invoice.subscription,
        message: error.message,
      });
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        billingStatus: mapInvoiceBillingStatus(invoice),
        lastInvoiceId: asString(invoice.id),
        stripePaymentMethodId: asString(invoice.default_payment_method || subscription.stripePaymentMethodId),
      },
    });

    await tx.company.update({
      where: { id: subscription.companyId },
      data: {
        billingStatus: mapInvoiceBillingStatus(invoice),
        lastInvoiceId: asString(invoice.id),
      },
    });
  });
}

async function handleStripeCustomerEvent(customer) {
  const companyId = customer.metadata?.companyId;
  if (!companyId) {
    return;
  }

  await prisma.company.update({
    where: { id: companyId },
    data: { stripeCustomerId: customer.id },
  });

  const subscription = await getLatestSubscription(companyId);
  if (subscription) {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { stripeCustomerId: customer.id },
    });
  }
}

async function handleStripePaymentMethodAttached(paymentMethod) {
  const customerId = asString(paymentMethod.customer);
  if (!customerId) {
    return;
  }

  const subscription = await findSubscriptionByStripeReferences({ stripeCustomerId: customerId });
  if (!subscription) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.subscription.update({
      where: { id: subscription.id },
      data: { stripePaymentMethodId: paymentMethod.id },
    });

    await tx.company.update({
      where: { id: subscription.companyId },
      data: { stripeCustomerId: customerId },
    });
  });
}

async function reconcileCompanyBillingState(companyId) {
  const subscription = await getLatestSubscription(companyId);
  if (!subscription?.stripeSubscriptionId) {
    return subscription;
  }

  try {
    const stripeSubscription = await stripeService.retrieveSubscription(subscription.stripeSubscriptionId);
    await persistStripeSubscriptionSnapshot({
      companyId,
      stripeSubscription,
      localSubscriptionId: subscription.id,
      fallbackPlanKey: subscription.plan,
      stripeCustomerId: subscription.stripeCustomerId,
    });
  } catch (error) {
    console.warn('[Billing] Falha ao reconciliar assinatura com Stripe:', {
      companyId,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      message: error.message,
    });
  }

  return getLatestSubscription(companyId);
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
  createCheckoutSession,
  syncCheckoutSession,
  createPortalSession,
  getSubscriptionStatus,
  listPayments,
  handleCheckoutSessionCompleted,
  handleStripeSubscriptionEvent,
  handleStripeInvoiceEvent,
  handleStripeCustomerEvent,
  handleStripePaymentMethodAttached,
  reconcileCompanyBillingState,
  BillingError,
  PLAN_PRICES,
  PLAN_NAMES,
  STATUS: SUBSCRIPTION_STATUS,
  BILLING_STATUS,
  TRIAL_DAYS,
  isSubscriptionActive,
  isSubscriptionRecoverable,
};
