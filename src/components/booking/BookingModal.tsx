import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { Service } from '../../types';
import { createBooking, BookingError, type BookingErrorCode } from '../../services/bookings';
import { businessConfig } from '../../config/business';
import { loadClientContact, saveClientContact, type ClientContact } from '../../lib/clientContact';
import AppointmentStep, { type Appointment } from './AppointmentStep';
import DetailsStep from './DetailsStep';
import BookingTicket, { type TicketData } from './BookingTicket';
import DepositStep from './DepositStep';
import { timeToMinutes, minutesToTime } from '../../lib/dates';
import { cartSchedule, cartDuration, cartPrice } from '../../lib/bookingCart';

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedService?: Service | null;
}

type Step = 'cita' | 'datos';

const ERROR_MESSAGES: Record<BookingErrorCode, string> = {
  SLOT_TAKEN: 'Esa hora acaba de ser reservada por otra persona. Elige otra hora, por favor.',
  NO_BARBER_AVAILABLE: 'Ya no hay barberos libres a esa hora. Elige otra hora, por favor.',
  PAST_DATE: 'Esa hora ya pasó. Elige otra hora, por favor.',
  INVALID_NAME: 'Escribe tu nombre completo.',
  INVALID_PHONE: 'Revisa tu número de celular: debe tener al menos 10 dígitos.',
  INVALID_TIME: 'La hora seleccionada no es válida. Elige otra, por favor.',
  SERVICE_NOT_FOUND: 'Ese servicio ya no está disponible. Elige otro, por favor.',
  CLOSED_DAY: 'Ese día no hay reservas por la web (la barbería está cerrada o atiende por orden de llegada). Elige otra fecha.',
  BARBER_REQUIRED: 'Elige con quién quieres tu cita.',
  WRONG_PROFESSIONAL: 'Esa persona no realiza este servicio. Elige a otra, por favor.',
  LUNCH_BREAK: 'A esa hora estamos en almuerzo. Elige otra hora, por favor.',
  UNKNOWN: 'No pudimos confirmar tu reserva por un problema de conexión. Intenta de nuevo o escríbenos por WhatsApp.',
};

// Si la hora ya no sirve, el cliente vuelve a elegir la cita
const BACK_TO_APPOINTMENT: BookingErrorCode[] = ['SLOT_TAKEN', 'NO_BARBER_AVAILABLE', 'PAST_DATE', 'INVALID_TIME', 'SERVICE_NOT_FOUND', 'CLOSED_DAY', 'BARBER_REQUIRED', 'WRONG_PROFESSIONAL', 'LUNCH_BREAK'];

