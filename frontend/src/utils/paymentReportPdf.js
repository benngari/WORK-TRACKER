// Builds the client payment report as a real PDF (header, summary, paid-by-site
// table and a payment-by-payment table). Loaded on demand so the PDF libraries
// are only downloaded when someone actually exports a report.
const fmtDate = (d) => {
  const x = new Date(d);
  if (isNaN(x)) return '-';
  return x.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export async function buildPaymentReportPdf({ clientName, periodText, currency, rows, siteRows, totals }) {
  const pdfMod = await import('jspdf');
  const jsPDF = pdfMod.jsPDF || pdfMod.default?.jsPDF || pdfMod.default;
  const tableMod = await import('jspdf-autotable');
  // The plugin exposes its function differently depending on the bundler, so pick whichever is callable.
  const autoTable = [tableMod.default, tableMod.default?.default, tableMod.autoTable, tableMod.default?.autoTable].find(
    (f) => typeof f === 'function'
  );

  const money = (n) => `${currency} ${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 40;
  const GREEN = [24, 136, 93];

  // Header band
  doc.setFillColor(...GREEN);
  doc.rect(0, 0, pageW, 78, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('Payment Report', M, 36);
  doc.setFontSize(11);
  doc.text(clientName, M, 58);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Period: ${periodText}`, pageW - M, 36, { align: 'right' });
  doc.text(`Generated: ${fmtDate(new Date())}`, pageW - M, 54, { align: 'right' });

  const rightAlign = (cols) => (data) => {
    if (cols.includes(data.column.index)) data.cell.styles.halign = 'right';
  };

  const common = {
    margin: { left: M, right: M },
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 5, textColor: [30, 41, 55], lineColor: [226, 232, 240], lineWidth: 0.5 },
    headStyles: { fillColor: GREEN, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [247, 250, 252] },
    footStyles: { fillColor: [238, 252, 246], textColor: [20, 109, 76], fontStyle: 'bold' },
    showFoot: 'lastPage',
  };

  // Summary
  autoTable(doc, {
    ...common,
    startY: 98,
    head: [['Total Received', 'Job Payments', 'Fare Reimbursements', 'Number of Payments']],
    body: [[money(totals.all), money(totals.job), money(totals.fare), String(totals.count)]],
    headStyles: { fillColor: [238, 252, 246], textColor: [20, 109, 76], fontStyle: 'bold', halign: 'center' },
    bodyStyles: { halign: 'center', fontStyle: 'bold', fontSize: 11, cellPadding: 8 },
    alternateRowStyles: {},
  });

  const heading = (text, y) => {
    let top = y;
    if (top > pageH - 140) {
      doc.addPage();
      top = 50;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text(text, M, top);
    return top + 8;
  };

  // Paid by site
  let y = heading('Paid by site', doc.lastAutoTable.finalY + 28);
  autoTable(doc, {
    ...common,
    startY: y,
    head: [['Site', 'Payments', 'Job Payments', 'Fares', 'Total']],
    body: siteRows.map((s) => [s.site, String(s.payments), money(s.job), money(s.fare), money(s.total)]),
    foot: [['TOTAL', String(totals.count), money(totals.job), money(totals.fare), money(totals.all)]],
    didParseCell: rightAlign([1, 2, 3, 4]),
  });

  // Payment details
  y = heading('Payment details', doc.lastAutoTable.finalY + 28);
  autoTable(doc, {
    ...common,
    startY: y,
    head: [['Date', 'Reference', 'Site', 'Job Card', 'Type', 'Amount']],
    body: rows.map((r) => [fmtDate(r.date), r.reference || '-', r.site || '-', r.jobCard || '-', r.type, money(r.amount)]),
    foot: [['', '', '', '', 'TOTAL', money(totals.all)]],
    columnStyles: { 0: { cellWidth: 62 }, 4: { cellWidth: 62 } },
    didParseCell: rightAlign([5]),
  });

  // Page footers
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text('Generated with Work Tracker', M, pageH - 20);
    doc.text(`Page ${i} of ${pages}`, pageW - M, pageH - 20, { align: 'right' });
  }

  return doc;
}