const prisma = require('../config/database');
const jwt = require('jsonwebtoken');

/**
 * Middleware que autentica o usuário (decodifica JWT) E verifica assinatura.
 * Combina authMiddleware + verificação de subscription em um único middleware.
 *
 * Regras de acesso:
 *   TRIAL   → acesso total (se dentro do prazo)
 *   ACTIVE  → acesso total
 *   PAST_DUE → acesso liberado até gracePeriodEnd (3 dias)
 *   PAUSED  → acesso bloqueado
 *   CANCELLED → acesso bloqueado
 *
 * SUPER_ADMIN é isento do guard de assinatura.
 */
async function subscriptionGuard(req, res, next) {
  try {
    // 1. Autenticar — decodificar JWT e popular req.userId, req.userRole, req.companyId
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token não fornecido.' });
    }
    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Token inválido ou expirado.' });
    }
    req.userId = decoded.id;
    req.userRole = decoded.role;
    req.companyId = decoded.companyId;
    req.userType = decoded.type;
    // Para rotas de funcionário
    if (decoded.type === 'employee') {
      req.employeeId = decoded.id;
    }

    // 2. SUPER_ADMIN sempre tem acesso
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

    // TRIAL — verificar se ainda dentro do prazo (14 dias)
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

    // PAST_DUE — carência de 3 dias usando gracePeriodEnd
    if (status === 'PAST_DUE') {
      const subscription = await prisma.subscription.findFirst({
        where: { companyId, status: 'PAST_DUE' },
        orderBy: { updatedAt: 'desc' },
      });

      if (subscription) {
        // Usar campo gracePeriodEnd se disponível, senão fallback para updatedAt + 3 dias
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
      return res.status(402).json({
        error: 'Pagamento pendente. Regularize para manter o acesso.',
        code: 'PAYMENT_OVERDUE',
      });
    }

    // PAUSED — acesso bloqueado
    if (status === 'PAUSED') {
      return res.status(402).json({
        error: 'Assinatura pausada. Reative para continuar usando o sistema.',
        code: 'SUBSCRIPTION_PAUSED',
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
