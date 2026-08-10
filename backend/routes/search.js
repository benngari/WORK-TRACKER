const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/searchController');
const auth = require('../middleware/auth');

router.use(auth);
router.get('/', ctrl.search);

module.exports = router;
