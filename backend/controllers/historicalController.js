const crudFactory = require('../utils/crudFactory');
const HistoricalRecord = require('../models/HistoricalRecord');

const base = crudFactory(HistoricalRecord, { sort: { date: -1 } });
module.exports = base;
