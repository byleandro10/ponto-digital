/**
 * Serviço de Billing — regras de negócio de assinatura
 *
 * Orquestra persistência (Prisma) e integração (mercadopagoService).
 * Toda lógica de estados, trial, grace period etc. fica aqui.
 */
const prisma = require('../config/database');
const mpService = require('./mercadopagoService');

// ─── Constantes ──────────────────────────────────────────────────────────────

const TRIAL_DAYS = 14;
const GRACE_PERIOD_DAYS = 3;

const PLAN_PRICES = {
  BASIC: 49,
  PROFESSIONAL: 99,
  ENTERPRISE: 199,
};

const PLAN_NAMES = {
  BASIC: 'Básico',
  PROFESSIONAL: 'Profissional',
  ENTERPRISE: 'Empresarial',
};

// Status válidos da assinatura
const STATUS = {
  TRIAL: 'TRIAL',       // trialing
  ACTIVE: 'ACTIVE',     // active
  PAST_DUE: 'PAST_DUE', // past_due
  CANCELLED: 'CANCELLED', // canceled
  PAUSED: 'PAUSED',     // paused
};

// ─── Funções auxiliares ──────────────────────────────────────────────────────

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

// ─── Criar Assinatura ────────────────────────────────────────────────────────

/**
 * Cria uma assinatura com trial de 14 dias.
 *
 * Fluxo:
 * 1. Valida plano e dados
 * 2. Verifica se já existe assinatura ativa
 * 3. Cria preapproval no Mercado Pago (trial embutido)
 * 4. Salva Subscription no banco
 * 5. Atualiza Company
 *
 * @param {Object} params
 * @param {string} params.companyId
 * @param {string} params.plan      - BASIC | PROFESSIONAL | ENTERPRISE
 * @param {string} params.cardTokenId
 * @param {string} params.email
 * @returns {Promise<Object>} Subscription criada
 */
async function createSubscription({ companyId, plan, cardTokenId, email }) {
  // Validar plano
  if (!plan || !PLAN_PRICES[plan]) {
    throw new BillingError('Plano inválido. Use BASIC, PROFESSIONAL ou ENTERPRISE.', 400);
  }
  if (!cardTokenId) {
    throw new BillingError('Token do cartão é obrigatório.', 400);
  }
  if (!email) {
    throw new BillingError('E-mail é obrigatório.', 400);
  }

  // Verificar assinatura ativa existente
  const existing = await prisma.subscription.findFirst({
    where: { companyId, status: { in: [STATUS.TRIAL, STATUS.ACTIVE] } },
  });
  if (existing) {
    throw new BillingError('Empresa já possui assinatura ativa.', 400);
  }

  const now = new Date();
  const trialEnd = addDays(now, TRIAL_DAYS);
  const backUrl = `${process.env.FRONTEND_URL || 'https://pontodigital.com.br'}/admin/dashboard`;

  // Criar preapproval no Mercado Pago
  const mpResult = await mpService.createPreapproval({
    reason: `Ponto Digital — Plano ${PLAN_NAMES[plan]}`,
    externalRef: companyId,
    payerEmail: email,
    cardTokenId,
    amount: PLAN_PRICES[plan],
    backUrl,
    withTrial: true,
  });

  // Persistir no banco — transação atômica
  const subscription = await prisma.$transaction(async (tx) => {
    const sub = await tx.subscription.create({
      data: {
        companyId,
        plan,
        status: STATUS.TRIAL,
        trialStart: now,
        trialEndsAt: trialEnd,
        currentPeriodStart: now,
        currentPeriodEnd: trialEnd,
        mpPreapprovalId: mpResult.id?.toString() || null,
        mpCustomerId: mpResult.payer_id?.toString() || null,
      },
    });

    await tx.company.update({
      where: { id: companyId },
      data: {
        plan: plan.toLowerCase(),
        subscriptionStatus: STATUS.TRIAL,
        trialEndsAt: trialEnd,
      },
    });

    return sub;
  });

  console.log('[Billing] Assinatura criada:', {
    subscriptionId: subscription.id,
    companyId,
    plan,
    trialEnd: trialEnd.toISOString(),
    mpPreapprovalId: mpResult.id,
  });

  return {
    id: subscription.id,
    plan: subscription.plan,
    status: subscription.status,
    trialStart: subscription.trialStart,
    trialEndsAt: subscription.trialEndsAt,
    mpPreapprovalId: subscription.mpPreapprovalId,
  };
}

