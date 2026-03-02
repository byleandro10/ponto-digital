const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth');
const { roleGuard } = require('../middlewares/roleGuard');
const { exportPDF, exportExcel, exportCSV, exportConsolidated } = require('../controllers/exportController');

router.use(authMiddleware);
router.get('/pdf/:employeeId', roleGuard('ADMIN', 'SUPER_ADMIN', 'MANAGER'), exportPDF);
router.get('/excel/:employeeId', roleGuard('ADMIN', 'SUPER_ADMIN', 'MANAGER'), exportExcel);
router.get('/csv/:employeeId', roleGuard('ADMIN', 'SUPER_ADMIN', 'MANAGER'), exportCSV);
router.get('/consolidated', roleGuard('ADMIN', 'SUPER_ADMIN'), exportConsolidated);

module.exports = router;
