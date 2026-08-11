const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/documentController');
const auth = require('../middleware/auth');
const { upload } = require('../config/cloudinary');

router.use(auth);
router.get('/', ctrl.list);

// Wrap multer/Cloudinary upload so its errors surface a real message
// instead of falling through to the generic "Server error" handler.
router.post('/upload', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      console.error('Upload error:', err);
      return res.status(400).json({ message: err.message || 'File upload failed' });
    }
    next();
  });
}, ctrl.upload);

router.delete('/:id', ctrl.remove);

module.exports = router;