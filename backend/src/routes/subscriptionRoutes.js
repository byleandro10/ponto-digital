const express = require('express');
const rateLimit = require('express-rate-limit');

const router = express.Router();
const { authMiddleware } = require('../middlewares/auth');
const { roleGuard } = require('../middlewares/roleGuard');
const { allowBodyFields, allowQueryFields } = require('../middlewares/requestGuard');
const { logSecurityEvent } = require('../utils/securityLogger');
const {
  createPreapproval,
  getStatus,
  changePlan,
  cancelSubscription,
  getPayments,
  reactivateSubscription,
} = require('../controllers/subscriptionController');

const subscriptionLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logSecurityEvent(req, 'subscription_rate_limit_exceeded');
    res.status(429).json({ error: 'Muitas operacoes de assinatura. Tente novamente em alguns minutos.' });
  },
});

router.use(authMiddleware);
router.use(roleGuard('ADMIN', 'SUPER_ADMIN'));
router.use(subscriptionLimiter);

router.post('/create-preapproval', allowBodyFields(['plan', 'cardTokenId', 'email']), createPreapproval);
router.get('/status', allowQueryFields([]), getStatus);
router.put('/change-plan', allowBodyFields(['plan']), changePlan);
router.post('/cancel', allowBodyFields([]), cancelSubscription);
router.get('/payments', allowQueryFields([]), getPayments);
router.post('/reactivate', allowBodyFields(['plan']), reactivateSubscription);

module.exports = router;
