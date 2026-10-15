import { loadLogo, downloadBlob, type ReportData } from './report';

// Excel del reporte (quincena, mes o año) con el logo y formato:
//   Resumen  → cifras, liquidación por barbero, ingresos por servicio y mejores clientes
//   Por día / Por mes → movimiento del período
//   Detalle  → cada servicio, con filtros para buscar por barbero, estado o servicio
// ExcelJS se carga solo al exportar.

const GOLD = 'FFD4AF37';
const GOLD_SOFT = 'FFFAF4E1';
const DARK = 'FF111111';
const ZEBRA = 'FFF7F7F7';
const GREY = 'FF71717A';
const MONEY = '"$"#,##0';

export async function exportReportExcel(data: ReportData): Promise<void> {
  const [{ default: ExcelJS }, logo] = await Promise.all([import('exceljs'), loadLogo()]);
  type Worksheet = import('exceljs').Worksheet;
  type Row = import('exceljs').Row;

  const wb = new ExcelJS.Workbook();
  wb.creator = data.business.name;
  wb.created = new Date();
  const logoId = logo ? wb.addImage({ base64: logo, extension: 'png' }) : null;

  const fill = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } });
  const thin = { style: 'thin' as const, color: { argb: 'FFE4E4E7' } };

  /** Encabezado negro con el logo, el título y el período (filas 1 a 4). */
  const banner = (ws: Worksheet, lastCol: number) => {
    for (let r = 1; r <= 4; r++) {
      const row = ws.getRow(r);
      row.height = r === 1 ? 30 : 20;
      for (let c = 1; c <= lastCol; c++) row.getCell(c).fill = fill(DARK);
    }
    for (let c = 1; c <= lastCol; c++) ws.getRow(5).getCell(c).fill = fill(GOLD);
    ws.getRow(5).height = 4;
    if (logoId !== null) ws.addImage(logoId, { tl: { col: 0.15, row: 0.15 }, ext: { width: 84, height: 84 } });
    ws.mergeCells(1, 2, 1, lastCol);
    ws.mergeCells(2, 2, 2, lastCol);
    ws.mergeCells(3, 2, 3, lastCol);
    ws.mergeCells(4, 2, 4, lastCol);
    const t = ws.getCell(1, 2);
    t.value = data.title.toUpperCase();
    t.font = { bold: true, size: 16, color: { argb: GOLD } };
    t.alignment = { vertical: 'middle' };
    ws.getCell(2, 2).value = data.period;
    ws.getCell(2, 2).font = { size: 12, color: { argb: 'FFFFFFFF' } };
    ws.getCell(3, 2).value = `${data.business.name} · ${data.business.address} · ${data.business.phone}`;
    ws.getCell(3, 2).font = { size: 9, color: { argb: 'FFA1A1AA' } };
    ws.getCell(4, 2).value = `Generado el ${data.generatedAt}`;
    ws.getCell(4, 2).font = { size: 9, italic: true, color: { argb: 'FFA1A1AA' } };
  };

  const sectionTitle = (ws: Worksheet, rowNo: number, text: string, lastCol: number) => {
    ws.mergeCells(rowNo, 1, rowNo, lastCol);
    const c = ws.getCell(rowNo, 1);
    c.value = text;
    c.font = { bold: true, size: 12, color: { argb: 'FF18181B' } };
    c.border = { bottom: { style: 'medium', color: { argb: GOLD } } };
    ws.getRow(rowNo).height = 22;
  };

  const headerRow = (row: Row) => {
    row.eachCell((cell) => {
      cell.fill = fill(DARK);
      cell.font = { bold: true, color: { argb: GOLD } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = { top: thin, bottom: thin, left: thin, right: thin };
    });
    row.height = 20;
  };

  const bodyRow = (row: Row, index: number, moneyCols: number[]) => {
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      if (index % 2 === 1) cell.fill = fill(ZEBRA);
      cell.border = { top: thin, bottom: thin, left: thin, right: thin };
      if (moneyCols.includes(col)) cell.numFmt = MONEY;
    });
  };

  const totalRow = (row: Row, moneyCols: number[]) => {
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.fill = fill(GOLD_SOFT);
      cell.font = { bold: true };
      cell.border = { top: { style: 'medium', color: { argb: GOLD } }, bottom: thin, left: thin, right: thin };
      if (moneyCols.includes(col)) cell.numFmt = MONEY;
    });
  };

  /** Escribe una tabla desde `start` y devuelve la fila siguiente libre. */
  const writeTable = (ws: Worksheet, start: number, headers: string[], rows: (string | number | null)[][], moneyCols: number[], total?: (string | number | null)[]) => {
    headerRow(ws.getRow(start));
    headers.forEach((h, i) => { ws.getCell(start, i + 1).value = h; });
    headerRow(ws.getRow(start));
    rows.forEach((r, i) => {
      const row = ws.getRow(start + 1 + i);
      r.forEach((v, j) => { row.getCell(j + 1).value = v; });
      bodyRow(row, i, moneyCols);
    });
    let next = start + 1 + rows.length;
    if (total) {
      const row = ws.getRow(next);
      total.forEach((v, j) => { row.getCell(j + 1).value = v; });
      totalRow(row, moneyCols);
      next += 1;
    }
    return next + 1;
  };

  // ---------------- Resumen
  const ws = wb.addWorksheet('Resumen', { views: [{ showGridLines: false }], pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  ws.columns = [{ width: 30 }, { width: 14 }, { width: 18 }, { width: 13 }, { width: 18 }, { width: 18 }];
  banner(ws, 6);

  // Cifras principales
  let r = 7;
  sectionTitle(ws, r, 'Resumen del período', 6);
  r += 1;
  data.kpis.forEach((k, i) => {
    const row = ws.getRow(r + i);
    row.height = 22;
    ws.mergeCells(r + i, 3, r + i, 6);
    row.getCell(1).value = k.label;
    row.getCell(1).font = { color: { argb: GREY } };
    row.getCell(2).value = k.value;
    row.getCell(2).font = { bold: true, size: 13 };
    row.getCell(3).value = k.note ?? '';
    row.getCell(3).font = { size: 9, italic: true, color: { argb: GREY } };
    for (let c = 1; c <= 6; c++) {
      const cell = row.getCell(c);
      cell.fill = fill(i % 2 ? 'FFFFFFFF' : GOLD_SOFT);
      cell.alignment = { vertical: 'middle' };
      cell.border = { bottom: thin };
    }
  });
  r += data.kpis.length + 1;

  const totalRevenue = data.barbers.reduce((a, b) => a + b.revenue, 0);
  const totalPay = data.barbers.reduce((a, b) => a + (b.pay ?? 0), 0);
  sectionTitle(ws, r, 'Liquidación por barbero (pago = ingresos × comisión)', 6);
  r = writeTable(ws, r + 1,
    ['Barbero', 'Servicios', 'Ingresos', 'Comisión', 'Pago al barbero', 'Queda al negocio'],
    data.barbers.map((b) => [b.name, b.services, b.revenue, b.commission === null ? '—' : `${b.commission}%`, b.pay, b.pay === null ? null : b.revenue - b.pay]),
    [3, 5, 6],
    ['Total', data.barbers.reduce((a, b) => a + b.services, 0), totalRevenue, '', totalPay, totalRevenue - totalPay],
  );

  sectionTitle(ws, r, 'Ingresos por servicio', 6);
  r = writeTable(ws, r + 1,
    ['Servicio', 'Completados', 'Ingresos', '% del total'],
    data.services.map((s) => [s.name, s.count, s.revenue, totalRevenue ? `${Math.round((s.revenue / totalRevenue) * 100)}%` : '—']),
    [3],
  );

  if (data.topClients.length) {
    sectionTitle(ws, r, 'Mejores clientes', 6);
    r = writeTable(ws, r + 1,
      ['Cliente', 'Celular', 'Visitas', 'Gastado'],
      data.topClients.map((c) => [c.name, c.phone || '—', c.visits, c.revenue]),
      [4],
    );
  }

  // ---------------- Por día / Por mes
  const bd = data.breakdown;
  const wsB = wb.addWorksheet(bd.label === 'Mes' ? 'Por mes' : 'Por día', { views: [{ showGridLines: false }] });
  wsB.columns = [{ width: 26 }, { width: 14 }, { width: 14 }, { width: 18 }];
  banner(wsB, 4);
  sectionTitle(wsB, 7, bd.title, 4);
  writeTable(wsB, 8,
    [bd.label, 'Reservas', 'Completadas', 'Ingresos'],
    bd.rows.map((x) => [x.label, x.bookings, x.completed, x.revenue]),
    [4],
    ['Total', bd.rows.reduce((a, x) => a + x.bookings, 0), bd.rows.reduce((a, x) => a + x.completed, 0), bd.rows.reduce((a, x) => a + x.revenue, 0)],
  );

  // ---------------- Detalle
  const wsD = wb.addWorksheet('Detalle', { views: [{ state: 'frozen', ySplit: 7, showGridLines: false }] });
  wsD.columns = [{ width: 12 }, { width: 8 }, { width: 28 }, { width: 14 }, { width: 28 }, { width: 18 }, { width: 14 }, { width: 14 }];
  banner(wsD, 8);
  const headers = ['Fecha', 'Hora', 'Cliente', 'Celular', 'Servicio', 'Barbero', 'Estado', 'Valor'];
  const next = writeTable(wsD, 7, headers,
    data.detail.map((d) => [d.date.split('-').reverse().join('/'), d.time, d.client, d.phone, d.service, d.barber, d.status, d.price]),
    [8],
  );
  if (data.detail.length) wsD.autoFilter = { from: { row: 7, column: 1 }, to: { row: 6 + data.detail.length, column: 8 } };
  wsD.getCell(next, 1).value = 'Los ingresos de los reportes cuentan solo los servicios en estado «Completada».';
  wsD.getCell(next, 1).font = { italic: true, size: 9, color: { argb: GREY } };

  const buffer = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${data.fileBase}.xlsx`);
}
