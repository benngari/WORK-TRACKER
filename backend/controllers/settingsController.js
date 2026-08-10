const Settings = require('../models/Settings');

exports.get = async (req, res) => {
  try {
    let settings = await Settings.findOne({ owner: req.user.id });
    if (!settings) settings = await Settings.create({ owner: req.user.id });
    res.json(settings);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch settings', error: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const settings = await Settings.findOneAndUpdate(
      { owner: req.user.id },
      req.body,
      { new: true, upsert: true, runValidators: true }
    );
    res.json(settings);
  } catch (err) {
    res.status(400).json({ message: 'Failed to update settings', error: err.message });
  }
};
