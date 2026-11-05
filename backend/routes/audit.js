const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/auditController');
const auth = require('../middleware/auth');

router.use(auth);
// Read-only on purpose: the audit log can't be edited or deleted from the app.
router.get('/', ctrl.list);
router.get('/job/:id', ctrl.forJob);
// bring back something that was deleted, using the copy the log kept
router.post('/:id/restore', ctrl.restore);

module.exports = router;