const prisma = require('../config/database');
const bcrypt = require('bcryptjs');
const { generateToken } = require('../utils/generateToken');
const { isValidEmail, isValidCNPJ, formatCNPJ, isValidPassword, sanitize } = require('../utils/validators');
const { TRIAL_DAYS, BILLING_STATUS, normalizePlanKey } = require('../config/billingConfig');
const billingService = require('../services/billingService');

async function _trackLoginDirect(companyId, type) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const field = type === 'admin' ? 'adminLogins' : 'employeeLogins';
    await prisma.usageLog.upsert({
      where: { companyId_date: { companyId, date: today } },
      create: { companyId, date: today, [field]: 1 },
      update: { [field]: { increment: 1 } },
    });
  } catch (err) {
    console.error('Erro ao rastrear login:', err.message);
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
    let { companyName, cnpj, name, email, password, plan, paymentMethodId, setupIntentId } = req.body;

    companyName = sanitize(companyName);
    cnpj = sanitize(cnpj);
    name = sanitize(name);
    email = sanitize(email)?.toLowerCase();
    password = password || '';
    paymentMethodId = sanitize(paymentMethodId);

    if (!companyName || !cnpj || !name || !email || !password) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'E-mail inválido. Informe um e-mail válido, como usuario@empresa.com.' });
    }

    if (!isValidCNPJ(cnpj)) {
      return res.status(400).json({ error: 'CNPJ inválido. Informe um CNPJ válido com 14 dígitos.' });
    }
    cnpj = formatCNPJ(cnpj);

    if (!isValidPassword(password)) {
      return res.status(400).json({ error: 'A senha deve ter no mínimo 8 caracteres, com pelo menos 1 letra maiúscula, 1 letra minúscula e 1 número.' });
    }

    if (name.length < 3) {
      return res.status(400).json({ error: 'O nome deve ter no mínimo 3 caracteres.' });
    }

    const requiresBillingOnSignup = Boolean(plan || paymentMethodId);
    if (requiresBillingOnSignup && !paymentMethodId) {
      return res.status(400).json({
        error: 'Valide o cartão pela Stripe antes de concluir o cadastro.',
      });
    }

    const existingCompany = await prisma.company.findUnique({ where: { cnpj } });
    if (existingCompany) {
      return res.status(400).json({ error: 'Este CNPJ já possui uma empresa cadastrada.' });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'Este e-mail já está em uso.' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    plan = normalizePlanKey(plan, 'BASIC');

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS);
    const now = new Date();

    const company = await prisma.company.create({
      data: {
        name: companyName,
        cnpj,
        plan: plan.toLowerCase(),
        subscriptionStatus: BILLING_STATUS.TRIAL,
        trialEndsAt,
        users: {
          create: { name, email, password: hashedPassword, role: 'ADMIN' },
        },
        subscriptions: {
          create: {
            plan,
            status: BILLING_STATUS.TRIAL,
            trialStart: now,
            trialEndsAt,
            currentPeriodStart: now,
            currentPeriodEnd: trialEndsAt,
          },
        },
      },
      include: { users: true },
    });

    createdCompanyId = company.id;

    let subscription = null;
    if (requiresBillingOnSignup) {
      try {
        subscription = await billingService.createSubscription({
          companyId: company.id,
          userId: company.users[0].id,
          plan,
          paymentMethodId,
          setupIntentId,
        });
      } catch (error) {
        await cleanupFailedCompanyRegistration(company.id);

        if (error instanceof billingService.BillingError) {
          return res.status(error.statusCode).json({ error: error.message });
        }

        return res.status(422).json({
          error: `Falha ao validar o cartão e criar a assinatura na Stripe: ${error.message}`,
        });
      }
    }

    const user = company.users[0];
    const token = generateToken({ id: user.id, role: user.role, companyId: company.id, type: 'admin' });

    res.status(201).json({
      message: requiresBillingOnSignup
        ? 'Empresa cadastrada e assinatura iniciada com sucesso.'
        : 'Empresa cadastrada com sucesso.',
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      company: { id: company.id, name: company.name, cnpj: company.cnpj, plan: company.plan },
      subscriptionStatus: subscription?.status || BILLING_STATUS.TRIAL,
      trialEndsAt: subscription?.trialEndsAt || trialEndsAt,
      subscription,
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
    res.status(500).json({ error: 'Erro ao registrar a empresa. Tente novamente.' });
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
    const user = await prisma.user.findUnique({ where: { email }, include: { company: true } });
    if (!user) return res.status(401).json({ error: 'Credenciais inválidas.' });
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(401).json({ error: 'Credenciais inválidas.' });
    const token = generateToken({ id: user.id, role: user.role, companyId: user.companyId, type: 'admin' });
    _trackLoginDirect(user.companyId, 'admin').catch(() => {});
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      company: { id: user.company.id, name: user.company.name, cnpj: user.company.cnpj, plan: user.company.plan },
      subscriptionStatus: user.company.subscriptionStatus || BILLING_STATUS.TRIAL,
      trialEndsAt: user.company.trialEndsAt || null,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao fazer login.' });
  }
}

