const express = require('express');
const router = express.Router();
const { authMiddleware, employeeAuth } = require('../middlewares/auth');
const { roleGuard } = require('../middlewares/roleGuard');
const { listGeofences, createGeofence, updateGeofence, deleteGeofence, updateGeofenceConfig, getCompanyConfig, uploadCompanyLogo, removeCompanyLogo } = require('../controllers/geofenceController');

// /config pode ser acessada por admin OU funcionário autenticado
function flexAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não fornecido.' });
  }
  const jwt = require('jsonwebtoken');
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
    req.userId = decoded.id;
    req.userRole = decoded.role;
    req.companyId = decoded.companyId;
    req.userType = decoded.type;
    if (decoded.type === 'employee') req.employeeId = decoded.id;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}

router.get('/config', flexAuth, getCompanyConfig);
router.put('/config', authMiddleware, roleGuard('ADMIN', 'SUPER_ADMIN'), updateGeofenceConfig);
router.put('/logo', authMiddleware, roleGuard('ADMIN', 'SUPER_ADMIN'), uploadCompanyLogo);
router.delete('/logo', authMiddleware, roleGuard('ADMIN', 'SUPER_ADMIN'), removeCompanyLogo);
router.get('/', authMiddleware, roleGuard('ADMIN', 'SUPER_ADMIN', 'MANAGER'), listGeofences);
router.post('/', authMiddleware, roleGuard('ADMIN', 'SUPER_ADMIN'), createGeofence);
router.put('/:id', authMiddleware, roleGuard('ADMIN', 'SUPER_ADMIN'), updateGeofence);
router.delete('/:id', authMiddleware, roleGuard('ADMIN', 'SUPER_ADMIN'), deleteGeofence);

module.exports = router;
