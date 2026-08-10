const Job = require('../models/Job');
const Attendance = require('../models/Attendance');
const PaymentAllocation = require('../models/PaymentAllocation');
const Payment = require('../models/Payment');
const MpesaTransaction = require('../models/MpesaTransaction');
const Transport = require('../models/Transport');
const Site = require('../models/Site');
const { computeJobFinancials } = require('./jobController');

exports.summary = async (req, res) => {
  try {
    const ownerFilter = { owner: req.user.id };
    const jobs = await Job.find(ownerFilter).populate('client').populate('site');

    let totalExpected = 0;
    let totalPaid = 0;
    let totalCallouts = 0;
    let workCompletedNotPaid = 0;
    const byClient = {};
    const bySite = {};
    const byBank = {};
    const byMonth = {}; // "2026-08" -> { expected, paid }

    for (const job of jobs) {
      const fin = await computeJobFinancials(job);
      totalExpected += fin.expected;
      totalPaid += fin.paid;
      totalCallouts += fin.attendanceCount;
      if (fin.outstanding > 0 && job.status === 'Completed') {
        workCompletedNotPaid += fin.outstanding;
      }

      const clientName = job.client?.name || 'Unknown';
      byClient[clientName] = byClient[clientName] || { expected: 0, paid: 0 };
      byClient[clientName].expected += fin.expected;
      byClient[clientName].paid += fin.paid;

      const siteLabel = job.site
        ? job.site.siteType === 'Bank'
          ? [job.site.bankName, job.site.branch].filter(Boolean).join(' - ')
          : job.site.siteName
        : 'Unknown Site';
      bySite[siteLabel] = bySite[siteLabel] || { expected: 0, paid: 0 };
      bySite[siteLabel].expected += fin.expected;
      bySite[siteLabel].paid += fin.paid;

      if (job.site?.siteType === 'Bank' && job.site.bankName) {
        byBank[job.site.bankName] = byBank[job.site.bankName] || { expected: 0, paid: 0 };
        byBank[job.site.bankName].expected += fin.expected;
        byBank[job.site.bankName].paid += fin.paid;
      }

      // distribute expected/paid across attendance months for the "monthly" chart
      for (const a of fin.attendance) {
        const key = `${a.date.getFullYear()}-${String(a.date.getMonth() + 1).padStart(2, '0')}`;
        byMonth[key] = byMonth[key] || { expected: 0, paid: 0, callouts: 0 };
        byMonth[key].expected += job.rate;
        byMonth[key].callouts += 1;
      }
    }

    // Spread paid amounts across months isn't exact without per-allocation dates,
    // so approximate monthly "paid" using actual payment received dates instead.
    const payments = await Payment.find(ownerFilter);
    for (const p of payments) {
      const key = `${p.receivedDate.getFullYear()}-${String(p.receivedDate.getMonth() + 1).padStart(2, '0')}`;
      byMonth[key] = byMonth[key] || { expected: 0, paid: 0, callouts: 0 };
      byMonth[key].paid += p.amount;
    }

    const sitesVisited = await Site.countDocuments({
      _id: { $in: jobs.map((j) => j.site?._id).filter(Boolean) },
    });

    const mpesaCount = await MpesaTransaction.countDocuments(ownerFilter);

    const transportAgg = await Transport.aggregate([
      { $match: { owner: req.user.id } },
      { $group: { _id: null, totalFare: { $sum: '$fare' } } },
    ]);
    const totalFare = transportAgg[0]?.totalFare || 0;

    const nairobiAgg = await Transport.aggregate([
      { $match: { owner: req.user.id } },
      { $group: { _id: '$zone', total: { $sum: '$fare' }, count: { $sum: 1 } } },
    ]);

    res.json({
      cards: {
        totalExpected,
        totalPaid,
        totalOutstanding: Math.max(0, totalExpected - totalPaid),
        workCompletedNotPaid,
        totalJobs: jobs.length,
        totalCallouts,
        sitesVisited,
        mpesaPayments: mpesaCount,
        totalFare,
      },
      charts: {
        monthly: Object.entries(byMonth)
          .sort(([a], [b]) => (a > b ? 1 : -1))
          .map(([month, v]) => ({ month, ...v })),
        byClient: Object.entries(byClient).map(([name, v]) => ({ name, ...v })),
        bySite: Object.entries(bySite).map(([name, v]) => ({ name, ...v })),
        byBank: Object.entries(byBank).map(([name, v]) => ({ name, ...v })),
        nairobiVsOutside: nairobiAgg.map((n) => ({ zone: n._id, total: n.total, count: n.count })),
      },
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to build dashboard summary', error: err.message });
  }
};
