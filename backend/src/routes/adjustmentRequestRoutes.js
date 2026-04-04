const express = require('express');
const router = express.Router();
const { authMiddleware, employeeAuth } = require('../middlewares/auth');
const { roleGuard } = require('../middlewares/roleGuard');
const { allowBodyFields, allowQueryFields, validateUuidParams } = require('../middlewares/requestGuard');
const {
  createRequest,
  myRequests,
  listPendingRequests,
  approveRequest,
  rejectRequest,
  countPending,
} = require('../controllers/adjustmentRequestController');

router.post('/request', employeeAuth, allowBodyFields(['entryId', 'requestType', 'requestedValue', 'reason']), createRequest);
router.get('/my-requests', employeeAuth, allowQueryFields([]), myRequests);

router.get('/pending', authMiddleware, roleGuard('ADMIN', 'SUPER_ADMIN'), allowQueryFields(['status']), listPendingRequests);
router.get('/pending/count', authMiddleware, roleGuard('ADMIN', 'SUPER_ADMIN'), allowQueryFields([]), countPending);
router.put('/:requestId/approve', authMiddleware, roleGuard('ADMIN', 'SUPER_ADMIN'), validateUuidParams(['requestId']), allowBodyFields(['reviewNote']), approveRequest);
router.put('/:requestId/reject', authMiddleware, roleGuard('ADMIN', 'SUPER_ADMIN'), validateUuidParams(['requestId']), allowBodyFields(['reviewNote']), rejectRequest);

module.exports = router;
