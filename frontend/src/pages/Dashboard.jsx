import { lazy, Suspense, useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from 'recharts';
import api from '../api/axios';
import { DashboardSkeleton } from '../components/Skeletons.jsx';
import StatCard from '../components/StatCard.jsx';
import OnboardingChecklist from '../components/OnboardingChecklist.jsx';
import { MapPin } from 'lucide-react';
import { formatKES } from '../utils/format.js';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

// the map (and its library) only downloads when you switch it on
const SitesMap = lazy(() => import('../components/SitesMap.jsx'));

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
  const [showMap, setShowMap] = useState(false);

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
  const pl = periodLabels[period];

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
        <button onClick={() => setShowMap((v) => !v)} className="btn-secondary flex items-center gap-1.5">
          <MapPin size={16} /> {showMap ? 'Hide Sites Map' : 'Show Sites Map'}
        </button>
      </div>

      {showMap && (
        <Suspense fallback={<div className="card text-sm text-slate-400">Loading map...</div>}>
          <SitesMap />
        </Suspense>
      )}

      {loading ? (
        <DashboardSkeleton />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            <StatCard label={`Expected (${pl})`} value={formatKES(cards.totalExpected)} />
            <StatCard label={`Paid (${pl})`} value={formatKES(cards.totalPaid)} accent="text-brand-600" />
            <StatCard label={`Outstanding (${pl})`} value={formatKES(cards.totalOutstanding)} accent="text-amber-600" />
            <StatCard
              label={`Expenses (${pl})`}
              value={formatKES(cards.totalExpenses)}
              accent="text-red-600"
              sub={`${formatKES(cards.expensesLogged)} logged + ${formatKES(cards.netVisitFares)} net visit fares`}
            />
            <StatCard
              label={`Net Income (${pl})`}
              value={formatKES(cards.netIncome)}
              accent={cards.netIncome >= 0 ? 'text-brand-600' : 'text-red-600'}
              sub="Paid minus expenses"
            />
            <StatCard
              label="Work Done, Not Paid"
              value={formatKES(cards.workCompletedNotPaid)}
              accent="text-red-600"
              sub="All time"
            />
            <StatCard label="Total Jobs" value={cards.totalJobs} sub="All time" />
            <StatCard label={`Callouts (${pl})`} value={cards.totalCallouts} />
            <StatCard label="Sites Visited" value={cards.sitesVisited} sub="All time" />
            <StatCard label="M-PESA Payments" value={cards.mpesaPayments} sub="All time" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card">
              <div className="font-semibold text-ink-900 mb-4">Monthly Expected vs Paid vs Expenses</div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={charts.monthly}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f6" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => formatKES(v)} />
                  <Legend />
                  <Bar dataKey="expected" fill="#aeeacd" name="Expected" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="paid" fill="#26a873" name="Paid" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expenses" fill="#f59e0b" name="Expenses" radius={[4, 4, 0, 0]} />
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
              <div className="font-semibold text-ink-900 mb-4">Expenses by Category ({pl})</div>
              {(charts.expensesByCategory || []).length === 0 ? (
                <div className="text-sm text-slate-400 py-16 text-center">No expenses logged for this period.</div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={charts.expensesByCategory} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef2f6" />
                    <XAxis type="number" tick={{ fontSize: 12 }} />
                    <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v) => formatKES(v)} />
                    <Bar dataKey="total" fill="#f59e0b" name="Spent" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
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