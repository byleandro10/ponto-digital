const prisma = require('../config/database');
const { extractBearerToken, decodeToken, assignAuthContext } = require('./auth');
const { logSecurityEvent } = require('../utils/securityLogger');
const billingService = require('../services/billingService');

async function subscriptionGuard(req, res, next) {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      logSecurityEvent(req, 'missing_bearer_token');
      return res.status(401).json({ error: 'Token nao fornecido.' });
    }

    let decoded;
    try {
      decoded = decodeToken(token);
    } catch (error) {
      logSecurityEvent(req, 'invalid_token', { reason: error.message });
      return res.status(401).json({ error: 'Token invalido ou expirado.' });
    }

    assignAuthContext(req, decoded);
    if (decoded.type === 'employee') {
      req.employeeId = decoded.id;
    }

    if (req.userRole === 'SUPER_ADMIN') {
      return next();
    }

    const companyId = req.companyId;
    if (!companyId) {
      logSecurityEvent(req, 'missing_company_context');
      return res.status(401).json({ error: 'Empresa nao identificada.' });
    }

    await billingService.reconcileCompanyBillingState(companyId);

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { subscriptionStatus: true, trialEndsAt: true },
    });

    if (!company) {
      logSecurityEvent(req, 'company_not_found_for_token');
      return res.status(404).json({ error: 'Empresa nao encontrada.' });
    }

    if (['ACTIVE', 'TRIALING'].includes(company.subscriptionStatus)) {
      return next();
    }

    const errorByStatus = {
      INCOMPLETE: {
        error: 'Finalize a assinatura para liberar o acesso ao sistema.',
        code: 'SUBSCRIPTION_INCOMPLETE',
      },
      INCOMPLETE_EXPIRED: {
        error: 'A sessao de assinatura expirou. Inicie uma nova assinatura para continuar.',
        code: 'SUBSCRIPTION_INCOMPLETE_EXPIRED',
      },
      PAST_DUE: {
        error: 'Existe um pagamento pendente. Atualize a forma de pagamento para continuar.',
        code: 'SUBSCRIPTION_PAST_DUE',
      },
      UNPAID: {
        error: 'A cobranca nao foi concluida. Atualize a forma de pagamento para continuar.',
        code: 'SUBSCRIPTION_UNPAID',
      },
      CANCELED: {
        error: 'A assinatura foi cancelada. Reative para continuar usando o sistema.',
        code: 'SUBSCRIPTION_CANCELED',
      },
    };

    const response = errorByStatus[company.subscriptionStatus] || {
      error: 'Assinatura inativa. Reative para continuar usando o sistema.',
      code: 'SUBSCRIPTION_INACTIVE',
    };

    logSecurityEvent(req, 'subscription_denied', {
      reason: response.code,
      status: company.subscriptionStatus,
    });

    return res.status(402).json(response);
  } catch (error) {
    console.error('Erro no subscriptionGuard:', error);
    return res.status(500).json({
      error: 'Erro interno ao verificar assinatura. Tente novamente.',
    });
  }
}

module.exports = { subscriptionGuard };
