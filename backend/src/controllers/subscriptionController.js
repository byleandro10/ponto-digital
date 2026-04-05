const billingService = require('../services/billingService');

const { BillingError } = billingService;

function handleBillingError(res, req, message, error) {
  if (error instanceof BillingError) {
    return res.status(error.statusCode).json({
      error: error.message,
      details: error.details || undefined,
      requestId: req.requestId,
    });
  }

  console.error(message, {
    requestId: req.requestId,
    companyId: req.companyId,
    userId: req.userId,
    error: error.message,
  });

  return res.status(500).json({
    error: 'Erro interno ao processar a cobranca.',
    requestId: req.requestId,
  });
}

async function createCheckoutSession(req, res) {
  try {
    const result = await billingService.createCheckoutSession({
      companyId: req.companyId,
      userId: req.userId,
      plan: req.body.plan,
    });

    return res.status(201).json({
      message: 'Checkout criado com sucesso.',
      ...result,
      requestId: req.requestId,
    });
  } catch (error) {
    return handleBillingError(res, req, '[Billing] Erro ao criar checkout session', error);
  }
}

async function syncCheckoutSession(req, res) {
  try {
    const subscription = await billingService.syncCheckoutSession({
      companyId: req.companyId,
      sessionId: req.body.sessionId,
    });

    return res.json({
      message: 'Assinatura sincronizada com sucesso.',
      subscription,
      requestId: req.requestId,
    });
  } catch (error) {
    return handleBillingError(res, req, '[Billing] Erro ao sincronizar checkout session', error);
  }
}

async function createPortalSession(req, res) {
  try {
    const result = await billingService.createPortalSession({
      companyId: req.companyId,
    });

    return res.status(201).json({
      message: 'Portal do cliente criado com sucesso.',
      ...result,
      requestId: req.requestId,
    });
  } catch (error) {
    return handleBillingError(res, req, '[Billing] Erro ao criar portal session', error);
  }
}

async function getStatus(req, res) {
  try {
    const subscription = await billingService.getSubscriptionStatus(req.companyId);
    return res.json({ subscription, requestId: req.requestId });
  } catch (error) {
    return handleBillingError(res, req, '[Billing] Erro ao buscar status da assinatura', error);
  }
}

async function getPayments(req, res) {
  try {
    const payments = await billingService.listPayments(req.companyId);
    return res.json({ payments, requestId: req.requestId });
  } catch (error) {
    return handleBillingError(res, req, '[Billing] Erro ao buscar pagamentos', error);
  }
}

module.exports = {
  createCheckoutSession,
  syncCheckoutSession,
  createPortalSession,
  getStatus,
  getPayments,
};
