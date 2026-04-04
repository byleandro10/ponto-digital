const billingService = require('../services/billingService');
const stripeService = require('../services/stripeService');
const { stripePublishableKey } = require('../config/stripe');

const { BillingError, PLAN_PRICES, PLAN_NAMES } = billingService;

async function createSetupIntent(req, res) {
  try {
    const setupIntent = await stripeService.createSetupIntent({
      metadata: {
        companyId: req.companyId || '',
        userId: req.userId || '',
        requestId: req.requestId || '',
      },
    });

    return res.status(201).json({
      clientSecret: setupIntent.client_secret,
      setupIntentId: setupIntent.id,
      requestId: req.requestId,
    });
  } catch (error) {
    console.error('[Billing] Falha ao criar SetupIntent:', {
      requestId: req.requestId,
      message: error.message,
    });
    return res.status(500).json({ error: 'Erro ao iniciar a validação segura do cartão com a Stripe.' });
  }
}

async function getPublicBillingConfig(req, res) {
  if (!stripePublishableKey) {
    return res.status(503).json({
      error: 'A chave pública da Stripe não está configurada no ambiente.',
    });
  }

  return res.json({
    provider: 'stripe',
    publishableKey: stripePublishableKey,
  });
}

async function createPreapproval(req, res) {
  try {
    const { plan, paymentMethodId, setupIntentId } = req.body;
    const companyId = req.companyId;

    const subscription = await billingService.createSubscription({
      companyId,
      userId: req.userId,
      plan,
      paymentMethodId,
      setupIntentId,
    });

    res.status(201).json({
      message: `Assinatura criada com sucesso. ${billingService.TRIAL_DAYS} dias grátis ativados.`,
      subscription,
    });
  } catch (error) {
    if (error instanceof BillingError) {
      return res.status(error.statusCode).json({ error: error.message, details: error.details || undefined });
    }
    console.error('[Billing] Erro ao criar assinatura:', {
      requestId: req.requestId,
      message: error.message,
    });
    res.status(500).json({ error: 'Erro ao criar assinatura. Tente novamente.' });
  }
}

async function getStatus(req, res) {
  try {
    const subscription = await billingService.getSubscriptionStatus(req.companyId);
    res.json({ subscription });
  } catch (error) {
    console.error('[Billing] Erro ao buscar status:', {
      requestId: req.requestId,
      message: error.message,
    });
    res.status(500).json({ error: 'Erro ao buscar status da assinatura.' });
  }
}

async function changePlan(req, res) {
  try {
    const { plan, paymentMethodId, setupIntentId } = req.body;
    const result = await billingService.changePlan({
      companyId: req.companyId,
      userId: req.userId,
      plan,
      paymentMethodId,
      setupIntentId,
    });

    res.json(result);
  } catch (error) {
    if (error instanceof BillingError) {
      return res.status(error.statusCode).json({ error: error.message, details: error.details || undefined });
    }
    console.error('[Billing] Erro ao alterar plano:', {
      requestId: req.requestId,
      message: error.message,
    });
    res.status(500).json({ error: 'Erro ao alterar plano.' });
  }
}

async function cancelSubscription(req, res) {
  try {
    const result = await billingService.cancelSubscription(req.companyId);
    res.json(result);
  } catch (error) {
    if (error instanceof BillingError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('[Billing] Erro ao cancelar assinatura:', {
      requestId: req.requestId,
      message: error.message,
    });
    res.status(500).json({ error: 'Erro ao cancelar assinatura.' });
  }
}

async function getPayments(req, res) {
  try {
    const payments = await billingService.listPayments(req.companyId);
    res.json({ payments });
  } catch (error) {
    console.error('[Billing] Erro ao buscar pagamentos:', {
      requestId: req.requestId,
      message: error.message,
    });
    res.status(500).json({ error: 'Erro ao buscar pagamentos.' });
  }
}

async function reactivateSubscription(req, res) {
  try {
    const { paymentMethodId, plan, setupIntentId } = req.body;
    const result = await billingService.reactivateSubscription({
      companyId: req.companyId,
      userId: req.userId,
      paymentMethodId,
      plan,
      setupIntentId,
    });

    res.json(result);
  } catch (error) {
    if (error instanceof BillingError) {
      return res.status(error.statusCode).json({ error: error.message, details: error.details || undefined });
    }
    console.error('[Billing] Erro ao reativar assinatura:', {
      requestId: req.requestId,
      message: error.message,
    });
    res.status(500).json({ error: 'Erro ao reativar a assinatura. Verifique os dados do cartão e tente novamente.' });
  }
}

module.exports = {
  getPublicBillingConfig,
  createSetupIntent,
  createPreapproval,
  getStatus,
  changePlan,
  cancelSubscription,
  getPayments,
  reactivateSubscription,
  PLAN_PRICES,
  PLAN_NAMES,
};