// Aviso por WhatsApp al cliente y al dueño (función de Vercel api/send-whatsapp).
// Si falla, la cita igual queda guardada y el cliente tiene su ticket en pantalla.
function notifyWhatsApp(payload: { bookingId: string }) {
  fetch('/api/send-whatsapp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
    .then((res) => { if (!res.ok) console.warn('No se pudo enviar el WhatsApp de la reserva', res.status); })
    .catch((err) => console.warn('No se pudo enviar el WhatsApp de la reserva', err));
}

const emptyAppointment = (service: Service | null = null): Appointment => ({
  items: service ? [{ service, qty: 1 }] : [],
  barber: null,
  date: '',
  time: '',
});

export default function BookingModal({ isOpen, onClose, preselectedService }: BookingModalProps) {
  const [step, setStep] = useState<Step>('cita');
  const [appointment, setAppointment] = useState<Appointment>(emptyAppointment(preselectedService ?? null));
  const [contact, setContact] = useState<ClientContact>(loadClientContact);
  const [ticket, setTicket] = useState<TicketData | null>(null);
  // Anticipo pendiente de la reserva recién hecha: se muestra el QR antes del ticket
  const [deposit, setDeposit] = useState<{ ids: string[]; amount: number; expiresAt: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setStep('cita');
      setAppointment(emptyAppointment(preselectedService ?? null));
      setContact(loadClientContact());
      setTicket(null);
      setDeposit(null);
      setError('');
    }
  }, [isOpen, preselectedService]);

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !loading) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    const { items, barber, date, time } = appointment;
    if (items.length === 0) return;
    const schedule = cartSchedule(items, time);
    setLoading(true);
    setError('');
    const created: { bookingId: string; barberName: string; depositAmount: number; depositExpiresAt: string | null }[] = [];
    try {
      // Cada servicio es una cita, uno detrás de otro y con el mismo barbero
      let barberId = barber?.id ?? '';
      for (let i = 0; i < schedule.length; i++) {
        const booking = await createBooking({
          serviceId: schedule[i].service.id,
          barberId,
          date,
          time: schedule[i].time,
          clientName: i === 0 ? contact.name.trim() : `${contact.name.trim()} (turno ${i + 1})`,
          clientPhone: contact.phone.trim(),
        });
        barberId = booking.barberId;
        created.push(booking);
      }
      saveClientContact(contact);
      const depositTotal = created.reduce((s, b) => s + b.depositAmount, 0);
      if (depositTotal > 0) {
        const expiries = created.map((b) => b.depositExpiresAt).filter((x): x is string => !!x).sort();
        setDeposit({ ids: created.map((b) => b.bookingId), amount: depositTotal, expiresAt: expiries[0] ?? null });
      }
      setTicket({
        bookingId: created[0].bookingId,
        clientName: contact.name.trim(),
        items: items.map(({ service, qty }) => ({ name: service.name, qty, price: service.price * qty })),
        barberName: created[0].barberName,
        date,
        time,
        price: cartPrice(items),
        endTime: minutesToTime(timeToMinutes(time) + cartDuration(items)),
        deposit: depositTotal > 0 ? depositTotal : undefined,
      });
      created.forEach((b) => notifyWhatsApp({ bookingId: b.bookingId }));
    } catch (err) {
      console.error('Error al crear la reserva', err);
      const code: BookingErrorCode = err instanceof BookingError ? err.code : 'UNKNOWN';
      if (created.length > 0) {
        // Alcanzaron a quedar algunos turnos: se avisa cuáles para que no reserve dos veces
        created.forEach((b) => notifyWhatsApp({ bookingId: b.bookingId }));
        setError(`Se reservaron ${created.length} de ${schedule.length} servicios (desde las ${time}). El siguiente ya no estaba libre: escríbenos por WhatsApp y te ayudamos.`);
      } else {
        setError(ERROR_MESSAGES[code]);
        if (BACK_TO_APPOINTMENT.includes(code)) {
          setAppointment((prev) => ({ ...prev, time: '', ...(code === 'SERVICE_NOT_FOUND' ? { items: [] } : {}) }));
          setStep('cita');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Reservar cita">
      {/* Tocar afuera no cierra la reserva (se perdería lo elegido): solo la ✕ o al terminar */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />

      <div className="relative w-full sm:max-w-2xl bg-[#0d0d0d] border border-white/10 rounded-t-3xl sm:rounded-3xl overflow-hidden animate-slide-up h-[92vh] sm:h-[min(90vh,760px)] flex flex-col">
        {ticket ? (
          <>
            <button
              onClick={onClose}
              aria-label="Cerrar"
              className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white"
            >
              <X size={16} />
            </button>
            {deposit ? (
              <DepositStep
                bookingIds={deposit.ids}
                amount={deposit.amount}
                total={ticket.price}
                expiresAt={deposit.expiresAt}
                clientName={ticket.clientName}
                onSubmitted={() => setDeposit(null)}
              />
            ) : (
              <BookingTicket ticket={ticket} onClose={onClose} />
            )}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-white/10">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-gold">Paso {step === 'cita' ? 1 : 2} de 2</p>
                <h2 className="font-serif text-xl font-bold text-white">{step === 'cita' ? 'Reserva tu cita' : 'Tus datos'}</h2>
              </div>
              <button
                onClick={onClose}
                aria-label="Cerrar"
                className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <div className="h-1 bg-white/5">
              <div className="h-full bg-gradient-to-r from-gold-400 to-gold-300 transition-all duration-500" style={{ width: step === 'cita' ? '50%' : '100%' }} />
            </div>

            {error && (
              <div className="mx-5 sm:mx-6 mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {error}{' '}
                <a
                  href={`https://wa.me/${businessConfig.whatsapp}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-red-300 hover:text-white"
                >
                  Escribir por WhatsApp
                </a>
              </div>
            )}

            <div className="flex-1 min-h-0">
              {step === 'cita' ? (
                <AppointmentStep
                  value={appointment}
                  onChange={(value) => { setAppointment(value); setError(''); }}
                  onContinue={() => { setError(''); setStep('datos'); }}
                />
              ) : (
                <DetailsStep
                  appointment={appointment}
                  contact={contact}
                  loading={loading}
                  onChange={setContact}
                  onConfirm={handleConfirm}
                  onBack={() => setStep('cita')}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
