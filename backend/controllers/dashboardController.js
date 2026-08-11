const Job = require('../models/Job');
const Attendance = require('../models/Attendance');
const PaymentAllocation = require('../models/PaymentAllocation');
const Payment = require('../models/Payment');
const MpesaTransaction = require('../models/MpesaTransaction');
const Transport = require('../models/Transport');
const Site = require('../models/Site');

exports.summary = async (req, res) => {
  try {
    const ownerFilter = { owner: req.user.id };
    const jobs = await Job.find({ ...ownerFilter, deletedAt: null }).populate('client').populate('site');
    const jobIds = jobs.map((j) => j._id);

    // Fetch everything needed in a handful of batched queries instead of
    // querying per job (which is what made this slow with many jobs).
    const [allAttendance, allAllocations, payments, mpesaCount, transportAgg, nairobiAgg] = await Promise.all([
      Attendance.find({ job: { $in: jobIds }, owner: req.user.id }),
      PaymentAllocation.find({ job: { $in: jobIds }, owner: req.user.id }),
      Payment.find(ownerFilter),
      MpesaTransaction.countDocuments(ownerFilter),
      Transport.aggregate([
        { $match: { owner: req.user.id } },
        { $group: { _id: null, totalFare: { $sum: '$fare' } } },
      ]),
      Transport.aggregate([
        { $match: { owner: req.user.id } },
        { $group: { _id: '$zone', total: { $sum: '$fare' }, count: { $sum: 1 } } },
      ]),
    ]);

    const attendanceByJob = {};
    for (const a of allAttendance) {
      const key = String(a.job);
      (attendanceByJob[key] = attendanceByJob[key] || []).push(a);
    }
    const paidByJob = {};
    for (const a of allAllocations) {
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

      const siteLabel = job.site
        ? job.site.siteType === 'Bank'
          ? [job.site.bankName, job.site.branch].filter(Boolean).join(' - ')
          : job.site.siteName
        : 'Unknown Site';
      bySite[siteLabel] = bySite[siteLabel] || { expected: 0, paid: 0 };
      bySite[siteLabel].expected += expected;
      bySite[siteLabel].paid += paid;

      if (job.site?.siteType === 'Bank' && job.site.bankName) {
        byBank[job.site.bankName] = byBank[job.site.bankName] || { expected: 0, paid: 0 };
        byBank[job.site.bankName].expected += expected;
        byBank[job.site.bankName].paid += paid;
      }

      for (const a of jobAttendance) {
        const key = `${a.date.getFullYear()}-${String(a.date.getMonth() + 1).padStart(2, '0')}`;
        byMonth[key] = byMonth[key] || { expected: 0, paid: 0, callouts: 0 };
        byMonth[key].expected += job.rate;
        byMonth[key].callouts += 1;
      }
    }

    for (const p of payments) {
      const key = `${p.receivedDate.getFullYear()}-${String(p.receivedDate.getMonth() + 1).padStart(2, '0')}`;
      byMonth[key] = byMonth[key] || { expected: 0, paid: 0, callouts: 0 };
      byMonth[key].paid += p.amount;
    }

    const sitesVisited = await Site.countDocuments({
      _id: { $in: jobs.map((j) => j.site?._id).filter(Boolean) },
    });

    res.json({
      cards: {
        totalExpected,
        totalPaid,
        totalOutstanding: Math.max(0, totalExpected - totalPaid),
        workCompletedNotPaid,
        totalJobs: totalCallouts,
        totalCallouts,
        sitesVisited,
        mpesaPayments: mpesaCount,
        totalFare: transportAgg[0]?.totalFare || 0,
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