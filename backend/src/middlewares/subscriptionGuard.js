const prisma = require('../config/database');

/**
 * Middleware que verifica se a empresa do usuário tem assinatura válida.
 * Permite acesso se: TRIAL (dentro do prazo), ACTIVE, ou PAST_DUE (carência 3 dias).
 * Bloqueia com HTTP 402 caso contrário.
 *
 * SUPER_ADMIN é isento deste guard.
 */
async function subscriptionGuard(req, res, next) {
  try {
    // SUPER_ADMIN sempre tem acesso
    if (req.userRole === 'SUPER_ADMIN') {
      return next();
    }

    const companyId = req.companyId;
    if (!companyId) {
      return res.status(401).json({ error: 'Empresa não identificada.' });
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { subscriptionStatus: true, trialEndsAt: true },
    });

    if (!company) {
      return res.status(404).json({ error: 'Empresa não encontrada.' });
    }

    const now = new Date();
    const status = company.subscriptionStatus;

    // ACTIVE — ok
    if (status === 'ACTIVE') {
      return next();
    }

    // TRIAL — verificar se ainda dentro do prazo
    if (status === 'TRIAL') {
      if (company.trialEndsAt && company.trialEndsAt > now) {
        return next();
      }
      // Trial expirado — bloquear
      return res.status(402).json({
        error: 'Período de teste expirado. Ative sua assinatura para continuar.',
        code: 'TRIAL_EXPIRED',
      });
    }

    // PAST_DUE — carência de 3 dias
    if (status === 'PAST_DUE') {
      const subscription = await prisma.subscription.findFirst({
        where: { companyId, status: 'PAST_DUE' },
        orderBy: { updatedAt: 'desc' },
      });

      if (subscription) {
        const gracePeriodEnd = new Date(subscription.updatedAt);
        gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 3);
        if (now < gracePeriodEnd) {
          return next();
        }
      }
      return res.status(402).json({
        error: 'Pagamento pendente. Regularize para manter o acesso.',
        code: 'PAYMENT_OVERDUE',
      });
    }

    // CANCELLED, EXPIRED ou qualquer outro status
    return res.status(402).json({
      error: 'Assinatura inativa. Reative para continuar usando o sistema.',
      code: 'SUBSCRIPTION_INACTIVE',
    });
  } catch (error) {
    console.error('Erro no subscriptionGuard:', error);
    return next(); // Em caso de erro, permitir acesso (fail-open)
  }
}

module.exports = { subscriptionGuard };
