const mockBillingService = {
  handlePaymentWebhook: jest.fn(),
  handlePreapprovalWebhook: jest.fn(),
};

jest.mock('../src/services/billingService', () => mockBillingService);

const { handleMercadoPagoWebhook, verifyWebhookSignature } = require('../src/controllers/webhookController');
const crypto = require('crypto');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function sign(dataId, requestId, secret, ts = '1712250000') {
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const hash = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  return `ts=${ts},v1=${hash}`;
}

describe('webhookController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.MP_WEBHOOK_SECRET = 'super-secret';
  });

  test('valida assinatura HMAC corretamente', () => {
    const signature = sign('123', 'req-1', process.env.MP_WEBHOOK_SECRET);
    expect(verifyWebhookSignature({
      signature,
      requestId: 'req-1',
      dataId: '123',
      secret: process.env.MP_WEBHOOK_SECRET,
    })).toBe(true);
  });

  test('processa webhook de pagamento aprovado', async () => {
    const req = {
      body: { type: 'payment', data: { id: '123' } },
      headers: {
        'x-request-id': 'req-1',
        'x-signature': sign('123', 'req-1', process.env.MP_WEBHOOK_SECRET),
      },
    };
    const res = mockRes();

    await handleMercadoPagoWebhook(req, res);

    expect(mockBillingService.handlePaymentWebhook).toHaveBeenCalledWith('123');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('processa webhook de preapproval recusando assinatura invalida', async () => {
    const req = {
      body: { type: 'subscription_preapproval', data: { id: 'pre_123' } },
      headers: {
        'x-request-id': 'req-2',
        'x-signature': 'ts=1712250000,v1=invalid',
      },
    };
    const res = mockRes();

    await handleMercadoPagoWebhook(req, res);

    expect(mockBillingService.handlePreapprovalWebhook).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
