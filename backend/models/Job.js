const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
    site: { type: mongoose.Schema.Types.ObjectId, ref: 'Site', required: true, index: true },
    jobCardRef: { type: String, trim: true }, // job card / reference number
    jobType: { type: String, trim: true }, // e.g. "Repair", "Installation", "Callout"
    description: { type: String, trim: true },
    status: {
      type: String,
      enum: ['Open', 'In Progress', 'Completed', 'Cancelled'],
      default: 'Open',
    },
    rate: { type: Number, required: true, default: 1500 }, // KES per callout/day for this job
    // Expected payment can be auto-calculated from attendance count * rate,
    // but we keep it stored so it can be manually overridden.
    expectedPaymentOverride: { type: Number, default: null },
    paymentDueDate: { type: Date, default: null },
    paymentStatus: {
      type: String,
      enum: ['Pending', 'Partially Paid', 'Paid', 'Overpaid', 'Unmatched'],
      default: 'Pending',
    },
    notes: { type: String, trim: true },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

jobSchema.index({ owner: 1, client: 1, site: 1, createdAt: -1 });

module.exports = mongoose.model('Job', jobSchema);
