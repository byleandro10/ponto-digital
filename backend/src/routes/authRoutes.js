const express = require('express');
const router = express.Router();
const { register, loginAdmin, loginEmployee } = require('../controllers/authController');
router.post('/register', register);
router.post('/login/admin', loginAdmin);
router.post('/login/employee', loginEmployee);
module.exports = router;
