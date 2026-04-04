const crypto = require('crypto');
const billingService = require('../services/billingService');

async function handleMercadoPagoWebhook(req, res) {
  try {
    const { type, data, action } = req.body;

    const secret = process.env.MP_WEBHOOK_SECRET;
    if (!secret) {
      console.error('[Webhook] MP_WEBHOOK_SECRET nao configurado.');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    const signature = req.headers['x-signature'];
    const requestId = req.headers['x-request-id'];

    if (!signature || !requestId || !data?.id) {
      return res.status(401).json({ error: 'Missing signature headers or payload id' });
    }

    const isValid = verifyWebhookSignature({
      signature,
      requestId,
      dataId: data.id,
      secret,
    });

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    if (isPaymentEvent(type, action)) {
      await billingService.handlePaymentWebhook(data.id);
    } else if (isPreapprovalEvent(type, action)) {
      await billingService.handlePreapprovalWebhook(data.id);
    } else {
      console.log('[Webhook] Evento Mercado Pago ignorado:', { type, action, dataId: data.id });
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('[Webhook] Erro ao processar webhook do Mercado Pago:', error);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
}

function isPaymentEvent(type, action) {
  return type === 'payment' || (typeof action === 'string' && action.startsWith('payment.'));
}

function isPreapprovalEvent(type, action) {
  return (
    type === 'subscription_preapproval' ||
    type === 'preapproval' ||
    (typeof action === 'string' && (action.startsWith('subscription_preapproval.') || action.startsWith('preapproval.')))
  );
}

function verifyWebhookSignature({ signature, requestId, dataId, secret }) {
  try {
    const parts = String(signature)
      .split(',')
      .reduce((acc, part) => {
        const [key, value] = part.trim().split('=');
        acc[key] = value;
        return acc;
      }, {});

    const ts = parts.ts;
    const hash = parts.v1;
    if (!ts || !hash) {
      return false;
    }

    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expected, 'hex'));
  } catch (error) {
    console.error('[Webhook] Erro na verificacao de assinatura:', error.message);
    return false;
  }
}

module.exports = { handleMercadoPagoWebhook, verifyWebhookSignature };
