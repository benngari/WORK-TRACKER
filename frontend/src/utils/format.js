export function getCurrency() {
  return localStorage.getItem('wt_currency') || 'KES';
}

export function setCurrency(code) {
  localStorage.setItem('wt_currency', code || 'KES');
}

export function formatKES(amount) {
  const n = Number(amount) || 0;
  const currency = getCurrency();
  return `${currency} ${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
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

export function getThumbnailUrl(url, { width = 300, height = 200 } = {}) {
  if (!url) return null;
  const transformation = `w_${width},h_${height},c_fill,f_auto,q_auto,pg_1`;
  if (url.includes('/upload/')) {
    return url.replace('/upload/', `/upload/${transformation}/`);
  }
  return url;
}