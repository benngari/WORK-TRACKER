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
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Africa/Nairobi' });
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

// datetime-local helpers: values are always treated as East Africa Time (UTC+3)
const EAT_MS = 3 * 60 * 60 * 1000;

export function toNairobiInput(date) {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d)) return '';
  return new Date(d.getTime() + EAT_MS).toISOString().slice(0, 16);
}

export function fromNairobiInput(value) {
  if (!value) return null;
  const d = new Date(value + ':00+03:00');
  return isNaN(d) ? null : d.toISOString();
}