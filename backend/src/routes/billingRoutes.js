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
  cancelSubscription,
} = require('../controllers/subscriptionController');

const billingLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logSecurityEvent(req, 'billing_rate_limit_exceeded');
    res.status(429).json({ error: 'Muitas operacoes de cobranca. Tente novamente em alguns minutos.' });
  },
});

router.get('/public-config', billingLimiter, allowQueryFields([]), getPublicBillingConfig);
router.post('/setup-intent', billingLimiter, allowBodyFields(['email']), createSetupIntent);

router.use(authMiddleware);
router.use(roleGuard('ADMIN', 'SUPER_ADMIN'));
router.use(billingLimiter);

router.post('/create-subscription', allowBodyFields(['plan', 'paymentMethodId']), createPreapproval);
router.post('/cancel-subscription', allowBodyFields([]), cancelSubscription);
router.get('/subscription-status', allowQueryFields([]), getStatus);

module.exports = router;
