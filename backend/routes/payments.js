const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/paymentController');
const auth = require('../middleware/auth');

router.use(auth);
router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.post('/:id/allocate', ctrl.allocate);
router.delete('/allocations/:allocationId', ctrl.removeAllocation);
router.delete('/:id', ctrl.remove);

module.exports = router;