// ─── Cancelar Assinatura ─────────────────────────────────────────────────────

/**
 * Cancela a assinatura ativa da empresa.
 *
 * @param {string} companyId
 * @returns {Promise<Object>}
 */
async function cancelSubscription(companyId) {
  const subscription = await prisma.subscription.findFirst({
    where: { companyId, status: { in: [STATUS.TRIAL, STATUS.ACTIVE, STATUS.PAST_DUE] } },
  });

  if (!subscription) {
    throw new BillingError('Nenhuma assinatura ativa encontrada.', 404);
  }

  // Cancelar no Mercado Pago
  if (subscription.mpPreapprovalId) {
    try {
      await mpService.updatePreapprovalStatus(subscription.mpPreapprovalId, 'cancelled');
    } catch (err) {
      console.error('[Billing] Erro ao cancelar no MP:', err.message);
      // Continua — o cancelamento local é prioritário
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.subscription.update({
      where: { id: subscription.id },
      data: { status: STATUS.CANCELLED, cancelledAt: new Date() },
    });

    await tx.company.update({
      where: { id: companyId },
      data: { subscriptionStatus: STATUS.CANCELLED },
    });
  });

  console.log('[Billing] Assinatura cancelada:', {
    subscriptionId: subscription.id,
    companyId,
  });

  return { message: 'Assinatura cancelada. Acesso permanece até o fim do período atual.' };
}

// ─── Status da Assinatura ────────────────────────────────────────────────────

/**
 * Retorna o status atual da assinatura da empresa.
 *
 * @param {string} companyId
 * @returns {Promise<Object|null>}
 */
async function getSubscriptionStatus(companyId) {
  const subscription = await prisma.subscription.findFirst({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
  });

  if (!subscription) {
    // Fallback: dados da Company (para trial pré-checkout)
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { plan: true, subscriptionStatus: true, trialEndsAt: true, createdAt: true },
    });

    if (company && company.subscriptionStatus) {
      const now = new Date();
      const planUpper = (company.plan || 'basic').toUpperCase();
      const trialDaysLeft = company.trialEndsAt
        ? Math.max(0, Math.ceil((company.trialEndsAt - now) / (1000 * 60 * 60 * 24)))
        : 0;

      return {
        id: null,
        plan: planUpper,
        planName: PLAN_NAMES[planUpper] || planUpper,
        status: company.subscriptionStatus,
        trialEndsAt: company.trialEndsAt,
        trialDaysLeft,
        currentPeriodStart: company.createdAt,
        currentPeriodEnd: company.trialEndsAt,
        gracePeriodEnd: null,
        createdAt: company.createdAt,
      };
    }

    return null;
  }

  const now = new Date();
  const trialDaysLeft = subscription.trialEndsAt
    ? Math.max(0, Math.ceil((subscription.trialEndsAt - now) / (1000 * 60 * 60 * 24)))
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
  };
}

// ─── Listar Pagamentos ──────────────────────────────────────────────────────

/**
 * Lista pagamentos da empresa.
 *
 * @param {string} companyId
 * @param {number} limit
 * @returns {Promise<Array>}
 */
