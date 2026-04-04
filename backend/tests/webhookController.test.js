const mockPrisma = {
  webhookEvent: {
    create: jest.fn(),
    update: jest.fn(),
  },
};

const mockBillingService = {
  handleStripeCustomerEvent: jest.fn(),
  handleStripeInvoiceEvent: jest.fn(),
  handleStripeSubscriptionEvent: jest.fn(),
  handleStripePaymentIntentEvent: jest.fn(),
  handleStripeSetupIntentEvent: jest.fn(),
  handleStripePaymentMethodAttached: jest.fn(),
};

const mockStripeService = {
  constructWebhookEvent: jest.fn(),
};

jest.mock('../src/services/billingService', () => mockBillingService);
jest.mock('../src/services/stripeService', () => mockStripeService);
jest.mock('../src/config/database', () => mockPrisma);

const { handleStripeWebhook } = require('../src/controllers/webhookController');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('webhookController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    mockPrisma.webhookEvent.create.mockResolvedValue({});
    mockPrisma.webhookEvent.update.mockResolvedValue({});
  });

  test('processa invoice.payment_succeeded', async () => {
    mockStripeService.constructWebhookEvent.mockReturnValue({
      type: 'invoice.payment_succeeded',
      data: { object: { id: 'in_123' } },
    });

    const req = { body: Buffer.from('{}'), headers: { 'stripe-signature': 'sig' } };
    const res = mockRes();

    await handleStripeWebhook(req, res);

    expect(mockBillingService.handleStripeInvoiceEvent).toHaveBeenCalledWith({ id: 'in_123' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('processa customer.subscription.updated', async () => {
    mockStripeService.constructWebhookEvent.mockReturnValue({
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_123' } },
    });

    const req = { body: Buffer.from('{}'), headers: { 'stripe-signature': 'sig' } };
    const res = mockRes();

    await handleStripeWebhook(req, res);

    expect(mockBillingService.handleStripeSubscriptionEvent).toHaveBeenCalledWith({ id: 'sub_123' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('rejeita webhook sem assinatura', async () => {
    const req = { body: Buffer.from('{}'), headers: {} };
    const res = mockRes();

    await handleStripeWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('retorna 200 para evento duplicado', async () => {
    mockStripeService.constructWebhookEvent.mockReturnValue({
      id: 'evt_duplicate',
      type: 'invoice.paid',
      data: { object: { id: 'in_123' } },
    });
    mockPrisma.webhookEvent.create.mockRejectedValue({ code: 'P2002' });

    const req = { body: Buffer.from('{}'), headers: { 'stripe-signature': 'sig' }, requestId: 'req-1' };
    const res = mockRes();

    await handleStripeWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockBillingService.handleStripeInvoiceEvent).not.toHaveBeenCalled();
  });
});
