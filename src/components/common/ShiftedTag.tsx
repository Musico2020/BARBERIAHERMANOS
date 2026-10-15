import { FastForward, MessageCircle } from 'lucide-react';
import type { Booking } from '../../types';
import { isShifted, shiftWhatsappLink } from '../../lib/shifted';

// Marca de las citas que se adelantaron porque el barbero terminó la anterior antes de tiempo,
// con un botón para avisarle al cliente por WhatsApp (mensaje ya escrito).

export default function ShiftedTag({ b }: { b: Booking }) {
  if (!isShifted(b)) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 font-semibold">
        <FastForward size={11} /> Adelantada · antes {b.originalTime}
      </span>
      <a
        href={shiftWhatsappLink(b)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 font-semibold"
      >
        <MessageCircle size={11} /> Avisar al cliente
      </a>
    </span>
  );
}
