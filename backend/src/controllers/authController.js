const prisma = require('../config/database');
const bcrypt = require('bcryptjs');
const { generateToken } = require('../utils/generateToken');
const {
  isValidEmail,
  isValidCNPJ,
  formatCNPJ,
  isValidPassword,
  sanitize,
} = require('../utils/validators');
const {
  BILLING_STATUS,
  SUBSCRIPTION_STATUS,
  normalizePlanKey,
  getPlanConfig,
} = require('../config/billingConfig');

function isLegacyBillingSchemaError(error) {
  const message = String(error?.message || error?.meta?.message || '').toLowerCase();
  return (
    error?.code === 'P2021'
    || error?.code === 'P2022'
    || /unknown column|does not exist|table .* doesn't exist/i.test(message)
  );
}

function buildCompanyCreateData({
  companyName,
  cnpj,
  plan,
  includeCompanySubscriptionStatus = true,
  includeHostedBillingFields = true,
}) {
  const companyData = {
    name: companyName,
    cnpj,
    plan: getPlanConfig(plan).slug,
  };

  if (includeCompanySubscriptionStatus) {
    companyData.subscriptionStatus = SUBSCRIPTION_STATUS.INCOMPLETE;
  }

  if (includeHostedBillingFields) {
    companyData.billingStatus = BILLING_STATUS.INCOMPLETE;
    companyData.cancelAtPeriodEnd = false;
  }

  return companyData;
}

function buildSubscriptionCreateData({
  companyId,
  plan,
  includeSubscriptionStatus = true,
  includeHostedBillingFields = true,
}) {
  const data = {
    companyId,
    plan,
  };

  if (includeSubscriptionStatus) {
    data.status = SUBSCRIPTION_STATUS.INCOMPLETE;
  }

  if (includeHostedBillingFields) {
    data.billingStatus = BILLING_STATUS.INCOMPLETE;
    data.cancelAtPeriodEnd = false;
  }

  return data;
}

async function createCompanyWithBillingCompatibility(tx, payload) {
  const attempts = [
    {
      includeCompanySubscriptionStatus: true,
      includeHostedBillingFields: true,
    },
    {
      includeCompanySubscriptionStatus: true,
      includeHostedBillingFields: false,
    },
    {
      includeCompanySubscriptionStatus: false,
      includeHostedBillingFields: false,
    },
  ];

  let lastCompatibilityError = null;

  for (const attempt of attempts) {
    try {
      return await tx.company.create({
        data: buildCompanyCreateData({
          ...payload,
          ...attempt,
        }),
        select: {
          id: true,
          name: true,
          cnpj: true,
          plan: true,
        },
      });
    } catch (error) {
      if (!isLegacyBillingSchemaError(error)) {
        throw error;
      }

      lastCompatibilityError = error;
    }
  }

  throw lastCompatibilityError;
}

async function createAdminUser(tx, { companyId, name, email, hashedPassword }) {
  return tx.user.create({
    data: {
      companyId,
      name,
      email,
      password: hashedPassword,
      role: 'ADMIN',
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  });
}

async function createLocalSubscriptionIfPossible(tx, { companyId, plan }) {
  const attempts = [
    { includeSubscriptionStatus: true, includeHostedBillingFields: true },
    { includeSubscriptionStatus: true, includeHostedBillingFields: false },
    { includeSubscriptionStatus: false, includeHostedBillingFields: false },
  ];

  for (const attempt of attempts) {
    try {
      await tx.subscription.create({
        data: buildSubscriptionCreateData({
          companyId,
          plan,
          ...attempt,
        }),
        select: { id: true },
      });
      return;
    } catch (error) {
      if (!isLegacyBillingSchemaError(error)) {
        throw error;
      }
    }
  }
}

function buildCompanyAuthSelect({ includeSubscriptionFields = true } = {}) {
  const select = {
    id: true,
    name: true,
    cnpj: true,
    plan: true,
  };

  if (includeSubscriptionFields) {
    select.subscriptionStatus = true;
    select.trialEndsAt = true;
  }

  return select;
}

async function getCompanyAuthSnapshot(companyId) {
  const attempts = [
    buildCompanyAuthSelect({ includeSubscriptionFields: true }),
    buildCompanyAuthSelect({ includeSubscriptionFields: false }),
  ];

  let lastCompatibilityError = null;

  for (const select of attempts) {
    try {
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select,
      });

      if (!company) {
        return null;
      }

      return {
        id: company.id,
        name: company.name,
        cnpj: company.cnpj,
        plan: company.plan,
        subscriptionStatus: company.subscriptionStatus || SUBSCRIPTION_STATUS.INCOMPLETE,
        trialEndsAt: company.trialEndsAt || null,
      };
    } catch (error) {
      if (!isLegacyBillingSchemaError(error)) {
        throw error;
      }

      lastCompatibilityError = error;
    }
  }

  throw lastCompatibilityError;
}

