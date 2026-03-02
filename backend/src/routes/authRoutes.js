const express = require('express');
const router = express.Router();
const { register, loginAdmin, loginEmployee, changePasswordAdmin, changePasswordEmployee } = require('../controllers/authController');
const { authMiddleware, employeeAuth } = require('../middlewares/auth');

router.post('/register', register);
router.post('/login/admin', loginAdmin);
router.post('/login/employee', loginEmployee);

// Alterar senha (autenticado)
router.put('/change-password/admin',    authMiddleware, changePasswordAdmin);
router.put('/change-password/employee', employeeAuth,  changePasswordEmployee);

module.exports = router;