async function listPayments(companyId, limit = 50) {
  return prisma.payment.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

// ─── Processar Evento de Pagamento (Webhook) ────────────────────────────────

/**
 * Processa evento de pagamento recebido via webhook.
 * Idempotente: usa upsert com mpPaymentId como chave.
 *
 * @param {string|number} paymentId - ID do pagamento no MP
 */
async function handlePaymentWebhook(paymentId) {
  const mpPayment = await mpService.getPayment(paymentId);
  if (!mpPayment) {
    console.warn('[Billing] Pagamento não encontrado no MP:', paymentId);
    return;
  }

  const preapprovalId = mpPayment.metadata?.preapproval_id || null;
  const externalRef = mpPayment.external_reference;

  // Localizar subscription
  let subscription = null;
  if (preapprovalId) {
    subscription = await prisma.subscription.findFirst({
      where: { mpPreapprovalId: preapprovalId.toString() },
    });
  }
  if (!subscription && externalRef) {
    subscription = await prisma.subscription.findFirst({
      where: {
        companyId: externalRef,
        status: { in: [STATUS.TRIAL, STATUS.ACTIVE, STATUS.PAST_DUE, STATUS.PAUSED] },
      },
    });
  }

  if (!subscription) {
    console.warn('[Billing] Subscription não encontrada para payment:', paymentId);
    return;
  }

  // Mapear status
  const STATUS_MAP = {
    approved: 'APPROVED',
    pending: 'PENDING',
    in_process: 'PENDING',
    rejected: 'REJECTED',
    refunded: 'REFUNDED',
    cancelled: 'REJECTED',
  };
  const paymentStatus = STATUS_MAP[mpPayment.status] || 'PENDING';
  const mpPaymentIdStr = paymentId.toString();

  // Idempotência: upsert pelo mpPaymentId
  const existingPayment = await prisma.payment.findFirst({
    where: { mpPaymentId: mpPaymentIdStr },
  });

  if (existingPayment) {
    // Atualizar status do pagamento existente
    await prisma.payment.update({
      where: { id: existingPayment.id },
      data: {
        status: paymentStatus,
        paidAt: paymentStatus === 'APPROVED' ? new Date(mpPayment.date_approved || Date.now()) : existingPayment.paidAt,
        failureReason: mpPayment.status_detail || null,
      },
    });
  } else {
    // Criar novo registro de pagamento
    await prisma.payment.create({
      data: {
        subscriptionId: subscription.id,
        companyId: subscription.companyId,
        mpPaymentId: mpPaymentIdStr,
        amount: mpPayment.transaction_amount || 0,
        status: paymentStatus,
        paidAt: paymentStatus === 'APPROVED' ? new Date(mpPayment.date_approved || Date.now()) : null,
        failureReason: mpPayment.status_detail || null,
      },
    });
  }

  // Atualizar status da assinatura conforme resultado do pagamento
  if (paymentStatus === 'APPROVED') {
    await activateSubscription(subscription);
  } else if (paymentStatus === 'REJECTED') {
    await markAsPastDue(subscription);
  }

  console.log('[Billing] Payment webhook processado:', {
    paymentId: mpPaymentIdStr,
    paymentStatus,
    subscriptionId: subscription.id,
    companyId: subscription.companyId,
  });
}

// ─── Processar Evento de Preapproval (Webhook) ──────────────────────────────

/**
 * Processa evento de preapproval recebido via webhook.
 *
 * @param {string|number} preapprovalId - ID da preapproval no MP
 */
async function handlePreapprovalWebhook(preapprovalId) {
  const mpPre = await mpService.getPreapproval(preapprovalId);
  if (!mpPre) {
    console.warn('[Billing] Preapproval não encontrada no MP:', preapprovalId);
    return;
  }

  const subscription = await prisma.subscription.findFirst({
    where: { mpPreapprovalId: preapprovalId.toString() },
  });

  if (!subscription) {
    console.warn('[Billing] Subscription não encontrada para preapproval:', preapprovalId);
    return;
  }

  // Mapear status do MP para status interno
  const STATUS_MAP = {
    authorized: STATUS.ACTIVE,
    paused: STATUS.PAUSED,
    cancelled: STATUS.CANCELLED,
    pending: STATUS.TRIAL,
  };

  const newStatus = STATUS_MAP[mpPre.status] || subscription.status;

  // Evitar atualização redundante
  if (subscription.status === newStatus) {
    console.log('[Billing] Preapproval webhook: status já atualizado, ignorando:', {
      preapprovalId,
      status: newStatus,
    });
    return;
  }

  const updateData = { status: newStatus };

  // Se cancelado, registrar data de cancelamento
  if (newStatus === STATUS.CANCELLED) {
    updateData.cancelledAt = new Date();
  }

  // Se voltou a ficar ativo (reauthorized), limpar grace period
  if (newStatus === STATUS.ACTIVE) {
    updateData.gracePeriodEnd = null;
    const now = new Date();
    updateData.currentPeriodStart = now;
    updateData.currentPeriodEnd = addMonths(now, 1);
  }

  await prisma.$transaction(async (tx) => {
    await tx.subscription.update({
      where: { id: subscription.id },
      data: updateData,
    });

    await tx.company.update({
      where: { id: subscription.companyId },
      data: { subscriptionStatus: newStatus },
    });
  });

  console.log('[Billing] Preapproval webhook processado:', {
    preapprovalId,
    oldStatus: subscription.status,
    newStatus,
    companyId: subscription.companyId,
  });
}

// ─── Helpers internos ────────────────────────────────────────────────────────

/**
 * Ativa a assinatura após pagamento aprovado.
 */
async function activateSubscription(subscription) {
  const now = new Date();
  const periodEnd = addMonths(now, 1);

  await prisma.$transaction(async (tx) => {
    await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        status: STATUS.ACTIVE,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        gracePeriodEnd: null, // Limpar grace period
      },
    });

    await tx.company.update({
      where: { id: subscription.companyId },
      data: { subscriptionStatus: STATUS.ACTIVE },
    });
  });

  console.log('[Billing] Assinatura ativada:', {
    subscriptionId: subscription.id,
    companyId: subscription.companyId,
    periodEnd: periodEnd.toISOString(),
  });
}

