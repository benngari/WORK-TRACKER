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
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

expenseSchema.index({ owner: 1, date: -1 });

module.exports = mongoose.model('Expense', expenseSchema);
module.exports.EXPENSE_CATEGORIES = EXPENSE_CATEGORIES;