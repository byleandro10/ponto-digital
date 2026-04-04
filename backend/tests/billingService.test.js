const mockPrisma = {
  company: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  user: {
    findFirst: jest.fn(),
  },
  subscription: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
  },
  payment: {
    upsert: jest.fn(),
    findMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockStripeService = {
  createCustomer: jest.fn(),
  attachPaymentMethod: jest.fn(),
  createSubscription: jest.fn(),
  cancelSubscription: jest.fn(),
};

jest.mock('../src/config/database', () => mockPrisma);
jest.mock('../src/services/stripeService', () => mockStripeService);

const billingService = require('../src/services/billingService');

describe('billingService with Stripe', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (arg) => {
      if (typeof arg === 'function') {
        return arg(mockPrisma);
      }
      return arg;
    });
  });

  test('cria assinatura trial na Stripe com payment method', async () => {
    const now = new Date('2026-04-04T10:00:00.000Z');
    const trialEndsAt = new Date('2026-05-04T10:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now.getTime());

    mockPrisma.company.findUnique.mockResolvedValue({
      id: 'company-1',
      name: 'Empresa Teste',
      plan: 'professional',
      subscriptionStatus: 'TRIAL',
      trialEndsAt,
    });
    mockPrisma.subscription.findFirst.mockResolvedValue({
      id: 'sub-1',
      companyId: 'company-1',
      plan: 'PROFESSIONAL',
      status: 'TRIAL',
      trialEndsAt,
      mpPreapprovalId: null,
      trialStart: now,
    });
    mockPrisma.user.findFirst.mockResolvedValue({
      id: 'user-1',
      companyId: 'company-1',
      email: 'admin@empresa.com',
      name: 'Admin',
    });
    mockStripeService.createCustomer.mockResolvedValue({ id: 'cus_123' });
    mockStripeService.createSubscription.mockResolvedValue({
      id: 'sub_stripe_123',
      status: 'trialing',
      current_period_start: Math.floor(now.getTime() / 1000),
      current_period_end: Math.floor(trialEndsAt.getTime() / 1000),
    });
    mockPrisma.subscription.update.mockImplementation(async ({ data }) => ({
      id: 'sub-1',
      companyId: 'company-1',
      createdAt: now,
      ...data,
    }));
    mockPrisma.company.update.mockResolvedValue({});

    const result = await billingService.createSubscription({
      companyId: 'company-1',
      userId: 'user-1',
      plan: 'PROFESSIONAL',
      paymentMethodId: 'pm_123',
    });

    expect(mockStripeService.attachPaymentMethod).toHaveBeenCalledWith({
      customerId: 'cus_123',
      paymentMethodId: 'pm_123',
    });
    expect(mockStripeService.createSubscription).toHaveBeenCalledWith(expect.objectContaining({
      customerId: 'cus_123',
      paymentMethodId: 'pm_123',
      planKey: 'PROFESSIONAL',
      trialEnd: trialEndsAt,
    }));
    expect(result.status).toBe('TRIAL');
    jest.useRealTimers();
  });

  test('marca invoice paga como ACTIVE', async () => {
    mockPrisma.subscription.findFirst.mockResolvedValue({
      id: 'sub-local',
      companyId: 'company-1',
      plan: 'PROFESSIONAL',
      status: 'TRIAL',
    });
    mockPrisma.payment.upsert.mockResolvedValue({});
    mockPrisma.subscription.update.mockResolvedValue({
      id: 'sub-local',
      companyId: 'company-1',
      status: 'ACTIVE',
      plan: 'PROFESSIONAL',
    });
    mockPrisma.company.update.mockResolvedValue({});

    await billingService.handleStripeInvoiceEvent({
      id: 'in_123',
      payment_intent: 'pi_123',
      subscription: 'sub_stripe_123',
      status: 'paid',
      paid: true,
      amount_paid: 9900,
      lines: { data: [{ period: { end: Math.floor(Date.now() / 1000) + 2592000 } }] },
    });

    expect(mockPrisma.payment.upsert).toHaveBeenCalled();
    expect(mockPrisma.subscription.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'ACTIVE' }),
    }));
  });

  test('marca assinatura como PAST_DUE em invoice falha', async () => {
    mockPrisma.subscription.findFirst.mockResolvedValue({
      id: 'sub-local',
      companyId: 'company-1',
      plan: 'PROFESSIONAL',
      status: 'ACTIVE',
    });
    mockPrisma.payment.upsert.mockResolvedValue({});
    mockPrisma.subscription.update.mockResolvedValue({
      id: 'sub-local',
      companyId: 'company-1',
      status: 'PAST_DUE',
      plan: 'PROFESSIONAL',
    });
    mockPrisma.company.update.mockResolvedValue({});

    await billingService.handleStripeInvoiceEvent({
      id: 'in_123',
      payment_intent: 'pi_123',
      subscription: 'sub_stripe_123',
      status: 'open',
      paid: false,
      amount_due: 9900,
    });

    expect(mockPrisma.subscription.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'PAST_DUE' }),
    }));
  });
});
