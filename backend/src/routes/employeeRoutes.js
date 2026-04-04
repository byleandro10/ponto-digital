const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth');
const { roleGuard } = require('../middlewares/roleGuard');
const { employeeLimitGuard } = require('../middlewares/planLimitGuard');
const { allowBodyFields, allowQueryFields, validateUuidParams } = require('../middlewares/requestGuard');
const {
  createEmployee,
  listEmployees,
  getEmployee,
  updateEmployee,
  deleteEmployee,
} = require('../controllers/employeeController');

router.use(authMiddleware);

router.post(
  '/',
  roleGuard('ADMIN', 'SUPER_ADMIN'),
  employeeLimitGuard(),
  allowBodyFields(['name', 'email', 'cpf', 'password', 'phone', 'position', 'department', 'workloadHours', 'workScheduleType', 'geofenceExempt']),
  createEmployee
);

router.get('/', roleGuard('ADMIN', 'SUPER_ADMIN', 'MANAGER'), allowQueryFields(['search', 'department', 'active']), listEmployees);
router.get('/:id', roleGuard('ADMIN', 'SUPER_ADMIN', 'MANAGER'), validateUuidParams(['id']), getEmployee);

router.put(
  '/:id',
  roleGuard('ADMIN', 'SUPER_ADMIN'),
  validateUuidParams(['id']),
  allowBodyFields(['name', 'email', 'phone', 'position', 'department', 'workloadHours', 'active', 'workScheduleType', 'geofenceExempt']),
  updateEmployee
);

router.delete('/:id', roleGuard('ADMIN', 'SUPER_ADMIN'), validateUuidParams(['id']), deleteEmployee);

module.exports = router;
