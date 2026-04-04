const jwt = require('jsonwebtoken');
const { logSecurityEvent } = require('../utils/securityLogger');

function extractBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  return authHeader.split(' ')[1];
}

function decodeToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

function assignAuthContext(req, decoded) {
  req.userId = decoded.id;
  req.userRole = decoded.role;
  req.companyId = decoded.companyId;
  req.userType = decoded.type;
}

async function authMiddleware(req, res, next) {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      logSecurityEvent(req, 'missing_bearer_token');
      return res.status(401).json({ error: 'Token nao fornecido.' });
    }

    const decoded = decodeToken(token);
    assignAuthContext(req, decoded);
    next();
  } catch (error) {
    logSecurityEvent(req, 'invalid_token', { reason: error.message });
    return res.status(401).json({ error: 'Token invalido ou expirado.' });
  }
}

async function employeeAuth(req, res, next) {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      logSecurityEvent(req, 'missing_bearer_token');
      return res.status(401).json({ error: 'Token nao fornecido.' });
    }

    const decoded = decodeToken(token);
    if (decoded.type !== 'employee') {
      logSecurityEvent(req, 'employee_route_denied', { tokenType: decoded.type || null });
      return res.status(403).json({ error: 'Acesso restrito a funcionarios.' });
    }

    assignAuthContext(req, decoded);
    req.employeeId = decoded.id;
    next();
  } catch (error) {
    logSecurityEvent(req, 'invalid_token', { reason: error.message });
    return res.status(401).json({ error: 'Token invalido ou expirado.' });
  }
}

module.exports = { authMiddleware, employeeAuth, extractBearerToken, decodeToken, assignAuthContext };
