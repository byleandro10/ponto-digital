function roleGuard(...allowedRoles) {
  return (req, res, next) => {
    if (!req.userRole || !allowedRoles.includes(req.userRole)) {
      return res.status(403).json({ error: 'Sem permissão para acessar este recurso.' });
    }
    next();
  };
}

module.exports = { roleGuard };