/**
 * Marca assinatura como PAST_DUE e inicia grace period.
 */
async function markAsPastDue(subscription) {
  const now = new Date();
  const gracePeriodEnd = addDays(now, GRACE_PERIOD_DAYS);

  await prisma.$transaction(async (tx) => {
    await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        status: STATUS.PAST_DUE,
        gracePeriodEnd,
      },
    });

    await tx.company.update({
      where: { id: subscription.companyId },
      data: { subscriptionStatus: STATUS.PAST_DUE },
    });
  });

  console.log('[Billing] Assinatura em atraso (grace period):', {
    subscriptionId: subscription.id,
    companyId: subscription.companyId,
    gracePeriodEnd: gracePeriodEnd.toISOString(),
  });
}

// ─── Trocar Plano ────────────────────────────────────────────────────────────

/**
 * Altera o plano da assinatura.
 * Cancela preapproval atual no MP e cria nova.
 *
 * @param {Object} params
 * @param {string} params.companyId
 * @param {string} params.plan
 * @param {string} params.cardTokenId
 * @param {string} params.email
 * @returns {Promise<Object>}
 */
async function changePlan({ companyId, plan, cardTokenId, email }) {
  if (!plan || !PLAN_PRICES[plan]) {
    throw new BillingError('Plano inválido.', 400);
  }
  if (!email) {
    throw new BillingError('E-mail é obrigatório.', 400);
  }

  const current = await prisma.subscription.findFirst({
    where: { companyId, status: { in: [STATUS.TRIAL, STATUS.ACTIVE] } },
  });
  if (!current) {
    throw new BillingError('Nenhuma assinatura ativa encontrada.', 404);
  }

  // Cancelar preapproval antiga no MP
  if (current.mpPreapprovalId) {
    try {
      await mpService.updatePreapprovalStatus(current.mpPreapprovalId, 'cancelled');
    } catch (err) {
      console.error('[Billing] Erro ao cancelar preapproval antiga no MP:', err.message);
    }
  }

  // Criar nova preapproval
  const backUrl = `${process.env.FRONTEND_URL || 'https://pontodigital.com.br'}/admin/subscription`;
  const mpResult = await mpService.createPreapproval({
    reason: `Ponto Digital — Plano ${PLAN_NAMES[plan]}`,
    externalRef: companyId,
    payerEmail: email,
    cardTokenId,
    amount: PLAN_PRICES[plan],
    backUrl,
    withTrial: false,
  });

  const now = new Date();
  const periodEnd = addMonths(now, 1);

  const subscription = await prisma.$transaction(async (tx) => {
    // Cancelar antiga
    await tx.subscription.update({
      where: { id: current.id },
      data: { status: STATUS.CANCELLED, cancelledAt: now },
    });

    // Criar nova
    const sub = await tx.subscription.create({
      data: {
        companyId,
        plan,
        status: STATUS.ACTIVE,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        mpPreapprovalId: mpResult.id?.toString() || null,
        mpCustomerId: mpResult.payer_id?.toString() || null,
      },
    });

    await tx.company.update({
      where: { id: companyId },
      data: { plan: plan.toLowerCase(), subscriptionStatus: STATUS.ACTIVE },
    });

    return sub;
  });

  console.log('[Billing] Plano alterado:', {
    subscriptionId: subscription.id,
    companyId,
    oldPlan: current.plan,
    newPlan: plan,
  });

  return {
    message: `Plano alterado para ${PLAN_NAMES[plan]} com sucesso!`,
    subscription: { id: subscription.id, plan, status: STATUS.ACTIVE },
  };
}

