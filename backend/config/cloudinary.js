const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
  console.error('WARNING: Cloudinary environment variables are missing. Document uploads will fail.');
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'work-tracker/documents',
    resource_type: 'auto', // allows pdf, jpg, png etc.
    allowed_formats: ['jpg', 'jpeg', 'png', 'pdf', 'webp'],
  },
});

const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } });

module.exports = { cloudinary, upload };