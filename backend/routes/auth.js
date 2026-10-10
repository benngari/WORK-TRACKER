const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/authController');
const auth = require('../middleware/auth');

router.post('/register', ctrl.register);
router.post('/login', ctrl.login);
router.get('/me', auth, ctrl.me);
router.post('/forgot-password', ctrl.forgotPassword);
router.post('/reset-password/:token', ctrl.resetPassword);

module.exports = router;