import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { TableSkeleton } from '../components/Skeletons.jsx';
import { SortTh, useSort } from '../components/SortHeader.jsx';
import { formatKES, formatDate, siteLabel } from '../utils/format.js';

export default function AttendanceHistory() {
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const load = () => {
    setLoading(true);
    const params = {};
    if (dateFrom) params.from = dateFrom;
    if (dateTo) params.to = dateTo;
    api.get('/attendance', { params }).then((res) => setRecords(res.data)).finally(() => setLoading(false));
  };

  useEffect(load, [dateFrom, dateTo]);

  const filtered = records.filter((r) => {
    if (!r.job || r.job.deletedAt) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.job?.client?.name?.toLowerCase().includes(q) ||
      siteLabel(r.job?.site).toLowerCase().includes(q) ||
      r.job?.jobCardRef?.toLowerCase().includes(q)
    );
  });

  const { sorted, sort, toggle } = useSort(filtered, 'date', 'desc', {
    date: (r) => (r.date ? new Date(r.date).getTime() : null),
    client: (r) => r.job?.client?.name,
    site: (r) => siteLabel(r.job?.site),
  });

  const th = 'py-2.5 px-4';

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap gap-3 items-center">
        <input className="input max-w-xs" placeholder="Search client, site, job card..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <input type="date" className="input max-w-xs" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <input type="date" className="input max-w-xs" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        <div className="text-sm text-slate-500 ml-auto">{sorted.length} visit(s)</div>
      </div>

      {loading ? (
        <TableSkeleton />
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 uppercase border-b border-slate-100">
                <SortTh label="Date Attended" k="date" sort={sort} onSort={toggle} firstDir="desc" className={th} />
                <SortTh label="Client" k="client" sort={sort} onSort={toggle} className={th} />
                <SortTh label="Site" k="site" sort={sort} onSort={toggle} className={th} />
                <SortTh label="Shift" k="shift" sort={sort} onSort={toggle} className={th} />
                <SortTh label="Rate" k="rate" sort={sort} onSort={toggle} firstDir="desc" className={th} />
                <SortTh label="Fare" k="fare" sort={sort} onSort={toggle} firstDir="desc" className={th} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r._id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/jobs/${r.job?._id}`)}>
                  <td className="py-2.5 px-4">{formatDate(r.date)}</td>
                  <td className="py-2.5 px-4 font-medium text-ink-900">{r.job?.client?.name}</td>
                  <td className="py-2.5 px-4 text-slate-600">{siteLabel(r.job?.site)}</td>
                  <td className="py-2.5 px-4 text-slate-600">{r.shift}</td>
                  <td className="py-2.5 px-4 text-slate-600">{formatKES(r.rate)}</td>
                  <td className="py-2.5 px-4 text-slate-600">{formatKES(r.fare)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sorted.length === 0 && <div className="text-center py-8 text-sm text-slate-400">No attendance records found.</div>}
        </div>
      )}
    </div>
  );
}