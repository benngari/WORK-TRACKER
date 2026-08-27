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

// Builds a small preview thumbnail from a Cloudinary URL. Works for both
// images and PDFs (Cloudinary can render a PDF's first page as an image),
// by inserting a transformation segment right after "/upload/".
export function getThumbnailUrl(url, { width = 300, height = 200 } = {}) {
  if (!url) return null;
  const transformation = `w_${width},h_${height},c_fill,f_auto,q_auto,pg_1`;
  if (url.includes('/upload/')) {
    return url.replace('/upload/', `/upload/${transformation}/`);
  }
  return url;
}