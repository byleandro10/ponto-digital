const { logSecurityEvent } = require('../utils/securityLogger');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function allowBodyFields(allowedFields = []) {
  const allowed = new Set(allowedFields);

  return (req, res, next) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return next();
    }

    const unexpected = Object.keys(req.body).filter((field) => !allowed.has(field));
    if (unexpected.length > 0) {
      logSecurityEvent(req, 'unexpected_body_fields', { unexpected });
      return res.status(400).json({ error: 'Payload contem campos nao permitidos.' });
    }

    next();
  };
}

function allowQueryFields(allowedFields = []) {
  const allowed = new Set(allowedFields);

  return (req, res, next) => {
    const unexpected = Object.keys(req.query || {}).filter((field) => !allowed.has(field));
    if (unexpected.length > 0) {
      logSecurityEvent(req, 'unexpected_query_fields', { unexpected });
      return res.status(400).json({ error: 'Query string contem campos nao permitidos.' });
    }

    next();
  };
}

function validateUuidParams(paramNames = []) {
  return (req, res, next) => {
    for (const paramName of paramNames) {
      const value = req.params?.[paramName];
      if (value && !UUID_RE.test(value)) {
        logSecurityEvent(req, 'invalid_uuid_param', { paramName, value });
        return res.status(400).json({ error: `Parametro ${paramName} invalido.` });
      }
    }

    next();
  };
}

module.exports = {
  allowBodyFields,
  allowQueryFields,
  validateUuidParams,
};
