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
    error?.code === 'P2022'
    || /unknown column|does not exist|table .* doesn't exist/i.test(message)
  );
}

function buildCompanyRegistrationCreateInput({
  companyName,
  cnpj,
  plan,
  name,
  email,
  hashedPassword,
  includeCompanySubscriptionStatus = true,
  includeHostedBillingFields = true,
  includeLocalSubscription = true,
  includeSubscriptionStatus = true,
  includeSubscriptionHostedBillingFields = true,
}) {
  const companyData = {
    name: companyName,
    cnpj,
    plan: getPlanConfig(plan).slug,
    users: {
      create: {
        name,
        email,
        password: hashedPassword,
        role: 'ADMIN',
      },
    },
  };

  if (includeCompanySubscriptionStatus) {
    companyData.subscriptionStatus = SUBSCRIPTION_STATUS.INCOMPLETE;
  }

  if (includeLocalSubscription) {
    companyData.subscriptions = {
      create: {
        plan,
      },
    };

    if (includeSubscriptionStatus) {
      companyData.subscriptions.create.status = SUBSCRIPTION_STATUS.INCOMPLETE;
    }
  }

  if (includeHostedBillingFields) {
    companyData.billingStatus = BILLING_STATUS.INCOMPLETE;
    companyData.cancelAtPeriodEnd = false;
  }

  if (includeLocalSubscription && includeSubscriptionHostedBillingFields) {
    companyData.subscriptions.create.billingStatus = BILLING_STATUS.INCOMPLETE;
    companyData.subscriptions.create.cancelAtPeriodEnd = false;
  }

  return {
    data: companyData,
    select: {
      id: true,
      name: true,
      cnpj: true,
      plan: true,
      users: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
    },
  };
}

async function createCompanyWithBillingCompatibility(payload) {
  const attempts = [
    {
      includeCompanySubscriptionStatus: true,
      includeHostedBillingFields: true,
      includeLocalSubscription: true,
      includeSubscriptionStatus: true,
      includeSubscriptionHostedBillingFields: true,
    },
    {
      includeCompanySubscriptionStatus: true,
      includeHostedBillingFields: false,
      includeLocalSubscription: true,
      includeSubscriptionStatus: true,
      includeSubscriptionHostedBillingFields: false,
    },
    {
      includeCompanySubscriptionStatus: true,
      includeHostedBillingFields: false,
      includeLocalSubscription: false,
      includeSubscriptionStatus: false,
      includeSubscriptionHostedBillingFields: false,
    },
  ];

  let lastCompatibilityError = null;

  for (const attempt of attempts) {
    try {
      return await prisma.company.create(
        buildCompanyRegistrationCreateInput({
          ...payload,
          ...attempt,
        })
      );
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

    const company = await createCompanyWithBillingCompatibility({
      companyName,
      cnpj,
      plan,
      name,
      email,
      hashedPassword,
    });

    createdCompanyId = company.id;

    const user = company.users[0];
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
      subscriptionStatus: SUBSCRIPTION_STATUS.INCOMPLETE,
      trialEndsAt: null,
    });
  } catch (error) {
    console.error('Erro ao registrar empresa:', error.message);

    if (createdCompanyId) {
      await cleanupFailedCompanyRegistration(createdCompanyId);
    }

    if (error.code === 'P2002') {
      const field = error.meta?.target?.includes('email') ? 'E-mail' : 'CNPJ';
      return res.status(400).json({ error: `${field} já cadastrado.` });
    }

    return res.status(500).json({
      error: 'Erro ao registrar a empresa. Tente novamente.',
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
      include: { company: true },
    });

    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
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
        id: user.company.id,
        name: user.company.name,
        cnpj: user.company.cnpj,
        plan: user.company.plan,
      },
      subscriptionStatus: user.company.subscriptionStatus || SUBSCRIPTION_STATUS.INCOMPLETE,
      trialEndsAt: user.company.trialEndsAt || null,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao fazer login.' });
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
      include: { company: true },
    });

    if (!employee || !employee.active) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    const validPassword = await bcrypt.compare(password, employee.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
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
        id: employee.company.id,
        name: employee.company.name,
        cnpj: employee.company.cnpj,
        plan: employee.company.plan,
      },
      subscriptionStatus: employee.company.subscriptionStatus || SUBSCRIPTION_STATUS.INCOMPLETE,
      trialEndsAt: employee.company.trialEndsAt || null,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao fazer login.' });
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
