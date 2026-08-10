const mongoose = require('mongoose');

const mpesaSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    transactionCode: { type: String, trim: true, uppercase: true, index: true }, // e.g. QAB1XYZ23
    amount: { type: Number, required: true },
    sender: { type: String, trim: true },
    transactionDate: { type: Date }, // date+time parsed from the message
    mpesaBalance: { type: Number, default: null },
    originalMessage: { type: String, required: true },
    parsedSuccessfully: { type: Boolean, default: false },
    proofDocument: {
      url: { type: String },
      publicId: { type: String },
    },
    // How much of this transaction's amount has been allocated to jobs so far
    allocatedAmount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

mpesaSchema.virtual('unallocatedAmount').get(function () {
  return Math.max(0, (this.amount || 0) - (this.allocatedAmount || 0));
});
mpesaSchema.set('toJSON', { virtuals: true });
mpesaSchema.set('toObject', { virtuals: true });

// Prevent duplicate transaction codes per user (when a code was actually parsed)
mpesaSchema.index(
  { owner: 1, transactionCode: 1 },
  { unique: true, partialFilterExpression: { transactionCode: { $type: 'string', $ne: '' } } }
);

module.exports = mongoose.model('MpesaTransaction', mpesaSchema);
