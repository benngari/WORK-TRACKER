const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/backupController');
const auth = require('../middleware/auth');

router.use(auth);
router.get('/export', ctrl.exportAll);

module.exports = router;