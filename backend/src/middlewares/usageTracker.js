const prisma = require('../config/database');

/**
 * Middleware para rastrear métricas de uso.
 * Faz upsert no UsageLog do dia para a empresa atual.
 * Executa de forma assíncrona para não impactar performance.
 */
function trackLogin(loginType) {
  return (req, res, next) => {
    // Executar tracking de forma assíncrona (fire & forget)
    const companyId = req.companyId;
    if (companyId) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const field = loginType === 'admin' ? 'adminLogins' : 'employeeLogins';

      prisma.usageLog
        .upsert({
          where: { companyId_date: { companyId, date: today } },
          create: {
            companyId,
            date: today,
            [field]: 1,
          },
          update: {
            [field]: { increment: 1 },
          },
        })
        .catch((err) => console.error('Erro ao rastrear login:', err.message));
    }
    next();
  };
}

/**
 * Rastrear punch (batida de ponto) — chamado após punch bem-sucedido
 */
async function trackPunch(companyId) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await prisma.usageLog.upsert({
      where: { companyId_date: { companyId, date: today } },
      create: {
        companyId,
        date: today,
        totalPunches: 1,
      },
      update: {
        totalPunches: { increment: 1 },
      },
    });
  } catch (err) {
    console.error('Erro ao rastrear punch:', err.message);
  }
}

/**
 * Atualizar contagem de funcionários ativos — chamado em CRUD de funcionários
 */
async function updateActiveEmployees(companyId) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const count = await prisma.employee.count({
      where: { companyId, active: true },
    });

    await prisma.usageLog.upsert({
      where: { companyId_date: { companyId, date: today } },
      create: {
        companyId,
        date: today,
        activeEmployees: count,
      },
      update: {
        activeEmployees: count,
      },
    });
  } catch (err) {
    console.error('Erro ao atualizar activeEmployees:', err.message);
  }
}

module.exports = { trackLogin, trackPunch, updateActiveEmployees };
