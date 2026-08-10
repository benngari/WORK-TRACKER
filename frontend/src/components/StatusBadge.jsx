const styles = {
  Pending: 'bg-amber-50 text-amber-700',
  'Partially Paid': 'bg-blue-50 text-blue-700',
  Paid: 'bg-brand-50 text-brand-700',
  Overpaid: 'bg-purple-50 text-purple-700',
  Unmatched: 'bg-red-50 text-red-700',
  Open: 'bg-slate-100 text-slate-600',
  'In Progress': 'bg-blue-50 text-blue-700',
  Completed: 'bg-brand-50 text-brand-700',
  Cancelled: 'bg-red-50 text-red-700',
};

export default function StatusBadge({ status }) {
  return <span className={`badge ${styles[status] || 'bg-slate-100 text-slate-600'}`}>{status}</span>;
}
