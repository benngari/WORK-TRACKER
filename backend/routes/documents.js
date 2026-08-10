const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/documentController');
const auth = require('../middleware/auth');
const { upload } = require('../config/cloudinary');

router.use(auth);
router.get('/', ctrl.list);
router.post('/upload', upload.single('file'), ctrl.upload);
router.delete('/:id', ctrl.remove);

module.exports = router;
