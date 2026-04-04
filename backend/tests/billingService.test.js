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
  },
  payment: {
    upsert: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockMpService = {
  validateCardToken: jest.fn(),
  createPreapproval: jest.fn(),
  updatePreapprovalStatus: jest.fn(),
  getPayment: jest.fn(),
  getPreapproval: jest.fn(),
};

jest.mock('../src/config/database', () => mockPrisma);
jest.mock('../src/services/mercadopagoService', () => mockMpService);

const billingService = require('../src/services/billingService');

describe('billingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.FRONTEND_URL = 'https://ponto.lbrcore.com';
    process.env.APP_URL = 'https://ponto.lbrcore.com';

    mockPrisma.$transaction.mockImplementation(async (arg) => {
      if (typeof arg === 'function') {
        return arg(mockPrisma);
      }
      return arg;
    });
  });

  test('rejeita cartao invalido durante o trial', async () => {
    const now = new Date('2026-04-04T10:00:00.000Z');
    const trialEndsAt = new Date('2026-05-04T10:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now.getTime());

    mockPrisma.company.findUnique.mockResolvedValue({
      id: 'company-1',
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
    });
    mockMpService.createPreapproval.mockRejectedValue(new Error('card_declined'));

    await expect(billingService.createSubscription({
      companyId: 'company-1',
      userId: 'user-1',
      plan: 'PROFESSIONAL',
      cardTokenId: 'tok_invalid',
      paymentMethodId: 'visa',
    })).rejects.toMatchObject({
      name: 'BillingError',
      statusCode: 422,
    });

    jest.useRealTimers();
  });

  test('agenda a primeira cobranca para o fim do trial de 30 dias', async () => {
    const now = new Date('2026-04-04T10:00:00.000Z');
    const trialEndsAt = new Date('2026-05-04T10:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now.getTime());

    mockPrisma.company.findUnique.mockResolvedValue({
      id: 'company-1',
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
      currentPeriodStart: now,
      currentPeriodEnd: trialEndsAt,
    });
    mockPrisma.user.findFirst.mockResolvedValue({
      id: 'user-1',
      companyId: 'company-1',
      email: 'admin@empresa.com',
    });
    mockMpService.createPreapproval.mockResolvedValue({ id: 'pre_123', status: 'authorized', payer_id: 12345 });
    mockPrisma.subscription.update.mockImplementation(async ({ data }) => ({
      id: 'sub-1',
      companyId: 'company-1',
      createdAt: now,
      updatedAt: now,
      ...data,
    }));
    mockPrisma.company.update.mockResolvedValue({});

    const result = await billingService.createSubscription({
      companyId: 'company-1',
      userId: 'user-1',
      plan: 'PROFESSIONAL',
      cardTokenId: 'tok_valid',
      paymentMethodId: 'visa',
    });

    expect(mockMpService.createPreapproval).toHaveBeenCalledWith(expect.objectContaining({
      externalRef: 'sub-1',
      amount: 99,
      startDate: trialEndsAt,
    }));
    expect(result.status).toBe('TRIAL');
    expect(result.trialEndsAt).toEqual(trialEndsAt);
    jest.useRealTimers();
  });

  test('marca assinatura como ativa com webhook de pagamento aprovado', async () => {
    const approvedAt = '2026-05-04T10:00:00.000Z';
    mockMpService.getPayment.mockResolvedValue({
      id: 987,
      status: 'approved',
      date_approved: approvedAt,
      transaction_amount: 99,
      external_reference: 'sub-1',
      status_detail: 'accredited',
    });
    mockPrisma.subscription.findFirst.mockResolvedValue({
      id: 'sub-1',
      companyId: 'company-1',
      plan: 'PROFESSIONAL',
      status: 'TRIAL',
    });
    mockPrisma.payment.upsert.mockResolvedValue({});
    mockPrisma.subscription.update.mockResolvedValue({
      id: 'sub-1',
      companyId: 'company-1',
      plan: 'PROFESSIONAL',
      status: 'ACTIVE',
      trialEndsAt: null,
    });
    mockPrisma.company.update.mockResolvedValue({});

    await billingService.handlePaymentWebhook(987);

    expect(mockPrisma.payment.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ status: 'APPROVED' }),
      update: expect.objectContaining({ status: 'APPROVED' }),
    }));
    expect(mockPrisma.subscription.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'ACTIVE' }),
    }));
  });

  test('marca assinatura como past_due com webhook de pagamento recusado', async () => {
    mockMpService.getPayment.mockResolvedValue({
      id: 654,
      status: 'rejected',
      transaction_amount: 99,
      external_reference: 'sub-1',
      status_detail: 'cc_rejected_insufficient_amount',
    });
    mockPrisma.subscription.findFirst.mockResolvedValue({
      id: 'sub-1',
      companyId: 'company-1',
      plan: 'PROFESSIONAL',
      status: 'ACTIVE',
    });
    mockPrisma.payment.upsert.mockResolvedValue({});
    mockPrisma.payment.findFirst.mockResolvedValue({ id: 'payment-1' });
    mockPrisma.payment.update.mockResolvedValue({});
    mockPrisma.subscription.update.mockResolvedValue({
      id: 'sub-1',
      companyId: 'company-1',
      plan: 'PROFESSIONAL',
      status: 'PAST_DUE',
    });
    mockPrisma.company.update.mockResolvedValue({});

    await billingService.handlePaymentWebhook(654);

    expect(mockPrisma.subscription.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'PAST_DUE' }),
    }));
    expect(mockPrisma.payment.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ failureReason: 'cc_rejected_insufficient_amount' }),
    }));
  });
});
