const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/settingsController');
const auth = require('../middleware/auth');

router.use(auth);
router.get('/', ctrl.get);
router.put('/', ctrl.update);

module.exports = router;
