import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Download } from 'lucide-react';
import api from '../api/axios';
import StatusBadge from '../components/StatusBadge.jsx';
import { SortTh, useSort } from '../components/SortHeader.jsx';
import { formatKES, formatDate } from '../utils/format.js';
import { downloadCSV } from '../utils/exportCsv.js';

const time = (d) => (d ? new Date(d).getTime() : null);

export default function Outstanding() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  // No default column: starts in the server order (overdue first, biggest first)
  const { sorted, sort, toggle } = useSort(rows, null, 'desc', {
    lastAttendance: (r) => time(r.lastAttendance),
    paymentDueDate: (r) => time(r.paymentDueDate),
  });

  useEffect(() => {
    api.get('/reports/outstanding').then((res) => setRows(res.data)).finally(() => setLoading(false));
  }, []);

  const total = rows.reduce((s, r) => s + r.outstanding, 0);
  const overdueCount = rows.filter((r) => r.isOverdue).length;
  const overdueTotal = rows.filter((r) => r.isOverdue).reduce((s, r) => s + r.outstanding, 0);

  const handleExportCSV = () => {
    const headers = ['Client', 'Site', 'Job Card', 'Expected', 'Paid', 'Outstanding', 'Last Attendance', 'Payment Due Date', 'Days Outstanding', 'Overdue', 'Status'];
    const csvRows = sorted.map((r) => [
      r.client || '',
      r.site || '',
      r.jobCardRef || '',
      r.expected,
      r.paid,
      r.outstanding,
      formatDate(r.lastAttendance),
      formatDate(r.paymentDueDate),
      r.daysOutstanding ?? '',
      r.isOverdue ? 'Yes' : 'No',
      r.status,
    ]);
    downloadCSV(`outstanding-payments-${new Date().toISOString().slice(0, 10)}.csv`, headers, csvRows);
  };

  const th = 'py-2.5 px-4';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 no-print flex-wrap">
        <div className="card bg-amber-50 border-amber-100 flex items-center gap-3 flex-1 min-w-[220px]">
          <AlertCircle className="text-amber-500" />
          <div>
            <div className="text-xs text-amber-700 uppercase font-semibold">Total Owed To Me</div>
            <div className="text-2xl font-bold text-amber-700">{formatKES(total)}</div>
          </div>
        </div>
        {overdueCount > 0 && (
          <div className="card bg-red-50 border-red-100 flex items-center gap-3 flex-1 min-w-[220px]">
            <AlertCircle className="text-red-500" />
            <div>
              <div className="text-xs text-red-700 uppercase font-semibold">Overdue ({overdueCount})</div>
              <div className="text-2xl font-bold text-red-700">{formatKES(overdueTotal)}</div>
            </div>
          </div>
        )}
        <button onClick={handleExportCSV} className="btn-secondary flex items-center gap-1.5">
          <Download size={15} /> Export CSV
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-slate-400">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="card text-center py-10 text-slate-400">Nothing outstanding - all caught up.</div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 uppercase border-b border-slate-100">
                <SortTh label="Client" k="client" sort={sort} onSort={toggle} className={th} />
                <SortTh label="Site" k="site" sort={sort} onSort={toggle} className={th} />
                <th className={th}>Job</th>
                <SortTh label="Expected" k="expected" sort={sort} onSort={toggle} firstDir="desc" className={th} />
                <SortTh label="Paid" k="paid" sort={sort} onSort={toggle} firstDir="desc" className={th} />
                <SortTh label="Outstanding" k="outstanding" sort={sort} onSort={toggle} firstDir="desc" className={th} />
                <SortTh label="Last Attendance" k="lastAttendance" sort={sort} onSort={toggle} firstDir="desc" className={th} />
                <SortTh label="Due Date" k="paymentDueDate" sort={sort} onSort={toggle} className={th} />
                <SortTh label="Status" k="status" sort={sort} onSort={toggle} className={th} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr
                  key={r.jobId}
                  className={`border-b border-slate-50 last:border-0 hover:bg-slate-50 cursor-pointer ${
                    r.isOverdue ? 'bg-red-50/50' : ''
                  }`}
                  onClick={() => navigate(`/jobs/${r.jobId}`)}
                >
                  <td className="py-2.5 px-4 font-medium text-ink-900">{r.client}</td>
                  <td className="py-2.5 px-4 text-slate-600">{r.site}</td>
                  <td className="py-2.5 px-4 text-slate-600">{r.jobCardRef || '-'}</td>
                  <td className="py-2.5 px-4">{formatKES(r.expected)}</td>
                  <td className="py-2.5 px-4">{formatKES(r.paid)}</td>
                  <td className="py-2.5 px-4 font-semibold text-red-600">{formatKES(r.outstanding)}</td>
                  <td className="py-2.5 px-4 text-slate-600">{formatDate(r.lastAttendance)}</td>
                  <td className="py-2.5 px-4">
                    {r.isOverdue ? (
                      <span className="text-red-600 font-medium">{formatDate(r.paymentDueDate)} - Overdue</span>
                    ) : (
                      <span className="text-slate-600">{formatDate(r.paymentDueDate)}</span>
                    )}
                  </td>
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