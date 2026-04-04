const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth');
const { roleGuard } = require('../middlewares/roleGuard');
const { allowQueryFields, validateUuidParams } = require('../middlewares/requestGuard');
const { getMonthlyReport, getDashboardStats, getPunchMapData } = require('../controllers/reportController');

router.use(authMiddleware);

router.get('/dashboard', roleGuard('ADMIN', 'SUPER_ADMIN', 'MANAGER'), getDashboardStats);
router.get(
  '/monthly/:employeeId',
  roleGuard('ADMIN', 'SUPER_ADMIN', 'MANAGER'),
  validateUuidParams(['employeeId']),
  allowQueryFields(['month', 'year']),
  getMonthlyReport
);
router.get(
  '/punch-map',
  roleGuard('ADMIN', 'SUPER_ADMIN', 'MANAGER'),
  allowQueryFields(['employeeId', 'date']),
  getPunchMapData
);

module.exports = router;
