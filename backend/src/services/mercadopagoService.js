const { preApproval, paymentApi } = require('../config/mercadopago');
const { TRIAL_DAYS } = require('../config/billingConfig');

function extractMpErrorMessage(error) {
  return (
    error?.cause?.[0]?.description ||
    error?.cause?.[0]?.message ||
    error?.message ||
    'Erro desconhecido na comunicacao com o Mercado Pago.'
  );
}

async function validateCardToken({
  cardTokenId,
  paymentMethodId,
  payerEmail,
  externalRef,
  description,
}) {
  try {
    const payment = await paymentApi.create({
      body: {
        token: cardTokenId,
        payment_method_id: paymentMethodId,
        payer: { email: payerEmail },
        transaction_amount: 1,
        installments: 1,
        capture: false,
        binary_mode: true,
        description,
        external_reference: externalRef,
      },
    });

    if (!payment?.id) {
      throw new Error('Mercado Pago nao retornou um identificador de validacao para o cartao.');
    }

    if (!['approved', 'authorized'].includes(String(payment.status || '').toLowerCase())) {
      await safeCancelPayment(payment.id);
      throw new Error(payment.status_detail || payment.status || 'Cartao recusado na validacao.');
    }

    await safeCancelPayment(payment.id);

    return {
      id: payment.id?.toString(),
      status: payment.status,
      paymentMethodId: payment.payment_method_id || paymentMethodId,
      lastFourDigits: payment.card?.last_four_digits || null,
    };
  } catch (error) {
    throw new Error(extractMpErrorMessage(error));
  }
}

async function safeCancelPayment(paymentId) {
  if (!paymentId) {
    return;
  }

  try {
    await paymentApi.cancel({ id: paymentId });
  } catch (error) {
    console.warn('[MP] Falha ao cancelar pagamento de validacao:', {
      paymentId,
      message: extractMpErrorMessage(error),
    });
  }
}

async function createPreapproval({
  reason,
  externalRef,
  payerEmail,
  cardTokenId,
  amount,
  backUrl,
  startDate,
  notificationUrl,
}) {
  const autoRecurring = {
    frequency: 1,
    frequency_type: 'months',
    transaction_amount: amount,
    currency_id: 'BRL',
  };

  if (startDate) {
    autoRecurring.start_date = new Date(startDate).toISOString();
  }

  const body = {
    reason,
    external_reference: externalRef,
    payer_email: payerEmail,
    card_token_id: cardTokenId,
    auto_recurring: autoRecurring,
    back_url: backUrl,
    status: 'authorized',
  };

  if (notificationUrl) {
    body.notification_url = notificationUrl;
  }

  try {
    const result = await preApproval.create({ body });

    console.log('[MP] Preapproval criada:', {
      id: result.id,
      status: result.status,
      externalRef,
      startDate: autoRecurring.start_date || null,
      trialDays: TRIAL_DAYS,
    });

    return result;
  } catch (error) {
    throw new Error(extractMpErrorMessage(error));
  }
}

async function updatePreapproval(preapprovalId, body) {
  try {
    const result = await preApproval.update({
      id: preapprovalId,
      body,
    });

    console.log('[MP] Preapproval atualizada:', {
      id: preapprovalId,
      fields: Object.keys(body || {}),
    });

    return result;
  } catch (error) {
    throw new Error(extractMpErrorMessage(error));
  }
}

async function updatePreapprovalStatus(preapprovalId, status) {
  return updatePreapproval(preapprovalId, { status });
}

async function getPreapproval(preapprovalId) {
  try {
    return await preApproval.get({ id: preapprovalId });
  } catch (error) {
    throw new Error(extractMpErrorMessage(error));
  }
}

async function getPayment(paymentId) {
  try {
    return await paymentApi.get({ id: paymentId });
  } catch (error) {
    throw new Error(extractMpErrorMessage(error));
  }
}

module.exports = {
  createPreapproval,
  updatePreapproval,
  updatePreapprovalStatus,
  getPreapproval,
  getPayment,
  validateCardToken,
  extractMpErrorMessage,
  TRIAL_DAYS,
};
