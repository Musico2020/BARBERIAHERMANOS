import { useState } from 'react';
import { Star, Loader2, Send } from 'lucide-react';
import { rateBooking, type ClientBooking } from '../../services/clientLookup';

// Calificar con estrellas una cita atendida desde «Mis citas». Se puede cambiar después.

const LABELS = ['', 'Mala', 'Regular', 'Buena', 'Muy buena', '¡Excelente!'];

interface Props {
  booking: ClientBooking;
  phone: string;
  name: string;
  onRated: (rating: number, comment: string) => void;
}

export default function RateBooking({ booking, phone, name, onRated }: Props) {
  const [editing, setEditing] = useState(booking.rating === null);
  const [stars, setStars] = useState(booking.rating ?? 0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState(booking.comment ?? '');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const shown = hover || stars;

  const send = async () => {
    if (!stars) return setMessage({ ok: false, text: 'Toca las estrellas para calificar.' });
    setSending(true);
    setMessage(null);
    try {
      const result = await rateBooking(phone, name, booking.id, stars, comment);
      if (result === 'OK') {
        onRated(stars, comment.trim());
        setEditing(false);
        setMessage({ ok: true, text: '¡Gracias por calificar!' });
      } else {
        setMessage({ ok: false, text: result === 'TOO_MANY' ? 'Demasiados intentos. Intenta más tarde.' : 'No pudimos guardar tu calificación.' });
      }
    } catch (err) {
      console.error('No se pudo calificar', err);
      setMessage({ ok: false, text: 'Error de conexión. Intenta de nuevo.' });
    } finally {
      setSending(false);
    }
  };

  if (!editing) {
    return (
      <div className="mt-3 pt-3 border-t border-white/[0.06] flex flex-wrap items-center gap-2">
        <span className="flex" aria-label={`Calificaste con ${booking.rating} de 5 estrellas`}>
          {[1, 2, 3, 4, 5].map((n) => <Star key={n} size={16} className={n <= (booking.rating ?? 0) ? 'text-gold fill-gold' : 'text-zinc-600'} />)}
        </span>
        <span className="text-xs text-zinc-400">Tu calificación</span>
        {booking.comment && <span className="text-xs text-zinc-500 italic w-full">“{booking.comment}”</span>}
        {message?.ok && <span className="text-xs text-emerald-300">{message.text}</span>}
        <button onClick={() => { setEditing(true); setMessage(null); }} className="ml-auto text-xs text-gold underline underline-offset-2">Cambiar</button>
      </div>
    );
  }

  return (
    <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-2.5">
      <p className="text-xs text-zinc-300">¿Cómo te atendió {booking.barber}?</p>
      <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => { setStars(n); setMessage(null); }}
            onMouseEnter={() => setHover(n)}
            aria-label={`${n} ${n === 1 ? 'estrella' : 'estrellas'}`}
            aria-pressed={stars === n}
            className="p-1 -m-0.5"
          >
            <Star size={28} className={`transition-transform ${n <= shown ? 'text-gold fill-gold scale-110' : 'text-zinc-600'}`} />
          </button>
        ))}
        {shown > 0 && <span className="ml-2 text-sm font-semibold text-gold">{LABELS[shown]}</span>}
      </div>
      {stars > 0 && (
        <>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value.slice(0, 300))}
            rows={2}
            placeholder="Cuéntanos algo (opcional)"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-gold/50 resize-none"
          />
          <div className="flex items-center gap-2">
            <button onClick={send} disabled={sending} className="btn-gold px-4 py-2 rounded-full text-sm font-bold disabled:opacity-60">
              {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} <span>Enviar calificación</span>
            </button>
            {booking.rating !== null && (
              <button onClick={() => { setEditing(false); setStars(booking.rating ?? 0); setMessage(null); }} className="text-xs text-zinc-400">Cancelar</button>
            )}
          </div>
        </>
      )}
      {message && !message.ok && <p className="text-xs text-rose-300">{message.text}</p>}
    </div>
  );
}