async function loginEmployee(req, res) {
  try {
    let { cpf, password } = req.body;
    cpf = sanitize(cpf)?.replace(/\D/g, '');
    if (!cpf || !password) {
      return res.status(400).json({ error: 'CPF e senha são obrigatórios.' });
    }
    const employee = await prisma.employee.findUnique({ where: { cpf }, include: { company: true } });
    if (!employee || !employee.active) return res.status(401).json({ error: 'Credenciais inválidas.' });
    const validPassword = await bcrypt.compare(password, employee.password);
    if (!validPassword) return res.status(401).json({ error: 'Credenciais inválidas.' });
    const token = generateToken({ id: employee.id, companyId: employee.companyId, type: 'employee' });
    _trackLoginDirect(employee.companyId, 'employee').catch(() => {});
    res.json({
      token,
      employee: {
        id: employee.id,
        name: employee.name,
        cpf: employee.cpf.replace(/^(\d{3})\d{6}(\d{2})$/, '$1.***.***-$2'),
        position: employee.position,
      },
      company: { id: employee.company.id, name: employee.company.name, cnpj: employee.company.cnpj, plan: employee.company.plan },
      subscriptionStatus: employee.company.subscriptionStatus || BILLING_STATUS.TRIAL,
      trialEndsAt: employee.company.trialEndsAt || null,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao fazer login.' });
  }
}

async function changePasswordAdmin(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Senha atual e nova senha são obrigatórias.' });
    }
    if (!isValidPassword(newPassword)) {
      return res.status(400).json({ error: 'Nova senha deve ter no mínimo 8 caracteres, com pelo menos 1 maiúscula, 1 minúscula e 1 número.' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) return res.status(401).json({ error: 'Senha atual incorreta.' });

    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: req.userId }, data: { password: hashed } });

    res.json({ message: 'Senha alterada com sucesso.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao alterar senha.' });
  }
}

async function changePasswordEmployee(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Senha atual e nova senha são obrigatórias.' });
    }
    if (!isValidPassword(newPassword)) {
      return res.status(400).json({ error: 'Nova senha deve ter no mínimo 8 caracteres, com pelo menos 1 maiúscula, 1 minúscula e 1 número.' });
    }

    const employee = await prisma.employee.findUnique({ where: { id: req.employeeId } });
    if (!employee) return res.status(404).json({ error: 'Funcionário não encontrado.' });

    const valid = await bcrypt.compare(currentPassword, employee.password);
    if (!valid) return res.status(401).json({ error: 'Senha atual incorreta.' });

    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.employee.update({ where: { id: req.employeeId }, data: { password: hashed } });

    res.json({ message: 'Senha alterada com sucesso.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao alterar senha.' });
  }
}

module.exports = { register, loginAdmin, loginEmployee, changePasswordAdmin, changePasswordEmployee };
