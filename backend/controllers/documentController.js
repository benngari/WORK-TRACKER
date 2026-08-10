const JobDocument = require('../models/JobDocument');
const { cloudinary } = require('../config/cloudinary');

exports.list = async (req, res) => {
  try {
    const filter = { owner: req.user.id };
    if (req.query.job) filter.job = req.query.job;
    if (req.query.category) filter.category = req.query.category;
    if (req.query.standalone === 'true') filter.job = null;

    const docs = await JobDocument.find(filter).populate('job').sort({ createdAt: -1 });
    res.json(docs);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch documents', error: err.message });
  }
};

// multer-storage-cloudinary has already uploaded the file by the time this runs;
// req.file contains the Cloudinary result.
exports.upload = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const doc = await JobDocument.create({
      owner: req.user.id,
      job: req.body.job || null,
      category: req.body.category || 'Other',
      filename: req.file.originalname,
      url: req.file.path, // secure_url from Cloudinary
      publicId: req.file.filename, // public_id from Cloudinary
      fileType: req.file.mimetype,
      notes: req.body.notes || '',
    });
    res.status(201).json(doc);
  } catch (err) {
    res.status(500).json({ message: 'Failed to upload document', error: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const doc = await JobDocument.findOne({ _id: req.params.id, owner: req.user.id });
    if (!doc) return res.status(404).json({ message: 'Not found' });

    try {
      await cloudinary.uploader.destroy(doc.publicId, { resource_type: 'auto' });
    } catch (cloudErr) {
      console.warn('Cloudinary delete warning:', cloudErr.message);
    }

    await doc.deleteOne();
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete document', error: err.message });
  }
};
