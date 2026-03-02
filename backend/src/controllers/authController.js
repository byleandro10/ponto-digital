const prisma = require('../config/database');
const bcrypt = require('bcryptjs');
const { generateToken } = require('../utils/generateToken');
const { isValidEmail, isValidCNPJ, formatCNPJ, isValidPassword, sanitize } = require('../utils/validators');

async function register(req, res) {
  try {
    let { companyName, cnpj, name, email, password } = req.body;

    // Sanitização
    companyName = sanitize(companyName);
    cnpj = sanitize(cnpj);
    name = sanitize(name);
    email = sanitize(email)?.toLowerCase();
    password = password || '';

    // Validações obrigatórias
    if (!companyName || !cnpj || !name || !email || !password) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
    }

    // Validação de e-mail
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'E-mail inválido. Informe um e-mail válido (ex: usuario@empresa.com).' });
    }

    // Validação de CNPJ
    if (!isValidCNPJ(cnpj)) {
      return res.status(400).json({ error: 'CNPJ inválido. Informe um CNPJ válido com 14 dígitos.' });
    }
    cnpj = formatCNPJ(cnpj);

    // Validação de senha
    if (!isValidPassword(password)) {
      return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres.' });
    }

    // Validação de nome
    if (name.length < 3) {
      return res.status(400).json({ error: 'Nome deve ter no mínimo 3 caracteres.' });
    }

    const existingCompany = await prisma.company.findUnique({ where: { cnpj } });
    if (existingCompany) {
      return res.status(400).json({ error: 'CNPJ já cadastrado.' });
    }
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'E-mail já cadastrado.' });
    }
    const hashedPassword = await bcrypt.hash(password, 12);
    const company = await prisma.company.create({
      data: {
        name: companyName,
        cnpj,
        users: {
          create: { name, email, password: hashedPassword, role: 'ADMIN' }
        }
      },
      include: { users: true }
    });
    const user = company.users[0];
    const token = generateToken({ id: user.id, role: user.role, companyId: company.id, type: 'admin' });
    res.status(201).json({
      message: 'Empresa cadastrada com sucesso!',
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      company: { id: company.id, name: company.name }
    });
  } catch (error) {
    console.error('Erro ao registrar empresa:', error.message, error.stack);
    if (error.code === 'P2002') {
      const field = error.meta?.target?.includes('email') ? 'E-mail' : 'CNPJ';
      return res.status(400).json({ error: `${field} já cadastrado.` });
    }
    res.status(500).json({ error: 'Erro ao registrar empresa. Tente novamente.', debug: error.message });
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
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      company: { id: user.company.id, name: user.company.name }
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
    res.json({
      token,
      employee: { id: employee.id, name: employee.name, cpf: employee.cpf, position: employee.position },
      company: { id: employee.company.id, name: employee.company.name }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao fazer login.' });
  }
}

module.exports = { register, loginAdmin, loginEmployee };
