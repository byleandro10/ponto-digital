const request = require('supertest');
const path = require('path');

// Carregar .env do diretório backend ANTES de tudo
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
process.env.JWT_SECRET = 'test-secret-key-for-integration-tests';
process.env.JWT_EXPIRES_IN = '1h';

const app = require('../src/app');
const prisma = require('../src/config/database');

// Gerar sufixo único por execução para evitar conflitos de dados
const UID = Date.now().toString(36);

// Dados de teste
const COMPANY_DATA = {
  companyName: `Empresa Test ${UID}`,
  cnpj: '11222333000181',
  name: 'Admin Teste',
  email: `admin-${UID}@teste.com`,
  password: '123456'
};

const EMPLOYEE_DATA = {
  name: 'João Silva Teste',
  cpf: '52998224725',
  email: `joao-${UID}@teste.com`,
  password: '123456',
  phone: '11999887766',
  position: 'Desenvolvedor',
  department: 'TI',
  workloadHours: 8
};

// ─── LIMPEZA ──────────────────────────────────────────────
beforeAll(async () => {
  // Limpar dados antigos de testes anteriores
  await prisma.timeEntry.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.user.deleteMany();
  await prisma.company.deleteMany();
});

afterAll(async () => {
  // Limpar tudo e fechar conexão
  await prisma.timeEntry.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.user.deleteMany();
  await prisma.company.deleteMany();
  await prisma.$disconnect();
});

// ─── VARIÁVEIS COMPARTILHADAS ENTRE TESTES ────────────────
let adminToken;
let companyId;
let employeeId;
let employeeToken;

// ═══════════════════════════════════════════════════════════
// FLUXO COMPLETO: Empresa → Login → Funcionário → Ponto
// ═══════════════════════════════════════════════════════════

