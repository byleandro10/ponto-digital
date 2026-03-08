/**
 * Controller de Webhooks — Mercado Pago
 *
 * Recebe notificações IPN/Webhooks v2 do MP.
 * Valida assinatura HMAC, desduplicada e delega ao billingService.
 */
const crypto = require('crypto');
const billingService = require('../services/billingService');

// Set para idempotência em memória (evita reprocessamento de webhooks duplicados)
// Em produção, considere usar Redis ou tabela de idempotência no banco.
const processedWebhooks = new Set();
const MAX_PROCESSED_CACHE = 10000;

/**
 * POST /api/webhooks/mercadopago
 * Recebe notificações do Mercado Pago (IPN / Webhooks v2)
 */
async function handleMercadoPagoWebhook(req, res) {
  try {
    // Responder rapidamente ao MP para evitar retry
    res.status(200).json({ received: true });

    const { type, data, action } = req.body;

    // ── Validar assinatura HMAC ──────────────────────────────────
    const signature = req.headers['x-signature'];
    const requestId = req.headers['x-request-id'];

    if (process.env.MP_WEBHOOK_SECRET && signature && requestId) {
      const isValid = verifyWebhookSignature({
        signature,
        requestId,
        dataId: data?.id,
        secret: process.env.MP_WEBHOOK_SECRET,
      });

      if (!isValid) {
        console.warn('[Webhook] Assinatura HMAC inválida — ignorando evento');
        return;
      }
    }

    // ── Idempotência ─────────────────────────────────────────────
    const idempotencyKey = `${type || action}:${data?.id}`;
    if (processedWebhooks.has(idempotencyKey)) {
      console.log('[Webhook] Evento já processado (idempotência):', idempotencyKey);
      return;
    }

    // Limitar tamanho do cache
    if (processedWebhooks.size >= MAX_PROCESSED_CACHE) {
      const firstKey = processedWebhooks.values().next().value;
      processedWebhooks.delete(firstKey);
    }
    processedWebhooks.add(idempotencyKey);

    // ── Log de auditoria ─────────────────────────────────────────
    console.log('[Webhook] Evento recebido:', {
      type,
      action,
      dataId: data?.id,
      requestId,
      timestamp: new Date().toISOString(),
    });

    // ── Roteamento de eventos ────────────────────────────────────
    if (type === 'payment' && data?.id) {
      await billingService.handlePaymentWebhook(data.id);
    } else if (type === 'subscription_preapproval' && data?.id) {
      await billingService.handlePreapprovalWebhook(data.id);
    } else if (action && data?.id) {
      // Formato alternativo de webhook (v2)
      if (action.startsWith('payment.')) {
        await billingService.handlePaymentWebhook(data.id);
      } else if (action.startsWith('subscription_preapproval.')) {
        await billingService.handlePreapprovalWebhook(data.id);
      }
    } else {
      console.log('[Webhook] Tipo de evento não tratado:', { type, action });
    }
  } catch (error) {
    console.error('[Webhook] Erro ao processar webhook do Mercado Pago:', error);
  }
}

/**
 * Verifica assinatura HMAC do webhook do Mercado Pago.
 *
 * @param {Object} params
 * @param {string} params.signature  - Header x-signature
 * @param {string} params.requestId  - Header x-request-id
 * @param {string} params.dataId     - data.id do body
 * @param {string} params.secret     - MP_WEBHOOK_SECRET
 * @returns {boolean}
 */
function verifyWebhookSignature({ signature, requestId, dataId, secret }) {
  try {
    const parts = signature.split(',').reduce((acc, part) => {
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
    const expected = crypto
      .createHmac('sha256', secret)
      .update(manifest)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(hash, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch (err) {
    console.error('[Webhook] Erro na verificação de assinatura:', err.message);
    return false;
  }
}

module.exports = { handleMercadoPagoWebhook };
