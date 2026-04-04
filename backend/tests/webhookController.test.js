const mockBillingService = {
  handleStripeInvoiceEvent: jest.fn(),
  handleStripeSubscriptionEvent: jest.fn(),
};

const mockStripeService = {
  constructWebhookEvent: jest.fn(),
};

jest.mock('../src/services/billingService', () => mockBillingService);
jest.mock('../src/services/stripeService', () => mockStripeService);

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
});
