const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-key-for-security-routes';

jest.mock('../src/controllers/reportController', () => ({
  getMonthlyReport: (req, res) => res.status(200).json({ ok: true }),
  getDashboardStats: (req, res) => res.status(200).json({ ok: true }),
  getPunchMapData: (req, res) => res.status(200).json({ ok: true }),
}));

jest.mock('../src/controllers/timeEntryController', () => ({
  clockPunch: (req, res) => res.status(201).json({ ok: true }),
  getTodayEntries: (req, res) => res.status(200).json({ ok: true }),
  getHistory: (req, res) => res.status(200).json({ ok: true }),
  getAllTodayEntries: (req, res) => res.status(200).json({ ok: true }),
}));

jest.mock('../src/controllers/subscriptionController', () => ({
  createSetupIntent: (req, res) => res.status(201).json({ ok: true }),
  createPreapproval: (req, res) => res.status(200).json({ ok: true }),
  getStatus: (req, res) => res.status(200).json({ ok: true }),
  changePlan: (req, res) => res.status(200).json({ ok: true }),
  cancelSubscription: (req, res) => res.status(200).json({ ok: true }),
  getPayments: (req, res) => res.status(200).json({ ok: true }),
  reactivateSubscription: (req, res) => res.status(200).json({ ok: true }),
}));

jest.mock('../src/controllers/authController', () => ({
  register: (req, res) => res.status(201).json({ ok: true }),
  loginAdmin: (req, res) => res.status(200).json({ ok: true }),
  loginEmployee: (req, res) => res.status(200).json({ ok: true }),
  changePasswordAdmin: (req, res) => res.status(200).json({ ok: true }),
  changePasswordEmployee: (req, res) => res.status(200).json({ ok: true }),
}));

const reportRoutes = require('../src/routes/reportRoutes');
const timeEntryRoutes = require('../src/routes/timeEntryRoutes');
const subscriptionRoutes = require('../src/routes/subscriptionRoutes');
const authRoutes = require('../src/routes/authRoutes');

function makeToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
}

function buildApp(mountPath, router) {
  const app = express();
  app.use(express.json());
  app.use(mountPath, router);
  return app;
}

describe('Security route protections', () => {
  const adminToken = makeToken({ id: 'admin-1', role: 'ADMIN', companyId: 'company-1', type: 'admin' });
  const employeeToken = makeToken({ id: 'employee-1', role: 'EMPLOYEE', companyId: 'company-1', type: 'employee' });

  test('blocks dashboard access for employee tokens', async () => {
    const app = buildApp('/api/reports', reportRoutes);

    const response = await request(app)
      .get('/api/reports/dashboard')
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/permissao/i);
  });

  test('allows dashboard access for admin tokens', async () => {
    const app = buildApp('/api/reports', reportRoutes);

    const response = await request(app)
      .get('/api/reports/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
  });

  test('blocks all-today endpoint for employee tokens', async () => {
    const app = buildApp('/api/time-entries', timeEntryRoutes);

    const response = await request(app)
      .get('/api/time-entries/all-today')
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/permissao/i);
  });

  test('blocks subscription management without login', async () => {
    const app = buildApp('/api/subscriptions', subscriptionRoutes);

    const response = await request(app)
      .post('/api/subscriptions/create-preapproval')
      .send({ plan: 'professional', cardTokenId: 'tok_123', email: 'admin@example.com' });

    expect(response.status).toBe(401);
    expect(response.body.error).toMatch(/token/i);
  });

  test('blocks subscription management for employee tokens', async () => {
    const app = buildApp('/api/subscriptions', subscriptionRoutes);

    const response = await request(app)
      .post('/api/subscriptions/create-preapproval')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ plan: 'professional', cardTokenId: 'tok_123', email: 'admin@example.com' });

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/permissao/i);
  });

  test('rejects unexpected login fields to reduce mass assignment risk', async () => {
    const app = buildApp('/api/auth', authRoutes);

    const response = await request(app)
      .post('/api/auth/login/admin')
      .send({ email: 'admin@example.com', password: 'secret123', role: 'SUPER_ADMIN' });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/campos nao permitidos/i);
  });
});
