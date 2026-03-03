const prisma = require('../config/database');

/**
 * GET /api/super-admin/dashboard
 * KPIs globais do sistema
 */
async function getDashboard(req, res) {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalCompanies,
      activeSubscriptions,
      trialSubscriptions,
      cancelledLast30,
      totalEmployees,
      punchesThisMonth,
      allActiveSubscriptions,
      recentCompanies,
    ] = await Promise.all([
      prisma.company.count(),
      prisma.subscription.count({ where: { status: 'ACTIVE' } }),
      prisma.subscription.count({ where: { status: 'TRIAL' } }),
      prisma.subscription.count({
        where: { status: 'CANCELLED', cancelledAt: { gte: thirtyDaysAgo } },
      }),
      prisma.employee.count({ where: { active: true } }),
      prisma.timeEntry.count({ where: { createdAt: { gte: startOfMonth } } }),
      prisma.subscription.findMany({
        where: { status: 'ACTIVE' },
        select: { plan: true },
      }),
      prisma.company.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          _count: { select: { employees: true } },
          subscriptions: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { plan: true, status: true, trialEndsAt: true },
          },
        },
      }),
    ]);

    // Calcular MRR
    const PLAN_PRICES = { BASIC: 49, PROFESSIONAL: 99, ENTERPRISE: 199 };
    const mrr = allActiveSubscriptions.reduce((sum, sub) => {
      return sum + (PLAN_PRICES[sub.plan] || 0);
    }, 0);

    // Churn rate (últimos 30 dias)
    const totalAtStart = totalCompanies - cancelledLast30; // aproximação
    const churnRate = totalAtStart > 0 ? ((cancelledLast30 / totalAtStart) * 100).toFixed(1) : 0;

    // Receita total (todos os pagamentos aprovados)
    const totalRevenue = await prisma.payment.aggregate({
      where: { status: 'APPROVED' },
      _sum: { amount: true },
    });

    res.json({
      kpis: {
        totalCompanies,
        activeSubscriptions,
        trialSubscriptions,
        cancelledLast30,
        totalEmployees,
        punchesThisMonth,
        mrr,
        churnRate: parseFloat(churnRate),
        totalRevenue: totalRevenue._sum.amount || 0,
      },
      recentCompanies: recentCompanies.map((c) => ({
        id: c.id,
        name: c.name,
        cnpj: c.cnpj,
        createdAt: c.createdAt,
        employeeCount: c._count.employees,
        subscription: c.subscriptions[0] || null,
      })),
    });
  } catch (error) {
    console.error('Erro no dashboard SA:', error);
    res.status(500).json({ error: 'Erro ao carregar dashboard.' });
  }
}

/**
 * GET /api/super-admin/companies
 * Lista todas as empresas com filtros
 */
async function getCompanies(req, res) {
  try {
    const { search, plan, status, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { cnpj: { contains: search } },
      ];
    }

    if (plan) {
      where.plan = plan;
    }

    if (status) {
      where.subscriptionStatus = status;
    }

    const [companies, total] = await Promise.all([
      prisma.company.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { employees: true } },
          subscriptions: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { plan: true, status: true, trialEndsAt: true, createdAt: true },
          },
          users: {
            where: { role: { in: ['ADMIN', 'MANAGER'] } },
            take: 1,
            select: { name: true, email: true, updatedAt: true },
          },
        },
      }),
      prisma.company.count({ where }),
    ]);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Buscar batidas do mês para cada empresa
    const companyIds = companies.map((c) => c.id);
    const punchCounts = await prisma.timeEntry.groupBy({
      by: ['employeeId'],
      where: {
        createdAt: { gte: startOfMonth },
        employee: { companyId: { in: companyIds } },
      },
      _count: true,
    });

    // Agrupar por company
    const employeeCompanyMap = {};
    const employees = await prisma.employee.findMany({
      where: { companyId: { in: companyIds } },
      select: { id: true, companyId: true },
    });
    employees.forEach((e) => (employeeCompanyMap[e.id] = e.companyId));

    const punchesByCompany = {};
    punchCounts.forEach((p) => {
      const cid = employeeCompanyMap[p.employeeId];
      if (cid) punchesByCompany[cid] = (punchesByCompany[cid] || 0) + p._count;
    });

    res.json({
      companies: companies.map((c) => ({
        id: c.id,
        name: c.name,
        cnpj: c.cnpj,
        plan: c.plan,
        subscriptionStatus: c.subscriptionStatus,
        employeeCount: c._count.employees,
        punchesThisMonth: punchesByCompany[c.id] || 0,
        createdAt: c.createdAt,
        subscription: c.subscriptions[0] || null,
        trialDaysLeft:
          c.subscriptions[0]?.trialEndsAt
            ? Math.max(0, Math.ceil((new Date(c.subscriptions[0].trialEndsAt) - now) / (1000 * 60 * 60 * 24)))
            : 0,
        adminUser: c.users[0] || null,
      })),
      total,
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    console.error('Erro ao listar empresas SA:', error);
    res.status(500).json({ error: 'Erro ao listar empresas.' });
  }
}

