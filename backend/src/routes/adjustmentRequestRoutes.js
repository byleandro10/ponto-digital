const express = require('express');
const router = express.Router();
const { authMiddleware, employeeAuth } = require('../middlewares/auth');
const { roleGuard } = require('../middlewares/roleGuard');
const {
  createRequest, myRequests,
  listPendingRequests, approveRequest, rejectRequest, countPending
} = require('../controllers/adjustmentRequestController');

// ─── Rotas do funcionário ─────────────────────────────────────────
router.post('/request', employeeAuth, createRequest);
router.get('/my-requests', employeeAuth, myRequests);

// ─── Rotas do admin ───────────────────────────────────────────────
router.get('/pending', authMiddleware, roleGuard('ADMIN', 'SUPER_ADMIN'), listPendingRequests);
router.get('/pending/count', authMiddleware, roleGuard('ADMIN', 'SUPER_ADMIN'), countPending);
router.put('/:requestId/approve', authMiddleware, roleGuard('ADMIN', 'SUPER_ADMIN'), approveRequest);
router.put('/:requestId/reject', authMiddleware, roleGuard('ADMIN', 'SUPER_ADMIN'), rejectRequest);

module.exports = router;
