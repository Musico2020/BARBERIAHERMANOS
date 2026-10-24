import { useEffect, useState } from 'react';
import { Loader2, Save, CheckCircle2, AlertCircle, Clock, RotateCcw } from 'lucide-react';
import { getServices } from '../../services/services';
import { getBarbers, saveBarberServices } from '../../services/barbers';
import { roleFor } from '../../lib/bookingCart';
import { formatCOP } from '../../data';
import { Panel } from './ui';
import BarberAvatar from '../common/BarberAvatar';
import { CategoryIcon } from '../common/BarberIcons';
import type { Barber, BarberServiceRule, Service } from '../../types';

// Panel → Configuración → Barberos: para cada barbero, qué servicios sabe hacer (solo esos se le pueden
// reservar o registrar) y cuánto cobra por cada uno (vacío = el precio general de Panel → Servicios).

type Status = { kind: 'ok' | 'error'; text: string } | null;

export default function BarberServicesSettings() {
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [barberId, setBarberId] = useState('');
  // Borrador de las reglas del barbero elegido: precio como texto para poder dejarlo vacío
  const [draft, setDraft] = useState<Record<string, { enabled: boolean; price: string }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  useEffect(() => {
    Promise.all([getBarbers(), getServices()])
      .then(([b, s]) => { setBarbers(b); setServices(s); setBarberId((id) => id || b[0]?.id || ''); })
      .catch((err) => { console.error('No se pudieron cargar barberos y servicios', err); setStatus({ kind: 'error', text: 'No se pudieron cargar los datos. Recarga la página.' }); })
      .finally(() => setLoading(false));
  }, []);

  const barber = barbers.find((b) => b.id === barberId);
  const mine = barber ? services.filter((s) => roleFor(s) === barber.role) : [];

  // Al cambiar de barbero se carga su configuración guardada
  useEffect(() => {
    if (!barber) return;
    setDraft(Object.fromEntries(mine.map((s) => {
      const rule = barber.services?.[s.id];
      return [s.id, { enabled: rule?.enabled !== false, price: rule?.price != null ? String(rule.price) : '' }];
    })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barberId, barbers, services]);
  // El aviso de «Guardado» se borra solo al cambiar de barbero
  useEffect(() => { setStatus(null); }, [barberId]);

  const set = (id: string, patch: Partial<{ enabled: boolean; price: string }>) => {
    setDraft((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
    setStatus(null);
  };

  const enabledCount = mine.filter((s) => draft[s.id]?.enabled !== false).length;

  const save = async () => {
    if (!barber) return;
    if (enabledCount === 0) return setStatus({ kind: 'error', text: `Deja al menos un servicio para ${barber.shortName}.` });
    setSaving(true);
    setStatus(null);
    try {
      const rules: Record<string, BarberServiceRule> = Object.fromEntries(mine.map((s) => {
        const d = draft[s.id] ?? { enabled: true, price: '' };
        const digits = d.price.replace(/\D/g, '');
        const price = digits === '' ? null : Number(digits);
        // El mismo precio general no se guarda como excepción
        return [s.id, { enabled: d.enabled, price: price === s.price ? null : price }];
      }));
      await saveBarberServices(barber.id, rules);
      const saved = Object.fromEntries(Object.entries(rules).filter(([, r]) => !r.enabled || r.price !== null));
      setBarbers((list) => list.map((b) => (b.id === barber.id ? { ...b, services: saved } : b)));
      setStatus({ kind: 'ok', text: `Guardado. Desde ya, la web y la agenda de ${barber.shortName} usan estos servicios y precios.` });
    } catch (err) {
      console.error('No se pudieron guardar los servicios del barbero', err);
      setStatus({ kind: 'error', text: 'No se pudo guardar. Revisa tu conexión e intenta de nuevo.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-gold" /></div>;
  }

  return (
    <div className="space-y-5">
      <Panel title="Servicios y precios por barbero" subtitle="Escoge el barbero, marca lo que sabe hacer y, si cobra distinto, escribe su precio">
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
          {barbers.map((b) => {
            const selected = b.id === barberId;
            const off = Object.values(b.services ?? {}).filter((r) => !r.enabled).length;
            const custom = Object.values(b.services ?? {}).filter((r) => r.enabled && r.price !== null).length;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => setBarberId(b.id)}
                aria-pressed={selected}
                className={`shrink-0 flex items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left transition-all ${selected ? 'border-gold bg-gold/10' : 'border-white/10 bg-white/[0.03] hover:border-gold/40'}`}
              >
                <BarberAvatar barber={b} className="w-10 h-10 rounded-full text-sm shrink-0" />
                <span>
                  <span className={`block text-sm font-semibold ${selected ? 'text-gold' : 'text-white'}`}>{b.shortName}</span>
                  <span className="block text-[11px] text-zinc-500">
                    {off || custom ? [off ? `${off} no hace` : '', custom ? `${custom} con su precio` : ''].filter(Boolean).join(' · ') : 'Todo, precio general'}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {barber && (
          <div className="mt-4 space-y-2">
            <p className="text-xs text-zinc-500">{enabledCount} de {mine.length} servicios · los que no marques no se le pueden reservar a {barber.shortName}.</p>
            {mine.map((s) => {
              const d = draft[s.id] ?? { enabled: true, price: '' };
              return (
                <div key={s.id} className={`flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2.5 ${d.enabled ? 'border-white/10 bg-white/[0.02]' : 'border-white/[0.05] opacity-60'}`}>
                  <label className="flex flex-1 min-w-[12rem] items-center gap-3 cursor-pointer select-none">
                    <input type="checkbox" className="accent-[#d9ad50] w-5 h-5 shrink-0" checked={d.enabled} onChange={(e) => set(s.id, { enabled: e.target.checked })} />
                    <CategoryIcon category={s.category} size={16} className="text-gold/70 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm text-white font-medium truncate">{s.name}</span>
                      <span className="flex items-center gap-1 text-[11px] text-zinc-500"><Clock size={10} /> {s.duration} min · general {formatCOP(s.price)}</span>
                    </span>
                  </label>
                  <div className="flex items-center gap-1.5">
                    <span className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">$</span>
                      <input
                        inputMode="numeric"
                        aria-label={`Precio de ${s.name} con ${barber.shortName}`}
                        disabled={!d.enabled}
                        value={d.price}
                        placeholder={String(s.price)}
                        onChange={(e) => set(s.id, { price: e.target.value.replace(/\D/g, '') })}
                        className="w-32 pl-6 pr-2 py-2 rounded-lg bg-black/30 border border-white/10 text-right font-mono text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-gold/60 disabled:opacity-40"
                      />
                    </span>
                    {d.price !== '' && (
                      <button type="button" onClick={() => set(s.id, { price: '' })} aria-label="Volver al precio general" title="Volver al precio general" className="w-8 h-8 rounded-lg border border-white/10 text-zinc-400 hover:text-gold flex items-center justify-center">
                        <RotateCcw size={13} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {mine.length === 0 && <p className="text-sm text-zinc-500">No hay servicios activos para este rol.</p>}
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3 pt-5 mt-5 border-t border-white/[0.06]">
          {status ? (
            <p role="status" className={`flex items-center gap-2 text-sm ${status.kind === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
              {status.kind === 'ok' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />} {status.text}
            </p>
          ) : <span />}
          <button type="button" onClick={save} disabled={saving || !barber} className="btn-gold px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Guardar {barber ? `de ${barber.shortName}` : ''}
          </button>
        </div>
      </Panel>
      <p className="text-zinc-600 text-xs px-1">
        El precio de cada barbero se usa al reservar por la web (también para el anticipo), en «Cliente nuevo» y en la Agenda. Las citas que ya existen conservan su valor.
      </p>
    </div>
  );
}
