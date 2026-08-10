const mongoose = require('mongoose');

const transportSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    attendance: { type: mongoose.Schema.Types.ObjectId, ref: 'Attendance', default: null },
    job: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', default: null },
    date: { type: Date, required: true },
    fare: { type: Number, required: true },
    method: { type: String, trim: true }, // matatu, boda, taxi, own car...
    zone: { type: String, enum: ['Nairobi', 'Outside Nairobi'], default: 'Nairobi' },
    reimbursed: { type: Boolean, default: false },
    reimbursedAmount: { type: Number, default: 0 },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Transport', transportSchema);
