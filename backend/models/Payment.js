const mongoose = require('mongoose');

// A Payment represents money actually received (via M-PESA or another method).
// It can be split across multiple jobs using PaymentAllocation records.
const paymentSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    method: { type: String, enum: ['M-PESA', 'Bank Transfer', 'Cash', 'Other'], default: 'M-PESA' },
    mpesaTransaction: { type: mongoose.Schema.Types.ObjectId, ref: 'MpesaTransaction', default: null },
    amount: { type: Number, required: true },
    receivedDate: { type: Date, required: true }, // Payment Received Date
    reference: { type: String, trim: true },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Payment', paymentSchema);
