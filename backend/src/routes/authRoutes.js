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
const { createSimpleRateLimit } = require('../middlewares/simpleRateLimit');

const loginAttemptLimiter = createSimpleRateLimit({
  windowMs: 60 * 1000,
  max: 5,
  errorMessage: 'Muitas tentativas de login. Aguarde 1 minuto.',
  eventName: 'auth_rate_limit_exceeded',
});

router.post('/register', allowBodyFields(['companyName', 'cnpj', 'name', 'email', 'password', 'plan']), register);
router.post('/login/admin', loginAttemptLimiter, allowBodyFields(['email', 'password']), loginAdmin);
router.post('/login/employee', loginAttemptLimiter, allowBodyFields(['cpf', 'password']), loginEmployee);

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
