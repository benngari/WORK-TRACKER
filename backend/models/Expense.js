const mongoose = require('mongoose');

const EXPENSE_CATEGORIES = [
  'Transport',
  'Tools & Equipment',
  'Materials',
  'Airtime & Data',
  'Meals',
  'Rent & Utilities',
  'Licences & Fees',
  'Other',
];

const expenseSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: Date, required: true },
    amount: { type: Number, required: true, min: 0 },
    category: { type: String, enum: EXPENSE_CATEGORIES, default: 'Other' },
    description: { type: String, trim: true },
    job: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', default: null }, // set when the expense belongs to one job
    notes: { type: String, trim: true },
    clientRequestId: { type: String, trim: true }, // stops an offline retry creating a duplicate
  },
  { timestamps: true }
);

expenseSchema.index({ owner: 1, date: -1 });
expenseSchema.index({ job: 1 });
expenseSchema.index({ owner: 1, clientRequestId: 1 }, { sparse: true });

module.exports = mongoose.model('Expense', expenseSchema);
module.exports.EXPENSE_CATEGORIES = EXPENSE_CATEGORIES;