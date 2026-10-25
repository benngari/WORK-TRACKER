const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/reportController');
const auth = require('../middleware/auth');

router.use(auth);
router.get('/ledger', ctrl.ledger);
router.get('/outstanding', ctrl.outstanding);
router.get('/overdue-summary', ctrl.overdueSummary);
router.get('/client-profit', ctrl.clientProfit);

module.exports = router;