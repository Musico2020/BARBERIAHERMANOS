// Datos de un reporte (quincena, mes o año) listos para exportar a PDF o Excel.
// AdminReports los arma una sola vez y cada exportador los dibuja a su manera.

export interface ReportData {
  /** 'Reporte de quincena' · 'Reporte mensual' · 'Reporte anual' */
  title: string;
  /** '1 al 15 de octubre de 2026' · 'Octubre 2026' · '2026' */
  period: string;
  /** Nombre del archivo sin extensión: 'reporte-2026-10-01-a-2026-10-15' */
  fileBase: string;
  generatedAt: string;
  business: { name: string; address: string; phone: string };
  kpis: { label: string; value: string; note?: string }[];
  /** Totales por barbero, con su comisión y lo que se le paga */
  barbers: { name: string; services: number; revenue: number; commission: number | null; pay: number | null }[];
  services: { name: string; count: number; revenue: number }[];
  /** Ingresos por día (quincena y mes) o por mes (año) */
  breakdown: { title: string; label: string; rows: { label: string; bookings: number; completed: number; revenue: number }[] };
  topClients: { name: string; phone: string; visits: number; revenue: number }[];
  /** Cada servicio del período */
  detail: { date: string; time: string; client: string; phone: string; service: string; barber: string; status: string; price: number }[];
}

/** El logo como data URL (PNG) para meterlo en el PDF y en el Excel. */
export async function loadLogo(): Promise<string | null> {
  try {
    const res = await fetch('/logo-salon-hermanos.png');
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
