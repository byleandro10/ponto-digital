const prisma = require('../config/database');
const bcrypt = require('bcryptjs');
const { isValidEmail, isValidCPF, formatCPF, isValidPassword, isValidPhone, sanitize } = require('../utils/validators');
const { updateActiveEmployees } = require('../middlewares/usageTracker');

async function createEmployee(req, res) {
  try {
    let { name, cpf, email, password, phone, position, department, workloadHours, workScheduleType, geofenceExempt } = req.body;

    // Sanitização
    name = sanitize(name);
    cpf = sanitize(cpf);
    email = sanitize(email)?.toLowerCase();
    phone = sanitize(phone);
    position = sanitize(position);
    department = sanitize(department);

    // Validações obrigatórias
    if (!name || !cpf || !email || !password) {
      return res.status(400).json({ error: 'Nome, CPF, e-mail e senha são obrigatórios.' });
    }

    // Validação de nome
    if (name.length < 3) {
      return res.status(400).json({ error: 'Nome deve ter no mínimo 3 caracteres.' });
    }

    // Validação de e-mail
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'E-mail inválido. Informe um e-mail válido (ex: usuario@empresa.com).' });
    }

    // Validação de CPF
    if (!isValidCPF(cpf)) {
      return res.status(400).json({ error: 'CPF inválido. Informe um CPF válido com 11 dígitos.' });
    }
    cpf = formatCPF(cpf);

    // Validação de senha
    if (!isValidPassword(password)) {
      return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres.' });
    }

    // Validação de telefone
    if (phone && !isValidPhone(phone)) {
      return res.status(400).json({ error: 'Telefone inválido. Informe DDD + número (10 ou 11 dígitos).' });
    }

    // Parse da carga horária
    const parsedWorkload = parseFloat(workloadHours) || 8;
    if (parsedWorkload < 1 || parsedWorkload > 24) {
      return res.status(400).json({ error: 'Carga horária deve ser entre 1 e 24 horas.' });
    }

    const validSchedules = ['standard', 'no_break', 'shift'];
    const schedule = validSchedules.includes(workScheduleType) ? workScheduleType : 'standard';

    const existingCpf = await prisma.employee.findUnique({ where: { cpf } });
    if (existingCpf) return res.status(400).json({ error: 'CPF já cadastrado.' });
    const existingEmail = await prisma.employee.findUnique({ where: { email } });
    if (existingEmail) return res.status(400).json({ error: 'E-mail já cadastrado.' });
    const hashedPassword = await bcrypt.hash(password, 12);
    const employee = await prisma.employee.create({
      data: {
        name, cpf, email, password: hashedPassword,
        phone: phone || null, position: position || null,
        department: department || null, workloadHours: parsedWorkload,
        workScheduleType: schedule,
        geofenceExempt: !!geofenceExempt,
        companyId: req.companyId
      }
    });
    res.status(201).json({
      message: 'Funcionário cadastrado com sucesso!',
      employee: { id: employee.id, name: employee.name, cpf: employee.cpf, email: employee.email, position: employee.position, department: employee.department }
    });

    // Atualizar métricas de uso (fire & forget)
    updateActiveEmployees(req.companyId).catch(() => {});
  } catch (error) {
    console.error('Erro ao cadastrar funcionário:', error.message);
    if (error.code === 'P2002') {
      const field = error.meta?.target?.includes('email') ? 'E-mail' : 'CPF';
      return res.status(400).json({ error: `${field} já cadastrado.` });
    }
    res.status(500).json({ error: 'Erro ao cadastrar funcionário. Tente novamente.' });
  }
}

async function listEmployees(req, res) {
  try {
    const { search, department, active } = req.query;
    const where = { companyId: req.companyId };
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { cpf: { contains: search } },
        { email: { contains: search } }
      ];
    }
    if (department) where.department = department;
    if (active !== undefined) where.active = active === 'true';
    const employees = await prisma.employee.findMany({
      where,
      select: { id: true, name: true, cpf: true, email: true, phone: true, position: true, department: true, workloadHours: true, workScheduleType: true, geofenceExempt: true, active: true, createdAt: true },
      orderBy: { name: 'asc' }
    });
    res.json({ employees, total: employees.length });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao listar funcionários.' });
  }
}

async function getEmployee(req, res) {
  try {
    const employee = await prisma.employee.findFirst({
      where: { id: req.params.id, companyId: req.companyId },
      select: { id: true, name: true, cpf: true, email: true, phone: true, position: true, department: true, workloadHours: true, workScheduleType: true, geofenceExempt: true, active: true, createdAt: true }
    });
    if (!employee) return res.status(404).json({ error: 'Funcionário não encontrado.' });
    res.json({ employee });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar funcionário.' });
  }
}

async function updateEmployee(req, res) {
  try {
    let { name, email, phone, position, department, workloadHours, active, workScheduleType, geofenceExempt } = req.body;
    const employee = await prisma.employee.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!employee) return res.status(404).json({ error: 'Funcionário não encontrado.' });

    // Sanitização
    name = sanitize(name);
    email = sanitize(email)?.toLowerCase();
    phone = sanitize(phone);
    position = sanitize(position);
    department = sanitize(department);

    // Validações opcionais
    if (email && !isValidEmail(email)) {
      return res.status(400).json({ error: 'E-mail inválido.' });
    }
    if (email && email !== employee.email) {
      const existingEmail = await prisma.employee.findUnique({ where: { email } });
      if (existingEmail) return res.status(400).json({ error: 'E-mail já cadastrado por outro funcionário.' });
    }
    if (name && name.length < 3) {
      return res.status(400).json({ error: 'Nome deve ter no mínimo 3 caracteres.' });
    }
    if (phone && !isValidPhone(phone)) {
      return res.status(400).json({ error: 'Telefone inválido.' });
    }

    const parsedWorkload = workloadHours ? parseFloat(workloadHours) : undefined;
    if (parsedWorkload !== undefined && (parsedWorkload < 1 || parsedWorkload > 24)) {
      return res.status(400).json({ error: 'Carga horária deve ser entre 1 e 24 horas.' });
    }

    const validSchedules = ['standard', 'no_break', 'shift'];

    const updated = await prisma.employee.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }), ...(email && { email }),
        ...(phone !== undefined && { phone: phone || null }),
        ...(position !== undefined && { position: position || null }),
        ...(department !== undefined && { department: department || null }),
        ...(parsedWorkload !== undefined && { workloadHours: parsedWorkload }),
        ...(active !== undefined && { active }),
        ...(workScheduleType && validSchedules.includes(workScheduleType) && { workScheduleType }),
        ...(geofenceExempt !== undefined && { geofenceExempt: !!geofenceExempt }),
      },
      select: { id: true, name: true, cpf: true, email: true, phone: true, position: true, department: true, workloadHours: true, workScheduleType: true, geofenceExempt: true, active: true }
    });
    res.json({ message: 'Funcionário atualizado!', employee: updated });
  } catch (error) {
    console.error('Erro ao atualizar funcionário:', error.message);
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'E-mail já cadastrado por outro funcionário.' });
    }
    res.status(500).json({ error: 'Erro ao atualizar funcionário. Tente novamente.' });
  }
}

async function deleteEmployee(req, res) {
  try {
    const employee = await prisma.employee.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!employee) return res.status(404).json({ error: 'Funcionário não encontrado.' });
    await prisma.employee.update({ where: { id: req.params.id }, data: { active: false } });
    res.json({ message: 'Funcionário desativado com sucesso.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao remover funcionário.' });
  }
}

module.exports = { createEmployee, listEmployees, getEmployee, updateEmployee, deleteEmployee };
