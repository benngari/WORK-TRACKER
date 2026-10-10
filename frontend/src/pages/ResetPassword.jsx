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