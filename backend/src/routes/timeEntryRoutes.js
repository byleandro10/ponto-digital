const express = require('express');
const router = express.Router();
const { authMiddleware, employeeAuth } = require('../middlewares/auth');
const { roleGuard } = require('../middlewares/roleGuard');
const { allowBodyFields, allowQueryFields, validateUuidParams } = require('../middlewares/requestGuard');
const { clockPunch, getTodayEntries, getHistory, getAllTodayEntries } = require('../controllers/timeEntryController');

router.post('/punch', employeeAuth, allowBodyFields(['lat', 'lng', 'address', 'type', 'deviceInfo', 'selfieUrl']), clockPunch);
router.get('/today', employeeAuth, getTodayEntries);
router.get('/history', employeeAuth, allowQueryFields(['month', 'year']), getHistory);
router.get('/my-history', employeeAuth, allowQueryFields(['month', 'year']), getHistory);
router.get('/all-today', authMiddleware, roleGuard('ADMIN', 'SUPER_ADMIN', 'MANAGER'), getAllTodayEntries);
router.get(
  '/employee/:employeeId/history',
  authMiddleware,
  roleGuard('ADMIN', 'SUPER_ADMIN', 'MANAGER'),
  validateUuidParams(['employeeId']),
  allowQueryFields(['month', 'year']),
  getHistory
);

module.exports = router;
