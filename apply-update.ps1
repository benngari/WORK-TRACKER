# ============================================================
# Work Tracker - update script
# Adds: Forgot/Reset Password (Resend), onboarding checklist,
# and a fix for new sites not appearing in the New Job dropdown.
#
# HOW TO RUN:
#   1. Open PowerShell in your work-tracker project ROOT folder
#      (the folder that contains both 'backend' and 'frontend').
#   2. Run:  powershell -ExecutionPolicy Bypass -File .\apply-update.ps1
# ============================================================

$ErrorActionPreference = "Stop"

if (-not (Test-Path ./backend) -or -not (Test-Path ./frontend)) {
    Write-Host "ERROR: Run this script from your work-tracker project root (the folder containing backend and frontend)." -ForegroundColor Red
    exit 1
}

function Write-FileUtf8NoBom {
    param([string]$Path, [string]$Content)
    $fullPath = Join-Path (Get-Location) $Path
    $dir = Split-Path -Path $fullPath -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($fullPath, $Content, $utf8NoBom)
    Write-Host ("  wrote " + $Path) -ForegroundColor Green
}

Write-Host "Applying update..." -ForegroundColor Cyan

$file1 = @'
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    resetPasswordToken: { type: String, default: null },
    resetPasswordExpires: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
'@
Write-FileUtf8NoBom -Path "backend/models/User.js" -Content $file1

$file2 = @'
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendPasswordResetEmail(to, resetUrl) {
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
    to,
    subject: 'Reset your Work Tracker password',
    html: `
      <p>Someone requested a password reset for your Work Tracker account.</p>
      <p><a href="${resetUrl}">Click here to reset your password</a></p>
      <p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
    `,
  });
}

module.exports = { sendPasswordResetEmail };
'@
Write-FileUtf8NoBom -Path "backend/utils/email.js" -Content $file2

$file3 = @'
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
'@
Write-FileUtf8NoBom -Path "backend/controllers/authController.js" -Content $file3

