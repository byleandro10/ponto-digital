const { logSecurityEvent } = require('../utils/securityLogger');

function roleGuard(...allowedRoles) {
  return (req, res, next) => {
    if (!req.userRole || !allowedRoles.includes(req.userRole)) {
      logSecurityEvent(req, 'role_guard_denied', { allowedRoles });
      return res.status(403).json({ error: 'Sem permissao para acessar este recurso.' });
    }
    next();
  };
}

module.exports = { roleGuard };
