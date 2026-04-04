const express = require('express');
const router = express.Router();
const { employeeAuth } = require('../middlewares/auth');
const { allowQueryFields } = require('../middlewares/requestGuard');
const { getMyPunchMirror, getMyAuditLog } = require('../controllers/employeeSelfServiceController');

router.use(employeeAuth);

// Espelho de ponto mensal do funcionário
router.get('/punch-mirror', allowQueryFields(['month', 'year']), getMyPunchMirror);

// Log de alterações feitas nos registros do funcionário
router.get('/audit-log', allowQueryFields([]), getMyAuditLog);

module.exports = router;
