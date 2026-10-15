import { useState, useEffect, useCallback } from 'react';
import { Delete, Loader2, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import AuthLayout from '../../components/layout/AuthLayout';
import { getBarbers } from '../../services/barbers';
import { barberLogin } from '../../services/barberPortal';
import type { Barber } from '../../types';
import BarberAvatar from '../../components/common/BarberAvatar';

interface Props {
  onLogin: (barber: Barber, pin: string) => void;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export default function BarberLogin({ onLogin }: Props) {
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [loadingBarbers, setLoadingBarbers] = useState(true);
  const [selectedBarber, setSelectedBarber] = useState<Barber | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    getBarbers()
      .then(setBarbers)
      .catch((err) => {
        console.error('No se pudieron cargar los barberos', err);
        setError('No se pudieron cargar los barberos. Recarga la página.');
      })
      .finally(() => setLoadingBarbers(false));
  }, []);

  const showPinError = (message: string, delay = 900) => {
    setError(message);
    setShake(true);
    setTimeout(() => { setPin(''); setError(''); setShake(false); }, delay);
  };

  // El PIN se valida en el servidor; tras 5 intentos fallidos se bloquea 15 minutos
  const validatePin = async (barber: Barber, p: string) => {
    setChecking(true);
    try {
      const result = await barberLogin(barber.id, p);
      if (result === 'OK') {
        onLogin(barber, p);
      } else if (result === 'PIN_LOCKED') {
        showPinError('Demasiados intentos. Espera 15 minutos.', 3000);
      } else {
        showPinError('PIN incorrecto. Intenta de nuevo.');
      }
    } catch (err) {
      console.error('No se pudo validar el PIN', err);
      showPinError('Error de conexión. Intenta de nuevo.', 2000);
    } finally {
      setChecking(false);
    }
  };

  const handleDigit = useCallback((d: string) => {
    if (!selectedBarber || checking || shake) return;
    setPin((current) => {
      if (current.length >= 4) return current;
      const next = current + d;
      if (next.length === 4) setTimeout(() => validatePin(selectedBarber, next), 150);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBarber, checking, shake]);

  const handleDelete = useCallback(() => setPin((p) => p.slice(0, -1)), []);

  // También se puede escribir el PIN con el teclado del computador
  useEffect(() => {
    if (!selectedBarber) return;
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) handleDigit(e.key);
      else if (e.key === 'Backspace') handleDelete();
      else if (e.key === 'Escape') { setSelectedBarber(null); setPin(''); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selectedBarber, handleDigit, handleDelete]);

  if (!selectedBarber) {
    return (
      <AuthLayout role="barber" title="Portal del barbero" subtitle="Elige tu perfil para ver tu agenda del día.">
        {loadingBarbers ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 size={26} className="animate-spin text-gold" />
            <p className="text-zinc-500 text-sm">Cargando barberos...</p>
          </div>
        ) : error ? (
          <p role="alert" className="flex items-start gap-2 text-red-300 text-sm bg-red-500/10 border border-red-500/25 rounded-xl px-3.5 py-2.5">
            <AlertCircle size={16} className="shrink-0 mt-0.5" /> {error}
          </p>
        ) : (
          <div className="space-y-3">
            {barbers.map((b) => (
              <button
                key={b.id}
                onClick={() => setSelectedBarber(b)}
                className="w-full p-4 rounded-2xl border border-white/10 bg-white/[0.03] hover:border-gold/50 hover:bg-gold/[0.05] transition-all text-left flex items-center gap-4 group"
              >
                <BarberAvatar barber={b} className="w-14 h-14 rounded-full text-lg shrink-0 border-2 border-gold/30 group-hover:border-gold transition-colors" />
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold">{b.name}</p>
                  <p className="text-zinc-500 text-xs mt-0.5 truncate">{b.specialties.slice(0, 3).join(' · ')}</p>
                </div>
                <ChevronRight size={20} className="text-zinc-600 group-hover:text-gold transition-colors shrink-0" />
              </button>
            ))}
          </div>
        )}
      </AuthLayout>
    );
  }

  const keyClass =
    'h-16 rounded-2xl border border-white/12 bg-white/[0.04] text-white text-2xl font-mono font-semibold hover:border-gold/50 hover:bg-gold/[0.08] active:scale-95 transition-all disabled:opacity-40';

  return (
    <AuthLayout role="barber" title="Ingresa tu PIN" subtitle="Escribe tu PIN de 4 números.">
      <button
        onClick={() => { setSelectedBarber(null); setPin(''); setError(''); }}
        className="flex items-center gap-1 text-zinc-400 hover:text-white text-sm -mt-2 mb-5 transition-colors"
      >
        <ChevronLeft size={16} /> Cambiar barbero
      </button>

      <div className="flex items-center gap-3 mb-7">
        <BarberAvatar barber={selectedBarber} className="w-14 h-14 rounded-full text-lg border-2 border-gold/50" />
        <div>
          <p className="text-white font-semibold text-lg leading-tight">{selectedBarber.name}</p>
          <p className="text-zinc-500 text-xs">Portal del barbero</p>
        </div>
      </div>

      <div className={`flex justify-center gap-4 mb-3 ${shake ? 'animate-[shake_0.4s_ease-in-out]' : ''}`} aria-label={`${pin.length} de 4 números`}>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`w-4 h-4 rounded-full border-2 transition-all ${
              error ? 'border-red-400 bg-red-400/60' : pin.length > i ? 'bg-gold border-gold scale-110' : 'border-zinc-600'
            }`}
          />
        ))}
      </div>
      <p role="status" className={`text-center text-sm h-5 mb-4 ${error ? 'text-red-300' : 'text-zinc-500'}`}>
        {checking ? 'Verificando...' : error}
      </p>

      <div className="grid grid-cols-3 gap-3">
        {KEYS.map((d) => (
          <button key={d} onClick={() => handleDigit(d)} disabled={checking} className={keyClass}>{d}</button>
        ))}
        <div />
        <button onClick={() => handleDigit('0')} disabled={checking} className={keyClass}>0</button>
        <button
          onClick={handleDelete}
          disabled={checking}
          aria-label="Borrar"
          className="h-16 rounded-2xl border border-white/12 bg-white/[0.02] flex items-center justify-center text-zinc-400 hover:text-white active:scale-95 transition-all"
        >
          {checking ? <Loader2 size={20} className="animate-spin text-gold" /> : <Delete size={22} />}
        </button>
      </div>
    </AuthLayout>
  );
}
