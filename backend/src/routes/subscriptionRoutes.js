const express = require('express');
const rateLimit = require('express-rate-limit');

const router = express.Router();
const { authMiddleware } = require('../middlewares/auth');
const { roleGuard } = require('../middlewares/roleGuard');
const { allowBodyFields, allowQueryFields } = require('../middlewares/requestGuard');
const { logSecurityEvent } = require('../utils/securityLogger');
const {
  getPublicBillingConfig,
  createSetupIntent,
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

router.get('/public-config', subscriptionLimiter, allowQueryFields([]), getPublicBillingConfig);
router.post('/setup-intent', subscriptionLimiter, allowBodyFields(['email']), createSetupIntent);

router.use(authMiddleware);
router.use(roleGuard('ADMIN', 'SUPER_ADMIN'));
router.use(subscriptionLimiter);

router.post('/create-preapproval', allowBodyFields(['plan', 'paymentMethodId']), createPreapproval);
router.get('/status', allowQueryFields([]), getStatus);
router.put('/change-plan', allowBodyFields(['plan', 'paymentMethodId']), changePlan);
router.post('/cancel', allowBodyFields([]), cancelSubscription);
router.get('/payments', allowQueryFields([]), getPayments);
router.post('/reactivate', allowBodyFields(['plan', 'paymentMethodId']), reactivateSubscription);

module.exports = router;
