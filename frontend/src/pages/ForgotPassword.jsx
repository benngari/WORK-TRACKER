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
            Check your inbox (and spam folder) â€” the link expires in 1 hour.
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