import { useState } from 'react';
import { Search, Loader2, CalendarClock, Clock, Scissors, User, History, CalendarDays, MessageCircle, ShieldCheck } from 'lucide-react';
import PublicLayout from '../components/layout/PublicLayout';
import { usePageMeta } from '../hooks/usePageMeta';
import { businessConfig } from '../config/business';
import { formatCOP } from '../data';
import { todayKey, nowMinutes, timeToMinutes, formatDateLong, time12, addDays } from '../lib/dates';
import { loadClientContact } from '../lib/clientContact';
import { findClientBookings, type ClientBooking } from '../services/clientLookup';

// «Mis citas»: el cliente escribe su celular y su primer nombre y ve su próxima cita, las pendientes
// y el historial. Solo consulta: para cambiar o cancelar se escribe por WhatsApp.

const STATUS: Record<ClientBooking['status'], { label: string; tone: string }> = {
  pending: { label: 'Pendiente', tone: 'text-amber-300 bg-amber-500/10 border-amber-500/30' },
  confirmed: { label: 'Confirmada', tone: 'text-sky-300 bg-sky-500/10 border-sky-500/30' },
  completed: { label: 'Atendida', tone: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' },
  cancelled: { label: 'Cancelada', tone: 'text-zinc-400 bg-white/5 border-white/10' },
  'no-show': { label: 'No asistió', tone: 'text-rose-300 bg-rose-500/10 border-rose-500/30' },
};

const inputClass = 'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-base placeholder-zinc-600 focus:outline-none focus:border-gold/60';

/** «Hoy», «Mañana» o «En 5 días» */
function whenLabel(date: string): string {
  const today = todayKey();
  if (date === today) return 'Hoy';
  if (date === addDays(today, 1)) return 'Mañana';
  const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  return `En ${days} días`;
}

function Row({ b }: { b: ClientBooking }) {
  const s = STATUS[b.status];
  return (
    <li className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-white font-semibold capitalize">{formatDateLong(b.date)}</p>
          <p className="text-gold font-mono text-sm">{time12(b.time)}</p>
        </div>
        <span className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${s.tone}`}>{s.label}</span>
      </div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-zinc-300 text-sm mt-2">
        <span className="inline-flex items-center gap-1.5"><Scissors size={13} className="text-gold/70" />{b.service}</span>
        <span className="inline-flex items-center gap-1.5"><User size={13} className="text-gold/70" />{b.barber}</span>
        <span className="font-mono text-zinc-400">{formatCOP(b.price)}</span>
      </p>
    </li>
  );
}

export default function MyBookingsPage() {
  usePageMeta({
    title: 'Mis citas | Salón Hermanos',
    description: 'Consulta tu próxima cita y tu historial en Salón Hermanos con tu número de celular.',
    noindex: true,
  });
  const saved = loadClientContact();
  const [phone, setPhone] = useState(saved.phone);
  const [name, setName] = useState(saved.name.split(' ')[0] ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ name: string; bookings: ClientBooking[] } | null>(null);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.replace(/\D/g, '').length < 10) return setError('Escribe tu número de celular de 10 dígitos.');
    if (name.trim().length < 2) return setError('Escribe tu primer nombre, como lo diste al reservar.');
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const r = await findClientBookings(phone, name);
      if (r.status === 'OK') setResult({ name: r.name, bookings: r.bookings });
      else if (r.status === 'TOO_MANY') setError('Hiciste muchas consultas con este número. Intenta de nuevo en una hora.');
      else setError('No encontramos citas con ese celular y ese nombre. Revisa que sea el mismo número y el primer nombre con que reservaste.');
    } catch (err) {
      console.error('No se pudo consultar', err);
      setError('No pudimos consultar en este momento. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const today = todayKey();
  const now = nowMinutes();
  const isUpcoming = (b: ClientBooking) =>
    (b.status === 'pending' || b.status === 'confirmed') && (b.date > today || (b.date === today && timeToMinutes(b.time) >= now - 30));
  const upcoming = (result?.bookings ?? []).filter(isUpcoming).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  const history = (result?.bookings ?? []).filter((b) => !isUpcoming(b));
  const next = upcoming[0];
  const visits = history.filter((b) => b.status === 'completed').length;
  const waText = encodeURIComponent(`Hola, soy ${result?.name ?? name}. Quiero cambiar o cancelar mi cita${next ? ` del ${formatDateLong(next.date)} a las ${time12(next.time)}` : ''}.`);

  return (
    <PublicLayout>
      {(openBooking) => (
        <div className="pt-28 sm:pt-32 pb-20 px-4">
          <div className="max-w-2xl mx-auto">
            <p className="section-label text-center">Clientes</p>
            <h1 className="font-serif text-3xl sm:text-4xl font-bold text-white text-center mt-1">Mis citas</h1>
            <p className="text-zinc-400 text-center mt-2">Consulta tu próxima cita y tu historial con el celular con que reservaste.</p>

            <form onSubmit={search} className="mt-8 rounded-2xl border border-gold/25 bg-white/[0.02] p-5 space-y-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs text-zinc-400 uppercase tracking-wider block mb-2">Celular</span>
                  <input className={inputClass} type="tel" inputMode="tel" autoComplete="tel" placeholder="300 123 4567" value={phone} onChange={(e) => { setPhone(e.target.value); setError(''); }} />
                </label>
                <label className="block">
                  <span className="text-xs text-zinc-400 uppercase tracking-wider block mb-2">Primer nombre</span>
                  <input className={inputClass} autoComplete="given-name" placeholder="Ej: Carlos" value={name} onChange={(e) => { setName(e.target.value); setError(''); }} />
                </label>
              </div>
              {error && <p className="text-rose-300 text-sm">{error}</p>}
              <button type="submit" disabled={loading} className="btn-gold w-full min-h-[48px] py-3 rounded-full text-base font-bold disabled:opacity-60">
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
                <span>Buscar mis citas</span>
              </button>
              <p className="flex items-start gap-1.5 text-[11px] text-zinc-500">
                <ShieldCheck size={12} className="mt-0.5 shrink-0 text-gold" />
                Pedimos tu nombre además del celular para que nadie más pueda ver tus citas.
              </p>
            </form>

            {result && (
              <div className="mt-8 space-y-7">
                <p className="text-white text-lg">
                  Hola, <span className="font-semibold text-gold">{result.name}</span>
                  {visits > 0 && <span className="text-zinc-400 text-sm"> · nos has visitado {visits} {visits === 1 ? 'vez' : 'veces'}</span>}
                </p>

                {next ? (
                  <section className="frame-gold rounded-3xl p-5 sm:p-6">
                    <p className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-gold font-semibold">
                      <CalendarClock size={15} /> Tu próxima cita · {whenLabel(next.date)}
                    </p>
                    <p className="font-serif text-2xl sm:text-3xl font-bold text-white mt-2 capitalize">{formatDateLong(next.date)}</p>
                    <p className="flex items-center gap-2 font-mono text-xl text-gold mt-1"><Clock size={18} /> {time12(next.time)}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-zinc-200 mt-3">
                      <span className="inline-flex items-center gap-1.5"><Scissors size={15} className="text-gold/80" />{next.service}</span>
                      <span className="inline-flex items-center gap-1.5"><User size={15} className="text-gold/80" />con {next.barber}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-3 text-sm">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${STATUS[next.status].tone}`}>{STATUS[next.status].label}</span>
                      <span className="text-zinc-400">Total {formatCOP(next.price)}</span>
                      {next.deposit > 0 && next.depositStatus === 'verified' && <span className="text-emerald-300">· anticipo de {formatCOP(next.deposit)} recibido</span>}
                      {next.deposit > 0 && next.depositStatus === 'submitted' && <span className="text-amber-300">· anticipo en revisión</span>}
                    </div>
                    <p className="text-zinc-500 text-xs mt-3">📍 {businessConfig.address.trim()}</p>
                  </section>
                ) : (
                  <section className="rounded-2xl border border-dashed border-white/15 p-6 text-center">
                    <p className="text-white font-semibold">No tienes citas pendientes</p>
                    <p className="text-zinc-400 text-sm mt-1">Reserva tu próximo turno en segundos.</p>
                  </section>
                )}

                <div className="flex flex-col sm:flex-row gap-3">
                  <button onClick={() => openBooking()} className="btn-gold flex-1 min-h-[46px] py-3 rounded-full font-bold">
                    <CalendarDays size={17} /> <span>Reservar otra cita</span>
                  </button>
                  {next && (
                    <a href={`https://wa.me/${businessConfig.whatsapp}?text=${waText}`} target="_blank" rel="noopener noreferrer" className="btn-outline-gold flex-1 min-h-[46px] py-3 rounded-full font-semibold text-center inline-flex items-center justify-center gap-2">
                      <MessageCircle size={17} /> Cambiar o cancelar
                    </a>
                  )}
                </div>

                {upcoming.length > 1 && (
                  <section>
                    <h2 className="flex items-center gap-2 text-white font-semibold mb-3"><CalendarClock size={17} className="text-gold" /> Citas pendientes ({upcoming.length})</h2>
                    <ul className="space-y-2">{upcoming.map((b) => <Row key={b.id} b={b} />)}</ul>
                  </section>
                )}

                <section>
                  <h2 className="flex items-center gap-2 text-white font-semibold mb-3"><History size={17} className="text-gold" /> Historial ({history.length})</h2>
                  {history.length === 0 ? (
                    <p className="text-zinc-500 text-sm">Todavía no tienes citas anteriores.</p>
                  ) : (
                    <ul className="space-y-2">{history.map((b) => <Row key={b.id} b={b} />)}</ul>
                  )}
                </section>
              </div>
            )}
          </div>
        </div>
      )}
    </PublicLayout>
  );
}
