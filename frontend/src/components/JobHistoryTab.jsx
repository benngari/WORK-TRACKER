import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, History } from 'lucide-react';
import api from '../api/axios';

const TYPE_STYLES = {
  create: 'bg-green-50 text-green-700',
  update: 'bg-blue-50 text-blue-700',
  delete: 'bg-red-50 text-red-700',
  auth: 'bg-purple-50 text-purple-700',
  other: 'bg-slate-100 text-slate-600',
};
const TYPE_LABELS = { create: 'Added', update: 'Changed', delete: 'Deleted', auth: 'Account', other: 'Other' };

const formatWhen = (value) => {
  const d = new Date(value);
  if (isNaN(d)) return '-';
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi',
  });
};

const show = (v) => {
  if (v === null || v === undefined || v === '') return '(empty)';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

function Pairs({ data }) {
  return (
    <div className="space-y-1">
      {Object.entries(data || {}).map(([k, v]) => (
        <div key={k} className="text-xs flex gap-2">
          <span className="text-slate-400 min-w-[100px]">{k}</span>
          <span className="text-slate-700 break-all">{show(v)}</span>
        </div>
      ))}
    </div>
  );
}

function Detail({ log }) {
  const d = log.details || {};
  if (!d.changes && !d.fields && !d.snapshot) return <div className="text-xs text-slate-400">No extra details were kept for this one.</div>;
  return (
    <div className="space-y-2">
      {d.changes && (
        <div className="space-y-1">
          <div className="text-xs font-semibold text-slate-500">What changed</div>
          {Object.entries(d.changes).map(([k, c]) => (
            <div key={k} className="text-xs flex gap-2 flex-wrap">
              <span className="text-slate-400 min-w-[100px]">{k}</span>
              <span className="text-red-600 line-through break-all">{show(c.from)}</span>
              <span className="text-slate-400">{'->'}</span>
              <span className="text-green-700 break-all">{show(c.to)}</span>
            </div>
          ))}
        </div>
      )}
      {d.fields && (
        <div>
          <div className="text-xs font-semibold text-slate-500 mb-1">Details entered</div>
          <Pairs data={d.fields} />
        </div>
      )}
      {d.snapshot && (
        <div>
          <div className="text-xs font-semibold text-slate-500 mb-1">What was removed</div>
          <Pairs data={d.snapshot} />
        </div>
      )}
    </div>
  );
}

// Everything that was done on this job - added, changed or removed - newest first, from the Audit Log.
export default function JobHistoryTab({ job }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);

  useEffect(() => {
    setLoading(true);
    api
      .get(`/audit/job/${job._id}`)
      .then((res) => {
        setLogs(res.data);
        setError('');
      })
      .catch((err) => setError(err.response?.data?.message || 'Failed to load the history'))
      .finally(() => setLoading(false));
  }, [job._id]);

  if (loading) return <div className="text-sm text-slate-400">Loading...</div>;
  if (error) return <div className="text-sm bg-red-50 text-red-600 rounded-lg px-3 py-2">{error}</div>;

  if (logs.length === 0) {
    return (
      <div className="card text-center py-10 text-slate-400">
        <History className="mx-auto mb-2" />
        No history for this job yet. Changes you make from now on will be listed here.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-sm text-slate-500">Newest first. Tap an item to see exactly what changed.</div>
      <div className="card divide-y divide-slate-50 p-0">
        {logs.map((log) => {
          const isOpen = open === log._id;
          return (
            <div key={log._id}>
              <button type="button" onClick={() => setOpen(isOpen ? null : log._id)} className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-slate-50">
                <span className="mt-0.5 text-slate-400">{isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</span>
                <span className="flex-1">
                  <span className="block text-sm text-ink-900">{log.action}</span>
                  <span className="block text-xs text-slate-400">{formatWhen(log.createdAt)}</span>
                </span>
                <span className={`text-xs font-medium rounded-full px-2 py-0.5 whitespace-nowrap ${TYPE_STYLES[log.type] || TYPE_STYLES.other}`}>
                  {TYPE_LABELS[log.type] || 'Other'}
                </span>
              </button>
              {isOpen && (
                <div className="px-4 pb-3 pl-11">
                  <Detail log={log} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}