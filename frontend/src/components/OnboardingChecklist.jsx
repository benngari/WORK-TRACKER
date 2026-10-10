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