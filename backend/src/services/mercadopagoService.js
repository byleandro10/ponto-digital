/**
 * Camada de integração com Mercado Pago — Preapproval (Assinaturas Recorrentes)
 *
 * Responsabilidade única: comunicação com a API do MP.
 * Nenhuma lógica de negócio ou persistência aqui.
 */
const { preApproval, paymentApi } = require('../config/mercadopago');

const TRIAL_DAYS = 14;

/**
 * Cria uma preapproval (assinatura recorrente) no Mercado Pago.
 *
 * @param {Object} params
 * @param {string} params.reason       - Descrição da assinatura (ex: "Ponto Digital — Plano Básico")
 * @param {string} params.externalRef  - ID externo (companyId)
 * @param {string} params.payerEmail   - E-mail do pagador
 * @param {string} params.cardTokenId  - Token do cartão gerado no front-end
 * @param {number} params.amount       - Valor mensal em BRL
 * @param {string} params.backUrl      - URL de retorno após checkout
 * @param {boolean} [params.withTrial] - Se deve aplicar trial de 14 dias
 * @returns {Promise<Object>} Resposta bruta da API do MP
 */
async function createPreapproval({
  reason,
  externalRef,
  payerEmail,
  cardTokenId,
  amount,
  backUrl,
  withTrial = true,
}) {
  const now = new Date();

  const autoRecurring = {
    frequency: 1,
    frequency_type: 'months',
    transaction_amount: amount,
    currency_id: 'BRL',
  };

  // Se trial, a primeira cobrança será após TRIAL_DAYS
  if (withTrial) {
    autoRecurring.free_trial = {
      frequency: TRIAL_DAYS,
      frequency_type: 'days',
    };
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

  const result = await preApproval.create({ body });

  console.log('[MP] Preapproval criada:', {
    id: result.id,
    status: result.status,
    externalRef,
    withTrial,
  });

  return result;
}

/**
 * Cancela (ou pausa) uma preapproval no Mercado Pago.
 *
 * @param {string} preapprovalId - ID da preapproval no MP
 * @param {'cancelled'|'paused'} status - Novo status
 * @returns {Promise<Object>}
 */
async function updatePreapprovalStatus(preapprovalId, status) {
  const result = await preApproval.update({
    id: preapprovalId,
    body: { status },
  });

  console.log('[MP] Preapproval atualizada:', {
    id: preapprovalId,
    newStatus: status,
  });

  return result;
}

/**
 * Busca detalhes de uma preapproval no Mercado Pago.
 *
 * @param {string} preapprovalId
 * @returns {Promise<Object>}
 */
async function getPreapproval(preapprovalId) {
  return preApproval.get({ id: preapprovalId });
}

/**
 * Busca detalhes de um pagamento no Mercado Pago.
 *
 * @param {string|number} paymentId
 * @returns {Promise<Object>}
 */
async function getPayment(paymentId) {
  return paymentApi.get({ id: paymentId });
}

module.exports = {
  createPreapproval,
  updatePreapprovalStatus,
  getPreapproval,
  getPayment,
  TRIAL_DAYS,
};
