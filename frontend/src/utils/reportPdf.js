// Builds the Payment Ledger and Paid and Balance reports as real, downloadable PDFs.
// The PDF libraries are loaded on demand, so they only download when someone exports.
const GREEN = [24, 136, 93];
const DARK = [30, 41, 55];
const STATUS_COLOURS = {
  Paid: [20, 109, 76],
  Pending: [180, 83, 9],
  'Partially Paid': [29, 78, 216],
  Overpaid: [126, 34, 206],
  Unmatched: [185, 28, 28],
};

const fmtDate = (d) => {
  const x = new Date(d);
  if (!d || isNaN(x)) return '-';
  return x.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Africa/Nairobi' });
};

const money = (n) => `KES ${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

async function loadLibs() {
  const pdfMod = await import('jspdf');
  const jsPDF = pdfMod.jsPDF || (pdfMod.default && pdfMod.default.jsPDF) || pdfMod.default;
  const tableMod = await import('jspdf-autotable');
  // The plugin exposes its function differently depending on the bundler, so pick whichever is callable.
  const autoTable = [tableMod.default, tableMod.default && tableMod.default.default, tableMod.autoTable, tableMod.default && tableMod.default.autoTable].find(
    (f) => typeof f === 'function'
  );
  return { jsPDF, autoTable };
}

function header(doc, { title, subtitle, lines }) {
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFillColor(...GREEN);
  doc.rect(0, 0, pageW, 78, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(title, 40, 36);
  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'normal');
  doc.text(subtitle, 40, 58, { maxWidth: pageW - 260 });
  doc.setFontSize(9);
  lines.forEach((line, i) => doc.text(line, pageW - 40, 34 + i * 16, { align: 'right' }));
}

function footers(doc) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text('Generated with Work Tracker', 40, pageH - 20);
    doc.text(`Page ${i} of ${pages}`, pageW - 40, pageH - 20, { align: 'right' });
  }
}

const baseTable = {
  margin: { left: 40, right: 40, bottom: 40 },
  theme: 'grid',
  styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 4.5, textColor: DARK, lineColor: [226, 232, 240], lineWidth: 0.5, overflow: 'linebreak' },
  headStyles: { fillColor: GREEN, textColor: 255, fontStyle: 'bold' },
  alternateRowStyles: { fillColor: [247, 250, 252] },
  footStyles: { fillColor: [238, 252, 246], textColor: [20, 109, 76], fontStyle: 'bold' },
  showFoot: 'lastPage',
  rowPageBreak: 'avoid',
};

function summaryTable(doc, autoTable, startY, cards) {
  autoTable(doc, {
    ...baseTable,
    startY,
    head: [cards.map((c) => c.label)],
    body: [cards.map((c) => c.value)],
    headStyles: { fillColor: [238, 252, 246], textColor: [20, 109, 76], fontStyle: 'bold', halign: 'center', fontSize: 8 },
    bodyStyles: { halign: 'center', fontStyle: 'bold', fontSize: 12, cellPadding: 8 },
    alternateRowStyles: {},
  });
  return doc.lastAutoTable.finalY;
}

// when the money arrived: the dates written in the payment messages (latest first line, a few shown)
const paidOnText = (r) => {
  const dates = (r.paidDates || []).map((p) => p.date);
  if (dates.length === 0) return r.paidOn ? fmtDate(r.paidOn) : '-';
  const shown = dates.slice(0, 3).map(fmtDate);
  if (dates.length > 3) shown.push(`+${dates.length - 3} more`);
  return shown.join('\n');
};

export async function buildLedgerPdf({ rows, filtersText, groupByClient }) {
  const { jsPDF, autoTable } = await loadLibs();
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });

  const totals = rows.reduce(
    (t, r) => ({ expected: t.expected + (r.expected || 0), paid: t.paid + (r.paid || 0), balance: t.balance + (r.balance || 0), callouts: t.callouts + (r.callouts || 0) }),
    { expected: 0, paid: 0, balance: 0, callouts: 0 }
  );
  const percent = totals.expected > 0 ? `${Math.round((totals.paid / totals.expected) * 100)}%` : '-';

  header(doc, { title: 'Payment Ledger', subtitle: filtersText || 'All clients, all dates', lines: [`Generated: ${fmtDate(new Date())}`, `${rows.length} job(s)`] });

  let y = summaryTable(doc, autoTable, 96, [
    { label: 'TOTAL EXPECTED', value: money(totals.expected) },
    { label: 'TOTAL PAID', value: money(totals.paid) },
    { label: 'BALANCE REMAINING', value: money(totals.balance) },
    { label: 'COLLECTED', value: percent },
    { label: 'JOBS / CALLOUTS', value: `${rows.length} / ${totals.callouts}` },
  ]);

  const columns = ['Job Date', 'Client', 'Site', 'Job Card', 'Callouts', 'Expected', 'Paid', 'Balance', 'Paid On', 'Status'];
  const COLS = columns.length;
  const toRow = (r) => [fmtDate(r.jobDate), r.client || '-', r.site || '-', r.jobCardRef || '-', String(r.callouts ?? ''), money(r.expected), money(r.paid), money(r.balance), paidOnText(r), r.status || ''];

  const body = [];
  if (groupByClient) {
    const groups = {};
    rows.forEach((r) => {
      const key = r.client || 'Unknown client';
      (groups[key] = groups[key] || []).push(r);
    });
    Object.keys(groups)
      .sort((a, b) => a.localeCompare(b))
      .forEach((name) => {
        const list = groups[name];
        const t = list.reduce((s, r) => ({ e: s.e + (r.expected || 0), p: s.p + (r.paid || 0), b: s.b + (r.balance || 0) }), { e: 0, p: 0, b: 0 });
        body.push([{ content: `${name}   (${list.length} job${list.length > 1 ? 's' : ''})`, colSpan: COLS, styles: { fillColor: [220, 244, 232], textColor: [20, 109, 76], fontStyle: 'bold', fontSize: 9.5 } }]);
        list.forEach((r) => body.push(toRow(r)));
        body.push([
          { content: `Subtotal - ${name}`, colSpan: 5, styles: { fontStyle: 'bold', halign: 'right', fillColor: [241, 245, 249] } },
          { content: money(t.e), styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
          { content: money(t.p), styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
          { content: money(t.b), styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
          { content: '', colSpan: 2, styles: { fillColor: [241, 245, 249] } },
        ]);
      });
  } else {
    rows.forEach((r) => body.push(toRow(r)));
  }

  autoTable(doc, {
    ...baseTable,
    startY: y + 22,
    head: [columns],
    body,
    foot: [['', '', '', 'TOTAL', String(totals.callouts), money(totals.expected), money(totals.paid), money(totals.balance), '', '']],
    columnStyles: {
      0: { cellWidth: 62 },
      4: { halign: 'center', cellWidth: 44 },
      5: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'right' },
      8: { cellWidth: 66 },
      9: { cellWidth: 70 },
    },
    didParseCell: (data) => {
      if (data.section !== 'body' && data.section !== 'foot') return;
      if (data.section === 'foot' && [5, 6, 7].includes(data.column.index)) data.cell.styles.halign = 'right';
      if (data.section === 'body' && !data.row.raw[0].colSpan) {
        const raw = data.row.raw;
        if (data.column.index === 9 && STATUS_COLOURS[raw[9]]) {
          data.cell.styles.textColor = STATUS_COLOURS[raw[9]];
          data.cell.styles.fontStyle = 'bold';
        }
        if (data.column.index === 7 && raw[7] !== money(0)) data.cell.styles.textColor = [180, 83, 9];
      }
    },
  });

  footers(doc);
  return doc;
}

export async function buildBalancePdf({ rows, totals, percentAll, groupLabel, periodText, onlyOwing }) {
  const { jsPDF, autoTable } = await loadLibs();
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  header(doc, {
    title: 'Paid and Balance Report',
    subtitle: `${groupLabel} | ${periodText}${onlyOwing ? ' | only where a balance remains' : ''}`,
    lines: [`Generated: ${fmtDate(new Date())}`, `${totals.jobs} job(s), ${totals.days} day(s)`],
  });

  const y = summaryTable(doc, autoTable, 96, [
    { label: 'EXPECTED', value: money(totals.expected) },
    { label: 'PAID', value: money(totals.paid) },
    { label: 'BALANCE REMAINING', value: money(totals.balance) },
    { label: 'COLLECTED', value: percentAll === null ? '-' : `${percentAll}%` },
  ]);

  autoTable(doc, {
    ...baseTable,
    startY: y + 22,
    head: [['Name', 'Jobs', 'Days', 'Expected', 'Paid', 'Balance remaining', '% paid']],
    body: rows.map((r) => [
      r.sub ? `${r.label}\n${r.sub}` : r.label,
      String(r.jobs.length),
      String(r.days),
      money(r.expected),
      money(r.paid),
      money(r.balance),
      r.percent === null ? '-' : `${r.percent}%`,
    ]),
    foot: [['TOTAL', String(totals.jobs), String(totals.days), money(totals.expected), money(totals.paid), money(totals.balance), percentAll === null ? '-' : `${percentAll}%`]],
    columnStyles: { 1: { halign: 'center', cellWidth: 36 }, 2: { halign: 'center', cellWidth: 36 }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right', cellWidth: 46 } },
    didParseCell: (data) => {
      if (data.section === 'foot' && data.column.index >= 3) data.cell.styles.halign = 'right';
      if (data.section === 'foot' && (data.column.index === 1 || data.column.index === 2)) data.cell.styles.halign = 'center';
      if (data.section === 'body' && data.column.index === 5 && data.row.raw[5] !== money(0)) data.cell.styles.textColor = [180, 83, 9];
      if (data.section === 'body' && data.column.index === 4) data.cell.styles.textColor = [20, 109, 76];
    },
  });

  footers(doc);
  return doc;
}