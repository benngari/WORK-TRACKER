
const MpesaTransaction = require('../models/MpesaTransaction');
const Payment = require('../models/Payment');
const PaymentAllocation = require('../models/PaymentAllocation');
const Job = require('../models/Job');
const { computeJobFinancials } = require('./jobController');
const { parseMpesaMessage } = require('../utils/mpesaParser');

// Step 1: paste a message, get back the parsed fields WITHOUT saving yet,
// so the user can review/correct before it's stored.
exports.parse = async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ message: 'message is required' });
    }

    const parsed = parseMpesaMessage(message);

    let duplicate = null;

    if (parsed.transactionCode) {
      duplicate = await MpesaTransaction.findOne({
        owner: req.user.id,
        transactionCode: parsed.transactionCode.trim().toUpperCase(),
      });
    }

    res.json({
      parsed,
      duplicate: duplicate
        ? { id: duplicate._id, createdAt: duplicate.createdAt }
        : null,
    });
  } catch (err) {
    res.status(500).json({
      message: 'Failed to parse message',
      error: err.message,
    });
  }
};

exports.list = async (req, res) => {
  try {
    const transactions = await MpesaTransaction.find({
      owner: req.user.id,
    }).sort({ transactionDate: -1 });

    res.json(transactions);
  } catch (err) {
    res.status(500).json({
      message: 'Failed to fetch transactions',
      error: err.message,
    });
  }
};

exports.getOne = async (req, res) => {
  try {
    const tx = await MpesaTransaction.findOne({
      _id: req.params.id,
      owner: req.user.id,
    });

    if (!tx) {
      return res.status(404).json({ message: 'Not found' });
    }

    res.json(tx);
  } catch (err) {
    res.status(500).json({
      message: 'Failed to fetch transaction',
      error: err.message,
    });
  }
};

// Step 2: save the (possibly corrected) transaction after review.
// Supports safe retries when an offline transaction is synchronised.
exports.create = async (req, res) => {
  try {
    const transactionCode =
      typeof req.body.transactionCode === 'string'
        ? req.body.transactionCode.trim().toUpperCase()
        : '';

    // 1. Recognise a retry of the exact same saved transaction.
    // This must happen before checking the transaction code.
    if (req.body._id) {
      const alreadySaved = await MpesaTransaction.findOne({
        _id: req.body._id,
        owner: req.user.id,
      });

      if (alreadySaved) {
        return res.status(200).json(alreadySaved);
      }
    }

    // 2. Prevent a different transaction record from reusing
    // an existing M-PESA transaction code.
    if (transactionCode) {
      const duplicate = await MpesaTransaction.findOne({
        owner: req.user.id,
        transactionCode,
      });

      if (duplicate) {
        return res.status(409).json({
          message: 'A transaction with this code already exists',
          existingId: duplicate._id,
        });
      }
    }

    // 3. Save the transaction.
    const tx = await MpesaTransaction.create({
      ...req.body,
      transactionCode: transactionCode || undefined,
      owner: req.user.id,
    });

    return res.status(201).json(tx);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        message: 'Duplicate transaction or transaction ID',
      });
    }

    return res.status(400).json({
      message: 'Failed to save transaction',
      error: err.message,
    });
  }
};

exports.update = async (req, res) => {
  try {
    const tx = await MpesaTransaction.findOneAndUpdate(
      {
        _id: req.params.id,
        owner: req.user.id,
      },
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!tx) {
      return res.status(404).json({ message: 'Not found' });
    }

    res.json(tx);
  } catch (err) {
    res.status(400).json({
      message: 'Failed to update transaction',
      error: err.message,
    });
  }
};

exports.remove = async (req, res) => {
  try {
    const tx = await MpesaTransaction.findOne({
      _id: req.params.id,
      owner: req.user.id,
    });

    if (!tx) {
      return res.status(404).json({ message: 'Not found' });
    }

    // Remove linked payments and allocations, then refresh
    // the financial status of every affected job.
    const payments = await Payment.find({
      owner: req.user.id,
      mpesaTransaction: tx._id,
    });

    for (const payment of payments) {
      const allocations = await PaymentAllocation.find({
        owner: req.user.id,
        payment: payment._id,
      });

      for (const allocation of allocations) {
        const job = await Job.findOne({
          _id: allocation.job,
          owner: req.user.id,
        });

        await allocation.deleteOne();

        if (job) {
          const fin = await computeJobFinancials(job);
          job.paymentStatus = fin.paymentStatus;
          await job.save();
        }
      }

      await payment.deleteOne();
    }

    await tx.deleteOne();

    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({
      message: 'Failed to delete transaction',
      error: err.message,
    });
  }
};
