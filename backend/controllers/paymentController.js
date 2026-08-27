const Payment = require('../models/Payment');
const PaymentAllocation = require('../models/PaymentAllocation');
const MpesaTransaction = require('../models/MpesaTransaction');
const Job = require('../models/Job');
const { computeJobFinancials } = require('./jobController');

exports.list = async (req, res) => {
  try {
    const payments = await Payment.find({ owner: req.user.id })
      .populate('mpesaTransaction')
      .sort({ receivedDate: -1 });

    const withAllocations = await Promise.all(
      payments.map(async (p) => {
        const allocations = await PaymentAllocation.find({ payment: p._id }).populate({
          path: 'job',
          populate: ['client', 'site'],
        });
        const allocated = allocations.reduce((sum, a) => sum + a.amount, 0);
        return { ...p.toObject(), allocations, allocated, unallocated: Math.max(0, p.amount - allocated) };
      })
    );
    res.json(withAllocations);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch payments', error: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const payment = await Payment.create({ ...req.body, owner: req.user.id });
    res.status(201).json(payment);
  } catch (err) {
    res.status(400).json({ message: 'Failed to create payment', error: err.message });
  }
};

exports.allocate = async (req, res) => {
  try {
    const { jobId, amount, notes, allocationType } = req.body;
    const payment = await Payment.findOne({ _id: req.params.id, owner: req.user.id });
    if (!payment) return res.status(404).json({ message: 'Payment not found' });

    const job = await Job.findOne({ _id: jobId, owner: req.user.id, deletedAt: null });
    if (!job) return res.status(404).json({ message: 'Job not found' });

    const existingAllocations = await PaymentAllocation.find({ payment: payment._id });
    const alreadyAllocated = existingAllocations.reduce((s, a) => s + a.amount, 0);
    const remaining = payment.amount - alreadyAllocated;
    if (amount > remaining) {
      return res.status(400).json({ message: `Only KES ${remaining} of this payment is unallocated` });
    }

    const allocation = await PaymentAllocation.create({
      owner: req.user.id,
      payment: payment._id,
      job: job._id,
      amount,
      allocationType: allocationType === 'Fare' ? 'Fare' : 'Payment',
      notes,
    });

    if (payment.mpesaTransaction) {
      await MpesaTransaction.findByIdAndUpdate(payment.mpesaTransaction, {
        $inc: { allocatedAmount: amount },
      });
    }

    const fin = await computeJobFinancials(job);
    job.paymentStatus = fin.paymentStatus;
    await job.save();

    res.status(201).json({ allocation, jobFinancials: fin });
  } catch (err) {
    res.status(400).json({ message: 'Failed to allocate payment', error: err.message });
  }
};

exports.updateAllocation = async (req, res) => {
  try {
    const { amount, allocationType } = req.body;
    const allocation = await PaymentAllocation.findOne({ _id: req.params.allocationId, owner: req.user.id });
    if (!allocation) return res.status(404).json({ message: 'Allocation not found' });

    const payment = await Payment.findById(allocation.payment);
    if (!payment) return res.status(404).json({ message: 'Payment not found' });

    if (amount !== undefined) {
      const otherAllocations = await PaymentAllocation.find({
        payment: payment._id,
        _id: { $ne: allocation._id },
      });
      const otherTotal = otherAllocations.reduce((s, a) => s + a.amount, 0);
      if (amount + otherTotal > payment.amount) {
        return res.status(400).json({
          message: `That would exceed the payment total. Only KES ${payment.amount - otherTotal} is available for this allocation.`,
        });
      }

      const diff = amount - allocation.amount;
      allocation.amount = amount;
      if (payment.mpesaTransaction) {
        await MpesaTransaction.findByIdAndUpdate(payment.mpesaTransaction, { $inc: { allocatedAmount: diff } });
      }
    }

    if (allocationType === 'Payment' || allocationType === 'Fare') {
      allocation.allocationType = allocationType;
    }

    await allocation.save();

    const job = await Job.findOne({ _id: allocation.job, owner: req.user.id, deletedAt: null });
    if (job) {
      const fin = await computeJobFinancials(job);
      job.paymentStatus = fin.paymentStatus;
      await job.save();
    }

    res.json({ allocation });
  } catch (err) {
    res.status(400).json({ message: 'Failed to update allocation', error: err.message });
  }
};

exports.removeAllocation = async (req, res) => {
  try {
    const allocation = await PaymentAllocation.findOne({ _id: req.params.allocationId, owner: req.user.id });
    if (!allocation) return res.status(404).json({ message: 'Not found' });

    const payment = await Payment.findById(allocation.payment);
    const job = await Job.findById(allocation.job);

    await allocation.deleteOne();

    if (payment && payment.mpesaTransaction) {
      await MpesaTransaction.findByIdAndUpdate(payment.mpesaTransaction, {
        $inc: { allocatedAmount: -allocation.amount },
      });
    }
    if (job) {
      const fin = await computeJobFinancials(job);
      job.paymentStatus = fin.paymentStatus;
      await job.save();
    }

    res.json({ message: 'Allocation removed' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to remove allocation', error: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const payment = await Payment.findOne({ _id: req.params.id, owner: req.user.id });
    if (!payment) return res.status(404).json({ message: 'Not found' });

    const allocations = await PaymentAllocation.find({ payment: payment._id });
    for (const a of allocations) {
      const job = await Job.findById(a.job);
      await a.deleteOne();
      if (job) {
        const fin = await computeJobFinancials(job);
        job.paymentStatus = fin.paymentStatus;
        await job.save();
      }
    }
    if (payment.mpesaTransaction) {
      await MpesaTransaction.findByIdAndUpdate(payment.mpesaTransaction, { allocatedAmount: 0 });
    }
    await payment.deleteOne();
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete payment', error: err.message });
  }
};