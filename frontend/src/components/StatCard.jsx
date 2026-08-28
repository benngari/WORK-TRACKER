export default function StatCard({ label, value, accent = 'text-ink-900', sub }) {
  return (
    <div className="card">
      <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
        {label}
      </div>
      <div className={`text-2xl font-bold ${accent}`}>{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}