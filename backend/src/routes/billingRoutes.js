/**
 * Rotas de Billing — endpoints conforme especificação
 *
 * POST /api/billing/create-subscription
 * POST /api/billing/cancel-subscription
 * GET  /api/billing/subscription-status
 *
 * Esses endpoints são aliases para os existentes em /api/subscriptions,
 * usando os mesmos controllers e lógica.
 */
const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth');
const {
  createPreapproval,
  getStatus,
  cancelSubscription,
} = require('../controllers/subscriptionController');

// Todas as rotas requerem autenticação
router.use(authMiddleware);

// POST /api/billing/create-subscription
router.post('/create-subscription', createPreapproval);

// POST /api/billing/cancel-subscription
router.post('/cancel-subscription', cancelSubscription);

// GET /api/billing/subscription-status
router.get('/subscription-status', getStatus);

module.exports = router;
