const prisma = require('../config/database');
const { preApproval } = require('../config/mercadopago');

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

/**
 * POST /api/subscriptions/create-preapproval
 * Cria assinatura recorrente no Mercado Pago com 30 dias de trial
 */
async function createPreapproval(req, res) {
  try {
    const { plan, cardTokenId, email } = req.body;
    const companyId = req.companyId;

    if (!plan || !PLAN_PRICES[plan]) {
      return res.status(400).json({ error: 'Plano inválido. Use BASIC, PROFESSIONAL ou ENTERPRISE.' });
    }

    if (!cardTokenId) {
      return res.status(400).json({ error: 'Token do cartão é obrigatório.' });
    }

    if (!email) {
      return res.status(400).json({ error: 'E-mail é obrigatório.' });
    }

    // Verificar se já tem assinatura ativa
    const existing = await prisma.subscription.findFirst({
      where: { companyId, status: { in: ['TRIAL', 'ACTIVE'] } },
    });
    if (existing) {
      return res.status(400).json({ error: 'Empresa já possui assinatura ativa.' });
    }

    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 30);

    // Criar preapproval no Mercado Pago
    const mpPreapproval = await preApproval.create({
      body: {
        reason: `Ponto Digital — Plano ${PLAN_NAMES[plan]}`,
        external_reference: companyId,
        payer_email: email,
        card_token_id: cardTokenId,
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: PLAN_PRICES[plan],
          currency_id: 'BRL',
          free_trial: {
            frequency: 30,
            frequency_type: 'days',
          },
        },
        back_url: `${process.env.FRONTEND_URL || 'https://pontodigital.com.br'}/admin/dashboard`,
        status: 'authorized',
      },
    });

    // Salvar no banco
    const subscription = await prisma.subscription.create({
      data: {
        companyId,
        plan,
        status: 'TRIAL',
        trialEndsAt: trialEnd,
        currentPeriodStart: new Date(),
        currentPeriodEnd: trialEnd,
        mpPreapprovalId: mpPreapproval.id,
        mpCustomerId: mpPreapproval.payer_id?.toString() || null,
      },
    });

    // Atualizar Company
    await prisma.company.update({
      where: { id: companyId },
      data: {
        plan: plan.toLowerCase(),
        subscriptionStatus: 'TRIAL',
        trialEndsAt: trialEnd,
      },
    });

    res.status(201).json({
      message: 'Assinatura criada com sucesso! 30 dias grátis ativados.',
      subscription: {
        id: subscription.id,
        plan: subscription.plan,
        status: subscription.status,
        trialEndsAt: subscription.trialEndsAt,
      },
    });
  } catch (error) {
    console.error('Erro ao criar assinatura:', error);
    res.status(500).json({ error: 'Erro ao criar assinatura. Tente novamente.' });
  }
}

/**
 * GET /api/subscriptions/status
 */
async function getStatus(req, res) {
  try {
    const subscription = await prisma.subscription.findFirst({
      where: { companyId: req.companyId },
      orderBy: { createdAt: 'desc' },
    });

    if (!subscription) {
      // Sem registro de Subscription — usar dados da Company (trial após checkout)
      const company = await prisma.company.findUnique({
        where: { id: req.companyId },
        select: { plan: true, subscriptionStatus: true, trialEndsAt: true, createdAt: true },
      });
      if (company && company.subscriptionStatus) {
        const now = new Date();
        const planUpper = (company.plan || 'basic').toUpperCase();
        const trialDaysLeft = company.trialEndsAt
          ? Math.max(0, Math.ceil((company.trialEndsAt - now) / (1000 * 60 * 60 * 24)))
          : 0;
        return res.json({
          subscription: {
            id: null,
            plan: planUpper,
            planName: PLAN_NAMES[planUpper] || planUpper,
            status: company.subscriptionStatus,
            trialEndsAt: company.trialEndsAt,
            trialDaysLeft,
            currentPeriodStart: company.createdAt,
            currentPeriodEnd: company.trialEndsAt,
            createdAt: company.createdAt,
          },
        });
      }
      return res.json({ subscription: null });
    }

    const now = new Date();
    const trialDaysLeft = subscription.trialEndsAt
      ? Math.max(0, Math.ceil((subscription.trialEndsAt - now) / (1000 * 60 * 60 * 24)))
      : 0;

    res.json({
      subscription: {
        id: subscription.id,
        plan: subscription.plan,
        planName: PLAN_NAMES[subscription.plan] || subscription.plan,
        status: subscription.status,
        trialEndsAt: subscription.trialEndsAt,
        trialDaysLeft,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        createdAt: subscription.createdAt,
      },
    });
  } catch (error) {
    console.error('Erro ao buscar status da assinatura:', error);
    res.status(500).json({ error: 'Erro ao buscar status da assinatura.' });
  }
}

