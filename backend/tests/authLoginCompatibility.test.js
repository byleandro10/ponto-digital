const mockPrisma = {
  user: {
    findUnique: jest.fn(),
  },
  employee: {
    findUnique: jest.fn(),
  },
  company: {
    findUnique: jest.fn(),
  },
  usageLog: {
    upsert: jest.fn(),
  },
};

const mockGenerateToken = {
  generateToken: jest.fn().mockReturnValue('jwt-token'),
};

jest.mock('../src/config/database', () => mockPrisma);
jest.mock('bcryptjs', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));
jest.mock('../src/utils/generateToken', () => mockGenerateToken);

const bcrypt = require('bcryptjs');
const { loginAdmin, loginEmployee } = require('../src/controllers/authController');

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('authController login compatibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.usageLog.upsert.mockResolvedValue({});
  });

  test('loginAdmin falls back when company billing fields are missing', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      name: 'Admin Teste',
      email: 'admin@empresa.com',
      password: 'hashed-password',
      role: 'ADMIN',
      companyId: 'company-1',
    });
    bcrypt.compare.mockResolvedValue(true);
    mockPrisma.company.findUnique
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
        email: 'admin@empresa.com',
        password: 'SenhaForte123',
      },
      requestId: 'req-login-admin',
    };
    const res = makeRes();

    await loginAdmin(req, res);

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'admin@empresa.com' },
      select: {
        id: true,
        name: true,
        email: true,
        password: true,
        role: true,
        companyId: true,
      },
    });
    expect(mockPrisma.company.findUnique).toHaveBeenCalledTimes(2);
    expect(mockPrisma.company.findUnique.mock.calls[0][0]).toEqual({
      where: { id: 'company-1' },
      select: {
        id: true,
        name: true,
        cnpj: true,
        plan: true,
        subscriptionStatus: true,
        trialEndsAt: true,
      },
    });
    expect(mockPrisma.company.findUnique.mock.calls[1][0]).toEqual({
      where: { id: 'company-1' },
      select: {
        id: true,
        name: true,
        cnpj: true,
        plan: true,
      },
    });
    expect(res.json).toHaveBeenCalledWith({
      token: 'jwt-token',
      user: {
        id: 'user-1',
        name: 'Admin Teste',
        email: 'admin@empresa.com',
        role: 'ADMIN',
      },
      company: {
        id: 'company-1',
        name: 'Empresa',
        cnpj: '34192212000130',
        plan: 'basic',
      },
      subscriptionStatus: 'INCOMPLETE',
      trialEndsAt: null,
    });
  });

  test('loginEmployee falls back when company billing fields are missing', async () => {
    mockPrisma.employee.findUnique.mockResolvedValue({
      id: 'employee-1',
      name: 'Colaborador',
      cpf: '12345678901',
      password: 'hashed-password',
      position: 'Atendente',
      active: true,
      companyId: 'company-1',
    });
    bcrypt.compare.mockResolvedValue(true);
    mockPrisma.company.findUnique
      .mockRejectedValueOnce({
        code: 'P2022',
        message: 'Unknown column trialEndsAt in field list',
      })
      .mockResolvedValueOnce({
        id: 'company-1',
        name: 'Empresa',
        cnpj: '34192212000130',
        plan: 'professional',
      });

    const req = {
      body: {
        cpf: '123.456.789-01',
        password: 'SenhaForte123',
      },
      requestId: 'req-login-employee',
    };
    const res = makeRes();

    await loginEmployee(req, res);

    expect(mockPrisma.employee.findUnique).toHaveBeenCalledWith({
      where: { cpf: '12345678901' },
      select: {
        id: true,
        name: true,
        cpf: true,
        password: true,
        position: true,
        active: true,
        companyId: true,
      },
    });
    expect(mockPrisma.company.findUnique).toHaveBeenCalledTimes(2);
    expect(res.json).toHaveBeenCalledWith({
      token: 'jwt-token',
      employee: {
        id: 'employee-1',
        name: 'Colaborador',
        cpf: '123.***.***-01',
        position: 'Atendente',
      },
      company: {
        id: 'company-1',
        name: 'Empresa',
        cnpj: '34192212000130',
        plan: 'professional',
      },
      subscriptionStatus: 'INCOMPLETE',
      trialEndsAt: null,
    });
  });

  test('loginAdmin returns 409 when the linked company no longer exists', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      name: 'Admin Teste',
      email: 'admin@empresa.com',
      password: 'hashed-password',
      role: 'ADMIN',
      companyId: 'company-missing',
    });
    bcrypt.compare.mockResolvedValue(true);
    mockPrisma.company.findUnique.mockResolvedValue(null);

    const req = {
      body: {
        email: 'admin@empresa.com',
        password: 'SenhaForte123',
      },
      requestId: 'req-company-missing',
    };
    const res = makeRes();

    await loginAdmin(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Nao foi possivel carregar os dados da empresa. Entre em contato com o suporte.',
    });
  });

  test('loginAdmin returns 503 when company schema is still incompatible after fallback attempts', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      name: 'Admin Teste',
      email: 'admin@empresa.com',
      password: 'hashed-password',
      role: 'ADMIN',
      companyId: 'company-1',
    });
    bcrypt.compare.mockResolvedValue(true);
    mockPrisma.company.findUnique
      .mockRejectedValueOnce({
        code: 'P2022',
        message: 'Unknown column subscriptionStatus in field list',
      })
      .mockRejectedValueOnce({
        code: 'P2022',
        message: 'Unknown column plan in field list',
      });

    const req = {
      body: {
        email: 'admin@empresa.com',
        password: 'SenhaForte123',
      },
      requestId: 'req-drift',
    };
    const res = makeRes();

    await loginAdmin(req, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      error: 'O sistema esta concluindo uma atualizacao interna. Tente novamente em instantes.',
      requestId: 'req-drift',
    });
  });
});