$file4 = @'
// Small helper to avoid repeating identical CRUD boilerplate across
// simple owner-scoped models (Client, Site, Transport, HistoricalRecord...).
function crudFactory(Model, { populate = null, sort = { createdAt: -1 } } = {}) {
  return {
    list: async (req, res) => {
      try {
        let query = Model.find({ owner: req.user.id }).sort(sort);
        if (populate) query = query.populate(populate);
        const items = await query;
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
'@
Write-FileUtf8NoBom -Path "backend/utils/crudFactory.js" -Content $file4

$file5 = @'
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/authController');
const auth = require('../middleware/auth');

router.post('/register', ctrl.register);
router.post('/login', ctrl.login);
router.get('/me', auth, ctrl.me);
router.post('/forgot-password', ctrl.forgotPassword);
router.post('/reset-password/:token', ctrl.resetPassword);

module.exports = router;
'@
Write-FileUtf8NoBom -Path "backend/routes/auth.js" -Content $file5

$file6 = @'
{
  "name": "work-tracker-backend",
  "version": "1.0.0",
  "description": "Personal Work, Job, Attendance & Payment Tracking System - Backend API",
  "main": "server.js",
  "type": "commonjs",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "cloudinary": "^1.41.3",
    "compression": "^1.7.4",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "jsonwebtoken": "^9.0.2",
    "mongoose": "^8.5.1",
    "multer": "^1.4.5-lts.1",
    "multer-storage-cloudinary": "^4.0.0",
    "resend": "^3.5.0"
  },
  "devDependencies": {
    "nodemon": "^3.1.4"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
'@
Write-FileUtf8NoBom -Path "backend/package.json" -Content $file6

$file7 = @'
# MongoDB Atlas connection string
MONGO_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/work-tracker?retryWrites=true&w=majority

# JWT secret - use a long random string
JWT_SECRET=change_this_to_a_long_random_secret

# Port (Render sets this automatically, but keep a local default)
PORT=5000

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Comma-separated list of allowed frontend origins (Vercel URL + localhost)
CLIENT_ORIGINS=http://localhost:5173,https://your-app.vercel.app

# Optional: create the very first account without an open registration route
ALLOW_SELF_REGISTER=true

# Resend (password reset emails)
RESEND_API_KEY=your_resend_api_key
RESEND_FROM_EMAIL=onboarding@resend.dev

# Your deployed frontend URL, used to build password reset links (no trailing slash)
FRONTEND_URL=https://your-app.vercel.app
'@
Write-FileUtf8NoBom -Path "backend/.env.example" -Content $file7

$file8 = @'
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

export default function Login() {
  const { login, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const res = await login(email, password);
    if (res.success) navigate('/');
    else setError(res.message);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-brand-500 flex items-center justify-center text-white mb-3">
            <Wallet size={22} />
          </div>
          <h1 className="text-xl font-bold text-ink-900">Work Tracker</h1>
          <p className="text-sm text-slate-500">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4">
          {error && <div className="text-sm bg-red-50 text-red-600 rounded-lg px-3 py-2">{error}</div>}
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              required
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label mb-0">Password</label>
              <Link to="/forgot-password" className="text-xs text-brand-600 font-medium">
                Forgot password?
              </Link>
            </div>
            <input
              type="password"
              required
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-sm text-slate-500 mt-4">
          No account yet?{' '}
          <Link to="/register" className="text-brand-600 font-medium">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
'@
Write-FileUtf8NoBom -Path "frontend/src/pages/Login.jsx" -Content $file8

$file9 = @'
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import api from '../api/axios';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-brand-500 flex items-center justify-center text-white mb-3">
            <Wallet size={22} />
          </div>
          <h1 className="text-xl font-bold text-ink-900">Work Tracker</h1>
          <p className="text-sm text-slate-500">Reset your password</p>
        </div>

        {sent ? (
          <div className="card text-sm text-slate-600">
            If an account with that email exists, we've sent a password reset link to it.
            Check your inbox (and spam folder) — the link expires in 1 hour.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="card space-y-4">
            {error && <div className="text-sm bg-red-50 text-red-600 rounded-lg px-3 py-2">{error}</div>}
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                required
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
          </form>
        )}

        <p className="text-center text-sm text-slate-500 mt-4">
          <Link to="/login" className="text-brand-600 font-medium">Back to Sign In</Link>
        </p>
      </div>
    </div>
  );
}
'@
Write-FileUtf8NoBom -Path "frontend/src/pages/ForgotPassword.jsx" -Content $file9

$file10 = @'
import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import api from '../api/axios';

export default function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await api.post(`/auth/reset-password/${token}`, { password });
      setDone(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-brand-500 flex items-center justify-center text-white mb-3">
            <Wallet size={22} />
          </div>
          <h1 className="text-xl font-bold text-ink-900">Work Tracker</h1>
          <p className="text-sm text-slate-500">Choose a new password</p>
        </div>

        {done ? (
          <div className="card text-sm text-brand-700 bg-brand-50">
            Password reset. Redirecting you to sign in...
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="card space-y-4">
            {error && <div className="text-sm bg-red-50 text-red-600 rounded-lg px-3 py-2">{error}</div>}
            <div>
              <label className="label">New Password</label>
              <input
                type="password"
                required
                minLength={6}
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Confirm New Password</label>
              <input
                type="password"
                required
                minLength={6}
                className="input"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Resetting...' : 'Reset Password'}
            </button>
          </form>
        )}

        <p className="text-center text-sm text-slate-500 mt-4">
          <Link to="/login" className="text-brand-600 font-medium">Back to Sign In</Link>
        </p>
      </div>
    </div>
  );
}
'@
Write-FileUtf8NoBom -Path "frontend/src/pages/ResetPassword.jsx" -Content $file10

$file11 = @'
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';

import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Clients from './pages/Clients.jsx';
import Sites from './pages/Sites.jsx';
import Jobs from './pages/Jobs.jsx';
import JobDetail from './pages/JobDetail.jsx';
import PaymentLedger from './pages/PaymentLedger.jsx';
import MpesaPayments from './pages/MpesaPayments.jsx';
import Outstanding from './pages/Outstanding.jsx';
import Documents from './pages/Documents.jsx';
import CalendarPage from './pages/Calendar.jsx';
import Reports from './pages/Reports.jsx';
import HistoricalRecords from './pages/HistoricalRecords.jsx';
import SettingsPage from './pages/Settings.jsx';
import AttendanceHistory from './pages/AttendanceHistory.jsx';
import Trash from './pages/Trash.jsx';

function PrivateRoute({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password/:token" element={<ResetPassword />} />

      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="clients" element={<Clients />} />
        <Route path="sites" element={<Sites />} />
        <Route path="jobs" element={<Jobs />} />
        <Route path="jobs/:id" element={<JobDetail />} />
        <Route path="attendance" element={<AttendanceHistory />} />
        <Route path="ledger" element={<PaymentLedger />} />
        <Route path="mpesa" element={<MpesaPayments />} />
        <Route path="outstanding" element={<Outstanding />} />
        <Route path="documents" element={<Documents />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="reports" element={<Reports />} />
        <Route path="historical" element={<HistoricalRecords />} />
        <Route path="trash" element={<Trash />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
'@
Write-FileUtf8NoBom -Path "frontend/src/App.jsx" -Content $file11

$file12 = @'
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle } from 'lucide-react';
import api from '../api/axios';

export default function OnboardingChecklist() {
  const [counts, setCounts] = useState(null);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem('wt_onboarding_dismissed') === 'true');

  useEffect(() => {
    if (dismissed) return;
    Promise.all([api.get('/clients'), api.get('/sites'), api.get('/jobs'), api.get('/payments')])
      .then(([c, s, j, p]) => {
        setCounts({
          clients: c.data.length,
          sites: s.data.length,
          jobs: j.data.length,
          payments: p.data.length,
        });
      })
      .catch(() => {});
  }, [dismissed]);

  if (dismissed || !counts) return null;

  const steps = [
    { label: 'Add your first client', done: counts.clients > 0, to: '/clients' },
    { label: 'Add a site or location', done: counts.sites > 0, to: '/sites' },
    { label: 'Log a job', done: counts.jobs > 0, to: '/jobs' },
    { label: 'Record a payment', done: counts.payments > 0, to: '/mpesa' },
  ];

  const allDone = steps.every((s) => s.done);
  if (allDone) return null; // stop showing once fully set up

  const handleDismiss = () => {
    localStorage.setItem('wt_onboarding_dismissed', 'true');
    setDismissed(true);
  };

  return (
    <div className="card bg-brand-50 border-brand-100">
      <div className="flex items-center justify-between mb-3">
        <div className="font-semibold text-ink-900 text-sm">Getting Started</div>
        <button onClick={handleDismiss} className="text-xs text-slate-400 hover:text-slate-600">Dismiss</button>
      </div>
      <div className="space-y-2">
        {steps.map((s) => (
          <Link key={s.label} to={s.to} className="flex items-center gap-2 text-sm hover:underline">
            {s.done ? <CheckCircle2 size={16} className="text-brand-600" /> : <Circle size={16} className="text-slate-300" />}
            <span className={s.done ? 'text-slate-400 line-through' : 'text-ink-800'}>{s.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
'@
Write-FileUtf8NoBom -Path "frontend/src/components/OnboardingChecklist.jsx" -Content $file12

$file13 = @'
import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from 'recharts';
import api from '../api/axios';
import StatCard from '../components/StatCard.jsx';
import OnboardingChecklist from '../components/OnboardingChecklist.jsx';
import { formatKES } from '../utils/format.js';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const COLORS = ['#26a873', '#7ad9ae', '#48c28c', '#146d4c', '#aeeacd', '#18885d'];

const periodLabels = {
  all: 'All Time',
  week: 'This Week',
  month: 'This Month',
  year: 'This Year',
};

export default function Dashboard() {
  const [period, setPeriod] = useState('all');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    api
      .get('/dashboard/summary', { params: { period } })
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.message || 'Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, [period]);

  if (error) return <div className="text-red-500 text-sm">{error}</div>;

  const { cards, charts } = data || { cards: {}, charts: {} };

  return (
    <div className="space-y-6">
      <OnboardingChecklist />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <Tabs value={period} onValueChange={setPeriod}>
          <TabsList>
            <TabsTrigger value="all">All Time</TabsTrigger>
            <TabsTrigger value="year">This Year</TabsTrigger>
            <TabsTrigger value="month">This Month</TabsTrigger>
            <TabsTrigger value="week">This Week</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {loading ? (
        <div className="text-slate-400 text-sm">Loading dashboard...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            <StatCard label={`Expected (${periodLabels[period]})`} value={formatKES(cards.totalExpected)} />
            <StatCard label={`Paid (${periodLabels[period]})`} value={formatKES(cards.totalPaid)} accent="text-brand-600" />
            <StatCard label={`Outstanding (${periodLabels[period]})`} value={formatKES(cards.totalOutstanding)} accent="text-amber-600" />
            <StatCard
              label="Work Done, Not Paid"
              value={formatKES(cards.workCompletedNotPaid)}
              accent="text-red-600"
              sub="All time"
            />
            <StatCard label="Total Jobs" value={cards.totalJobs} sub="All time" />
            <StatCard label={`Callouts (${periodLabels[period]})`} value={cards.totalCallouts} />
            <StatCard label="Sites Visited" value={cards.sitesVisited} sub="All time" />
            <StatCard label="M-PESA Payments" value={cards.mpesaPayments} sub="All time" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card">
              <div className="font-semibold text-ink-900 mb-4">Monthly Expected vs Paid</div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={charts.monthly}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f6" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => formatKES(v)} />
                  <Legend />
                  <Bar dataKey="expected" fill="#aeeacd" name="Expected" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="paid" fill="#26a873" name="Paid" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card">
              <div className="font-semibold text-ink-900 mb-4">Callouts by Month</div>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={charts.monthly}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f6" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="callouts" stroke="#18885d" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="card">
              <div className="font-semibold text-ink-900 mb-4">Earnings by Client (All Time)</div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={charts.byClient} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef2f6" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => formatKES(v)} />
                  <Bar dataKey="paid" fill="#26a873" name="Paid" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card">
              <div className="font-semibold text-ink-900 mb-4">Nairobi vs Outside Nairobi (Fare, All Time)</div>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={charts.nairobiVsOutside}
                    dataKey="total"
                    nameKey="zone"
                    outerRadius={90}
                    label={(entry) => `${entry.zone}: ${formatKES(entry.total)}`}
                  >
                    {(charts.nairobiVsOutside || []).map((entry, i) => (
                      <Cell key={entry.zone} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => formatKES(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
'@
Write-FileUtf8NoBom -Path "frontend/src/pages/Dashboard.jsx" -Content $file13

Write-Host "" 
Write-Host "Done - all files written." -ForegroundColor Cyan
Write-Host "Next:  git add .   then   git commit -m `"Add password reset, onboarding checklist, site dropdown fix`"   then   git push" -ForegroundColor Yellow
