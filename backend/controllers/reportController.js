const Job = require('../models/Job');
const Attendance = require('../models/Attendance');
const PaymentAllocation = require('../models/PaymentAllocation');
const Payment = require('../models/Payment');
const Expense = require('../models/Expense');
const { batchComputeFinancials } = require('./jobController');

exports.ledger = async (req, res) => {
  try {
    const filter = { owner: req.user.id, deletedAt: null };
    if (req.query.client) filter.client = req.query.client;
    if (req.query.site) filter.site = req.query.site;

    const jobs = await Job.find(filter).populate('client').populate('site').sort({ createdAt: -1 }).lean();
    const withFinancials = await batchComputeFinancials(jobs, req.user.id);

    let rows = withFinancials.map((job) => {
      const dates = (job.attendance || []).map((a) => a.date).sort((a, b) => new Date(a) - new Date(b));
      return {
        jobId: job._id,
        jobDate: dates[0] || job.createdAt,
        lastAttendance: dates[dates.length - 1] || null,
        client: job.client?.name,
        site: job.site
          ? job.site.siteType === 'Bank'
            ? [job.site.bankName, job.site.branch].filter(Boolean).join(' - ')
            : job.site.siteName
          : null,
        jobCardRef: job.jobCardRef,
        callouts: job.attendanceCount,
        expected: job.expected,
        paid: job.paid,
        balance: job.outstanding,
        paymentDueDate: job.paymentDueDate,
        status: job.paymentStatus,
      };
    });

    if (req.query.status) rows = rows.filter((r) => r.status === req.query.status);
    if (req.query.from) rows = rows.filter((r) => r.jobDate && new Date(r.jobDate) >= new Date(req.query.from));
    if (req.query.to) rows = rows.filter((r) => r.jobDate && new Date(r.jobDate) <= new Date(req.query.to));

    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Failed to build payment ledger', error: err.message });
  }
};

exports.outstanding = async (req, res) => {
  try {
    const jobs = await Job.find({ owner: req.user.id, deletedAt: null }).populate('client').populate('site').lean();
    const withFinancials = await batchComputeFinancials(jobs, req.user.id);
    const now = new Date();

    const rows = withFinancials
      .filter((job) => job.outstanding > 0)
      .map((job) => {
        const dates = (job.attendance || []).map((a) => a.date).sort((a, b) => new Date(a) - new Date(b));
        const lastAttendance = dates[dates.length - 1] || null;
        const daysOutstanding = lastAttendance
          ? Math.floor((Date.now() - new Date(lastAttendance).getTime()) / (1000 * 60 * 60 * 24))
          : null;
        const isOverdue = Boolean(job.paymentDueDate && new Date(job.paymentDueDate) < now);
        return {
          jobId: job._id,
          client: job.client?.name,
          site: job.site
            ? job.site.siteType === 'Bank'
              ? [job.site.bankName, job.site.branch].filter(Boolean).join(' - ')
              : job.site.siteName
            : null,
          jobCardRef: job.jobCardRef,
          expected: job.expected,
          paid: job.paid,
          outstanding: job.outstanding,
          lastAttendance,
          paymentDueDate: job.paymentDueDate,
          daysOutstanding,
          isOverdue,
          status: job.paymentStatus,
        };
      })
      .sort((a, b) => {
        if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
        return b.outstanding - a.outstanding;
      });

    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Failed to build outstanding report', error: err.message });
  }
};

exports.overdueSummary = async (req, res) => {
  try {
    const jobs = await Job.find({ owner: req.user.id, deletedAt: null }).lean();
    const withFinancials = await batchComputeFinancials(jobs, req.user.id);
    const now = new Date();

    const overdue = withFinancials.filter(
      (job) => job.outstanding > 0 && job.paymentDueDate && new Date(job.paymentDueDate) < now
    );

    res.json({
      count: overdue.length,
      totalAmount: overdue.reduce((sum, j) => sum + j.outstanding, 0),
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to build overdue summary', error: err.message });
  }
};

function getPeriodRange(period) {
  const now = new Date();
  if (period === 'month') {
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1),
      to: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
    };
  }
  if (period === 'year') {
    return {
      from: new Date(now.getFullYear(), 0, 1),
      to: new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999),
    };
  }
  return null;
}

