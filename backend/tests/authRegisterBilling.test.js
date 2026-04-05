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

const mockGenerateToken = {
  generateToken: jest.fn().mockReturnValue('jwt-token'),
};

jest.mock('../src/config/database', () => mockPrisma);
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn(),
}));
jest.mock('../src/utils/generateToken', () => mockGenerateToken);

const { register } = require('../src/controllers/authController');

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('authController register hosted billing flow', () => {
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
    expect(res.json).toHaveBeenCalledWith({ error: 'Este CNPJ já possui uma empresa cadastrada.' });
  });

  test('creates company with incomplete hosted billing state', async () => {
    mockPrisma.company.create.mockResolvedValue({
      id: 'company-1',
      name: 'Empresa',
      cnpj: '34.192.212/0001-30',
      plan: 'professional',
      users: [{ id: 'user-1', name: 'Admin Teste', email: 'novo@empresa.com', role: 'ADMIN' }],
    });

    const req = {
      body: {
        companyName: 'Empresa',
        cnpj: '34192212000130',
        name: 'Admin Teste',
        email: 'novo@empresa.com',
        password: 'SenhaForte123',
        plan: 'professional',
      },
    };
    const res = makeRes();

    await register(req, res);

    expect(mockPrisma.company.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        subscriptionStatus: 'INCOMPLETE',
        billingStatus: 'INCOMPLETE',
        plan: 'professional',
      }),
    }));
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      subscriptionStatus: 'INCOMPLETE',
      trialEndsAt: null,
    }));
  });

  test('falls back to legacy create payload when hosted billing columns are not in the database yet', async () => {
    mockPrisma.company.create
      .mockRejectedValueOnce({
        code: 'P2022',
        message: 'The column `billingStatus` does not exist in the current database.',
      })
      .mockResolvedValueOnce({
        id: 'company-1',
        name: 'Empresa',
        cnpj: '34.192.212/0001-30',
        plan: 'professional',
        users: [{ id: 'user-1', name: 'Admin Teste', email: 'novo@empresa.com', role: 'ADMIN' }],
      });

    const req = {
      body: {
        companyName: 'Empresa',
        cnpj: '34192212000130',
        name: 'Admin Teste',
        email: 'novo@empresa.com',
        password: 'SenhaForte123',
        plan: 'professional',
      },
    };
    const res = makeRes();

    await register(req, res);

    expect(mockPrisma.company.create).toHaveBeenCalledTimes(2);
    expect(mockPrisma.company.create.mock.calls[0][0]).toEqual(expect.objectContaining({
      data: expect.objectContaining({
        billingStatus: 'INCOMPLETE',
        cancelAtPeriodEnd: false,
        subscriptions: expect.objectContaining({
          create: expect.objectContaining({
            billingStatus: 'INCOMPLETE',
            cancelAtPeriodEnd: false,
          }),
        }),
      }),
    }));
    expect(mockPrisma.company.create.mock.calls[1][0]).toEqual(expect.objectContaining({
      data: expect.not.objectContaining({
        billingStatus: expect.anything(),
        cancelAtPeriodEnd: expect.anything(),
      }),
    }));
    expect(mockPrisma.company.create.mock.calls[1][0].data.subscriptions.create).toEqual(
      expect.not.objectContaining({
        billingStatus: expect.anything(),
        cancelAtPeriodEnd: expect.anything(),
      })
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('cleans created company data if an error happens after persistence', async () => {
    mockPrisma.company.create.mockResolvedValue({
      id: 'company-1',
      name: 'Empresa',
      cnpj: '34.192.212/0001-30',
      plan: 'basic',
      users: [{ id: 'user-1', name: 'Admin Teste', email: 'novo@empresa.com', role: 'ADMIN' }],
    });
    mockGenerateToken.generateToken.mockImplementationOnce(() => {
      throw new Error('token failure');
    });

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

    expect(mockPrisma.payment.deleteMany).toHaveBeenCalledWith({ where: { companyId: 'company-1' } });
    expect(mockPrisma.subscription.deleteMany).toHaveBeenCalledWith({ where: { companyId: 'company-1' } });
    expect(mockPrisma.user.deleteMany).toHaveBeenCalledWith({ where: { companyId: 'company-1' } });
    expect(mockPrisma.company.deleteMany).toHaveBeenCalledWith({ where: { id: 'company-1' } });
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao registrar a empresa. Tente novamente.' });
  });
});
