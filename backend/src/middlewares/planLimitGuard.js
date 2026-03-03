const prisma = require('../config/database');

const PLAN_LIMITS = {
  basic: { maxEmployees: 15, geofence: false },
  professional: { maxEmployees: 50, geofence: true },
  enterprise: { maxEmployees: Infinity, geofence: true },
};

/**
 * Verifica se a empresa atingiu o limite de funcionários do plano.
 * Aplicar nas rotas de criação de funcionário (POST /api/employees).
 */
function employeeLimitGuard() {
  return async (req, res, next) => {
    try {
      // SUPER_ADMIN é isento
      if (req.userRole === 'SUPER_ADMIN') return next();

      const companyId = req.companyId;
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { plan: true },
      });

      if (!company) return res.status(404).json({ error: 'Empresa não encontrada.' });

      const limits = PLAN_LIMITS[company.plan] || PLAN_LIMITS.basic;

      const employeeCount = await prisma.employee.count({
        where: { companyId, active: true },
      });

      if (employeeCount >= limits.maxEmployees) {
        return res.status(403).json({
          error: `Limite de ${limits.maxEmployees} funcionários atingido para o plano ${company.plan}. Faça upgrade para adicionar mais.`,
          code: 'PLAN_LIMIT_REACHED',
          currentPlan: company.plan,
          limit: limits.maxEmployees,
          current: employeeCount,
        });
      }

      next();
    } catch (error) {
      console.error('Erro no employeeLimitGuard:', error);
      next();
    }
  };
}

/**
 * Verifica se a empresa tem acesso a funcionalidade de geofence.
 * Plano Básico não tem acesso.
 */
function geofenceAccessGuard() {
  return async (req, res, next) => {
    try {
      if (req.userRole === 'SUPER_ADMIN') return next();

      const companyId = req.companyId;
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { plan: true },
      });

      if (!company) return res.status(404).json({ error: 'Empresa não encontrada.' });

      const limits = PLAN_LIMITS[company.plan] || PLAN_LIMITS.basic;

      if (!limits.geofence) {
        return res.status(403).json({
          error: 'Funcionalidade de cerca virtual disponível a partir do plano Profissional.',
          code: 'FEATURE_NOT_AVAILABLE',
          currentPlan: company.plan,
        });
      }

      next();
    } catch (error) {
      console.error('Erro no geofenceAccessGuard:', error);
      next();
    }
  };
}

module.exports = { employeeLimitGuard, geofenceAccessGuard, PLAN_LIMITS };