/**
 * PUT /api/subscriptions/change-plan
 */
async function changePlan(req, res) {
  try {
    const { plan, cardTokenId, email } = req.body;
    const companyId = req.companyId;

    if (!plan || !PLAN_PRICES[plan]) {
      return res.status(400).json({ error: 'Plano inválido.' });
    }

    const current = await prisma.subscription.findFirst({
      where: { companyId, status: { in: ['TRIAL', 'ACTIVE'] } },
    });

    if (!current) {
      return res.status(404).json({ error: 'Nenhuma assinatura ativa encontrada.' });
    }

    // Cancelar assinatura antiga no MP
    if (current.mpPreapprovalId) {
      try {
        await preApproval.update({
          id: current.mpPreapprovalId,
          body: { status: 'cancelled' },
        });
      } catch (e) {
        console.error('Erro ao cancelar preapproval antigo no MP:', e.message);
      }
    }

    // Marcar antiga como cancelada
    await prisma.subscription.update({
      where: { id: current.id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });

    // Criar nova assinatura
    const mpPreapprovalNew = await preApproval.create({
      body: {
        reason: `Ponto Digital — Plano ${PLAN_NAMES[plan]}`,
        external_reference: companyId,
        payer_email: email,
        card_token_id: cardTokenId,
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: PLAN_PRICES[plan],
          currency_id: 'BRL',
        },
        back_url: `${process.env.FRONTEND_URL || 'https://pontodigital.com.br'}/admin/subscription`,
        status: 'authorized',
      },
    });

    const subscription = await prisma.subscription.create({
      data: {
        companyId,
        plan,
        status: 'ACTIVE',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        mpPreapprovalId: mpPreapprovalNew.id,
        mpCustomerId: mpPreapprovalNew.payer_id?.toString() || null,
      },
    });

    await prisma.company.update({
      where: { id: companyId },
      data: { plan: plan.toLowerCase(), subscriptionStatus: 'ACTIVE' },
    });

    res.json({
      message: `Plano alterado para ${PLAN_NAMES[plan]} com sucesso!`,
      subscription: { id: subscription.id, plan, status: 'ACTIVE' },
    });
  } catch (error) {
    console.error('Erro ao alterar plano:', error);
    res.status(500).json({ error: 'Erro ao alterar plano.' });
  }
}

/**
 * POST /api/subscriptions/cancel
 */
async function cancelSubscription(req, res) {
  try {
    const companyId = req.companyId;

    const subscription = await prisma.subscription.findFirst({
      where: { companyId, status: { in: ['TRIAL', 'ACTIVE', 'PAST_DUE'] } },
    });

    if (!subscription) {
      return res.status(404).json({ error: 'Nenhuma assinatura ativa encontrada.' });
    }

    // Cancelar no MP
    if (subscription.mpPreapprovalId) {
      try {
        await preApproval.update({
          id: subscription.mpPreapprovalId,
          body: { status: 'cancelled' },
        });
      } catch (e) {
        console.error('Erro ao cancelar no MP:', e.message);
      }
    }

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });

    await prisma.company.update({
      where: { id: companyId },
      data: { subscriptionStatus: 'CANCELLED' },
    });

    res.json({ message: 'Assinatura cancelada. Acesso permanece até o fim do período atual.' });
  } catch (error) {
    console.error('Erro ao cancelar assinatura:', error);
    res.status(500).json({ error: 'Erro ao cancelar assinatura.' });
  }
}

