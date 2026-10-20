import { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing, Loader2, Share, PlusSquare, X } from 'lucide-react';
import { pushSupport, currentPushSubscription, enablePush, disablePush, sendTestPush, countPushDevices } from '../../services/push';

// «Avisos en este teléfono»: activa las notificaciones de reservas nuevas y comprobantes en el
// teléfono donde está abierto el panel. En iPhone primero hay que agregar el panel a la pantalla de inicio.

type State = 'loading' | 'off' | 'on' | 'denied' | 'ios-install' | 'unsupported';

const DISMISS_KEY = 'sh-push-banner-dismissed';

interface Props {
  /** compact: aviso en el dashboard que desaparece cuando ya está activo */
  compact?: boolean;
}

export default function PushCard({ compact = false }: Props) {
  const [state, setState] = useState<State>('loading');
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [devices, setDevices] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  });

  const refresh = async () => {
    const support = pushSupport();
    if (support !== 'ok') { setState(support); return; }
    if (Notification.permission === 'denied') { setState('denied'); return; }
    const sub = await currentPushSubscription().catch(() => null);
    setSubscription(sub);
    setState(sub ? 'on' : 'off');
    countPushDevices().then(setDevices).catch(() => setDevices(null));
  };

  useEffect(() => { refresh(); }, []);

  const activate = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const sub = await enablePush();
      setSubscription(sub);
      setState('on');
      await sendTestPush(sub).catch(() => undefined);
      setMessage({ kind: 'ok', text: 'Avisos activados. Te enviamos uno de prueba.' });
      countPushDevices().then(setDevices).catch(() => undefined);
    } catch (err) {
      console.error('No se pudieron activar los avisos', err);
      if (err instanceof Error && err.message === 'PERMISSION_DENIED') {
        setState(Notification.permission === 'denied' ? 'denied' : 'off');
        setMessage({ kind: 'error', text: 'No diste el permiso. Toca otra vez «Activar avisos» y elige «Permitir».' });
      } else {
        setMessage({ kind: 'error', text: 'No se pudieron activar los avisos. Revisa tu conexión e intenta de nuevo.' });
      }
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await disablePush();
      setSubscription(null);
      setState('off');
      setMessage({ kind: 'ok', text: 'Este teléfono ya no recibirá avisos.' });
      countPushDevices().then(setDevices).catch(() => undefined);
    } catch (err) {
      console.error('No se pudieron quitar los avisos', err);
      setMessage({ kind: 'error', text: 'No se pudieron quitar los avisos. Intenta de nuevo.' });
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    if (!subscription) return;
    setBusy(true);
    setMessage(null);
    try {
      await sendTestPush(subscription);
      setMessage({ kind: 'ok', text: 'Aviso de prueba enviado. Debe llegarte en unos segundos.' });
    } catch {
      setMessage({ kind: 'error', text: 'No se pudo enviar la prueba. Desactiva y vuelve a activar los avisos.' });
    } finally {
      setBusy(false);
    }
  };

  // En el dashboard solo se muestra mientras falta activarlo (y no lo cerraron)
  if (compact && (state === 'loading' || state === 'on' || state === 'unsupported' || dismissed)) return null;

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* sin almacenamiento */ }
  };

  return (
    <div className={`relative rounded-2xl border p-4 sm:p-5 ${state === 'on' ? 'border-emerald-500/30 bg-emerald-500/[0.05]' : 'border-gold/30 bg-gold/[0.05]'}`}>
      {compact && (
        <button onClick={dismiss} aria-label="Cerrar" className="absolute top-3 right-3 text-zinc-500 hover:text-white"><X size={16} /></button>
      )}
      <div className="flex items-start gap-3">
        <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${state === 'on' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-gold/15 text-gold'}`}>
          {state === 'on' ? <BellRing size={19} /> : state === 'denied' ? <BellOff size={19} /> : <Bell size={19} />}
        </span>
        <div className="min-w-0 flex-1 pr-5">
          <p className="text-white font-semibold">Avisos en este teléfono</p>
          <p className="text-zinc-400 text-sm mt-0.5">
            {state === 'on'
              ? 'Activados: te llega una notificación cuando alguien reserva o envía un comprobante de pago.'
              : 'Recibe una notificación en el teléfono cuando alguien reserve o envíe un comprobante, sin WhatsApp.'}
          </p>
          {devices !== null && devices > 0 && (
            <p className="text-zinc-500 text-xs mt-1">{devices === 1 ? '1 teléfono recibe avisos' : `${devices} teléfonos reciben avisos`}</p>
          )}

          {state === 'ios-install' && (
            <ol className="mt-3 space-y-1.5 text-sm text-zinc-200 list-decimal pl-5">
              <li>En Safari toca <Share size={14} className="inline -mt-0.5 text-gold" /> <strong>Compartir</strong> (abajo).</li>
              <li>Elige <PlusSquare size={14} className="inline -mt-0.5 text-gold" /> <strong>Agregar a inicio</strong> y luego <strong>Agregar</strong>.</li>
              <li>Abre el ícono <strong>«Panel Hermanos»</strong> desde la pantalla de inicio, entra y vuelve aquí para tocar <strong>Activar avisos</strong>.</li>
              <li className="text-zinc-500 text-xs list-none -ml-5">Necesitas iOS 16.4 o más reciente (Ajustes → General → Información).</li>
            </ol>
          )}
          {state === 'denied' && (
            <p className="mt-3 text-sm text-amber-300">
              Las notificaciones están bloqueadas para esta página. En Android: toca el candado junto a la dirección →
              Permisos → Notificaciones → Permitir. En iPhone: Ajustes → Notificaciones → Panel Hermanos → Permitir. Luego recarga.
            </p>
          )}
          {state === 'unsupported' && (
            <p className="mt-3 text-sm text-zinc-400">Este navegador no admite avisos. En Android usa Chrome; en iPhone, Safari con la página agregada a inicio.</p>
          )}

          <div className="flex flex-wrap gap-2 mt-3">
            {(state === 'off' || state === 'loading') && (
              <button onClick={activate} disabled={busy || state === 'loading'} className="btn-gold px-4 py-2 rounded-xl text-sm font-semibold min-h-[40px] disabled:opacity-60">
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Bell size={15} />} Activar avisos
              </button>
            )}
            {state === 'on' && (
              <>
                <button onClick={test} disabled={busy} className="btn-dark-glass px-4 py-2 rounded-xl text-sm font-semibold min-h-[40px] disabled:opacity-60">
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <BellRing size={15} />} Enviar prueba
                </button>
                <button onClick={deactivate} disabled={busy} className="btn-danger-glass px-4 py-2 rounded-xl text-sm font-semibold min-h-[40px] disabled:opacity-60">
                  <BellOff size={15} /> Desactivar en este teléfono
                </button>
              </>
            )}
          </div>
          {message && <p className={`text-sm mt-2 ${message.kind === 'ok' ? 'text-emerald-300' : 'text-rose-300'}`}>{message.text}</p>}
        </div>
      </div>
    </div>
  );
}
