const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth');
const { roleGuard } = require('../middlewares/roleGuard');
const { editTimeEntry, addTimeEntry, deleteTimeEntry, listAdjustments, getEntriesByDate } = require('../controllers/adjustmentController');

router.use(authMiddleware);
router.get('/entries', roleGuard('ADMIN', 'SUPER_ADMIN'), getEntriesByDate);
router.get('/logs', roleGuard('ADMIN', 'SUPER_ADMIN'), listAdjustments);
router.post('/add', roleGuard('ADMIN', 'SUPER_ADMIN'), addTimeEntry);
router.put('/:entryId', roleGuard('ADMIN', 'SUPER_ADMIN'), editTimeEntry);
router.delete('/:entryId', roleGuard('ADMIN', 'SUPER_ADMIN'), deleteTimeEntry);

module.exports = router;
