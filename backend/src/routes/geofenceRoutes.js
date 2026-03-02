const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth');
const { roleGuard } = require('../middlewares/roleGuard');
const { listGeofences, createGeofence, updateGeofence, deleteGeofence, updateGeofenceConfig, getCompanyConfig } = require('../controllers/geofenceController');

router.use(authMiddleware);
router.get('/config', getCompanyConfig);
router.put('/config', roleGuard('ADMIN', 'SUPER_ADMIN'), updateGeofenceConfig);
router.get('/', roleGuard('ADMIN', 'SUPER_ADMIN', 'MANAGER'), listGeofences);
router.post('/', roleGuard('ADMIN', 'SUPER_ADMIN'), createGeofence);
router.put('/:id', roleGuard('ADMIN', 'SUPER_ADMIN'), updateGeofence);
router.delete('/:id', roleGuard('ADMIN', 'SUPER_ADMIN'), deleteGeofence);

module.exports = router;
