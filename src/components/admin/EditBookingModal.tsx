import { useEffect, useState } from 'react';
import { X, Pencil, Loader2, MessageCircle, CheckCircle2, Save } from 'lucide-react';
import { getServices } from '../../services/services';
import { getBarbers } from '../../services/barbers';
import { getBusySlots, updateBookingDetails, type BusySlot } from '../../services/bookings';
import { generateSlots } from '../../lib/availability';
import { businessConfig } from '../../config/business';
import { formatCOP } from '../../data';
import { todayKey, addDays, formatDateLong, time12 } from '../../lib/dates';
import { waNumber } from '../../lib/whatsapp';
import { doesService, priceFor } from '../../lib/barberServices';
import { barberEditBooking, type EditBookingResult } from '../../services/barberPortal';
import type { Barber, Booking, Service } from '../../types';

// Panel → Reservas → Editar: cambia cliente, servicio, barbero, día, hora o valor de una reserva.
// Las horas que se ofrecen son las libres del barbero ese día (las mismas de la web, según la duración
// del servicio), sin contar esta misma cita. Al guardar se puede avisar al cliente por WhatsApp.

interface Props {
  booking: Booking;
  onClose: () => void;
  onSaved: (updated: Booking) => void;
  /** Desde el portal del barbero: la cita sigue siendo suya, con el precio del servicio, y se guarda con su PIN */
  barberSession?: { barber: Barber; pin: string };
}

const EDIT_ERRORS: Partial<Record<EditBookingResult, string>> = {
  SLOT_TAKEN: 'Esa hora ya se ocupó. Escoge otra.',
  INVALID_NAME: 'Escribe el nombre del cliente.',
  INVALID_PHONE: 'Revisa el celular: 10 dígitos o déjalo vacío.',
  INVALID_DATE: 'Escoge otro día.',
  BOOKING_NOT_FOUND: 'Esta cita ya no existe.',
  PIN_LOCKED: 'Demasiados intentos. Espera 15 minutos.',
  INVALID_PIN: 'Tu PIN cambió. Sal y vuelve a entrar.',
};

const inputClass = 'w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-white text-sm focus:outline-none focus:border-gold/60 [color-scheme:dark]';
const label = 'text-xs text-zinc-400 uppercase tracking-wider block mb-1.5';

const describe = (b: Pick<Booking, 'date' | 'time' | 'serviceName' | 'barberName' | 'price'>) =>
  `📅 ${formatDateLong(b.date)}\n🕒 ${time12(b.time)}\n✂️ ${b.serviceName} con ${b.barberName}\n💰 ${formatCOP(b.price)}`;

/** Mensaje para el cliente con la cita nueva y lo que cambió */
export function changeMessage(before: Booking, after: Booking): string {
  const first = after.clientName.replace(/\s*\(turno \d+\)$/, '').split(' ')[0];
  const changes: string[] = [];
  if (before.date !== after.date || before.time !== after.time) changes.push(`antes era el ${formatDateLong(before.date).toLowerCase()} a las ${time12(before.time)}`);
  if (before.serviceName !== after.serviceName) changes.push(`antes era ${before.serviceName}`);
  if (before.barberId !== after.barberId) changes.push(`antes era con ${before.barberName}`);
  return [
    `Hola ${first}, te escribimos de ${businessConfig.name} 💈. Actualizamos tu cita:`,
    '',
    describe(after),
    changes.length ? `\n(${changes.join('; ')})` : '',
    '',
    `📍 ${businessConfig.address.trim()}`,
    '¿Te queda bien? Si no, respóndenos y te acomodamos.',
  ].filter((l, i, all) => !(l === '' && all[i - 1] === '')).join('\n');
}

