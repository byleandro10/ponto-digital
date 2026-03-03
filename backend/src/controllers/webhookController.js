const crypto = require('crypto');
const prisma = require('../config/database');
const { paymentApi, preApproval } = require('../config/mercadopago');

/**
 * POST /api/webhooks/mercadopago
 * Recebe notificações do Mercado Pago (IPN / Webhooks v2)
 */
async function handleMercadoPagoWebhook(req, res) {
  try {
    // Responder rapidamente ao MP para evitar retry
    res.status(200).json({ received: true });

    const { type, data, action } = req.body;

    // Validar assinatura se secret estiver configurado
    const signature = req.headers['x-signature'];
    const requestId = req.headers['x-request-id'];
    if (process.env.MP_WEBHOOK_SECRET && signature && requestId) {
      const parts = signature.split(',').reduce((acc, part) => {
        const [key, value] = part.trim().split('=');
        acc[key] = value;
        return acc;
      }, {});

      const ts = parts.ts;
      const hash = parts.v1;
      const dataId = data?.id;

      const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
      const expected = crypto
        .createHmac('sha256', process.env.MP_WEBHOOK_SECRET)
        .update(manifest)
        .digest('hex');

      if (hash !== expected) {
        console.warn('Webhook MP: assinatura inválida');
        return;
      }
    }

    if (type === 'payment' && data?.id) {
      await handlePaymentEvent(data.id);
    } else if (type === 'subscription_preapproval' && data?.id) {
      await handlePreapprovalEvent(data.id);
    } else if (action && data?.id) {
      // Formato alternativo de webhook
      if (action.startsWith('payment.')) {
        await handlePaymentEvent(data.id);
      } else if (action.startsWith('subscription_preapproval.')) {
        await handlePreapprovalEvent(data.id);
      }
    }
  } catch (error) {
    console.error('Erro no webhook do Mercado Pago:', error);
  }
}

async function handlePaymentEvent(paymentId) {
  try {
    const mpPayment = await paymentApi.get({ id: paymentId });

    if (!mpPayment) return;

    const preapprovalId = mpPayment.metadata?.preapproval_id || null;
    const externalRef = mpPayment.external_reference;

    // Buscar subscription pelo preapproval_id ou external_reference (companyId)
    let subscription = null;
    if (preapprovalId) {
      subscription = await prisma.subscription.findFirst({
        where: { mpPreapprovalId: preapprovalId },
      });
    }
    if (!subscription && externalRef) {
      subscription = await prisma.subscription.findFirst({
        where: { companyId: externalRef, status: { in: ['TRIAL', 'ACTIVE', 'PAST_DUE'] } },
      });
    }

    if (!subscription) {
      console.warn(`Webhook: subscription não encontrada para payment ${paymentId}`);
      return;
    }

    // Mapear status do MP para nosso status
    const statusMap = {
      approved: 'APPROVED',
      pending: 'PENDING',
      in_process: 'PENDING',
      rejected: 'REJECTED',
      refunded: 'REFUNDED',
      cancelled: 'REJECTED',
    };
    const paymentStatus = statusMap[mpPayment.status] || 'PENDING';

    // Upsert do Payment
    await prisma.payment.upsert({
      where: { id: `mp_${paymentId}` },
      create: {
        id: `mp_${paymentId}`,
        subscriptionId: subscription.id,
        companyId: subscription.companyId,
        mpPaymentId: paymentId.toString(),
        amount: mpPayment.transaction_amount || 0,
        status: paymentStatus,
        paidAt: paymentStatus === 'APPROVED' ? new Date(mpPayment.date_approved || Date.now()) : null,
      },
      update: {
        status: paymentStatus,
        paidAt: paymentStatus === 'APPROVED' ? new Date(mpPayment.date_approved || Date.now()) : null,
      },
    });

    // Atualizar status da assinatura baseado no pagamento
    if (paymentStatus === 'APPROVED') {
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: 'ACTIVE',
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
      });

      await prisma.company.update({
        where: { id: subscription.companyId },
        data: { subscriptionStatus: 'ACTIVE' },
      });
    } else if (paymentStatus === 'REJECTED') {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: 'PAST_DUE' },
      });

      await prisma.company.update({
        where: { id: subscription.companyId },
        data: { subscriptionStatus: 'PAST_DUE' },
      });
    }
  } catch (error) {
    console.error('Erro ao processar payment webhook:', error);
  }
}

async function handlePreapprovalEvent(preapprovalId) {
  try {
    const mpPre = await preApproval.get({ id: preapprovalId });

    if (!mpPre) return;

    const subscription = await prisma.subscription.findFirst({
      where: { mpPreapprovalId: preapprovalId.toString() },
    });

    if (!subscription) {
      console.warn(`Webhook: subscription não encontrada para preapproval ${preapprovalId}`);
      return;
    }

    // Mapear status do preapproval para nosso status
    const statusMap = {
      authorized: 'ACTIVE',
      paused: 'PAST_DUE',
      cancelled: 'CANCELLED',
      pending: 'TRIAL',
    };
    const newStatus = statusMap[mpPre.status] || subscription.status;

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: newStatus },
    });

    await prisma.company.update({
      where: { id: subscription.companyId },
      data: { subscriptionStatus: newStatus },
    });
  } catch (error) {
    console.error('Erro ao processar preapproval webhook:', error);
  }
}

module.exports = { handleMercadoPagoWebhook };
