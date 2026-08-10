const mongoose = require('mongoose');

// Links a Payment to a Job, with the amount of that payment allocated to that job.
// One payment can be split across multiple jobs; one job can receive multiple allocations.
const allocationSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', required: true, index: true },
    job: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
    amount: { type: Number, required: true },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

allocationSchema.index({ owner: 1, job: 1 });

module.exports = mongoose.model('PaymentAllocation', allocationSchema);
