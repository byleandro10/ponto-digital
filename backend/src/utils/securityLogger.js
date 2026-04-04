function getClientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
    return forwardedFor.split(',')[0].trim();
  }

  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function logSecurityEvent(req, event, details = {}) {
  const payload = {
    event,
    requestId: req.requestId || null,
    method: req.method,
    path: req.originalUrl,
    ip: getClientIp(req),
    userId: req.userId || null,
    companyId: req.companyId || null,
    userRole: req.userRole || null,
    userType: req.userType || null,
    timestamp: new Date().toISOString(),
    ...details,
  };

  console.warn('[security]', JSON.stringify(payload));
}

module.exports = { logSecurityEvent };
