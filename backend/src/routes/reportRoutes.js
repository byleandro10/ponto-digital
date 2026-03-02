const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth');
const { roleGuard } = require('../middlewares/roleGuard');
const { getMonthlyReport, getDashboardStats } = require('../controllers/reportController');
router.use(authMiddleware);
router.get('/dashboard', getDashboardStats);
router.get('/monthly/:employeeId', roleGuard('ADMIN', 'SUPER_ADMIN', 'MANAGER'), getMonthlyReport);
module.exports = router;
