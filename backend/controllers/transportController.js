const crudFactory = require('../utils/crudFactory');
const Transport = require('../models/Transport');

const base = crudFactory(Transport, { sort: { date: -1 } });
module.exports = base;