async function trackLoginDirect(companyId, type) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const field = type === 'admin' ? 'adminLogins' : 'employeeLogins';

    await prisma.usageLog.upsert({
      where: { companyId_date: { companyId, date: today } },
      create: { companyId, date: today, [field]: 1 },
      update: { [field]: { increment: 1 } },
    });
  } catch (error) {
    console.error('Erro ao rastrear login:', error.message);
  }
}

async function cleanupFailedCompanyRegistration(companyId) {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.payment.deleteMany({ where: { companyId } });
      await tx.subscription.deleteMany({ where: { companyId } });
      await tx.user.deleteMany({ where: { companyId } });
      await tx.usageLog.deleteMany({ where: { companyId } });
      await tx.notificationSetting.deleteMany({ where: { companyId } });
      await tx.company.deleteMany({ where: { id: companyId } });
    });
  } catch (cleanupError) {
    console.error('Erro ao limpar cadastro incompleto:', cleanupError.message);
  }
}

async function register(req, res) {
  let createdCompanyId = null;

  try {
    let { companyName, cnpj, name, email, password, plan } = req.body;

    companyName = sanitize(companyName);
    cnpj = sanitize(cnpj);
    name = sanitize(name);
    email = sanitize(email)?.toLowerCase();
    password = password || '';

    if (!companyName || !cnpj || !name || !email || !password) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({
        error: 'E-mail inválido. Informe um e-mail válido, como usuario@empresa.com.',
      });
    }

    if (!isValidCNPJ(cnpj)) {
      return res.status(400).json({
        error: 'CNPJ inválido. Informe um CNPJ válido com 14 dígitos.',
      });
    }

    if (!isValidPassword(password)) {
      return res.status(400).json({
        error: 'A senha deve ter no mínimo 8 caracteres, com pelo menos 1 letra maiúscula, 1 letra minúscula e 1 número.',
      });
    }

    if (String(name).trim().length < 3) {
      return res.status(400).json({ error: 'O nome deve ter no mínimo 3 caracteres.' });
    }

    cnpj = formatCNPJ(cnpj);
    plan = normalizePlanKey(plan, 'BASIC');

    const [existingCompany, existingUser] = await Promise.all([
      prisma.company.findUnique({ where: { cnpj }, select: { id: true } }),
      prisma.user.findUnique({ where: { email }, select: { id: true } }),
    ]);

    if (existingCompany) {
      return res.status(400).json({ error: 'Este CNPJ já possui uma empresa cadastrada.' });
    }

    if (existingUser) {
      return res.status(400).json({ error: 'Este e-mail já está em uso.' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const { company, user } = await prisma.$transaction(async (tx) => {
      const createdCompany = await createCompanyWithBillingCompatibility(tx, {
        companyName,
        cnpj,
        plan,
      });

      const createdUser = await createAdminUser(tx, {
        companyId: createdCompany.id,
        name,
        email,
        hashedPassword,
      });

      await createLocalSubscriptionIfPossible(tx, {
        companyId: createdCompany.id,
        plan,
      });

      return {
        company: createdCompany,
        user: createdUser,
      };
    });

    createdCompanyId = company.id;
    const token = generateToken({
      id: user.id,
      role: user.role,
      companyId: company.id,
      type: 'admin',
    });

    return res.status(201).json({
      message: 'Empresa cadastrada com sucesso.',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      company: {
        id: company.id,
        name: company.name,
        cnpj: company.cnpj,
        plan: company.plan,
      },
      subscriptionStatus: company.subscriptionStatus || SUBSCRIPTION_STATUS.INCOMPLETE,
      trialEndsAt: null,
    });
  } catch (error) {
    console.error('[auth.register] falha no cadastro:', {
      requestId: req.requestId || null,
      code: error.code || 'UNKNOWN',
      message: error.message,
      meta: error.meta || null,
    });

    if (createdCompanyId) {
      await cleanupFailedCompanyRegistration(createdCompanyId);
    }

    if (error.code === 'P2002') {
      const field = error.meta?.target?.includes('email') ? 'E-mail' : 'CNPJ';
      return res.status(400).json({ error: `${field} já cadastrado.` });
    }

    if (isLegacyBillingSchemaError(error)) {
      return res.status(503).json({
        error: 'O sistema esta concluindo uma atualizacao interna. Tente novamente em instantes.',
        requestId: req.requestId || null,
      });
    }

    return res.status(500).json({
      error: 'Erro ao registrar a empresa. Tente novamente.',
      requestId: req.requestId || null,
    });
  }
}

async function loginAdmin(req, res) {
  try {
    let { email, password } = req.body;
    email = sanitize(email)?.toLowerCase();

    if (!email || !password) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'E-mail inválido.' });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        password: true,
        role: true,
        companyId: true,
      },
    });

    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    const company = await getCompanyAuthSnapshot(user.companyId);
    if (!company) {
      return res.status(409).json({
        error: 'Nao foi possivel carregar os dados da empresa. Entre em contato com o suporte.',
      });
    }

    const token = generateToken({
      id: user.id,
      role: user.role,
      companyId: user.companyId,
      type: 'admin',
    });

    trackLoginDirect(user.companyId, 'admin').catch(() => {});

    return res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      company: {
        id: company.id,
        name: company.name,
        cnpj: company.cnpj,
        plan: company.plan,
      },
      subscriptionStatus: company.subscriptionStatus,
      trialEndsAt: company.trialEndsAt,
    });
  } catch (error) {
    console.error('[auth.loginAdmin] falha no login:', {
      requestId: req.requestId || null,
      code: error.code || 'UNKNOWN',
      message: error.message,
      meta: error.meta || null,
    });
    if (isLegacyBillingSchemaError(error)) {
      return res.status(503).json({
        error: 'O sistema esta concluindo uma atualizacao interna. Tente novamente em instantes.',
        requestId: req.requestId || null,
      });
    }

    return res.status(500).json({
      error: 'Erro ao fazer login.',
      requestId: req.requestId || null,
    });
  }
}

