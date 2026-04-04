const billingService = require('../services/billingService');
const stripeService = require('../services/stripeService');

const { BillingError, PLAN_PRICES, PLAN_NAMES } = billingService;

async function createSetupIntent(req, res) {
  try {
    const setupIntent = await stripeService.createSetupIntent({
      metadata: {
        email: req.body?.email || '',
        companyId: req.companyId || '',
        userId: req.userId || '',
      },
    });

    return res.status(201).json({
      clientSecret: setupIntent.client_secret,
      setupIntentId: setupIntent.id,
    });
  } catch (error) {
    console.error('[Controller] Erro ao criar SetupIntent:', error);
    return res.status(500).json({ error: 'Erro ao iniciar validacao do cartao com a Stripe.' });
  }
}

async function createPreapproval(req, res) {
  try {
    const { plan, paymentMethodId } = req.body;
    const companyId = req.companyId;

    const subscription = await billingService.createSubscription({
      companyId,
      userId: req.userId,
      plan,
      paymentMethodId,
    });

    res.status(201).json({
      message: `Assinatura criada com sucesso! ${billingService.TRIAL_DAYS} dias gratis ativados.`,
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

async function getStatus(req, res) {
  try {
    const subscription = await billingService.getSubscriptionStatus(req.companyId);
    res.json({ subscription });
  } catch (error) {
    console.error('[Controller] Erro ao buscar status:', error);
    res.status(500).json({ error: 'Erro ao buscar status da assinatura.' });
  }
}

async function changePlan(req, res) {
  try {
    const { plan, paymentMethodId } = req.body;
    const result = await billingService.changePlan({
      companyId: req.companyId,
      userId: req.userId,
      plan,
      paymentMethodId,
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

async function getPayments(req, res) {
  try {
    const payments = await billingService.listPayments(req.companyId);
    res.json({ payments });
  } catch (error) {
    console.error('[Controller] Erro ao buscar pagamentos:', error);
    res.status(500).json({ error: 'Erro ao buscar pagamentos.' });
  }
}

async function reactivateSubscription(req, res) {
  try {
    const { paymentMethodId, plan } = req.body;
    const result = await billingService.reactivateSubscription({
      companyId: req.companyId,
      userId: req.userId,
      paymentMethodId,
      plan,
    });

    res.json(result);
  } catch (error) {
    if (error instanceof BillingError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('[Controller] Erro ao reativar assinatura:', error);
    res.status(500).json({ error: 'Erro ao reativar assinatura. Verifique os dados do cartao e tente novamente.' });
  }
}

module.exports = {
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
