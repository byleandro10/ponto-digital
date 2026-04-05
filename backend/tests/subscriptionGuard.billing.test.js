const mockPrisma = {
  company: {
    findUnique: jest.fn(),
  },
};

const mockBillingService = {
  reconcileCompanyBillingState: jest.fn(),
};

jest.mock('../src/config/database', () => mockPrisma);
jest.mock('../src/services/billingService', () => mockBillingService);

process.env.JWT_SECRET = 'subscription-guard-test-secret-1234567890';

const jwt = require('jsonwebtoken');
const { subscriptionGuard } = require('../src/middlewares/subscriptionGuard');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('subscriptionGuard billing access', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('blocks access when subscription is incomplete', async () => {
    const token = jwt.sign(
      { id: 'user-1', role: 'ADMIN', companyId: 'company-1', type: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const req = {
      headers: { authorization: `Bearer ${token}` },
      method: 'GET',
      originalUrl: '/api/reports/dashboard',
      ip: '127.0.0.1',
    };
    const res = mockRes();
    const next = jest.fn();

    mockBillingService.reconcileCompanyBillingState.mockResolvedValue();
    mockPrisma.company.findUnique.mockResolvedValue({
      subscriptionStatus: 'INCOMPLETE',
      trialEndsAt: null,
    });

    await subscriptionGuard(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'SUBSCRIPTION_INCOMPLETE',
    }));
  });
});
