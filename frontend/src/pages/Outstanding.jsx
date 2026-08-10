import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import api from '../api/axios';
import StatusBadge from '../components/StatusBadge.jsx';
import { formatKES, formatDate } from '../utils/format.js';

export default function Outstanding() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/reports/outstanding').then((res) => setRows(res.data)).finally(() => setLoading(false));
  }, []);

  const total = rows.reduce((s, r) => s + r.outstanding, 0);

  return (
    <div className="space-y-4">
      <div className="card bg-amber-50 border-amber-100 flex items-center gap-3">
        <AlertCircle className="text-amber-500" />
        <div>
          <div className="text-xs text-amber-700 uppercase font-semibold">Total Owed To Me</div>
          <div className="text-2xl font-bold text-amber-700">{formatKES(total)}</div>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-slate-400">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="card text-center py-10 text-slate-400">Nothing outstanding — all caught up.</div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 uppercase border-b border-slate-100">
                <th className="py-2.5 px-4">Client</th>
                <th className="py-2.5 px-4">Site</th>
                <th className="py-2.5 px-4">Job</th>
                <th className="py-2.5 px-4">Expected</th>
                <th className="py-2.5 px-4">Paid</th>
                <th className="py-2.5 px-4">Outstanding</th>
                <th className="py-2.5 px-4">Last Attendance</th>
                <th className="py-2.5 px-4">Days Outstanding</th>
                <th className="py-2.5 px-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.jobId} className="border-b border-slate-50 last:border-0 hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/jobs/${r.jobId}`)}>
                  <td className="py-2.5 px-4 font-medium text-ink-900">{r.client}</td>
                  <td className="py-2.5 px-4 text-slate-600">{r.site}</td>
                  <td className="py-2.5 px-4 text-slate-600">{r.jobCardRef || '-'}</td>
                  <td className="py-2.5 px-4">{formatKES(r.expected)}</td>
                  <td className="py-2.5 px-4">{formatKES(r.paid)}</td>
                  <td className="py-2.5 px-4 font-semibold text-red-600">{formatKES(r.outstanding)}</td>
                  <td className="py-2.5 px-4 text-slate-600">{formatDate(r.lastAttendance)}</td>
                  <td className="py-2.5 px-4 text-slate-600">{r.daysOutstanding ?? '-'}</td>
                  <td className="py-2.5 px-4"><StatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
