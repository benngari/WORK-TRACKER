export function formatKES(amount) {
  const n = Number(amount) || 0;
  return `KES ${n.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function formatDate(date) {
  if (!date) return '-';
  const d = new Date(date);
  if (isNaN(d)) return '-';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function siteLabel(site) {
  if (!site) return '-';
  if (site.siteType === 'Bank') return [site.bankName, site.branch].filter(Boolean).join(' - ');
  return site.siteName || '-';
}
