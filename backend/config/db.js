const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 10000,
    });
    console.log(`MongoDB connected: ${conn.connection.host}`);
    // Sites only need to be unique per client. An older version of the app may have left a stricter rule in the
    // database (one site name for everyone), which blocks adding the same site under another client.
    // Re-syncing the site indexes removes any rule the app no longer asks for.
    require('../models/Site')
      .syncIndexes()
      .then((dropped) => {
        if (dropped && dropped.length) console.log('Removed old site indexes:', dropped.join(', '));
      })
      .catch((err) => console.error('Site index sync failed:', err.message));
  } catch (err) {
    console.error(`MongoDB connection error: ${err.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;