// Small helper to avoid repeating identical CRUD boilerplate across
// simple owner-scoped models (Client, Site, Transport, HistoricalRecord...).
function crudFactory(Model, { populate = null, sort = { createdAt: -1 }, lean = false } = {}) {
  return {
    list: async (req, res) => {
      try {
        let query = Model.find({ owner: req.user.id }).sort(sort);
        if (populate) query = query.populate(populate);
        const items = lean ? await query.lean() : await query;
        res.json(items);
      } catch (err) {
        res.status(500).json({ message: 'Failed to fetch records', error: err.message });
      }
    },

    getOne: async (req, res) => {
      try {
        let query = Model.findOne({ _id: req.params.id, owner: req.user.id });
        if (populate) query = query.populate(populate);
        const item = await query;
        if (!item) return res.status(404).json({ message: 'Not found' });
        res.json(item);
      } catch (err) {
        res.status(500).json({ message: 'Failed to fetch record', error: err.message });
      }
    },

    // Populates the newly created record before returning it (when this
    // model has a populate option configured), so a freshly-created record
    // has the same shape as one fetched from the list endpoint. Without
    // this, code that optimistically appends a create-response into local
    // state (e.g. quick-add flows) sees unpopulated references and can't
    // match them against already-loaded, populated data.
    create: async (req, res) => {
      try {
        let item = await Model.create({ ...req.body, owner: req.user.id });
        if (populate) {
          item = await Model.findById(item._id).populate(populate);
        }
        res.status(201).json(item);
      } catch (err) {
        if (err.code === 11000) {
          return res.status(409).json({ message: 'A record with these details already exists' });
        }
        res.status(400).json({ message: 'Failed to create record', error: err.message });
      }
    },

    update: async (req, res) => {
      try {
        let item = await Model.findOneAndUpdate(
          { _id: req.params.id, owner: req.user.id },
          req.body,
          { new: true, runValidators: true }
        );
        if (!item) return res.status(404).json({ message: 'Not found' });
        if (populate) {
          item = await Model.findById(item._id).populate(populate);
        }
        res.json(item);
      } catch (err) {
        res.status(400).json({ message: 'Failed to update record', error: err.message });
      }
    },

    remove: async (req, res) => {
      try {
        const item = await Model.findOneAndDelete({ _id: req.params.id, owner: req.user.id });
        if (!item) return res.status(404).json({ message: 'Not found' });
        res.json({ message: 'Deleted' });
      } catch (err) {
        res.status(500).json({ message: 'Failed to delete record', error: err.message });
      }
    },
  };
}

module.exports = crudFactory;