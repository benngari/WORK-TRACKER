const crudFactory = require('../utils/crudFactory');
const Expense = require('../models/Expense');

const base = crudFactory(Expense, { sort: { date: -1 }, lean: true });

module.exports = {
  ...base,
  // a retry from a phone that was offline must not create the same expense twice
  create: async (req, res) => {
    if (req.body.clientRequestId) {
      const already = await Expense.findOne({ owner: req.user.id, clientRequestId: req.body.clientRequestId }).lean();
      if (already) return res.status(200).json(already);
    }
    return base.create(req, res);
  },
};