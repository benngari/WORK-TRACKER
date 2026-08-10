const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/attendanceController');
const auth = require('../middleware/auth');

router.use(auth);
router.get('/', ctrl.list);
router.get('/calendar', ctrl.calendar);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
