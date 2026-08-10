const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/dashboardController');
const auth = require('../middleware/auth');

router.use(auth);
router.get('/summary', ctrl.summary);

module.exports = router;