/**
 * GET /api/super-admin/companies/:id
 * Detalhes de uma empresa
 */
async function getCompanyDetail(req, res) {
  try {
    const { id } = req.params;

    const company = await prisma.company.findUnique({
      where: { id },
      include: {
        _count: { select: { employees: true } },
        subscriptions: { orderBy: { createdAt: 'desc' } },
        payments: { orderBy: { createdAt: 'desc' }, take: 20 },
        users: {
          where: { role: { in: ['ADMIN', 'MANAGER'] } },
          select: { id: true, name: true, email: true, role: true, updatedAt: true },
        },
      },
    });

    if (!company) {
      return res.status(404).json({ error: 'Empresa não encontrada.' });
    }

    // Métricas de uso dos últimos 30 dias
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const usageLogs = await prisma.usageLog.findMany({
      where: { companyId: id, date: { gte: thirtyDaysAgo } },
      orderBy: { date: 'asc' },
    });

    res.json({ company, usageLogs });
  } catch (error) {
    console.error('Erro ao buscar detalhes da empresa:', error);
    res.status(500).json({ error: 'Erro ao buscar detalhes.' });
  }
}

/**
 * GET /api/super-admin/revenue
 * Receita por período
 */
async function getRevenue(req, res) {
  try {
    const { months = 12 } = req.query;
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - parseInt(months));

    const payments = await prisma.payment.findMany({
      where: { status: 'APPROVED', paidAt: { gte: startDate } },
      include: { subscription: { select: { plan: true } } },
      orderBy: { paidAt: 'asc' },
    });

    // Agrupar por mês
    const monthlyRevenue = {};
    const revenueByPlan = { BASIC: 0, PROFESSIONAL: 0, ENTERPRISE: 0 };

    payments.forEach((p) => {
      const month = p.paidAt
        ? `${p.paidAt.getFullYear()}-${String(p.paidAt.getMonth() + 1).padStart(2, '0')}`
        : 'unknown';
      const amount = parseFloat(p.amount);
      monthlyRevenue[month] = (monthlyRevenue[month] || 0) + amount;

      const plan = p.subscription?.plan || 'BASIC';
      revenueByPlan[plan] = (revenueByPlan[plan] || 0) + amount;
    });

    const totalRevenue = await prisma.payment.aggregate({
      where: { status: 'APPROVED' },
      _sum: { amount: true },
    });

    res.json({
      monthlyRevenue: Object.entries(monthlyRevenue).map(([month, amount]) => ({
        month,
        amount,
      })),
      revenueByPlan,
      totalRevenue: totalRevenue._sum.amount || 0,
      totalPayments: payments.length,
    });
  } catch (error) {
    console.error('Erro ao buscar receita:', error);
    res.status(500).json({ error: 'Erro ao buscar receita.' });
  }
}

/**
 * GET /api/super-admin/churn
 * Empresas que cancelaram
 */
