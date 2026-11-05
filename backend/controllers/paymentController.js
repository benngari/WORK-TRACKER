
const Payment = require('../models/Payment');
const PaymentAllocation = require('../models/PaymentAllocation');
const MpesaTransaction = require('../models/MpesaTransaction');
const Job = require('../models/Job');
const { computeJobFinancials } = require('./jobController');

// Validate money values before saving or updating records.
const isValidAmount = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0;
};

// Recalculate the M-PESA allocated amount from actual allocation records.
// This avoids incorrect totals when a transaction has multiple linked payments.
const recalculateMpesaAllocatedAmount = async (transactionId, ownerId) => {
  if (!transactionId) return;

  const payments = await Payment.find({
    owner: ownerId,
    mpesaTransaction: transactionId,
  }).select('_id');

  const paymentIds = payments.map((payment) => payment._id);

  const allocations = paymentIds.length
    ? await PaymentAllocation.find({
        owner: ownerId,
        payment: { $in: paymentIds },
      }).select('amount')
    : [];

  const total = allocations.reduce(
    (sum, allocation) => sum + Number(allocation.amount || 0),
    0
  );

  await MpesaTransaction.findOneAndUpdate(
    { _id: transactionId, owner: ownerId },
    { $set: { allocatedAmount: total } }
  );
};

// Recalculate a job's financial status after an allocation changes.
const refreshJobFinancials = async (jobId, ownerId) => {
  if (!jobId) return;

  const job = await Job.findOne({
    _id: jobId,
    owner: ownerId,
    deletedAt: null,
  });

  if (!job) return;

  const financials = await computeJobFinancials(job);
  job.paymentStatus = financials.paymentStatus;
  await job.save();

  return financials;
};

exports.list = async (req, res) => {
  try {
    const payments = await Payment.find({
      owner: req.user.id,
    })
      .populate({
        path: 'mpesaTransaction',
        match: { owner: req.user.id },
      })
      .sort({ receivedDate: -1 })
      .lean();

    const paymentIds = payments.map((payment) => payment._id);

    const allAllocations = await PaymentAllocation.find({
      owner: req.user.id,
      payment: { $in: paymentIds },
    })
      .populate({
        path: 'job',
        match: { owner: req.user.id },
        populate: ['client', 'site'],
      })
      .lean();

    const byPayment = {};

    for (const allocation of allAllocations) {
      const key = String(allocation.payment);
      (byPayment[key] = byPayment[key] || []).push(allocation);
    }

    res.json(
      payments.map((payment) => {
        const allocations = byPayment[String(payment._id)] || [];

        const allocated = allocations.reduce(
          (sum, allocation) => sum + Number(allocation.amount || 0),
          0
        );

        return {
          ...payment,
          allocations,
          allocated,
          unallocated: Math.max(0, Number(payment.amount) - allocated),
        };
      })
    );
  } catch (err) {
    res.status(500).json({
      message: 'Failed to fetch payments',
      error: err.message,
    });
  }
};

exports.create = async (req, res) => {
  try {
    // Recognise a retry of the same payment.
    if (req.body._id) {
      const already = await Payment.findOne({
        _id: req.body._id,
        owner: req.user.id,
      });

      if (already) {
        return res.status(200).json(already);
      }
    }

    if (!isValidAmount(req.body.amount)) {
      return res.status(400).json({
        message: 'Payment amount must be a valid number greater than zero',
      });
    }

    // Ensure the linked M-PESA transaction belongs to this user.
    if (req.body.mpesaTransaction) {
      const tx = await MpesaTransaction.findOne({
        _id: req.body.mpesaTransaction,
        owner: req.user.id,
      });

      if (!tx) {
        return res.status(400).json({
          message: 'The M-PESA transaction for this payment was not found',
        });
      }
    }

    const payment = await Payment.create({
      ...req.body,
      owner: req.user.id,
    });

    return res.status(201).json(payment);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        message: 'This payment already exists',
      });
    }

    return res.status(400).json({
      message: 'Failed to create payment',
      error: err.message,
    });
  }
};

