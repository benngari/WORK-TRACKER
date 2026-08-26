function crudFactory(Model, { populate = null, sort = { createdAt: -1 } } = {}) {
  return {
    list: async (req, res) => {
      try {
        let query = Model.find({ owner: req.user.id }).sort(sort).lean();
        if (populate) query = query.populate(populate);
        const items = await query;
        res.json(items);
      } catch (err) {
        res.status(500).json({ message: 'Failed to fetch records', error: err.message });
      }
    },

    getOne: async (req, res) => {
      try {
        let query = Model.findOne({ _id: req.params.id, owner: req.user.id }).lean();
        if (populate) query = query.populate(populate);
        const item = await query;
        if (!item) return res.status(404).json({ message: 'Not found' });
        res.json(item);
      } catch (err) {
        res.status(500).json({ message: 'Failed to fetch record', error: err.message });
      }
    },

    create: async (req, res) => {
      try {
        const item = await Model.create({ ...req.body, owner: req.user.id });
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
        const item = await Model.findOneAndUpdate(
          { _id: req.params.id, owner: req.user.id },
          req.body,
          { new: true, runValidators: true }
        );
        if (!item) return res.status(404).json({ message: 'Not found' });
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