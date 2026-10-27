const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/auditController');
const auth = require('../middleware/auth');

router.use(auth);
// Read-only on purpose: the audit log can't be edited or deleted from the app.
router.get('/', ctrl.list);

module.exports = router;