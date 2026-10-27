const Job = require('../models/Job');
const Attendance = require('../models/Attendance');
const PaymentAllocation = require('../models/PaymentAllocation');
const Payment = require('../models/Payment');
const MpesaTransaction = require('../models/MpesaTransaction');
const Transport = require('../models/Transport');
const Site = require('../models/Site');
const Expense = require('../models/Expense');

function getPeriodRange(period) {
  const now = new Date();
  if (period === 'week') {
    const day = now.getDay();
    const diffToMonday = day === 0 ? 6 : day - 1;
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday);
    const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 6, 23, 59, 59, 999);
    return { from, to };
  }
  if (period === 'month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { from, to };
  }
  if (period === 'year') {
    const from = new Date(now.getFullYear(), 0, 1);
    const to = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    return { from, to };
  }
  return null;
}

const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const sum = (arr, fn) => arr.reduce((s, x) => s + fn(x), 0);

exports.summary = async (req, res) => {
  try {
    const ownerFilter = { owner: req.user.id };
    const period = ['week', 'month', 'year'].includes(req.query.period) ? req.query.period : 'all';
    const range = getPeriodRange(period);
    const inRange = (d) => !range || (d >= range.from && d <= range.to);

    const jobs = await Job.find({ ...ownerFilter, deletedAt: null }).populate('client').populate('site').lean();
    const jobIds = jobs.map((j) => j._id);

    const [allAttendance, allAllocations, payments, mpesaCount, transportAgg, nairobiAgg, allExpenses] = await Promise.all([
      Attendance.find({ job: { $in: jobIds }, owner: req.user.id }).lean(),
      PaymentAllocation.find({ job: { $in: jobIds }, owner: req.user.id }).lean(),
      Payment.find(ownerFilter).lean(),
      MpesaTransaction.countDocuments(ownerFilter),
      Transport.aggregate([
        { $match: { owner: req.user.id } },
        { $group: { _id: null, totalFare: { $sum: '$fare' } } },
      ]),
      Transport.aggregate([
        { $match: { owner: req.user.id } },
        { $group: { _id: '$zone', total: { $sum: '$fare' }, count: { $sum: 1 } } },
      ]),
      Expense.find(ownerFilter).lean(),
    ]);

    const attendanceByJob = {};
    for (const a of allAttendance) {
      const key = String(a.job);
      (attendanceByJob[key] = attendanceByJob[key] || []).push(a);
    }
    const paidByJob = {};
    for (const a of allAllocations) {
      if (a.allocationType === 'Fare') continue;
      const key = String(a.job);
      paidByJob[key] = (paidByJob[key] || 0) + a.amount;
    }

    let totalExpected = 0;
    let totalPaid = 0;
    let totalCallouts = 0;
    let workCompletedNotPaid = 0;
    const byClient = {};
    const bySite = {};
    const byBank = {};
    const byMonth = {};
    const month = (key) => (byMonth[key] = byMonth[key] || { expected: 0, paid: 0, callouts: 0, expenses: 0 });

    for (const job of jobs) {
      const jobAttendance = attendanceByJob[String(job._id)] || [];
      const expected = job.expectedPaymentOverride ?? jobAttendance.length * job.rate;
      const paid = paidByJob[String(job._id)] || 0;
      const outstanding = Math.max(0, expected - paid);

      totalExpected += expected;
      totalPaid += paid;
      totalCallouts += jobAttendance.length;
      if (outstanding > 0 && job.status === 'Completed') {
        workCompletedNotPaid += outstanding;
      }

      const clientName = job.client?.name || 'Unknown';
      byClient[clientName] = byClient[clientName] || { expected: 0, paid: 0 };
      byClient[clientName].expected += expected;
      byClient[clientName].paid += paid;

      const siteLbl = job.site
        ? job.site.siteType === 'Bank'
          ? [job.site.bankName, job.site.branch].filter(Boolean).join(' - ')
          : job.site.siteName
        : 'Unknown Site';
      bySite[siteLbl] = bySite[siteLbl] || { expected: 0, paid: 0 };
      bySite[siteLbl].expected += expected;
      bySite[siteLbl].paid += paid;

      if (job.site?.siteType === 'Bank' && job.site.bankName) {
        byBank[job.site.bankName] = byBank[job.site.bankName] || { expected: 0, paid: 0 };
        byBank[job.site.bankName].expected += expected;
        byBank[job.site.bankName].paid += paid;
      }

      for (const a of jobAttendance) {
        const m = month(monthKey(a.date));
        m.expected += job.rate;
        m.callouts += 1;
      }
    }

    for (const p of payments) {
      month(monthKey(p.receivedDate)).paid += p.amount;
    }
    for (const e of allExpenses) {
      month(monthKey(new Date(e.date))).expenses += e.amount;
    }

    const periodAttendance = allAttendance.filter((a) => inRange(a.date));
    const paymentIdsInPeriod = new Set(payments.filter((p) => inRange(p.receivedDate)).map((p) => String(p._id)));

    const periodExpected = range ? sum(periodAttendance, (a) => a.rate) : totalExpected;
    const periodCallouts = periodAttendance.length;
    const periodPaid = range
      ? sum(
          allAllocations.filter((a) => a.allocationType !== 'Fare' && paymentIdsInPeriod.has(String(a.payment))),
          (a) => a.amount
        )
      : totalPaid;
    const periodOutstanding = Math.max(0, periodExpected - periodPaid);

    // Net visit fares = fares you spent on visits minus fares you were reimbursed.
    const fareSpent = sum(periodAttendance, (a) => a.fare || 0);
    const fareReceived = sum(
      allAllocations.filter((a) => a.allocationType === 'Fare' && paymentIdsInPeriod.has(String(a.payment))),
      (a) => a.amount
    );
    const netVisitFares = fareSpent - fareReceived;

    const periodExpenseList = allExpenses.filter((e) => inRange(new Date(e.date)));
    const expensesLogged = sum(periodExpenseList, (e) => e.amount);
    const expensesByCategory = {};
    for (const e of periodExpenseList) {
      const c = e.category || 'Other';
      expensesByCategory[c] = (expensesByCategory[c] || 0) + e.amount;
    }
    const totalExpenses = expensesLogged + netVisitFares;
    const netIncome = periodPaid - totalExpenses;

    const sitesVisited = await Site.countDocuments({
      _id: { $in: jobs.map((j) => j.site?._id).filter(Boolean) },
    });

    res.json({
      period,
      cards: {
        totalExpected: periodExpected,
        totalPaid: periodPaid,
        totalOutstanding: periodOutstanding,
        totalCallouts: periodCallouts,
        expensesLogged,
        netVisitFares,
        totalExpenses,
        netIncome,
        workCompletedNotPaid,
        totalJobs: totalCallouts,
        sitesVisited,
        mpesaPayments: mpesaCount,
        totalFare: transportAgg[0]?.totalFare || 0,
      },
      charts: {
        monthly: Object.entries(byMonth)
          .sort(([a], [b]) => (a > b ? 1 : -1))
          .map(([m, v]) => ({ month: m, ...v })),
        byClient: Object.entries(byClient).map(([name, v]) => ({ name, ...v })),
        bySite: Object.entries(bySite).map(([name, v]) => ({ name, ...v })),
        byBank: Object.entries(byBank).map(([name, v]) => ({ name, ...v })),
        nairobiVsOutside: nairobiAgg.map((n) => ({ zone: n._id, total: n.total, count: n.count })),
        expensesByCategory: Object.entries(expensesByCategory)
          .map(([name, total]) => ({ name, total }))
          .sort((a, b) => b.total - a.total),
      },
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to build dashboard summary', error: err.message });
  }
};