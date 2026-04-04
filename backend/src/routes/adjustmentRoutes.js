const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth');
const { roleGuard } = require('../middlewares/roleGuard');
const { allowBodyFields, allowQueryFields, validateUuidParams } = require('../middlewares/requestGuard');
const { editTimeEntry, addTimeEntry, deleteTimeEntry, listAdjustments, getEntriesByDate } = require('../controllers/adjustmentController');

router.use(authMiddleware);

router.get('/entries', roleGuard('ADMIN', 'SUPER_ADMIN'), allowQueryFields(['employeeId', 'date']), getEntriesByDate);
router.get('/logs', roleGuard('ADMIN', 'SUPER_ADMIN'), allowQueryFields(['employeeId']), listAdjustments);
router.post('/add', roleGuard('ADMIN', 'SUPER_ADMIN'), allowBodyFields(['employeeId', 'type', 'timestamp', 'reason']), addTimeEntry);
router.put('/:entryId', roleGuard('ADMIN', 'SUPER_ADMIN'), validateUuidParams(['entryId']), allowBodyFields(['newTimestamp', 'reason']), editTimeEntry);
router.delete('/:entryId', roleGuard('ADMIN', 'SUPER_ADMIN'), validateUuidParams(['entryId']), allowBodyFields(['reason']), deleteTimeEntry);

module.exports = router;
