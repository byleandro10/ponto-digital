const mockPrisma = {
  company: {
    findUnique: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
  },
  subscription: {
    create: jest.fn(),
    deleteMany: jest.fn(),
  },
  payment: {
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

function setupTransactionMock() {
  mockPrisma.$transaction.mockImplementation(async (arg) => {
    if (typeof arg === 'function') {
      return arg(mockPrisma);
    }
    return arg;
  });
}

describe('authController register hosted billing flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupTransactionMock();
    mockPrisma.company.findUnique.mockResolvedValue(null);
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.company.create.mockResolvedValue({
      id: 'company-1',
      name: 'Empresa',
      cnpj: '34192212000130',
      plan: 'professional',
    });
    mockPrisma.user.create.mockResolvedValue({
      id: 'user-1',
      name: 'Admin Teste',
      email: 'novo@empresa.com',
      role: 'ADMIN',
    });
    mockPrisma.subscription.create.mockResolvedValue({ id: 'subscription-1' });
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

    expect(mockPrisma.company.findUnique).toHaveBeenCalledWith({
      where: { cnpj: '34192212000130' },
      select: { id: true },
    });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Este CNPJ já possui uma empresa cadastrada.' });
  });

  test('creates company, admin user and placeholder subscription in hosted billing flow', async () => {
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

    expect(mockPrisma.company.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Empresa',
        cnpj: '34192212000130',
        plan: 'professional',
        subscriptionStatus: 'INCOMPLETE',
        billingStatus: 'INCOMPLETE',
        cancelAtPeriodEnd: false,
      }),
      select: {
        id: true,
        name: true,
        cnpj: true,
        plan: true,
      },
    });
    expect(mockPrisma.user.create).toHaveBeenCalledWith({
      data: {
        companyId: 'company-1',
        name: 'Admin Teste',
        email: 'novo@empresa.com',
        password: 'hashed-password',
        role: 'ADMIN',
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });
    expect(mockPrisma.subscription.create).toHaveBeenCalledWith({
      data: {
        companyId: 'company-1',
        plan: 'PROFESSIONAL',
        status: 'INCOMPLETE',
        billingStatus: 'INCOMPLETE',
        cancelAtPeriodEnd: false,
      },
      select: { id: true },
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      subscriptionStatus: 'INCOMPLETE',
      trialEndsAt: null,
      token: 'jwt-token',
    }));
  });

  test('falls back when hosted billing columns are not in the company table yet', async () => {
    mockPrisma.company.create
      .mockRejectedValueOnce({
        code: 'P2022',
        message: 'Unknown column billingStatus in field list',
      })
      .mockResolvedValueOnce({
        id: 'company-1',
        name: 'Empresa',
        cnpj: '34192212000130',
        plan: 'professional',
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
    expect(mockPrisma.company.create.mock.calls[1][0]).toEqual({
      data: expect.objectContaining({
        name: 'Empresa',
        cnpj: '34192212000130',
        plan: 'professional',
        subscriptionStatus: 'INCOMPLETE',
      }),
      select: expect.any(Object),
    });
    expect(mockPrisma.company.create.mock.calls[1][0].data).toEqual(
      expect.not.objectContaining({
        billingStatus: expect.anything(),
        cancelAtPeriodEnd: expect.anything(),
      })
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('falls back when the company table does not have subscription fields', async () => {
    mockPrisma.company.create
      .mockRejectedValueOnce({
        code: 'P2022',
        message: 'Unknown column billingStatus in field list',
      })
      .mockRejectedValueOnce({
        code: 'P2022',
        message: 'Unknown column subscriptionStatus in field list',
      })
      .mockResolvedValueOnce({
        id: 'company-1',
        name: 'Empresa',
        cnpj: '34192212000130',
        plan: 'basic',
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

    expect(mockPrisma.company.create).toHaveBeenCalledTimes(3);
    expect(mockPrisma.company.create.mock.calls[2][0].data).toEqual({
      name: 'Empresa',
      cnpj: '34192212000130',
      plan: 'basic',
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      subscriptionStatus: 'INCOMPLETE',
    }));
  });

  test('falls back when the local subscription table is still incompatible', async () => {
    mockPrisma.subscription.create
      .mockRejectedValueOnce({
        code: 'P2022',
        message: 'Unknown column billingStatus in field list',
      })
      .mockRejectedValueOnce({
        code: 'P2022',
        message: 'Unknown column status in field list',
      })
      .mockRejectedValueOnce({
        code: 'P2021',
        message: "The table `Subscription` doesn't exist in the current database.",
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

    expect(mockPrisma.subscription.create).toHaveBeenCalledTimes(3);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('cleans created company data if an error happens after persistence', async () => {
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
