const express = require('express');
const router = express.Router();
const { handleMercadoPagoWebhook } = require('../controllers/webhookController');

// Webhook do MP — público, sem auth JWT
router.post('/mercadopago', handleMercadoPagoWebhook);

module.exports = router;