// ─── Reativar Assinatura ─────────────────────────────────────────────────────

/**
 * Reativa assinatura cancelada/expirada.
 *
 * @param {Object} params
 * @param {string} params.companyId
 * @param {string} params.cardTokenId
 * @param {string} params.email
 * @param {string} [params.plan]
 * @returns {Promise<Object>}
 */
async function reactivateSubscription({ companyId, cardTokenId, email, plan }) {
  if (!email) {
    throw new BillingError('E-mail é obrigatório.', 400);
  }

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) {
    throw new BillingError('Empresa não encontrada.', 404);
  }

  // Determinar plano
  const selectedPlan = (plan && PLAN_PRICES[plan]) ? plan : (company.plan || 'basic').toUpperCase();
  const planKey = PLAN_PRICES[selectedPlan] ? selectedPlan : 'BASIC';

  // Cancelar assinatura anterior no MP
  const previous = await prisma.subscription.findFirst({
    where: { companyId, status: { in: [STATUS.PAST_DUE, STATUS.ACTIVE, STATUS.TRIAL] } },
    orderBy: { createdAt: 'desc' },
  });
  if (previous?.mpPreapprovalId) {
    try {
      await mpService.updatePreapprovalStatus(previous.mpPreapprovalId, 'cancelled');
    } catch (err) {
      console.error('[Billing] Erro ao cancelar preapproval anterior:', err.message);
    }
    await prisma.subscription.update({
      where: { id: previous.id },
      data: { status: STATUS.CANCELLED, cancelledAt: new Date() },
    });
  }

  let mpPreapprovalId = null;
  let mpCustomerId = null;

  // Criar nova preapproval no MP
  if (cardTokenId) {
    const backUrl = `${process.env.FRONTEND_URL || 'https://pontodigital.com.br'}/admin/dashboard`;
    try {
      const mpResult = await mpService.createPreapproval({
        reason: `Ponto Digital — Plano ${PLAN_NAMES[planKey]}`,
        externalRef: companyId,
        payerEmail: email,
        cardTokenId,
        amount: PLAN_PRICES[planKey],
        backUrl,
        withTrial: false,
      });
      mpPreapprovalId = mpResult.id?.toString() || null;
      mpCustomerId = mpResult.payer_id?.toString() || null;
    } catch (err) {
      console.warn('[Billing] Erro ao criar preapproval no MP:', err.message);
    }
  }

  const now = new Date();
  const periodEnd = addDays(now, 30);

  const subscription = await prisma.$transaction(async (tx) => {
    const sub = await tx.subscription.create({
      data: {
        companyId,
        plan: planKey,
        status: STATUS.ACTIVE,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        mpPreapprovalId,
        mpCustomerId,
      },
    });

    await tx.company.update({
      where: { id: companyId },
      data: {
        plan: planKey.toLowerCase(),
        subscriptionStatus: STATUS.ACTIVE,
        trialEndsAt: null,
      },
    });

    return sub;
  });

  console.log('[Billing] Assinatura reativada:', {
    subscriptionId: subscription.id,
    companyId,
    plan: planKey,
  });

  return {
    message: `Assinatura reativada com sucesso! Plano ${PLAN_NAMES[planKey]}.`,
    subscription: { id: subscription.id, plan: planKey, status: STATUS.ACTIVE },
  };
}

// ─── Erro customizado ────────────────────────────────────────────────────────

class BillingError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'BillingError';
    this.statusCode = statusCode;
  }
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  createSubscription,
  cancelSubscription,
  getSubscriptionStatus,
  listPayments,
  handlePaymentWebhook,
  handlePreapprovalWebhook,
  changePlan,
  reactivateSubscription,
  BillingError,
  PLAN_PRICES,
  PLAN_NAMES,
  STATUS,
  TRIAL_DAYS,
  GRACE_PERIOD_DAYS,
};
