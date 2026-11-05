import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, CheckCircle2, MapPin, AlertTriangle, Wallet } from 'lucide-react';
import api from '../api/axios';
import { useToast } from '../context/ToastContext.jsx';
import { TableSkeleton } from '../components/Skeletons.jsx';
import { formatKES, formatDate, siteLabel } from '../utils/format.js';

const OVERDUE_DAYS = 60;
const SHOW_FIRST = 8;

const daysSince = (date) => (date ? Math.floor((Date.now() - new Date(date).getTime()) / 86400000) : 0);

// "-1.2921, 36.8219" (copied from Google Maps) -> latitude and longitude
const parseCoords = (text) => {
  const m = String(text || '').match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/);
  return m ? { latitude: Number(m[1]), longitude: Number(m[2]) } : null;
};

function Section({ icon: Icon, title, hint, count, children, tone = 'amber' }) {
  const [all, setAll] = useState(false);
  const items = Array.isArray(children) ? children : [children];
  const shown = all ? items : items.slice(0, SHOW_FIRST);
  return (
    <div className="card space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Icon size={18} className="text-brand-600 mt-0.5" />
          <div>
            <div className="font-semibold text-ink-900">{title}</div>
            <div className="text-xs text-slate-400">{hint}</div>
          </div>
        </div>
        {count === 0 ? (
          <span className="flex items-center gap-1 text-xs rounded-full bg-green-50 text-green-700 px-2.5 py-1 whitespace-nowrap">
            <CheckCircle2 size={13} /> All clear
          </span>
        ) : (
          <span className={`text-xs rounded-full px-2.5 py-1 whitespace-nowrap ${tone === 'red' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'}`}>
            {count} to check
          </span>
        )}
      </div>
      {count > 0 && <div className="divide-y divide-slate-50">{shown}</div>}
      {count > SHOW_FIRST && (
        <button type="button" onClick={() => setAll((v) => !v)} className="text-sm text-brand-600 hover:text-brand-700 font-medium">
          {all ? 'Show fewer' : `Show all ${count}`}
        </button>
      )}
    </div>
  );
}

function SiteRow({ site, onSaved }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const parsed = parseCoords(text);
    if (!parsed) {
      setError('Paste the two numbers from Google Maps, like -1.2921, 36.8219');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.put(`/sites/${site._id}`, parsed);
      toast.success('Coordinates saved');
      onSaved(site._id, parsed);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="py-2.5 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm text-ink-900">{siteLabel(site)}</div>
          <div className="text-xs text-slate-400">
            {(site.client && site.client.name) || ''}
            {[site.town, site.county].filter(Boolean).length ? ` | ${[site.town, site.county].filter(Boolean).join(', ')}` : ''}
          </div>
        </div>
        {!open && (
          <button type="button" onClick={() => setOpen(true)} className="text-sm text-brand-600 hover:text-brand-700 font-medium">
            Add coordinates
          </button>
        )}
      </div>
      {open && (
        <div className="space-y-2">
          <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. -1.2921, 36.8219" />
          {error && <div className="text-xs text-red-600">{error}</div>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary flex-1">Cancel</button>
            <button type="button" onClick={save} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// One page that points out what needs attention: missing site coordinates, money owed for a long time, and payments not matched to a job.
export default function DataHealth() {
  const [sites, setSites] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.get('/sites'), api.get('/jobs'), api.get('/payments')])
      .then(([s, j, p]) => {
        setSites(s.data);
        setJobs(j.data);
        setPayments(p.data);
      })
      .catch((err) => setError(err.response?.data?.message || 'Failed to check your data'))
      .finally(() => setLoading(false));
  }, []);

  const noCoords = useMemo(() => sites.filter((s) => s.latitude == null || s.longitude == null), [sites]);

  const overdue = useMemo(
    () =>
      jobs
        .filter((j) => (j.outstanding || 0) > 0 && j.status !== 'Cancelled')
        .map((j) => ({ job: j, since: j.lastVisit || j.firstVisit || j.createdAt }))
        .map((x) => ({ ...x, days: daysSince(x.since) }))
        .filter((x) => x.days >= OVERDUE_DAYS)
        .sort((a, b) => b.days - a.days),
    [jobs]
  );

  const unmatched = useMemo(() => payments.filter((p) => (p.unallocated || 0) > 0), [payments]);

  const handleSiteSaved = (id, coords) =>
    setSites((list) => list.map((s) => (s._id === id ? { ...s, ...coords } : s)));

  const issues = noCoords.length + overdue.length + unmatched.length;

  return (
    <div className="space-y-4">
      <div className="card flex items-center gap-3">
        <Activity className={issues === 0 && !loading ? 'text-green-600' : 'text-amber-500'} />
        <div>
          <div className="font-semibold text-ink-900">
            {loading ? 'Checking your data...' : issues === 0 ? 'Everything looks good' : `${issues} thing${issues > 1 ? 's' : ''} to check`}
          </div>
          <div className="text-xs text-slate-400">Missing site coordinates, money owed for {OVERDUE_DAYS}+ days, and payments not yet matched to a job.</div>
        </div>
      </div>

      {error && <div className="text-sm bg-red-50 text-red-600 rounded-lg px-3 py-2">{error}</div>}

      {loading ? (
        <TableSkeleton rows={4} />
      ) : (
        <>
          <Section
            icon={Wallet}
            tone="red"
            title={`Unpaid for ${OVERDUE_DAYS} days or more`}
            hint="Jobs with a balance remaining, counted from the last visit."
            count={overdue.length}
          >
            {overdue.map(({ job, days }) => (
              <Link key={job._id} to={`/jobs/${job._id}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5 hover:bg-slate-50 rounded-lg px-1">
                <div>
                  <div className="text-sm text-ink-900">{(job.client && job.client.name) || ''} - {siteLabel(job.site)}</div>
                  <div className="text-xs text-slate-400">Last visit {formatDate(job.lastVisit || job.firstVisit || job.createdAt)}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-amber-600">{formatKES(job.outstanding)}</div>
                  <div className="text-xs text-red-600">{days} days</div>
                </div>
              </Link>
            ))}
          </Section>

          <Section
            icon={AlertTriangle}
            title="Payments not yet matched to a job"
            hint="Money you received that is not fully allocated to jobs."
            count={unmatched.length}
          >
            {unmatched.map((p) => (
              <Link key={p._id} to="/mpesa" className="flex flex-wrap items-center justify-between gap-2 py-2.5 hover:bg-slate-50 rounded-lg px-1">
                <div>
                  <div className="text-sm text-ink-900">
                    {p.mpesaTransaction && p.mpesaTransaction.transactionCode ? p.mpesaTransaction.transactionCode : p.method}
                    {p.mpesaTransaction && p.mpesaTransaction.sender ? ` - ${p.mpesaTransaction.sender}` : ''}
                  </div>
                  <div className="text-xs text-slate-400">Received {formatDate(p.receivedDate)}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-amber-600">{formatKES(p.unallocated)} unmatched</div>
                  <div className="text-xs text-slate-400">of {formatKES(p.amount)}</div>
                </div>
              </Link>
            ))}
          </Section>

          <Section
            icon={MapPin}
            title="Sites with no map coordinates"
            hint="Add them to see exact pins on the Sites Map and open directions."
            count={noCoords.length}
          >
            {noCoords.map((s) => (
              <SiteRow key={s._id} site={s} onSaved={handleSiteSaved} />
            ))}
          </Section>
        </>
      )}
    </div>
  );
}