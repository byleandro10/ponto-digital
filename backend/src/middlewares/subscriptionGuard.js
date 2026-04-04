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

    const now = new Date();
    const status = company.subscriptionStatus;

    if (status === 'ACTIVE') {
      return next();
    }

    if (status === 'TRIAL') {
      if (company.trialEndsAt && company.trialEndsAt > now) {
        return next();
      }

      logSecurityEvent(req, 'subscription_denied', { reason: 'trial_expired' });
      return res.status(402).json({
        error: 'Periodo de teste expirado. Ative sua assinatura para continuar.',
        code: 'TRIAL_EXPIRED',
      });
    }

    if (status === 'PAST_DUE') {
      const subscription = await prisma.subscription.findFirst({
        where: { companyId, status: 'PAST_DUE' },
        orderBy: { updatedAt: 'desc' },
      });

      if (subscription) {
        let graceEnd;
        if (subscription.gracePeriodEnd) {
          graceEnd = new Date(subscription.gracePeriodEnd);
        } else {
          graceEnd = new Date(subscription.updatedAt);
          graceEnd.setDate(graceEnd.getDate() + 3);
        }

        if (now < graceEnd) {
          return next();
        }
      }

      logSecurityEvent(req, 'subscription_denied', { reason: 'payment_overdue' });
      return res.status(402).json({
        error: 'Pagamento pendente. Regularize para manter o acesso.',
        code: 'PAYMENT_OVERDUE',
      });
    }

    if (status === 'PAUSED') {
      logSecurityEvent(req, 'subscription_denied', { reason: 'subscription_paused' });
      return res.status(402).json({
        error: 'Assinatura pausada. Reative para continuar usando o sistema.',
        code: 'SUBSCRIPTION_PAUSED',
      });
    }

    logSecurityEvent(req, 'subscription_denied', { reason: 'subscription_inactive', status });
    return res.status(402).json({
      error: 'Assinatura inativa. Reative para continuar usando o sistema.',
      code: 'SUBSCRIPTION_INACTIVE',
    });
  } catch (error) {
    console.error('Erro no subscriptionGuard:', error);
    return res.status(500).json({ error: 'Erro interno ao verificar assinatura. Tente novamente.' });
  }
}

module.exports = { subscriptionGuard };
