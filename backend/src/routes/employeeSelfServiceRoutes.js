const express = require('express');
const router = express.Router();
const { employeeAuth } = require('../middlewares/auth');
const { getMyPunchMirror, getMyAuditLog } = require('../controllers/employeeSelfServiceController');

router.use(employeeAuth);

// Espelho de ponto mensal do funcionário
router.get('/punch-mirror', getMyPunchMirror);

// Log de alterações feitas nos registros do funcionário
router.get('/audit-log', getMyAuditLog);

module.exports = router;