describe('Fluxo Completo: Empresa + Funcionário', () => {

  // ─── 1. HEALTH CHECK ──────────────────────────────────
  test('1. Health check retorna OK', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('OK');
  });

  // ─── 2. REGISTRO DE EMPRESA ───────────────────────────
  describe('2. Cadastro de Empresa', () => {
    test('rejeita campos obrigatórios vazios', async () => {
      const res = await request(app).post('/api/auth/register').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/obrigatórios/);
    });

    test('rejeita e-mail inválido', async () => {
      const res = await request(app).post('/api/auth/register').send({
        ...COMPANY_DATA, email: 'email_invalido'
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/e-mail/i);
    });

    test('rejeita CNPJ inválido', async () => {
      const res = await request(app).post('/api/auth/register').send({
        ...COMPANY_DATA, cnpj: '12345678901234'
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/cnpj/i);
    });

    test('rejeita senha curta (< 6 caracteres)', async () => {
      const res = await request(app).post('/api/auth/register').send({
        ...COMPANY_DATA, password: '123'
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/senha/i);
    });

    test('rejeita nome curto (< 3 caracteres)', async () => {
      const res = await request(app).post('/api/auth/register').send({
        ...COMPANY_DATA, name: 'AB'
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/nome/i);
    });

    test('cadastra empresa com sucesso (status 201)', async () => {
      const res = await request(app).post('/api/auth/register').send(COMPANY_DATA);
      expect(res.status).toBe(201);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.email).toBe(COMPANY_DATA.email);
      expect(res.body.company.name).toBe(COMPANY_DATA.companyName);
      adminToken = res.body.token;
      companyId = res.body.company.id;
    });

    test('rejeita CNPJ duplicado', async () => {
      const res = await request(app).post('/api/auth/register').send({
        ...COMPANY_DATA, email: `outro-${UID}@teste.com`
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/cnpj/i);
    });
  });

  // ─── 3. LOGIN ADMIN ───────────────────────────────────
  describe('3. Login Admin', () => {
    test('faz login com credenciais válidas', async () => {
      const res = await request(app).post('/api/auth/login/admin').send({
        email: COMPANY_DATA.email,
        password: COMPANY_DATA.password
      });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.email).toBe(COMPANY_DATA.email);
      // Atualizar token para garantir que temos um token fresco
      adminToken = res.body.token;
    });

    test('rejeita senha incorreta', async () => {
      const res = await request(app).post('/api/auth/login/admin').send({
        email: COMPANY_DATA.email,
        password: 'senhaerrada'
      });
      expect(res.status).toBe(401);
    });

    test('rejeita e-mail não cadastrado', async () => {
      const res = await request(app).post('/api/auth/login/admin').send({
        email: 'naoexiste@x.com',
        password: '123456'
      });
      expect(res.status).toBe(401);
    });

    test('rejeita e-mail inválido no login', async () => {
      const res = await request(app).post('/api/auth/login/admin').send({
        email: 'invalido',
        password: '123456'
      });
      expect(res.status).toBe(400);
    });
  });

  // ─── 4. CADASTRO DE FUNCIONÁRIO ───────────────────────
  describe('4. Cadastro de Funcionário', () => {
    test('rejeita acesso sem token', async () => {
      const res = await request(app).get('/api/employees');
      expect(res.status).toBe(401);
    });

    test('rejeita CPF inválido', async () => {
      const res = await request(app)
        .post('/api/employees')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...EMPLOYEE_DATA, cpf: '12345678900' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/cpf/i);
    });

    test('rejeita e-mail inválido no funcionário', async () => {
      const res = await request(app)
        .post('/api/employees')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...EMPLOYEE_DATA, email: 'nao_eh_email' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/e-mail/i);
    });

    test('rejeita senha curta no funcionário', async () => {
      const res = await request(app)
        .post('/api/employees')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...EMPLOYEE_DATA, password: '123' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/senha/i);
    });

    test('cria funcionário com sucesso (status 201)', async () => {
      const res = await request(app)
        .post('/api/employees')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(EMPLOYEE_DATA);
      expect(res.status).toBe(201);
      expect(res.body.message).toMatch(/sucesso/i);
      expect(res.body.employee).toBeDefined();
      expect(res.body.employee.name).toBe(EMPLOYEE_DATA.name);
      expect(res.body.employee.cpf).toBe(EMPLOYEE_DATA.cpf);
      expect(res.body.employee.email).toBe(EMPLOYEE_DATA.email);
      expect(res.body.employee.position).toBe(EMPLOYEE_DATA.position);
      expect(res.body.employee.department).toBe(EMPLOYEE_DATA.department);
      employeeId = res.body.employee.id;
    });

    test('rejeita CPF duplicado', async () => {
      const res = await request(app)
        .post('/api/employees')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...EMPLOYEE_DATA, email: `dup-${UID}@teste.com` });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/cpf/i);
    });

    test('lista funcionários cadastrados', async () => {
      const res = await request(app)
        .get('/api/employees')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.employees).toBeInstanceOf(Array);
      expect(res.body.total).toBeGreaterThanOrEqual(1);
      const found = res.body.employees.find(e => e.id === employeeId);
      expect(found).toBeDefined();
      expect(found.name).toBe(EMPLOYEE_DATA.name);
    });

    test('busca funcionário por ID', async () => {
      const res = await request(app)
        .get(`/api/employees/${employeeId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.employee.name).toBe(EMPLOYEE_DATA.name);
      expect(res.body.employee.workloadHours).toBe(EMPLOYEE_DATA.workloadHours);
    });

    test('atualiza cargo do funcionário', async () => {
      const res = await request(app)
        .put(`/api/employees/${employeeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ position: 'Senior Developer', department: 'Engenharia' });
      expect(res.status).toBe(200);
      expect(res.body.employee.position).toBe('Senior Developer');
      expect(res.body.employee.department).toBe('Engenharia');
    });
  });

  // ─── 5. LOGIN FUNCIONÁRIO ─────────────────────────────
  describe('5. Login do Funcionário', () => {
    test('funcionário faz login com CPF e senha', async () => {
      const res = await request(app).post('/api/auth/login/employee').send({
        cpf: EMPLOYEE_DATA.cpf,
        password: EMPLOYEE_DATA.password
      });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.employee.name).toBe(EMPLOYEE_DATA.name);
      employeeToken = res.body.token;
    });

    test('rejeita CPF errado no login', async () => {
      const res = await request(app).post('/api/auth/login/employee').send({
        cpf: '00000000000',
        password: EMPLOYEE_DATA.password
      });
      expect(res.status).toBe(401);
    });

    test('rejeita senha errada no login', async () => {
      const res = await request(app).post('/api/auth/login/employee').send({
        cpf: EMPLOYEE_DATA.cpf,
        password: 'senhaerrada'
      });
      expect(res.status).toBe(401);
    });
  });

  // ─── 6. REGISTRO DE PONTO ─────────────────────────────
  describe('6. Registro de Ponto', () => {
    test('funcionário registra ENTRADA', async () => {
      const res = await request(app)
        .post('/api/time-entries/punch')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({});
      expect(res.status).toBe(201);
      expect(res.body.entry.type).toBe('CLOCK_IN');
      expect(res.body.message).toMatch(/entrada/i);
    });

    test('funcionário registra SAÍDA ALMOÇO', async () => {
      const res = await request(app)
        .post('/api/time-entries/punch')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({});
      expect(res.status).toBe(201);
      expect(res.body.entry.type).toBe('BREAK_START');
    });

    test('funcionário registra VOLTA ALMOÇO', async () => {
      const res = await request(app)
        .post('/api/time-entries/punch')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({});
      expect(res.status).toBe(201);
      expect(res.body.entry.type).toBe('BREAK_END');
    });

    test('funcionário registra SAÍDA', async () => {
      const res = await request(app)
        .post('/api/time-entries/punch')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({});
      expect(res.status).toBe(201);
      expect(res.body.entry.type).toBe('CLOCK_OUT');
    });

    test('rejeita 5º ponto (dia completo)', async () => {
      const res = await request(app)
        .post('/api/time-entries/punch')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/já foram registrados/i);
    });

    test('consulta pontos de hoje do funcionário', async () => {
      const res = await request(app)
        .get('/api/time-entries/today')
        .set('Authorization', `Bearer ${employeeToken}`);
      expect(res.status).toBe(200);
      expect(res.body.entries).toHaveLength(4);
      expect(res.body.isComplete).toBe(true);
    });
  });

  // ─── 7. DASHBOARD E RELATÓRIOS ────────────────────────
  describe('7. Dashboard e Relatórios', () => {
    test('dashboard retorna estatísticas corretas', async () => {
      const res = await request(app)
        .get('/api/reports/dashboard')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.totalEmployees).toBeGreaterThanOrEqual(1);
      expect(res.body.presentToday).toBeGreaterThanOrEqual(1);
      expect(res.body.date).toBeDefined();
    });

    test('visão geral do ponto de hoje (admin)', async () => {
      const res = await request(app)
        .get('/api/time-entries/all-today')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.employees).toBeInstanceOf(Array);
      const emp = res.body.employees.find(e => e.id === employeeId);
      expect(emp).toBeDefined();
      expect(emp.entries).toHaveLength(4);
      expect(emp.status).toBe('Saiu');
    });

    test('relatório mensal do funcionário', async () => {
      const now = new Date();
      const res = await request(app)
        .get(`/api/reports/monthly/${employeeId}?month=${now.getMonth() + 1}&year=${now.getFullYear()}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.employee.name).toBe(EMPLOYEE_DATA.name);
      expect(res.body.days).toBeInstanceOf(Array);
      expect(res.body.days.length).toBeGreaterThanOrEqual(1);
      expect(res.body.summary.daysWorked).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── 8. DESATIVAÇÃO DO FUNCIONÁRIO ────────────────────
  describe('8. Desativação do Funcionário', () => {
    test('desativa funcionário (soft delete)', async () => {
      const res = await request(app)
        .delete(`/api/employees/${employeeId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/desativado/i);
    });

    test('funcionário desativado não consegue logar', async () => {
      const res = await request(app).post('/api/auth/login/employee').send({
        cpf: EMPLOYEE_DATA.cpf,
        password: EMPLOYEE_DATA.password
      });
      expect(res.status).toBe(401);
    });
  });
});
