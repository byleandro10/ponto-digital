const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth');
const {
  createPreapproval,
  getStatus,
  changePlan,
  cancelSubscription,
  getPayments,
} = require('../controllers/subscriptionController');

// Todas as rotas requerem autenticação
router.use(authMiddleware);

router.post('/create-preapproval', createPreapproval);
router.get('/status', getStatus);
router.put('/change-plan', changePlan);
router.post('/cancel', cancelSubscription);
router.get('/payments', getPayments);

module.exports = router;