exports.allocate = async (req, res) => {
  try {
    const { jobId, amount, notes, allocationType, clientRequestId } = req.body;

    if (!isValidAmount(amount)) {
      return res.status(400).json({
        message: 'Allocation amount must be a valid number greater than zero',
      });
    }

    const allocationAmount = Number(amount);

    const payment = await Payment.findOne({
      _id: req.params.id,
      owner: req.user.id,
    });

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    const job = await Job.findOne({
      _id: jobId,
      owner: req.user.id,
      deletedAt: null,
    });

    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }

    // Recognise an identical retry, but do not silently accept a reused
    // request ID belonging to a different payment or job.
    if (clientRequestId) {
      const duplicate = await PaymentAllocation.findOne({
        owner: req.user.id,
        clientRequestId,
      });

      if (duplicate) {
        if (
          String(duplicate.payment) === String(payment._id) &&
          String(duplicate.job) === String(job._id)
        ) {
          return res.status(200).json({ allocation: duplicate });
        }

        return res.status(409).json({
          message: 'This request ID has already been used for another allocation',
        });
      }
    }

    const existingAllocations = await PaymentAllocation.find({
      owner: req.user.id,
      payment: payment._id,
    }).select('amount');

    const alreadyAllocated = existingAllocations.reduce(
      (sum, allocation) => sum + Number(allocation.amount || 0),
      0
    );

    const remaining = Number(payment.amount) - alreadyAllocated;

    if (allocationAmount > remaining) {
      return res.status(400).json({
        message: `Only KES ${Math.max(0, remaining)} of this payment is unallocated`,
      });
    }

    const allocation = await PaymentAllocation.create({
      owner: req.user.id,
      payment: payment._id,
      job: job._id,
      amount: allocationAmount,
      allocationType: allocationType === 'Fare' ? 'Fare' : 'Payment',
      notes,
      clientRequestId,
    });

    if (payment.mpesaTransaction) {
      await recalculateMpesaAllocatedAmount(
        payment.mpesaTransaction,
        req.user.id
      );
    }

    const financials = await refreshJobFinancials(job._id, req.user.id);

    return res.status(201).json({
      allocation,
      jobFinancials: financials,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        message: 'This allocation request already exists',
      });
    }

    return res.status(400).json({
      message: 'Failed to allocate payment',
      error: err.message,
    });
  }
};

exports.updateAllocation = async (req, res) => {
  try {
    const { amount, allocationType } = req.body;

    const allocation = await PaymentAllocation.findOne({
      _id: req.params.allocationId,
      owner: req.user.id,
    });

    if (!allocation) {
      return res.status(404).json({ message: 'Allocation not found' });
    }

    const payment = await Payment.findOne({
      _id: allocation.payment,
      owner: req.user.id,
    });

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    let amountChanged = false;

    if (amount !== undefined) {
      if (!isValidAmount(amount)) {
        return res.status(400).json({
          message: 'Allocation amount must be a valid number greater than zero',
        });
      }

      const newAmount = Number(amount);

      const otherAllocations = await PaymentAllocation.find({
        owner: req.user.id,
        payment: payment._id,
        _id: { $ne: allocation._id },
      }).select('amount');

      const otherTotal = otherAllocations.reduce(
        (sum, item) => sum + Number(item.amount || 0),
        0
      );

      const available = Number(payment.amount) - otherTotal;

      if (newAmount > available) {
        return res.status(400).json({
          message: `That would exceed the payment total. Only KES ${Math.max(0, available)} is available for this allocation.`,
        });
      }

      amountChanged = newAmount !== Number(allocation.amount);
      allocation.amount = newAmount;
    }

    if (allocationType === 'Payment' || allocationType === 'Fare') {
      allocation.allocationType = allocationType;
    }

    await allocation.save();

    if (amountChanged && payment.mpesaTransaction) {
      await recalculateMpesaAllocatedAmount(
        payment.mpesaTransaction,
        req.user.id
      );
    }

    const financials = await refreshJobFinancials(
      allocation.job,
      req.user.id
    );

    return res.json({
      allocation,
      jobFinancials: financials,
    });
  } catch (err) {
    return res.status(400).json({
      message: 'Failed to update allocation',
      error: err.message,
    });
  }
};

exports.removeAllocation = async (req, res) => {
  try {
    const allocation = await PaymentAllocation.findOne({
      _id: req.params.allocationId,
      owner: req.user.id,
    });

    if (!allocation) {
      return res.status(404).json({ message: 'Allocation not found' });
    }

    const payment = await Payment.findOne({
      _id: allocation.payment,
      owner: req.user.id,
    });

    const jobId = allocation.job;
    const transactionId = payment ? payment.mpesaTransaction : null;

    await allocation.deleteOne();

    if (transactionId) {
      await recalculateMpesaAllocatedAmount(transactionId, req.user.id);
    }

    const financials = await refreshJobFinancials(jobId, req.user.id);

    return res.json({
      message: 'Allocation removed',
      jobFinancials: financials,
    });
  } catch (err) {
    return res.status(500).json({
      message: 'Failed to remove allocation',
      error: err.message,
    });
  }
};

exports.remove = async (req, res) => {
  try {
    const payment = await Payment.findOne({
      _id: req.params.id,
      owner: req.user.id,
    });

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    const allocations = await PaymentAllocation.find({
      owner: req.user.id,
      payment: payment._id,
    });

    const affectedJobIds = [
      ...new Set(allocations.map((allocation) => String(allocation.job))),
    ];

    const transactionId = payment.mpesaTransaction;

    // Remove only allocations belonging to this user's payment.
    await PaymentAllocation.deleteMany({
      owner: req.user.id,
      payment: payment._id,
    });

    await payment.deleteOne();

    // Recalculate after deleting this payment. Do not blindly set the
    // transaction total to zero because other payments may still use it.
    if (transactionId) {
      await recalculateMpesaAllocatedAmount(transactionId, req.user.id);
    }

    for (const jobId of affectedJobIds) {
      await refreshJobFinancials(jobId, req.user.id);
    }

    return res.json({ message: 'Deleted' });
  } catch (err) {
    return res.status(500).json({
      message: 'Failed to delete payment',
      error: err.message,
    });
  }
};