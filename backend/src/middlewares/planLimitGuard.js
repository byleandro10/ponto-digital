const prisma = require('../config/database');
const { logSecurityEvent } = require('../utils/securityLogger');

const PLAN_LIMITS = {
  basic: { maxEmployees: 15, geofence: false },
  professional: { maxEmployees: 50, geofence: true },
  enterprise: { maxEmployees: Infinity, geofence: true },
};

function employeeLimitGuard() {
  return async (req, res, next) => {
    try {
      if (req.userRole === 'SUPER_ADMIN') return next();

      const companyId = req.companyId;
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { plan: true },
      });

      if (!company) return res.status(404).json({ error: 'Empresa nao encontrada.' });

      const limits = PLAN_LIMITS[company.plan] || PLAN_LIMITS.basic;

      const employeeCount = await prisma.employee.count({
        where: { companyId, active: true },
      });

      if (employeeCount >= limits.maxEmployees) {
        logSecurityEvent(req, 'plan_employee_limit_reached', {
          currentPlan: company.plan,
          limit: limits.maxEmployees,
          current: employeeCount,
        });
        return res.status(403).json({
          error: `Limite de ${limits.maxEmployees} funcionarios atingido para o plano ${company.plan}. Faca upgrade para adicionar mais.`,
          code: 'PLAN_LIMIT_REACHED',
          currentPlan: company.plan,
          limit: limits.maxEmployees,
          current: employeeCount,
        });
      }

      next();
    } catch (error) {
      console.error('Erro no employeeLimitGuard:', error);
      return res.status(500).json({ error: 'Erro interno ao validar limite do plano.' });
    }
  };
}

function geofenceAccessGuard() {
  return async (req, res, next) => {
    try {
      if (req.userRole === 'SUPER_ADMIN') return next();

      const companyId = req.companyId;
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { plan: true },
      });

      if (!company) return res.status(404).json({ error: 'Empresa nao encontrada.' });

      const limits = PLAN_LIMITS[company.plan] || PLAN_LIMITS.basic;
      if (!limits.geofence) {
        logSecurityEvent(req, 'plan_feature_denied', { feature: 'geofence', currentPlan: company.plan });
        return res.status(403).json({
          error: 'Funcionalidade de cerca virtual disponivel a partir do plano Profissional.',
          code: 'FEATURE_NOT_AVAILABLE',
          currentPlan: company.plan,
        });
      }

      next();
    } catch (error) {
      console.error('Erro no geofenceAccessGuard:', error);
      return res.status(500).json({ error: 'Erro interno ao validar permissao de plano.' });
    }
  };
}

module.exports = { employeeLimitGuard, geofenceAccessGuard, PLAN_LIMITS };
