const express = require('express');
const rateLimit = require('express-rate-limit');

const router = express.Router();
const { authMiddleware } = require('../middlewares/auth');
const { roleGuard } = require('../middlewares/roleGuard');
const { allowBodyFields, allowQueryFields } = require('../middlewares/requestGuard');
const { logSecurityEvent } = require('../utils/securityLogger');
const {
  createCheckoutSession,
  syncCheckoutSession,
  createPortalSession,
  getStatus,
  getPayments,
} = require('../controllers/subscriptionController');

const billingLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logSecurityEvent(req, 'billing_rate_limit_exceeded');
    res.status(429).json({ error: 'Muitas operacoes de cobranca. Tente novamente em alguns minutos.' });
  },
});

router.use(authMiddleware);
router.use(roleGuard('ADMIN', 'SUPER_ADMIN'));
router.use(billingLimiter);

router.post('/checkout-session', allowBodyFields(['plan']), createCheckoutSession);
router.post('/checkout-session/sync', allowBodyFields(['sessionId']), syncCheckoutSession);
router.post('/portal-session', allowBodyFields([]), createPortalSession);
router.get('/status', allowQueryFields([]), getStatus);
router.get('/payments', allowQueryFields([]), getPayments);

module.exports = router;