export default function EditBookingModal({ booking, onClose, onSaved, barberSession }: Props) {
  const [services, setServices] = useState<Service[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [name, setName] = useState(booking.clientName);
  const [phone, setPhone] = useState(booking.clientPhone);
  const [serviceId, setServiceId] = useState(booking.serviceId);
  const [barberId, setBarberId] = useState(booking.barberId);
  const [date, setDate] = useState(booking.date);
  const [time, setTime] = useState(booking.time);
  const [price, setPrice] = useState(String(booking.price));
  const [busy, setBusy] = useState<BusySlot[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<Booking | null>(null);
  // También las horas del almuerzo y las que ya pasaron hoy (la web no las ofrece)
  const [allHours, setAllHours] = useState(false);

  useEffect(() => {
    Promise.all([getServices(), getBarbers()])
      .then(([s, b]) => {
        const me = barberSession ? b.find((x) => x.id === barberSession.barber.id) ?? barberSession.barber : null;
        // El barbero solo puede cambiar a servicios que hace
        setServices(me ? s.filter((x) => x.id === booking.serviceId || doesService(me, x.id)) : s);
        setBarbers(me ? [me] : b);
      })
      .catch((err) => { console.error('No se pudieron cargar servicios y barberos', err); setError('No se pudieron cargar los servicios. Cierra y vuelve a intentar.'); });
  }, []);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Horas ocupadas de ese barbero ese día, sin contar esta misma cita
  useEffect(() => {
    if (!barberId || !date) return;
    let alive = true;
    setBusy(null);
    getBusySlots(date, barberId)
      .then((list) => {
        if (!alive) return;
        const mine = booking.barberId === barberId && booking.date === date;
        setBusy(list.filter((x) => !(mine && x.kind !== 'closed' && x.startTime === booking.time)));
      })
      .catch((err) => { console.error('No se pudieron cargar las horas', err); if (alive) setBusy([]); });
    return () => { alive = false; };
  }, [barberId, date, booking.barberId, booking.date, booking.time]);

  const service = services.find((s) => s.id === serviceId);
  const barber = barbers.find((b) => b.id === barberId);
  const duration = service?.duration ?? 30;
  const slots = busy && barber ? generateSlots(date, busy, [barber.id], duration, businessConfig.slotStep, () => barber.workHours, { includeLunch: allHours, includePast: allHours }).map((s) => s.time) : [];
  // La hora que ya tenía se puede dejar aunque no esté en la secuencia
  const keepCurrent = date === booking.date && barberId === booking.barberId;
  const times = [...new Set([...(keepCurrent ? [booking.time] : []), ...slots])].sort();
  const priceNum = Number(price.replace(/\D/g, '')) || 0;
  const timeOk = times.includes(time);
  const ready = !!service && !!barber && name.trim().length >= 2 && timeOk && !saving;

  const changeService = (id: string) => {
    setServiceId(id);
    const s = services.find((x) => x.id === id);
    // El barbero cobra el precio del servicio; si vuelve al servicio que tenía, se conserva su valor
    if (s) setPrice(String(id === booking.serviceId && barberId === booking.barberId ? booking.price : priceFor(barber, s)));
  };

  // Otro barbero puede cobrar distinto: se propone su precio (si vuelve al de la cita, el valor que tenía)
  const changeBarber = (id: string) => {
    setBarberId(id);
    const next = barbers.find((b) => b.id === id);
    if (service && !barberSession) setPrice(String(id === booking.barberId && serviceId === booking.serviceId ? booking.price : priceFor(next, service)));
  };

  const save = async () => {
    if (!service || !barber) return;
    if (!timeOk) return setError('Escoge una hora libre.');
    setSaving(true);
    setError('');
    try {
      const patch = {
        clientName: name, clientPhone: phone, serviceId: service.id, serviceName: service.name,
        barberId: barber.id, barberName: barber.shortName, date, time, price: priceNum,
      };
      if (barberSession) {
        const result = await barberEditBooking(barberSession.barber.id, barberSession.pin, booking.id, {
          clientName: name, clientPhone: phone, serviceId: service.id, date, time,
        });
        if (result !== 'OK') { setError(EDIT_ERRORS[result] ?? 'No se pudo guardar. Revisa los datos.'); return; }
      } else {
        await updateBookingDetails(booking.id, patch);
      }
      const updated: Booking = { ...booking, ...patch, clientName: name.trim(), clientPhone: phone.trim(), originalTime: undefined, shiftedAt: undefined };
      setSaved(updated);
      onSaved(updated);
    } catch (err) {
      console.error('No se pudo editar la reserva', err);
      setError('No se pudo guardar. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const phoneDigits = (saved?.clientPhone ?? phone).replace(/\D/g, '');

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Editar reserva">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => !saving && onClose()} />
      <div className="relative w-full sm:max-w-lg bg-[#0d0d0d] border border-white/10 rounded-t-3xl sm:rounded-3xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gold/15 border border-gold/25 flex items-center justify-center"><Pencil size={15} className="text-gold" /></div>
            <h2 className="font-serif text-xl font-bold text-white">{saved ? 'Reserva actualizada' : 'Editar reserva'}</h2>
          </div>
          <button onClick={onClose} disabled={saving} aria-label="Cerrar" className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white"><X size={16} /></button>
        </div>

        {saved ? (
          <div className="px-5 py-5 space-y-4 overflow-y-auto">
            <p className="flex items-center gap-2 text-emerald-300 font-semibold"><CheckCircle2 size={18} /> Cambios guardados</p>
            <pre className="whitespace-pre-wrap font-sans text-sm text-zinc-200 rounded-xl border border-white/10 bg-white/[0.03] p-4">{changeMessage(booking, saved)}</pre>
            {phoneDigits.length >= 10 ? (
              <a
                href={`https://wa.me/${waNumber(saved.clientPhone)}?text=${encodeURIComponent(changeMessage(booking, saved))}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-3.5"
              >
                <MessageCircle size={18} /> Avisar al cliente por WhatsApp
              </a>
            ) : (
              <p className="text-amber-300 text-sm">Esta reserva no tiene un celular válido para avisar por WhatsApp.</p>
            )}
            <button onClick={onClose} className="w-full btn-dark-glass py-3 rounded-full text-sm font-semibold">Cerrar</button>
          </div>
        ) : (
          <>
            <div className="px-5 py-5 space-y-4 overflow-y-auto">
              {error && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}
              <div className="grid grid-cols-2 gap-3">
                <label className="block"><span className={label}>Cliente</span><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} /></label>
                <label className="block"><span className={label}>Celular</span><input className={inputClass} type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
              </div>
              <label className="block">
                <span className={label}>Servicio</span>
                <select className={inputClass} value={serviceId} onChange={(e) => changeService(e.target.value)}>
                  {!services.some((s) => s.id === serviceId) && <option value={serviceId}>{booking.serviceName}</option>}
                  {services.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.duration} min · {formatCOP(s.price)}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className={label}>Barbero</span>
                  <select className={inputClass} value={barberId} onChange={(e) => changeBarber(e.target.value)}>
                    {barbers.filter((b) => b.id === barberId || (b.role === (service?.category === 'manicura' ? 'manicurista' : 'barbero') && doesService(b, serviceId))).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className={label}>Día</span>
                  <input type="date" className={inputClass} value={date} min={addDays(todayKey(), -30)} max={addDays(todayKey(), 90)} onChange={(e) => e.target.value && setDate(e.target.value)} />
                </label>
              </div>
              <div>
                <span className={label}>Hora {busy === null && <Loader2 size={11} className="inline animate-spin text-gold ml-1" />}</span>
                {busy !== null && times.length === 0 ? (
                  <p className="text-amber-300 text-sm">{barber?.shortName ?? 'Ese barbero'} no tiene horas libres ese día para {duration} min. Escoge otro día o barbero.</p>
                ) : (
                  <div className="grid grid-cols-4 gap-1.5 max-h-44 overflow-y-auto pr-1">
                    {times.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => { setTime(t); setError(''); }}
                        aria-pressed={time === t}
                        className={`py-2 rounded-lg text-xs font-mono border ${time === t ? 'border-gold bg-gold text-dark font-bold' : 'border-white/10 text-zinc-200 hover:border-gold/50 bg-white/[0.03]'}`}
                      >
                        {time12(t)}
                      </button>
                    ))}
                  </div>
                )}
                {!timeOk && busy !== null && times.length > 0 && <p className="text-amber-300 text-xs mt-1.5">Escoge una de las horas libres.</p>}
                <label className="mt-2 inline-flex items-center gap-2 text-xs text-zinc-400 cursor-pointer select-none">
                  <input type="checkbox" className="accent-[#d9ad50] w-4 h-4" checked={allHours} onChange={(e) => setAllHours(e.target.checked)} />
                  Ver también el almuerzo y las horas que ya pasaron
                </label>
              </div>
              <label className="block">
                <span className={label}>Valor</span>
                <input className={`${inputClass} font-mono read-only:opacity-70`} inputMode="numeric" value={price} readOnly={!!barberSession} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} />
              </label>
            </div>
            <div className="border-t border-white/10 px-5 py-4">
              <button onClick={save} disabled={!ready} className="w-full btn-gold py-3.5 rounded-full font-semibold disabled:opacity-40">
                {saving ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />}
                <span>Guardar cambios{timeOk ? ` · ${time12(time)}` : ''}</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
