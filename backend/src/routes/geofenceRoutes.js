const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth');
const { roleGuard } = require('../middlewares/roleGuard');
const { geofenceAccessGuard } = require('../middlewares/planLimitGuard');
const { allowBodyFields, validateUuidParams } = require('../middlewares/requestGuard');
const {
  listGeofences,
  createGeofence,
  updateGeofence,
  deleteGeofence,
  updateGeofenceConfig,
  getCompanyConfig,
  uploadCompanyLogo,
  removeCompanyLogo,
} = require('../controllers/geofenceController');

router.get('/config', authMiddleware, getCompanyConfig);
router.put(
  '/config',
  authMiddleware,
  roleGuard('ADMIN', 'SUPER_ADMIN'),
  allowBodyFields(['geofenceMode', 'requireSelfie']),
  updateGeofenceConfig
);
router.put('/logo', authMiddleware, roleGuard('ADMIN', 'SUPER_ADMIN'), allowBodyFields(['logoBase64']), uploadCompanyLogo);
router.delete('/logo', authMiddleware, roleGuard('ADMIN', 'SUPER_ADMIN'), removeCompanyLogo);
router.get('/', authMiddleware, roleGuard('ADMIN', 'SUPER_ADMIN', 'MANAGER'), geofenceAccessGuard(), listGeofences);
router.post(
  '/',
  authMiddleware,
  roleGuard('ADMIN', 'SUPER_ADMIN'),
  geofenceAccessGuard(),
  allowBodyFields(['name', 'latitude', 'longitude', 'radius', 'radiusMeters']),
  createGeofence
);
router.put(
  '/:id',
  authMiddleware,
  roleGuard('ADMIN', 'SUPER_ADMIN'),
  geofenceAccessGuard(),
  validateUuidParams(['id']),
  allowBodyFields(['name', 'latitude', 'longitude', 'radius', 'radiusMeters', 'active']),
  updateGeofence
);
router.delete('/:id', authMiddleware, roleGuard('ADMIN', 'SUPER_ADMIN'), geofenceAccessGuard(), validateUuidParams(['id']), deleteGeofence);

module.exports = router;