async function loginEmployee(req, res) {
  try {
    let { cpf, password } = req.body;
    cpf = sanitize(cpf)?.replace(/\D/g, '');

    if (!cpf || !password) {
      return res.status(400).json({ error: 'CPF e senha são obrigatórios.' });
    }

    const employee = await prisma.employee.findUnique({
      where: { cpf },
      select: {
        id: true,
        name: true,
        cpf: true,
        password: true,
        position: true,
        active: true,
        companyId: true,
      },
    });

    if (!employee || !employee.active) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    const validPassword = await bcrypt.compare(password, employee.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    const company = await getCompanyAuthSnapshot(employee.companyId);
    if (!company) {
      return res.status(409).json({
        error: 'Nao foi possivel carregar os dados da empresa. Entre em contato com o suporte.',
      });
    }

    const token = generateToken({
      id: employee.id,
      companyId: employee.companyId,
      type: 'employee',
    });

    trackLoginDirect(employee.companyId, 'employee').catch(() => {});

    return res.json({
      token,
      employee: {
        id: employee.id,
        name: employee.name,
        cpf: employee.cpf.replace(/^(\d{3})\d{6}(\d{2})$/, '$1.***.***-$2'),
        position: employee.position,
      },
      company: {
        id: company.id,
        name: company.name,
        cnpj: company.cnpj,
        plan: company.plan,
      },
      subscriptionStatus: company.subscriptionStatus,
      trialEndsAt: company.trialEndsAt,
    });
  } catch (error) {
    console.error('[auth.loginEmployee] falha no login:', {
      requestId: req.requestId || null,
      code: error.code || 'UNKNOWN',
      message: error.message,
      meta: error.meta || null,
    });
    if (isLegacyBillingSchemaError(error)) {
      return res.status(503).json({
        error: 'O sistema esta concluindo uma atualizacao interna. Tente novamente em instantes.',
        requestId: req.requestId || null,
      });
    }

    return res.status(500).json({
      error: 'Erro ao fazer login.',
      requestId: req.requestId || null,
    });
  }
}

async function changePasswordAdmin(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Senha atual e nova senha são obrigatórias.' });
    }

    if (!isValidPassword(newPassword)) {
      return res.status(400).json({
        error: 'Nova senha deve ter no mínimo 8 caracteres, com pelo menos 1 maiúscula, 1 minúscula e 1 número.',
      });
    }

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Senha atual incorreta.' });
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: req.userId }, data: { password: hashed } });

    return res.json({ message: 'Senha alterada com sucesso.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao alterar senha.' });
  }
}

async function changePasswordEmployee(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Senha atual e nova senha são obrigatórias.' });
    }

    if (!isValidPassword(newPassword)) {
      return res.status(400).json({
        error: 'Nova senha deve ter no mínimo 8 caracteres, com pelo menos 1 maiúscula, 1 minúscula e 1 número.',
      });
    }

    const employee = await prisma.employee.findUnique({ where: { id: req.employeeId } });
    if (!employee) {
      return res.status(404).json({ error: 'Funcionário não encontrado.' });
    }

    const valid = await bcrypt.compare(currentPassword, employee.password);
    if (!valid) {
      return res.status(401).json({ error: 'Senha atual incorreta.' });
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.employee.update({ where: { id: req.employeeId }, data: { password: hashed } });

    return res.json({ message: 'Senha alterada com sucesso.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao alterar senha.' });
  }
}

module.exports = {
  register,
  loginAdmin,
  loginEmployee,
  changePasswordAdmin,
  changePasswordEmployee,
};
