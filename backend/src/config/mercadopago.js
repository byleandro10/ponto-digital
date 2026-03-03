const { MercadoPagoConfig, PreApproval, Payment } = require('mercadopago');

const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN || '',
});

const preApproval = new PreApproval(mpClient);
const paymentApi = new Payment(mpClient);

module.exports = { mpClient, preApproval, paymentApi };
