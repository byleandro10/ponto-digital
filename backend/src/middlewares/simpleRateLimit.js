const { logSecurityEvent } = require('../utils/securityLogger');

function getClientKey(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  const ip = typeof forwardedFor === 'string' && forwardedFor.length > 0
    ? forwardedFor.split(',')[0].trim()
    : (req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown');

  return String(ip).replace(/^::ffff:/, '');
}

function createSimpleRateLimit({
  windowMs,
  max,
  errorMessage,
  eventName,
}) {
  const store = new Map();

  return (req, res, next) => {
    const now = Date.now();
    const key = `${eventName}:${getClientKey(req)}`;
    const current = store.get(key);

    if (!current || current.resetAt <= now) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    current.count += 1;
    store.set(key, current);

    if (current.count > max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      logSecurityEvent(req, eventName, {
        retryAfterSeconds,
        attempts: current.count,
      });
      return res.status(429).json({ error: errorMessage });
    }

    return next();
  };
}

module.exports = { createSimpleRateLimit };
