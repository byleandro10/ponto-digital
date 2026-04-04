const express = require('express');
const router = express.Router();
const {
  register,
  loginAdmin,
  loginEmployee,
  changePasswordAdmin,
  changePasswordEmployee,
} = require('../controllers/authController');
const { authMiddleware, employeeAuth } = require('../middlewares/auth');
const { roleGuard } = require('../middlewares/roleGuard');
const { allowBodyFields } = require('../middlewares/requestGuard');

router.post('/register', allowBodyFields(['companyName', 'cnpj', 'name', 'email', 'password', 'plan', 'paymentMethodId']), register);
router.post('/login/admin', allowBodyFields(['email', 'password']), loginAdmin);
router.post('/login/employee', allowBodyFields(['cpf', 'password']), loginEmployee);

router.put(
  '/change-password/admin',
  authMiddleware,
  roleGuard('ADMIN', 'SUPER_ADMIN', 'MANAGER'),
  allowBodyFields(['currentPassword', 'newPassword']),
  changePasswordAdmin
);

router.put(
  '/change-password/employee',
  employeeAuth,
  allowBodyFields(['currentPassword', 'newPassword']),
  changePasswordEmployee
);

module.exports = router;
