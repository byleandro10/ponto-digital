const request = require('supertest');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
process.env.JWT_SECRET = 'test-secret-key-for-integration-tests';
process.env.JWT_EXPIRES_IN = '1h';

const databaseUrl = process.env.DATABASE_URL || '';
const canRunIntegrationSuite = /^mysql:\/\//.test(databaseUrl) || /^mariadb:\/\//.test(databaseUrl);

const app = canRunIntegrationSuite ? require('../src/app') : null;
const prisma = canRunIntegrationSuite ? require('../src/config/database') : null;

(canRunIntegrationSuite ? describe : describe.skip)('API integration smoke tests', () => {
  beforeAll(async () => {
    await prisma.timeEntry.deleteMany();
    await prisma.employee.deleteMany();
    await prisma.user.deleteMany();
    await prisma.subscription.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.company.deleteMany();
  });

  afterAll(async () => {
    await prisma.timeEntry.deleteMany();
    await prisma.employee.deleteMany();
    await prisma.user.deleteMany();
    await prisma.subscription.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.company.deleteMany();
    await prisma.$disconnect();
  });

  test('health check returns OK', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('OK');
  });

  test('registers an admin company without billing payload', async () => {
    const suffix = Date.now().toString(36);
    const payload = {
      companyName: `Empresa Test ${suffix}`,
      cnpj: '11222333000181',
      name: 'Admin Teste',
      email: `admin-${suffix}@teste.com`,
      password: 'SenhaForte123',
    };

    const res = await request(app).post('/api/auth/register').send(payload);

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe(payload.email);
    expect(res.body.company.name).toBe(payload.companyName);
    expect(res.body.subscriptionStatus).toBe('TRIAL');
  });
});
