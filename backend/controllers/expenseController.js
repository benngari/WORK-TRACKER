const crudFactory = require('../utils/crudFactory');
const Expense = require('../models/Expense');

module.exports = crudFactory(Expense, { sort: { date: -1 }, lean: true });