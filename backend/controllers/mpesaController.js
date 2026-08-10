const MpesaTransaction = require('../models/MpesaTransaction');
const { parseMpesaMessage } = require('../utils/mpesaParser');

// Step 1: paste a message, get back the parsed fields WITHOUT saving yet,
// so the user can review/correct before it's stored.
exports.parse = async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ message: 'message is required' });

    const parsed = parseMpesaMessage(message);

    let duplicate = null;
    if (parsed.transactionCode) {
      duplicate = await MpesaTransaction.findOne({
        owner: req.user.id,
        transactionCode: parsed.transactionCode,
      });
    }

    res.json({ parsed, duplicate: duplicate ? { id: duplicate._id, createdAt: duplicate.createdAt } : null });
  } catch (err) {
    res.status(500).json({ message: 'Failed to parse message', error: err.message });
  }
};

exports.list = async (req, res) => {
  try {
    const transactions = await MpesaTransaction.find({ owner: req.user.id }).sort({ transactionDate: -1 });
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch transactions', error: err.message });
  }
};

exports.getOne = async (req, res) => {
  try {
    const tx = await MpesaTransaction.findOne({ _id: req.params.id, owner: req.user.id });
    if (!tx) return res.status(404).json({ message: 'Not found' });
    res.json(tx);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch transaction', error: err.message });
  }
};

// Step 2: save the (possibly corrected) transaction after review
exports.create = async (req, res) => {
  try {
    if (req.body.transactionCode) {
      const existing = await MpesaTransaction.findOne({
        owner: req.user.id,
        transactionCode: req.body.transactionCode.toUpperCase(),
      });
      if (existing) {
        return res.status(409).json({ message: 'A transaction with this code already exists', existingId: existing._id });
      }
    }
    const tx = await MpesaTransaction.create({ ...req.body, owner: req.user.id });
    res.status(201).json(tx);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'Duplicate transaction code' });
    }
    res.status(400).json({ message: 'Failed to save transaction', error: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const tx = await MpesaTransaction.findOneAndUpdate(
      { _id: req.params.id, owner: req.user.id },
      req.body,
      { new: true, runValidators: true }
    );
    if (!tx) return res.status(404).json({ message: 'Not found' });
    res.json(tx);
  } catch (err) {
    res.status(400).json({ message: 'Failed to update transaction', error: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const tx = await MpesaTransaction.findOneAndDelete({ _id: req.params.id, owner: req.user.id });
    if (!tx) return res.status(404).json({ message: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete transaction', error: err.message });
  }
};