// Profit per client = job payments received minus net visit fares (fares you
// spent minus fares you were reimbursed). General expenses (tools, airtime...)
// are not tied to a client, so they are reported once in the totals.
exports.clientProfit = async (req, res) => {
  try {
    const owner = req.user.id;
    const period = ['month', 'year'].includes(req.query.period) ? req.query.period : 'all';
    const range = getPeriodRange(period);
    const inRange = (d) => !range || (d >= range.from && d <= range.to);

    const jobs = await Job.find({ owner, deletedAt: null }).populate('client', 'name').lean();
    const jobIds = jobs.map((j) => j._id);

    const [attendance, allocations, payments, expenses] = await Promise.all([
      Attendance.find({ job: { $in: jobIds }, owner }).lean(),
      PaymentAllocation.find({ job: { $in: jobIds }, owner }).lean(),
      Payment.find({ owner }).select('receivedDate').lean(),
      Expense.find({ owner }).lean(),
    ]);

    // whole-job jobs: spread the agreed total evenly over the days worked
    const dayCount = {};
    for (const a of attendance) dayCount[String(a.job)] = (dayCount[String(a.job)] || 0) + 1;
    const overrideOf = {};
    for (const j of jobs) if (j.expectedPaymentOverride != null) overrideOf[String(j._id)] = j.expectedPaymentOverride;
    const shareOf = (a) => {
      const total = overrideOf[String(a.job)];
      const days = dayCount[String(a.job)];
      return total != null && days ? total / days : a.rate;
    };

    const rowsByClient = {};
    const jobRow = {};
    for (const j of jobs) {
      const id = String(j.client?._id || 'unknown');
      rowsByClient[id] = rowsByClient[id] || {
        clientId: id,
        client: j.client?.name || 'Unknown',
        callouts: 0,
        expected: 0,
        paid: 0,
        fareSpent: 0,
        fareReceived: 0,
      };
      jobRow[String(j._id)] = rowsByClient[id];
    }

    for (const a of attendance) {
      if (!inRange(a.date)) continue;
      const row = jobRow[String(a.job)];
      if (!row) continue;
      row.callouts += 1;
      row.expected += shareOf(a);
      row.fareSpent += a.fare || 0;
    }

    const paymentDate = {};
    for (const p of payments) paymentDate[String(p._id)] = p.receivedDate;

    for (const al of allocations) {
      const d = paymentDate[String(al.payment)];
      if (!d || !inRange(d)) continue;
      const row = jobRow[String(al.job)];
      if (!row) continue;
      if (al.allocationType === 'Fare') row.fareReceived += al.amount;
      else row.paid += al.amount;
    }

    const rows = Object.values(rowsByClient)
      .map((r) => {
        const netFares = r.fareSpent - r.fareReceived;
        const profit = r.paid - netFares;
        return {
          ...r,
          netFares,
          profit,
          margin: r.paid > 0 ? (profit / r.paid) * 100 : null,
          outstanding: Math.max(0, r.expected - r.paid),
        };
      })
      .filter((r) => r.callouts > 0 || r.paid > 0 || r.fareSpent > 0 || r.outstanding > 0);

    const paid = rows.reduce((s, r) => s + r.paid, 0);
    const netFares = rows.reduce((s, r) => s + r.netFares, 0);
    const profit = rows.reduce((s, r) => s + r.profit, 0);
    const generalExpenses = expenses.filter((e) => inRange(new Date(e.date))).reduce((s, e) => s + e.amount, 0);

    res.json({
      period,
      rows,
      totals: { paid, netFares, profit, generalExpenses, netIncome: profit - generalExpenses },
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to build client profit report', error: err.message });
  }
};