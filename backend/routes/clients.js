const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/clientController');
const auth = require('../middleware/auth');

router.use(auth);
router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.get('/:id/summary', ctrl.summary);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
