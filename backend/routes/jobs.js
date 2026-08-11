const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/jobController');
const auth = require('../middleware/auth');

router.use(auth);
router.get('/', ctrl.list);
router.get('/trash', ctrl.trash);
router.get('/:id', ctrl.getOne);
router.post('/', ctrl.create);
router.post('/:id/restore', ctrl.restore);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);
router.delete('/:id/permanent', ctrl.permanentRemove);

module.exports = router;