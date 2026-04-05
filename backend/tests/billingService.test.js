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
    findMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockStripeService = {
  createCustomer: jest.fn(),
  updateCustomer: jest.fn(),
  createCheckoutSession: jest.fn(),
  retrieveSubscription: jest.fn(),
};

jest.mock('../src/config/database', () => mockPrisma);
jest.mock('../src/services/stripeService', () => mockStripeService);

const billingService = require('../src/services/billingService');

describe('billingService hosted Stripe flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_PRICE_BASIC = 'price_basic_xxx';
    process.env.STRIPE_PRICE_PROFESSIONAL = 'price_professional_xxx';
    process.env.STRIPE_PRICE_ENTERPRISE = 'price_enterprise_xxx';
    mockPrisma.$transaction.mockImplementation(async (arg) => {
      if (typeof arg === 'function') {
        return arg(mockPrisma);
      }
      return arg;
    });
  });

  test('creates checkout session for an incomplete local subscription', async () => {
    mockPrisma.company.findUnique.mockResolvedValue({
      id: 'company-1',
      name: 'Empresa Teste',
      plan: 'professional',
      stripeCustomerId: null,
    });
    mockPrisma.user.findFirst.mockResolvedValue({
      id: 'user-1',
      companyId: 'company-1',
      email: 'admin@empresa.com',
      name: 'Admin',
    });
    mockPrisma.subscription.findFirst.mockResolvedValue(null);
    mockPrisma.subscription.create.mockResolvedValue({
      id: 'sub-local-1',
      companyId: 'company-1',
      plan: 'PROFESSIONAL',
      status: 'INCOMPLETE',
    });
    mockStripeService.createCustomer.mockResolvedValue({ id: 'cus_123' });
    mockStripeService.createCheckoutSession.mockResolvedValue({
      id: 'cs_test_123',
      url: 'https://checkout.stripe.com/test/cs_test_123',
    });
    mockPrisma.company.update.mockResolvedValue({});
    mockPrisma.subscription.update.mockResolvedValue({});

    const result = await billingService.createCheckoutSession({
      companyId: 'company-1',
      userId: 'user-1',
      plan: 'PROFESSIONAL',
    });

    expect(mockStripeService.createCustomer).toHaveBeenCalledWith(expect.objectContaining({
      companyId: 'company-1',
      userId: 'user-1',
    }));
    expect(mockStripeService.createCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({
      companyId: 'company-1',
      userId: 'user-1',
      localSubscriptionId: 'sub-local-1',
      planKey: 'PROFESSIONAL',
    }));
    expect(result).toEqual({
      checkoutSessionId: 'cs_test_123',
      checkoutUrl: 'https://checkout.stripe.com/test/cs_test_123',
    });
  });

  test('blocks duplicate checkout when company already has Stripe-managed subscription', async () => {
    mockPrisma.company.findUnique.mockResolvedValue({
      id: 'company-1',
      name: 'Empresa Teste',
      plan: 'professional',
      stripeCustomerId: 'cus_123',
    });
    mockPrisma.user.findFirst.mockResolvedValue({
      id: 'user-1',
      companyId: 'company-1',
      email: 'admin@empresa.com',
      name: 'Admin',
    });
    mockPrisma.subscription.findFirst.mockResolvedValue({
      id: 'sub-local-1',
      companyId: 'company-1',
      plan: 'PROFESSIONAL',
      status: 'ACTIVE',
      stripeSubscriptionId: 'sub_stripe_123',
    });

    await expect(
      billingService.createCheckoutSession({
        companyId: 'company-1',
        userId: 'user-1',
        plan: 'PROFESSIONAL',
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  test('syncs invoice and subscription status from Stripe webhook', async () => {
    const localSubscription = {
      id: 'sub-local-1',
      companyId: 'company-1',
      plan: 'PROFESSIONAL',
      status: 'INCOMPLETE',
      stripeCustomerId: 'cus_123',
    };

    mockPrisma.subscription.findUnique.mockImplementation(async ({ where }) => {
      if (where?.stripeSubscriptionId === 'sub_stripe_123') return localSubscription;
      if (where?.id === 'sub-local-1') return localSubscription;
      return null;
    });
    mockPrisma.payment.upsert.mockResolvedValue({});
    mockStripeService.retrieveSubscription.mockResolvedValue({
      id: 'sub_stripe_123',
      status: 'active',
      customer: 'cus_123',
      current_period_start: 1712198400,
      current_period_end: 1714790400,
      cancel_at_period_end: false,
      items: { data: [{ price: { id: process.env.STRIPE_PRICE_PROFESSIONAL || 'price_professional_xxx' } }] },
      default_payment_method: { id: 'pm_123' },
      latest_invoice: { id: 'in_123' },
      metadata: { companyId: 'company-1', localSubscriptionId: 'sub-local-1', planKey: 'PROFESSIONAL' },
    });
    mockPrisma.subscription.update.mockResolvedValue({
      ...localSubscription,
      status: 'ACTIVE',
      billingStatus: 'PAID',
    });
    mockPrisma.company.update.mockResolvedValue({});

    await billingService.handleStripeInvoiceEvent({
      id: 'in_123',
      subscription: 'sub_stripe_123',
      customer: 'cus_123',
      status: 'paid',
      paid: true,
      amount_paid: 9900,
    }, 'invoice.paid');

    expect(mockPrisma.payment.upsert).toHaveBeenCalled();
    expect(mockPrisma.subscription.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'ACTIVE',
        billingStatus: 'PAID',
      }),
    }));
    expect(mockPrisma.company.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        subscriptionStatus: 'ACTIVE',
        billingStatus: 'PAID',
      }),
    }));
  });
});
