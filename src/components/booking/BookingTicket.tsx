import { useEffect, useRef, useState } from 'react';
import { Download, Loader2, MapPin, CheckCircle2 } from 'lucide-react';
import { businessConfig } from '../../config/business';
import { formatCOP } from '../../data';
import { formatDateLong, time12 } from '../../lib/dates';
import { ticketCode } from '../../lib/ticket';
import { siteUrl } from '../../lib/whatsapp';

export interface TicketData {
  bookingId: string;
  clientName: string;
  /** Servicios reservados con su cantidad y el precio de esa línea */
  items: { name: string; qty: number; price: number }[];
  barberName: string;
  date: string;
  time: string;
  /** Precio total del pedido */
  price: number;
  /** Hora en que termina el último servicio */
  endTime: string;
  /** Anticipo enviado (comprobante por verificar) o por pagar en efectivo, si la reserva lo pidió */
  deposit?: number;
  /** transfer: comprobante enviado · cash: lo paga en efectivo en el salón antes de la cita */
  depositMethod?: 'transfer' | 'cash';
}

interface Props {
  ticket: TicketData;
  onClose: () => void;
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

export default function BookingTicket({ ticket, onClose }: Props) {
  const ticketRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<'download' | 'share' | null>(null);
  const [actionError, setActionError] = useState('');
  const code = ticketCode(ticket.bookingId);
  const dateText = formatDateLong(ticket.date);
  const several = ticket.items.reduce((n, i) => n + i.qty, 0) > 1;
  const hourText = several ? `${time12(ticket.time)} a ${time12(ticket.endTime)}` : time12(ticket.time);
  const cash = !!ticket.deposit && ticket.depositMethod === 'cash';
  const paidAll = !!ticket.deposit && !cash && ticket.deposit >= ticket.price;
  const status = !ticket.deposit ? 'Reserva confirmada' : cash ? 'Anticipo en efectivo pendiente' : paidAll ? 'Pago total por verificar' : 'Anticipo por verificar';

  const summary = [
    `✂️ *${businessConfig.name}* — ${status}`,
    `Código: ${code}`,
    `Servicios: ${ticket.items.map((i) => `${i.qty} × ${i.name}`).join(', ')}`,
    `Barbero: ${ticket.barberName}`,
    `Fecha: ${dateText}`,
    `Hora: ${hourText}`,
    cash
      ? `Total: ${formatCOP(ticket.price)} · Anticipo en efectivo (pagar en el salón antes de la cita): ${formatCOP(ticket.deposit!)} · Resto: ${formatCOP(ticket.price - ticket.deposit!)}`
      : ticket.deposit
      ? `Total: ${formatCOP(ticket.price)} · Pagado por transferencia: ${formatCOP(ticket.deposit)} · En el salón: ${formatCOP(ticket.price - ticket.deposit)}`
      : `Total: ${formatCOP(ticket.price)} (pago en el salón)`,
    `📍 ${businessConfig.address.trim()}`,
    `Consulta tus citas: ${siteUrl()}/mis-citas`,
  ].join('\n');

  const renderImage = async (): Promise<Blob> => {
    const { default: html2canvas } = await import('html2canvas');
    await document.fonts?.ready;
    const target = ticketRef.current!;
    const canvas = await html2canvas(target, {
      backgroundColor: '#0b0b0b',
      scale: 2,
      useCORS: true,
      logging: false,
      // Solo se copia el ticket (y los contenedores que lo envuelven), no toda la página con su fondo
      // animado y sus fotos: es lo que más demoraba
      ignoreElements: (el) => document.body.contains(el) && !el.contains(target) && !target.contains(el),
      // La ventana de reserva tiene scroll: en la copia que se fotografía se quita el recorte
      onclone: (_doc, element) => {
        for (let node = element.parentElement; node; node = node.parentElement) {
          node.style.overflow = 'visible';
          node.style.maxHeight = 'none';
          node.style.height = 'auto';
        }
      },
    });
    return new Promise((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo crear la imagen'))), 'image/png'),
    );
  };

  // La imagen se prepara una sola vez, en segundo plano apenas aparece el ticket: al tocar
  // «Enviar a WhatsApp» o «Descargar» ya está lista (y el celular no pierde el permiso de compartir)
  const imageRef = useRef<Promise<Blob> | null>(null);
  const getImage = () => {
    imageRef.current ??= renderImage().catch((err) => {
      imageRef.current = null; // si falla, se reintenta al tocar
      throw err;
    });
    return imageRef.current;
  };
  useEffect(() => {
    const timer = window.setTimeout(() => { getImage().catch(() => { /* se reintenta al tocar */ }); }, 400);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const downloadBlob = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ticket-${code}.png`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownload = async () => {
    setBusy('download');
    setActionError('');
    try {
      downloadBlob(await getImage());
    } catch (err) {
      console.error('No se pudo descargar el ticket', err);
      setActionError('No se pudo crear la imagen del ticket. Puedes tomarle una captura de pantalla.');
    } finally {
      setBusy(null);
    }
  };

  // En el celular abre el menú de compartir con la imagen del ticket (para enviarla por WhatsApp).
  // Donde no se puede compartir imágenes, descarga el ticket y abre WhatsApp con el resumen.
  const handleShare = async () => {
    setBusy('share');
    setActionError('');
    try {
      const blob = await getImage();
      const file = new File([blob], `ticket-${code}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `Reserva ${code}`, text: summary });
      } else {
        downloadBlob(blob);
        window.open(`https://wa.me/?text=${encodeURIComponent(summary)}`, '_blank', 'noopener');
      }
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') {
        console.error('No se pudo compartir el ticket', err);
        window.open(`https://wa.me/?text=${encodeURIComponent(summary)}`, '_blank', 'noopener');
      }
    } finally {
      setBusy(null);
    }
  };

  const rows = [
    ['Cliente', ticket.clientName],
    ...ticket.items.map((i, n) => [n === 0 ? (several ? 'Servicios' : 'Servicio') : '', `${i.qty} × ${i.name}`]),
    ['Barbero', ticket.barberName],
    ['Fecha', dateText],
    ['Hora', hourText],
  ];

  return (
    <div className="flex flex-col items-center px-5 py-6 sm:px-8 overflow-y-auto max-h-[92vh]">
      <div className="flex items-center gap-2 text-green-400 mb-4">
        <CheckCircle2 size={20} />
        <span className="font-semibold">{ticket.deposit && !cash ? '¡Recibimos tu comprobante!' : '¡Tu cita quedó reservada!'}</span>
      </div>

      {/* Lo que está dentro de ticketRef es lo que se descarga como imagen: solo colores sólidos */}
      <div ref={ticketRef} className="keep-dark w-full max-w-sm rounded-3xl overflow-hidden" style={{ background: '#121212', border: '1px solid #6B501F' }}>
        <div className="px-6 pt-6 pb-5 text-center" style={{ background: 'linear-gradient(160deg, #2a1f0c 0%, #121212 75%)' }}>
          <img src="/logo-salon-hermanos.png" alt={businessConfig.name} className="w-48 h-auto mx-auto object-contain" />
          <p className="text-[11px] uppercase tracking-[0.2em] mt-3" style={{ color: '#a1a1aa' }}>{status}</p>
          <p className="font-mono text-2xl font-bold tracking-widest mt-1" style={{ color: '#D9AD50' }}>{code}</p>
        </div>

        <div className="relative h-6" style={{ background: '#121212' }}>
          <span className="absolute -left-3 top-0 w-6 h-6 rounded-full" style={{ background: '#0b0b0b' }} />
          <span className="absolute -right-3 top-0 w-6 h-6 rounded-full" style={{ background: '#0b0b0b' }} />
          <span className="absolute left-5 right-5 top-1/2 border-t-2 border-dashed" style={{ borderColor: '#3f3f46' }} />
        </div>

        <div className="px-6 pb-2 space-y-2.5">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 text-sm">
              <span style={{ color: '#71717a' }}>{label}</span>
              <span className="text-right font-medium text-white">{value}</span>
            </div>
          ))}
          <div className="flex justify-between items-center pt-3 mt-1" style={{ borderTop: '1px solid #27272a' }}>
            <span className="text-sm" style={{ color: '#a1a1aa' }}>Total</span>
            <span className="font-mono text-xl font-bold" style={{ color: '#D9AD50' }}>{formatCOP(ticket.price)}</span>
          </div>
          {ticket.deposit ? (
            <>
              <div className="flex justify-between gap-4 text-sm">
                <span style={{ color: '#71717a' }}>{cash ? 'Anticipo en efectivo' : paidAll ? 'Pagado por transferencia' : 'Anticipo enviado'}</span>
                <span className="font-mono font-semibold" style={{ color: '#E6C27A' }}>{formatCOP(ticket.deposit)}</span>
              </div>
              <div className="flex justify-between gap-4 text-sm">
                <span style={{ color: '#71717a' }}>{cash ? 'Resto el día de la cita' : 'Pagas en el salón'}</span>
                <span className="font-mono font-semibold text-white">{formatCOP(ticket.price - ticket.deposit)}</span>
              </div>
              <p className="text-[11px] text-right" style={{ color: cash ? '#fbbf24' : '#71717a' }}>
                {cash
                  ? 'Ve al salón a pagar el anticipo antes de tu cita. Si no lo pagas, la reserva puede cancelarse.'
                  : 'Te confirmamos al verificar el pago. Si no asistes, pierdes lo pagado.'}
              </p>
            </>
          ) : (
            <p className="text-[11px] text-right" style={{ color: '#71717a' }}>Pago en el salón</p>
          )}
        </div>

        <div className="px-6 py-4 mt-2 text-center" style={{ background: '#0f0f0f', borderTop: '1px solid #27272a' }}>
          <p className="flex items-center justify-center gap-1.5 text-xs" style={{ color: '#a1a1aa' }}>
            <MapPin size={12} style={{ color: '#D9AD50' }} /> {businessConfig.address.trim()}
          </p>
          <p className="font-serif italic text-sm mt-2" style={{ color: '#E6C27A' }}>Barbería tradicional · Club de Caballeros</p>
          <p className="text-[10px] mt-1" style={{ color: '#52525b' }}>Muestra este ticket al llegar · Llega 5 minutos antes</p>
        </div>
      </div>

      {actionError && <p className="text-amber-400 text-xs mt-3 text-center max-w-sm">{actionError}</p>}

      <div className="w-full max-w-sm grid grid-cols-2 gap-2.5 mt-5">
        <button
          onClick={handleShare}
          disabled={busy !== null}
          className="flex items-center justify-center gap-2 py-3 rounded-full bg-green-600 hover:bg-green-500 text-white text-sm font-semibold transition-colors disabled:opacity-60"
        >
          {busy === 'share' ? <Loader2 size={16} className="animate-spin" /> : <WhatsAppIcon />}
          Enviar a WhatsApp
        </button>
        <button
          onClick={handleDownload}
          disabled={busy !== null}
          className="flex items-center justify-center gap-2 py-3 rounded-full border border-gold/50 text-gold text-sm font-semibold hover:bg-gold/10 transition-colors disabled:opacity-60"
        >
          {busy === 'download' ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
          Descargar
        </button>
      </div>
      <button onClick={onClose} className="mt-3 text-zinc-400 hover:text-white text-sm py-2">
        Listo, cerrar
      </button>
    </div>
  );
}