/**
 * GET /api/subscriptions/payments
 */
async function getPayments(req, res) {
  try {
    const payments = await prisma.payment.findMany({
      where: { companyId: req.companyId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json({ payments });
  } catch (error) {
    console.error('Erro ao buscar pagamentos:', error);
    res.status(500).json({ error: 'Erro ao buscar pagamentos.' });
  }
}

/**
 * POST /api/subscriptions/reactivate
 * Reativar assinatura expirada/cancelada com novo cartão de crédito
 */
async function reactivateSubscription(req, res) {
  try {
    const { cardTokenId, email, plan } = req.body;
    const companyId = req.companyId;

    if (!email) {
      return res.status(400).json({ error: 'E-mail é obrigatório.' });
    }

    // Buscar a empresa
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      return res.status(404).json({ error: 'Empresa não encontrada.' });
    }

    // Determinar plano — usar o informado ou o atual da empresa
    const selectedPlan = (plan && PLAN_PRICES[plan]) ? plan : (company.plan || 'basic').toUpperCase();
    const planKey = PLAN_PRICES[selectedPlan] ? selectedPlan : 'BASIC';

    // Cancelar assinatura ativa anterior no MP se existir
    const previous = await prisma.subscription.findFirst({
      where: { companyId, status: { in: ['PAST_DUE', 'ACTIVE', 'TRIAL'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (previous?.mpPreapprovalId) {
      try {
        await preApproval.update({
          id: previous.mpPreapprovalId,
          body: { status: 'cancelled' },
        });
      } catch (e) {
        console.error('Erro ao cancelar preapproval antigo:', e.message);
      }
      await prisma.subscription.update({
        where: { id: previous.id },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
    }

    let mpPreapprovalId = null;
    let mpCustomerId = null;

    // Criar nova preapproval no Mercado Pago (se tiver cardTokenId)
    if (cardTokenId) {
      try {
        const mpPreapproval = await preApproval.create({
          body: {
            reason: `Ponto Digital — Plano ${PLAN_NAMES[planKey]}`,
            external_reference: companyId,
            payer_email: email,
            card_token_id: cardTokenId,
            auto_recurring: {
              frequency: 1,
              frequency_type: 'months',
              transaction_amount: PLAN_PRICES[planKey],
              currency_id: 'BRL',
            },
            back_url: `${process.env.FRONTEND_URL || 'https://pontodigital.com.br'}/admin/dashboard`,
            status: 'authorized',
          },
        });
        mpPreapprovalId = mpPreapproval.id;
        mpCustomerId = mpPreapproval.payer_id?.toString() || null;
      } catch (mpErr) {
        console.warn('Erro ao criar preapproval no MP (modo teste?):', mpErr.message);
      }
    }

    // Criar nova subscription
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setDate(periodEnd.getDate() + 30);

    const subscription = await prisma.subscription.create({
      data: {
        companyId,
        plan: planKey,
        status: 'ACTIVE',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        mpPreapprovalId,
        mpCustomerId,
      },
    });

    // Atualizar Company para ACTIVE
    await prisma.company.update({
      where: { id: companyId },
      data: {
        plan: planKey.toLowerCase(),
        subscriptionStatus: 'ACTIVE',
        trialEndsAt: null,
      },
    });

    res.json({
      message: `Assinatura reativada com sucesso! Plano ${PLAN_NAMES[planKey]}.`,
      subscription: {
        id: subscription.id,
        plan: planKey,
        status: 'ACTIVE',
      },
    });
  } catch (error) {
    console.error('Erro ao reativar assinatura:', error);
    res.status(500).json({ error: 'Erro ao reativar assinatura. Verifique os dados do cartão e tente novamente.' });
  }
}

module.exports = { createPreapproval, getStatus, changePlan, cancelSubscription, getPayments, reactivateSubscription, PLAN_PRICES, PLAN_NAMES };
