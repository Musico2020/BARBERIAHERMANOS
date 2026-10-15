import { ChevronLeft, Loader2, User, CalendarDays, Clock } from 'lucide-react';
import { ClipperIcon } from '../common/BarberIcons';
import { formatCOP } from '../../data';
import { formatDateLong, timeToMinutes, minutesToTime } from '../../lib/dates';
import { isValidName, isValidPhone, type ClientContact } from '../../lib/clientContact';
import { cartUnits, cartDuration, cartPrice } from '../../lib/bookingCart';
import type { Appointment } from './AppointmentStep';

interface Props {
  appointment: Appointment;
  contact: ClientContact;
  loading: boolean;
  onChange: (contact: ClientContact) => void;
  onConfirm: () => void;
  onBack: () => void;
}

export default function DetailsStep({ appointment, contact, loading, onChange, onConfirm, onBack }: Props) {
  const { items, barber, date, time } = appointment;
  const units = cartUnits(items);
  const endTime = minutesToTime(timeToMinutes(time) + cartDuration(items));
  const nameOk = isValidName(contact.name);
  const phoneOk = isValidPhone(contact.phone);

  const rows = [
    { icon: User, label: 'Barbero', value: barber?.name ?? 'El que esté libre' },
    { icon: CalendarDays, label: 'Fecha', value: formatDateLong(date) },
    { icon: Clock, label: 'Hora', value: units > 1 ? `${time} a ${endTime} (seguidos)` : time },
  ];

  return (
    <form
      className="flex flex-col h-full"
      onSubmit={(e) => {
        e.preventDefault();
        if (nameOk && phoneOk && !loading) onConfirm();
      }}
    >
      <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5">
        <button type="button" onClick={onBack} className="flex items-center gap-1 text-zinc-400 hover:text-white text-sm mb-4 transition-colors">
          <ChevronLeft size={16} />
          Cambiar la cita
        </button>

        <div className="rounded-2xl border border-gold/25 bg-gold/[0.05] p-4 mb-6">
          <div className="flex items-start gap-3 py-1.5">
            <ClipperIcon size={15} className="text-gold shrink-0 mt-0.5" />
            <span className="text-zinc-500 text-sm w-16 shrink-0">{units === 1 ? 'Servicio' : 'Servicios'}</span>
            <ul className="flex-1 min-w-0 space-y-1">
              {items.map(({ service, qty }) => (
                <li key={service.id} className="flex justify-between gap-3 text-sm">
                  <span className="text-white font-medium">{qty} × {service.name}</span>
                  <span className="font-mono text-zinc-400 shrink-0">{formatCOP(qty * service.price)}</span>
                </li>
              ))}
            </ul>
          </div>
          {rows.map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-center gap-3 py-1.5">
              <Icon size={15} className="text-gold shrink-0" />
              <span className="text-zinc-500 text-sm w-16 shrink-0">{label}</span>
              <span className="text-white text-sm font-medium">{value}</span>
            </div>
          ))}
          <div className="border-t border-white/10 mt-3 pt-3 flex justify-between items-center">
            <span className="text-zinc-400 text-sm">Total · pagas en la barbería</span>
            <span className="font-mono text-xl font-bold gold-text">{formatCOP(cartPrice(items))}</span>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="booking-name" className="text-xs text-zinc-400 uppercase tracking-wider block mb-2">Tu nombre</label>
            <input
              id="booking-name"
              autoComplete="name"
              placeholder="Ej: Carlos Martínez"
              value={contact.name}
              onChange={(e) => onChange({ ...contact, name: e.target.value })}
              className="w-full px-4 py-3.5 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder-zinc-600 text-base focus:outline-none focus:border-gold/60 transition-colors"
            />
          </div>
          <div>
            <label htmlFor="booking-phone" className="text-xs text-zinc-400 uppercase tracking-wider block mb-2">Tu celular (WhatsApp)</label>
            <input
              id="booking-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="300 123 4567"
              value={contact.phone}
              onChange={(e) => onChange({ ...contact, phone: e.target.value })}
              aria-invalid={contact.phone !== '' && !phoneOk}
              className="w-full px-4 py-3.5 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder-zinc-600 text-base focus:outline-none focus:border-gold/60 transition-colors"
            />
            {contact.phone !== '' && !phoneOk && (
              <p className="text-amber-400 text-xs mt-1.5">Escribe tu celular de 10 dígitos.</p>
            )}
          </div>
          <p className="text-zinc-500 text-xs leading-relaxed">
            Te enviaremos la confirmación por WhatsApp. Si necesitas cambiar o cancelar, escríbenos con al menos 2 horas de anticipación.
          </p>
        </div>
      </div>

      <div className="border-t border-white/10 px-5 sm:px-6 py-4 bg-[#0d0d0d]">
        <button
          type="submit"
          disabled={!nameOk || !phoneOk || loading}
          className="w-full btn-gold py-3.5 rounded-full font-semibold disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (<><Loader2 size={18} className="animate-spin" /><span>Confirmando...</span></>) : <span>Confirmar reserva</span>}
        </button>
      </div>
    </form>
  );
}
