const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/mpesaController');
const auth = require('../middleware/auth');

router.use(auth);
router.post('/parse', ctrl.parse);
router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
