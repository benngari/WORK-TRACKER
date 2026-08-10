const mongoose = require('mongoose');

const jobDocumentSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // A document may belong to a job, OR be a standalone historical/statement upload (job is null)
    job: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', default: null, index: true },
    category: {
      type: String,
      enum: ['Job Card', 'Payment Statement', 'M-PESA Proof', 'Site Photo', 'Other'],
      default: 'Other',
    },
    filename: { type: String, required: true },
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    fileType: { type: String }, // pdf, jpg, png...
    notes: { type: String, trim: true },
  },
  { timestamps: true } // uploadDate = createdAt
);

module.exports = mongoose.model('JobDocument', jobDocumentSchema);
