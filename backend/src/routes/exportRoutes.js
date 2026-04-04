const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth');
const { roleGuard } = require('../middlewares/roleGuard');
const { allowQueryFields, validateUuidParams } = require('../middlewares/requestGuard');
const { exportPDF, exportExcel, exportCSV, exportConsolidated } = require('../controllers/exportController');

router.use(authMiddleware);

router.get('/pdf/:employeeId', roleGuard('ADMIN', 'SUPER_ADMIN', 'MANAGER'), validateUuidParams(['employeeId']), allowQueryFields(['month', 'year']), exportPDF);
router.get('/excel/:employeeId', roleGuard('ADMIN', 'SUPER_ADMIN', 'MANAGER'), validateUuidParams(['employeeId']), allowQueryFields(['month', 'year']), exportExcel);
router.get('/csv/:employeeId', roleGuard('ADMIN', 'SUPER_ADMIN', 'MANAGER'), validateUuidParams(['employeeId']), allowQueryFields(['month', 'year']), exportCSV);
router.get('/consolidated', roleGuard('ADMIN', 'SUPER_ADMIN'), allowQueryFields(['month', 'year']), exportConsolidated);

module.exports = router;
