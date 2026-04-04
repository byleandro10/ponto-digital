const mockPrisma = {
  company: {
    findUnique: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
    deleteMany: jest.fn(),
  },
  payment: {
    deleteMany: jest.fn(),
  },
  subscription: {
    deleteMany: jest.fn(),
  },
  usageLog: {
    deleteMany: jest.fn(),
  },
  notificationSetting: {
    deleteMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockBillingService = {
  createSubscription: jest.fn(),
  BillingError: class BillingError extends Error {
    constructor(message, statusCode = 400) {
      super(message);
      this.statusCode = statusCode;
    }
  },
};

jest.mock('../src/config/database', () => mockPrisma);
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn(),
}));
jest.mock('../src/utils/generateToken', () => ({
  generateToken: jest.fn().mockReturnValue('jwt-token'),
}));
jest.mock('../src/services/billingService', () => mockBillingService);

const { register } = require('../src/controllers/authController');

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('authController register with billing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (arg) => {
      if (typeof arg === 'function') {
        return arg(mockPrisma);
      }
      return arg;
    });
    mockPrisma.company.findUnique.mockResolvedValue(null);
    mockPrisma.user.findUnique.mockResolvedValue(null);
  });

  test('returns clear message when cnpj already exists', async () => {
    mockPrisma.company.findUnique.mockResolvedValue({ id: 'company-1' });
    const req = {
      body: {
        companyName: 'Empresa',
        cnpj: '34192212000130',
        name: 'Admin Teste',
        email: 'novo@empresa.com',
        password: 'SenhaForte123',
      },
    };
    const res = makeRes();

    await register(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Este CNPJ ja possui uma empresa cadastrada.' });
  });

  test('requires stripe payment method when signup includes a plan', async () => {
    const req = {
      body: {
        companyName: 'Empresa',
        cnpj: '34192212000130',
        name: 'Admin Teste',
        email: 'novo@empresa.com',
        password: 'SenhaForte123',
        plan: 'basic',
      },
    };
    const res = makeRes();

    await register(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Para iniciar o trial com cobranca automatica, valide o cartao pela Stripe antes de concluir o cadastro.',
    });
  });

  test('creates company and billing in a single successful signup', async () => {
    mockPrisma.company.create.mockResolvedValue({
      id: 'company-1',
      name: 'Empresa',
      cnpj: '34192212000130',
      plan: 'professional',
      users: [{ id: 'user-1', name: 'Admin Teste', email: 'novo@empresa.com', role: 'ADMIN' }],
    });
    mockBillingService.createSubscription.mockResolvedValue({
      id: 'sub-1',
      status: 'TRIAL',
      trialEndsAt: new Date('2026-05-04T00:00:00.000Z'),
    });

    const req = {
      body: {
        companyName: 'Empresa',
        cnpj: '34192212000130',
        name: 'Admin Teste',
        email: 'novo@empresa.com',
        password: 'SenhaForte123',
        plan: 'professional',
        paymentMethodId: 'pm_123',
      },
    };
    const res = makeRes();

    await register(req, res);

    expect(mockBillingService.createSubscription).toHaveBeenCalledWith({
      companyId: 'company-1',
      userId: 'user-1',
      plan: 'PROFESSIONAL',
      paymentMethodId: 'pm_123',
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json.mock.calls[0][0].message).toMatch(/assinatura iniciada/i);
  });

  test('rolls back company data when billing fails', async () => {
    mockPrisma.company.create.mockResolvedValue({
      id: 'company-1',
      name: 'Empresa',
      cnpj: '34192212000130',
      plan: 'basic',
      users: [{ id: 'user-1', name: 'Admin Teste', email: 'novo@empresa.com', role: 'ADMIN' }],
    });
    mockBillingService.createSubscription.mockRejectedValue(
      new mockBillingService.BillingError('Falha na Stripe.', 422)
    );

    const req = {
      body: {
        companyName: 'Empresa',
        cnpj: '34192212000130',
        name: 'Admin Teste',
        email: 'novo@empresa.com',
        password: 'SenhaForte123',
        plan: 'basic',
        paymentMethodId: 'pm_visa',
      },
    };
    const res = makeRes();

    await register(req, res);

    expect(mockPrisma.payment.deleteMany).toHaveBeenCalledWith({ where: { companyId: 'company-1' } });
    expect(mockPrisma.subscription.deleteMany).toHaveBeenCalledWith({ where: { companyId: 'company-1' } });
    expect(mockPrisma.user.deleteMany).toHaveBeenCalledWith({ where: { companyId: 'company-1' } });
    expect(mockPrisma.company.deleteMany).toHaveBeenCalledWith({ where: { id: 'company-1' } });
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({ error: 'Falha na Stripe.' });
  });
});
