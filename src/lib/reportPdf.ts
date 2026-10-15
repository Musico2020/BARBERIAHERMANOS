import { formatCOP } from '../data';
import { loadLogo, type ReportData } from './report';

// PDF del reporte (quincena, mes o año): encabezado negro con el logo, cifras principales,
// pago a cada barbero según su comisión, ingresos por servicio y por día/mes, mejores clientes
// y el detalle de cada servicio. jsPDF se carga solo al exportar.

type RGB = [number, number, number];
const GOLD: RGB = [212, 175, 55];
const GOLD_SOFT: RGB = [250, 244, 225];
const INK: RGB = [24, 24, 27];
const DARK: RGB = [17, 17, 17];
const GREY: RGB = [113, 113, 122];
const LINE: RGB = [228, 228, 231];
const ZEBRA: RGB = [248, 248, 248];

type Align = 'left' | 'right' | 'center';

/** Para no llenar el PDF anual con miles de filas, el detalle va completo solo en el Excel. */
const MAX_DETAIL_ROWS = 600;

export async function exportReportPdf(data: ReportData): Promise<void> {
  const [{ jsPDF }, logo] = await Promise.all([import('jspdf'), loadLogo()]);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 36;
  const CW = W - 2 * M;
  let y = 0;

  const bigHeader = () => {
    doc.setFillColor(...DARK);
    doc.rect(0, 0, W, 118, 'F');
    doc.setFillColor(...GOLD);
    doc.rect(0, 118, W, 3, 'F');
    if (logo) doc.addImage(logo, 'PNG', M, 16, 86, 86);
    const tx = logo ? M + 104 : M;
    doc.setTextColor(...GOLD);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text(data.title.toUpperCase(), tx, 50);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12.5);
    doc.text(data.period, tx, 70);
    doc.setTextColor(161, 161, 170);
    doc.setFontSize(8.5);
    doc.text(`${data.business.name} · ${data.business.address}`, tx, 90);
    doc.text(`Generado el ${data.generatedAt}`, W - M, 30, { align: 'right' });
    y = 142;
  };

  const smallHeader = () => {
    doc.setFillColor(...DARK);
    doc.rect(0, 0, W, 46, 'F');
    doc.setFillColor(...GOLD);
    doc.rect(0, 46, W, 2, 'F');
    if (logo) doc.addImage(logo, 'PNG', M, 6, 34, 34);
    doc.setTextColor(...GOLD);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text(data.title.toUpperCase(), logo ? M + 44 : M, 22);
    doc.setTextColor(212, 212, 216);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(data.period, logo ? M + 44 : M, 36);
    y = 68;
  };

  const newPage = () => { doc.addPage(); smallHeader(); };
  const ensureSpace = (needed: number) => { if (y + needed > H - 54) newPage(); };

  const sectionTitle = (text: string, note?: string) => {
    ensureSpace(64);
    doc.setFillColor(...GOLD);
    doc.rect(M, y, 3.5, 15, 'F');
    doc.setTextColor(...INK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(text, M + 11, y + 11.5);
    if (note) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...GREY);
      doc.text(note, W - M, y + 11.5, { align: 'right' });
    }
    y += 24;
  };

  /** Tabla: encabezado negro con letras doradas, filas alternadas y fila de total opcional. */
  const table = (headers: string[], rows: string[][], widths: number[], aligns: Align[], totalRow?: string[], fontSize = 9) => {
    const sum = widths.reduce((a, b) => a + b, 0);
    const cols = widths.map((w) => (w / sum) * CW);
    const rowH = fontSize + 10;
    const cellX = (i: number) => M + cols.slice(0, i).reduce((a, b) => a + b, 0);
    const drawCells = (cells: string[]) => {
      cells.forEach((cell, i) => {
        const text = doc.splitTextToSize(cell, cols[i] - 12)[0] ?? '';
        const x = aligns[i] === 'right' ? cellX(i) + cols[i] - 6 : aligns[i] === 'center' ? cellX(i) + cols[i] / 2 : cellX(i) + 6;
        doc.text(text, x, y + rowH / 2 + fontSize / 3, { align: aligns[i] });
      });
    };
    const drawHead = () => {
      doc.setFillColor(...DARK);
      doc.rect(M, y, CW, rowH + 2, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(fontSize - 0.5);
      doc.setTextColor(...GOLD);
      y += 1;
      drawCells(headers);
      y += rowH + 1;
    };
    ensureSpace(rowH * 3);
    drawHead();
    rows.forEach((row, r) => {
      if (y + rowH > H - 54) { newPage(); drawHead(); }
      if (r % 2 === 1) { doc.setFillColor(...ZEBRA); doc.rect(M, y, CW, rowH, 'F'); }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(fontSize);
      doc.setTextColor(...INK);
      drawCells(row);
      y += rowH;
    });
    if (totalRow) {
      if (y + rowH > H - 54) { newPage(); drawHead(); }
      doc.setFillColor(...GOLD_SOFT);
      doc.rect(M, y, CW, rowH + 2, 'F');
      doc.setDrawColor(...GOLD);
      doc.setLineWidth(0.8);
      doc.line(M, y, M + CW, y);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(fontSize);
      doc.setTextColor(...INK);
      y += 1;
      drawCells(totalRow);
      y += rowH + 1;
    }
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.5);
    doc.line(M, y, M + CW, y);
    y += 20;
  };

  // ---- Página 1
  bigHeader();

  // Cifras principales
  const gap = 10;
  const perRow = Math.min(4, data.kpis.length);
  const cardW = (CW - gap * (perRow - 1)) / perRow;
  const cardH = 62;
  data.kpis.forEach((k, i) => {
    const col = i % perRow;
    if (i > 0 && col === 0) y += cardH + gap;
    const x = M + col * (cardW + gap);
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.8);
    doc.roundedRect(x, y, cardW, cardH, 6, 6, 'FD');
    doc.setFillColor(...GOLD);
    doc.rect(x + 12, y, cardW - 24, 3, 'F');
    doc.setTextColor(...GREY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(k.label.toUpperCase(), x + 12, y + 20);
    doc.setTextColor(...INK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(k.value.length > 12 ? 13 : 16);
    doc.text(k.value, x + 12, y + 41);
    if (k.note) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...GREY);
      doc.text(doc.splitTextToSize(k.note, cardW - 24)[0] ?? '', x + 12, y + 54);
    }
  });
  y += cardH + 26;

  // Barberos y su pago
  const totalServices = data.barbers.reduce((a, b) => a + b.services, 0);
  const totalRevenue = data.barbers.reduce((a, b) => a + b.revenue, 0);
  const totalPay = data.barbers.reduce((a, b) => a + (b.pay ?? 0), 0);
  sectionTitle('Liquidación por barbero', 'Pago = ingresos × comisión');
  table(
    ['Barbero', 'Servicios', 'Ingresos', 'Comisión', 'Pago al barbero', 'Queda al negocio'],
    data.barbers.length
      ? data.barbers.map((b) => [
        b.name, String(b.services), formatCOP(b.revenue),
        b.commission === null ? '—' : `${b.commission}%`,
        b.pay === null ? '—' : formatCOP(b.pay),
        b.pay === null ? '—' : formatCOP(b.revenue - b.pay),
      ])
      : [['Sin servicios completados', '', '', '', '', '']],
    [2.2, 1, 1.4, 1, 1.5, 1.5],
    ['left', 'center', 'right', 'center', 'right', 'right'],
    data.barbers.length ? ['Total', String(totalServices), formatCOP(totalRevenue), '', formatCOP(totalPay), formatCOP(totalRevenue - totalPay)] : undefined,
  );

  sectionTitle('Ingresos por servicio');
  table(
    ['Servicio', 'Completados', 'Ingresos', '% del total'],
    data.services.length
      ? data.services.map((s) => [s.name, String(s.count), formatCOP(s.revenue), totalRevenue ? `${Math.round((s.revenue / totalRevenue) * 100)}%` : '—'])
      : [['Sin servicios completados', '', '', '']],
    [2.6, 1, 1.4, 1],
    ['left', 'center', 'right', 'center'],
  );

  const bd = data.breakdown;
  sectionTitle(bd.title);
  table(
    [bd.label, 'Reservas', 'Completadas', 'Ingresos'],
    bd.rows.length ? bd.rows.map((r) => [r.label, String(r.bookings), String(r.completed), formatCOP(r.revenue)]) : [['Sin movimiento', '', '', '']],
    [2, 1, 1, 1.4],
    ['left', 'center', 'center', 'right'],
    bd.rows.length
      ? ['Total', String(bd.rows.reduce((a, r) => a + r.bookings, 0)), String(bd.rows.reduce((a, r) => a + r.completed, 0)), formatCOP(bd.rows.reduce((a, r) => a + r.revenue, 0))]
      : undefined,
  );

  if (data.topClients.length) {
    sectionTitle('Mejores clientes');
    table(
      ['Cliente', 'Celular', 'Visitas', 'Gastado'],
      data.topClients.map((c) => [c.name, c.phone || '—', String(c.visits), formatCOP(c.revenue)]),
      [2.4, 1.4, 0.8, 1.2],
      ['left', 'left', 'center', 'right'],
    );
  }

  // Detalle de servicios
  const detail = data.detail.slice(0, MAX_DETAIL_ROWS);
  sectionTitle('Detalle de servicios', data.detail.length > MAX_DETAIL_ROWS
    ? `Primeros ${MAX_DETAIL_ROWS} de ${data.detail.length} · el detalle completo está en el Excel`
    : `${data.detail.length} ${data.detail.length === 1 ? 'registro' : 'registros'}`);
  table(
    ['Fecha', 'Hora', 'Cliente', 'Servicio', 'Barbero', 'Estado', 'Valor'],
    detail.length
      ? detail.map((d) => [d.date.split('-').reverse().join('/'), d.time, d.client, d.service, d.barber, d.status, formatCOP(d.price)])
      : [['Sin servicios en este período', '', '', '', '', '', '']],
    [1.05, 0.65, 1.9, 1.9, 1.1, 1.05, 1],
    ['left', 'left', 'left', 'left', 'left', 'left', 'right'],
    undefined,
    8,
  );

  // Pie de página en todas las hojas
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(1);
    doc.line(M, H - 34, W - M, H - 34);
    doc.setTextColor(...GREY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`${data.business.name} · ${data.business.phone} · Documento interno`, M, H - 20);
    doc.text(`Página ${p} de ${pages}`, W - M, H - 20, { align: 'right' });
  }

  doc.save(`${data.fileBase}.pdf`);
}