async function getChurn(req, res) {
  try {
    const { days = 90 } = req.query;
    const since = new Date();
    since.setDate(since.getDate() - parseInt(days));

    const churned = await prisma.subscription.findMany({
      where: {
        status: { in: ['CANCELLED', 'EXPIRED'] },
        updatedAt: { gte: since },
      },
      include: {
        company: { select: { id: true, name: true, cnpj: true, createdAt: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json({
      churned: churned.map((s) => ({
        company: s.company,
        plan: s.plan,
        status: s.status,
        cancelledAt: s.cancelledAt || s.updatedAt,
        subscriptionCreatedAt: s.createdAt,
        lifetimeDays: Math.ceil(
          (new Date(s.cancelledAt || s.updatedAt) - new Date(s.createdAt)) / (1000 * 60 * 60 * 24)
        ),
      })),
      total: churned.length,
    });
  } catch (error) {
    console.error('Erro ao buscar churn:', error);
    res.status(500).json({ error: 'Erro ao buscar churn.' });
  }
}

/**
 * GET /api/super-admin/usage-stats
 * Métricas agregadas de uso
 */
async function getUsageStats(req, res) {
  try {
    const { days = 30 } = req.query;
    const since = new Date();
    since.setDate(since.getDate() - parseInt(days));

    const usageLogs = await prisma.usageLog.findMany({
      where: { date: { gte: since } },
      orderBy: { date: 'asc' },
    });

    // Agrupar por data
    const dailyStats = {};
    usageLogs.forEach((log) => {
      const dateKey = log.date.toISOString().split('T')[0];
      if (!dailyStats[dateKey]) {
        dailyStats[dateKey] = { date: dateKey, totalPunches: 0, adminLogins: 0, employeeLogins: 0, activeEmployees: 0 };
      }
      dailyStats[dateKey].totalPunches += log.totalPunches;
      dailyStats[dateKey].adminLogins += log.adminLogins;
      dailyStats[dateKey].employeeLogins += log.employeeLogins;
      dailyStats[dateKey].activeEmployees += log.activeEmployees;
    });

    // Top empresas por uso
    const companyUsage = {};
    usageLogs.forEach((log) => {
      if (!companyUsage[log.companyId]) {
        companyUsage[log.companyId] = { companyId: log.companyId, totalPunches: 0, totalLogins: 0 };
      }
      companyUsage[log.companyId].totalPunches += log.totalPunches;
      companyUsage[log.companyId].totalLogins += log.adminLogins + log.employeeLogins;
    });

    const topCompanyIds = Object.values(companyUsage)
      .sort((a, b) => b.totalPunches - a.totalPunches)
      .slice(0, 10);

    // Buscar nomes das empresas top
    if (topCompanyIds.length > 0) {
      const companies = await prisma.company.findMany({
        where: { id: { in: topCompanyIds.map((c) => c.companyId) } },
        select: { id: true, name: true },
      });
      const nameMap = {};
      companies.forEach((c) => (nameMap[c.id] = c.name));
      topCompanyIds.forEach((c) => (c.companyName = nameMap[c.companyId] || 'Unknown'));
    }

    // Empresas inativas (sem batidas nos últimos 7 dias)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const activeCompanyIds = await prisma.usageLog.findMany({
      where: { date: { gte: sevenDaysAgo }, totalPunches: { gt: 0 } },
      select: { companyId: true },
      distinct: ['companyId'],
    });

    const activeIds = new Set(activeCompanyIds.map((c) => c.companyId));
    const allActiveCompanies = await prisma.company.findMany({
      where: { subscriptionStatus: { in: ['TRIAL', 'ACTIVE'] } },
      select: { id: true, name: true, createdAt: true },
    });

    const inactive = allActiveCompanies
      .filter((c) => !activeIds.has(c.id))
      .map((c) => ({ id: c.id, name: c.name, createdAt: c.createdAt }));

    res.json({
      daily: Object.values(dailyStats),
      topCompanies: topCompanyIds,
      inactiveCompanies: inactive,
    });
  } catch (error) {
    console.error('Erro ao buscar usage stats:', error);
    res.status(500).json({ error: 'Erro ao buscar métricas de uso.' });
  }
}

module.exports = { getDashboard, getCompanies, getCompanyDetail, getRevenue, getChurn, getUsageStats };
