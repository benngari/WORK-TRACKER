import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from 'recharts';
import api from '../api/axios';
import StatCard from '../components/StatCard.jsx';
import { formatKES } from '../utils/format.js';

const COLORS = ['#26a873', '#7ad9ae', '#48c28c', '#146d4c', '#aeeacd', '#18885d'];

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/dashboard/summary')
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.message || 'Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-slate-400 text-sm">Loading dashboard...</div>;
  if (error) return <div className="text-red-500 text-sm">{error}</div>;
  if (!data) return null;

  const { cards, charts } = data;

  return (
    <div className="space-y-6">
      {/* Top summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        <StatCard label="Total Expected" value={formatKES(cards.totalExpected)} />
        <StatCard label="Total Paid" value={formatKES(cards.totalPaid)} accent="text-brand-600" />
        <StatCard label="Total Outstanding" value={formatKES(cards.totalOutstanding)} accent="text-amber-600" />
        <StatCard
          label="Work Done, Not Paid"
          value={formatKES(cards.workCompletedNotPaid)}
          accent="text-red-600"
        />
        <StatCard label="Total Jobs" value={cards.totalJobs} />
        <StatCard label="Total Callouts" value={cards.totalCallouts} />
        <StatCard label="Sites Visited" value={cards.sitesVisited} />
        <StatCard label="M-PESA Payments" value={cards.mpesaPayments} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Monthly expected vs paid */}
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

        {/* Callouts by month */}
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

        {/* Earnings by client */}
        <div className="card">
          <div className="font-semibold text-ink-900 mb-4">Earnings by Client</div>
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

        {/* Nairobi vs outside */}
        <div className="card">
          <div className="font-semibold text-ink-900 mb-4">Nairobi vs Outside Nairobi (Fare)</div>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={charts.nairobiVsOutside}
                dataKey="total"
                nameKey="zone"
                outerRadius={90}
                label={(entry) => `${entry.zone}: ${formatKES(entry.total)}`}
              >
                {charts.nairobiVsOutside.map((entry, i) => (
                  <Cell key={entry.zone} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => formatKES(v)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
