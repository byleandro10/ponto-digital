/**
 * Controller de Assinaturas / Billing
 *
 * Camada fina: recebe HTTP, delega ao billingService, trata erros.
 */
const billingService = require('../services/billingService');
const { BillingError, PLAN_PRICES, PLAN_NAMES } = billingService;

/**
 * POST /api/subscriptions/create-preapproval
 * POST /api/billing/create-subscription
 *
 * Cria assinatura recorrente com trial de 14 dias.
 */
async function createPreapproval(req, res) {
  try {
    const { plan, cardTokenId, email } = req.body;
    const companyId = req.companyId;

    const subscription = await billingService.createSubscription({
      companyId,
      plan,
      cardTokenId,
      email,
    });

    res.status(201).json({
      message: `Assinatura criada com sucesso! ${billingService.TRIAL_DAYS} dias grátis ativados.`,
      subscription,
    });
  } catch (error) {
    if (error instanceof BillingError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('[Controller] Erro ao criar assinatura:', error);
    res.status(500).json({ error: 'Erro ao criar assinatura. Tente novamente.' });
  }
}

/**
 * GET /api/subscriptions/status
 * GET /api/billing/subscription-status
 */
async function getStatus(req, res) {
  try {
    const subscription = await billingService.getSubscriptionStatus(req.companyId);
    res.json({ subscription });
  } catch (error) {
    console.error('[Controller] Erro ao buscar status:', error);
    res.status(500).json({ error: 'Erro ao buscar status da assinatura.' });
  }
}

/**
 * PUT /api/subscriptions/change-plan
 */
async function changePlan(req, res) {
  try {
    const { plan, cardTokenId, email } = req.body;
    const result = await billingService.changePlan({
      companyId: req.companyId,
      plan,
      cardTokenId,
      email,
    });

    res.json(result);
  } catch (error) {
    if (error instanceof BillingError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('[Controller] Erro ao alterar plano:', error);
    res.status(500).json({ error: 'Erro ao alterar plano.' });
  }
}

/**
 * POST /api/subscriptions/cancel
 * POST /api/billing/cancel-subscription
 */
async function cancelSubscription(req, res) {
  try {
    const result = await billingService.cancelSubscription(req.companyId);
    res.json(result);
  } catch (error) {
    if (error instanceof BillingError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('[Controller] Erro ao cancelar assinatura:', error);
    res.status(500).json({ error: 'Erro ao cancelar assinatura.' });
  }
}

/**
 * GET /api/subscriptions/payments
 */
async function getPayments(req, res) {
  try {
    const payments = await billingService.listPayments(req.companyId);
    res.json({ payments });
  } catch (error) {
    console.error('[Controller] Erro ao buscar pagamentos:', error);
    res.status(500).json({ error: 'Erro ao buscar pagamentos.' });
  }
}

/**
 * POST /api/subscriptions/reactivate
 */
async function reactivateSubscription(req, res) {
  try {
    const { cardTokenId, email, plan } = req.body;
    const result = await billingService.reactivateSubscription({
      companyId: req.companyId,
      cardTokenId,
      email,
      plan,
    });

    res.json(result);
  } catch (error) {
    if (error instanceof BillingError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('[Controller] Erro ao reativar assinatura:', error);
    res.status(500).json({ error: 'Erro ao reativar assinatura. Verifique os dados do cartão e tente novamente.' });
  }
}

module.exports = { createPreapproval, getStatus, changePlan, cancelSubscription, getPayments, reactivateSubscription, PLAN_PRICES, PLAN_NAMES };
