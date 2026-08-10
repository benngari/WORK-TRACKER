const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/historicalController');
const auth = require('../middleware/auth');

router.use(auth);
router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
