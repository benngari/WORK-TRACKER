const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const Settings = require('../models/Settings');
const { sendPasswordResetEmail } = require('../utils/email');

function signToken(user) {
  return jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
}

exports.register = async (req, res) => {
  try {
    if (process.env.ALLOW_SELF_REGISTER === 'false') {
      return res.status(403).json({ message: 'Registration is disabled on this deployment' });
    }

    if (req.body.website) {
      return res.status(400).json({ message: 'Registration failed' });
    }

    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required' });
    }
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ message: 'An account with this email already exists' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email: email.toLowerCase(), passwordHash });
    await Settings.create({ owner: user._id });

    const token = signToken(user);
    res.status(201).json({
      token,
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    res.status(500).json({ message: 'Registration failed', error: err.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    const token = signToken(user);
    res.json({ token, user: { id: user._id, name: user.name, email: user.email } });
  } catch (err) {
    res.status(500).json({ message: 'Login failed', error: err.message });
  }
};

exports.me = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-passwordHash');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch profile', error: err.message });
  }
};

// Always responds the same way whether or not the account exists, so this
// endpoint can't be used to check which emails are registered.
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (user) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
      user.resetPasswordToken = hashedToken;
      user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000);
      await user.save();

      const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${rawToken}`;
      try {
        await sendPasswordResetEmail(user.email, resetUrl);
      } catch (emailErr) {
        console.error('Failed to send reset email:', emailErr.message);
      }
    }

    res.json({ message: 'If an account with that email exists, a reset link has been sent.' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to process request', error: err.message });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: new Date() },
    });
    if (!user) {
      return res.status(400).json({ message: 'This reset link is invalid or has expired' });
    }
    user.passwordHash = await bcrypt.hash(password, 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();
    res.json({ message: 'Password has been reset. You can now sign in.' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to reset password', error: err.message });
  }
};