const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth');
const { roleGuard } = require('../middlewares/roleGuard');
const {
  getDashboard,
  getCompanies,
  getCompanyDetail,
  getRevenue,
  getChurn,
  getUsageStats,
} = require('../controllers/superAdminController');

// Todas as rotas requerem SUPER_ADMIN
router.use(authMiddleware, roleGuard('SUPER_ADMIN'));

router.get('/dashboard', getDashboard);
router.get('/companies', getCompanies);
router.get('/companies/:id', getCompanyDetail);
router.get('/revenue', getRevenue);
router.get('/churn', getChurn);
router.get('/usage-stats', getUsageStats);

module.exports = router;
