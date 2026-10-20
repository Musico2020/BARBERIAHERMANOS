import { useEffect, useState } from 'react';
import { Copy, Check, Upload, Loader2, Clock, ShieldCheck, ImageIcon } from 'lucide-react';
import { businessConfig } from '../../config/business';
import { formatCOP } from '../../data';
import { IMAGE_ACCEPT } from '../../lib/imageFile';
import { uploadReceipt, submitDeposit } from '../../services/deposits';

// Paso de anticipo al terminar la reserva: el cliente paga el porcentaje con el QR de Nequi (Bre-B),
// sube la foto del comprobante y la barbería lo verifica en Panel → Pagos.

interface Props {
  bookingIds: string[];
  amount: number;
  total: number;
  /** Hasta cuándo hay plazo para pagar (ISO) */
  expiresAt: string | null;
  clientName: string;
  onSubmitted: () => void;
}

function useCountdown(expiresAt: string | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  if (!expiresAt) return null;
  const left = Math.max(0, new Date(expiresAt).getTime() - now);
  return { left, text: `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}` };
}

export default function DepositStep({ bookingIds, amount, total, expiresAt, clientName, onSubmitted }: Props) {
  const { deposit } = businessConfig;
  const countdown = useCountdown(expiresAt);
  const [copied, setCopied] = useState<'key' | 'amount' | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [payer, setPayer] = useState(clientName);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const expired = countdown !== null && countdown.left === 0;

  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const copy = async (what: 'key' | 'amount', text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      window.setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      console.error('No se pudo copiar', err);
    }
  };

  const send = async () => {
    if (!file) { setError('Adjunta la foto o captura del comprobante de pago.'); return; }
    if (payer.trim().length < 3) { setError('Escribe el nombre de quien hizo el pago.'); return; }
    setSending(true);
    setError('');
    try {
      const path = await uploadReceipt(bookingIds[0], file);
      const result = await submitDeposit(bookingIds, payer.trim(), path);
      if (result === 'OK') onSubmitted();
      else if (result === 'EXPIRED') setError('El tiempo para pagar se venció y la hora se liberó. Escríbenos por WhatsApp y te ayudamos.');
      else setError('No encontramos tu reserva. Escríbenos por WhatsApp y te ayudamos.');
    } catch (err) {
      console.error('No se pudo enviar el comprobante', err);
      setError(err instanceof Error && err.message === 'NOT_IMAGE'
        ? 'El archivo no es una imagen. Sube una foto o captura del comprobante.'
        : 'No se pudo enviar el comprobante. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col items-center px-5 py-6 sm:px-8 overflow-y-auto max-h-[92vh]">
      <p className="section-label">Último paso</p>
      <h2 className="font-serif text-2xl font-bold text-white mt-1 text-center">Separa tu turno con el anticipo</h2>
      <p className="text-zinc-400 text-sm text-center mt-2 max-w-sm">
        Paga el <strong className="text-white">{deposit.percent} %</strong> con el QR de Nequi o Bre-B y envíanos el comprobante.
        El resto lo pagas en el salón.
      </p>

      <div className="w-full max-w-sm mt-5 rounded-2xl border border-gold/30 bg-gold/[0.06] p-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs text-zinc-400 uppercase tracking-wider">Anticipo a pagar</p>
            <p className="font-serif text-3xl font-extrabold text-gold leading-none mt-1">{formatCOP(amount)}</p>
          </div>
          <button onClick={() => copy('amount', String(amount))} className="btn-dark-glass px-3 py-2 rounded-xl text-xs font-semibold min-h-[36px]">
            {copied === 'amount' ? <Check size={13} /> : <Copy size={13} />} {copied === 'amount' ? 'Copiado' : 'Copiar valor'}
          </button>
        </div>
        <p className="text-xs text-zinc-400 mt-2">Total {formatCOP(total)} · en el salón pagas {formatCOP(total - amount)}</p>
        {countdown && (
          <p className={`inline-flex items-center gap-1.5 text-xs font-semibold mt-3 px-2.5 py-1 rounded-full ${expired ? 'bg-rose-500/15 text-rose-300' : 'bg-white/5 text-zinc-200'}`}>
            <Clock size={12} /> {expired ? 'El tiempo para pagar se venció' : `Te guardamos la hora ${countdown.text} min`}
          </p>
        )}
      </div>

      <div className="keep-dark w-full max-w-[260px] mt-5 rounded-2xl overflow-hidden shadow-2xl">
        <img src="/pago-qr.jpg" alt={`Código QR de pago Bre-B / Nequi Negocios a nombre de ${deposit.holder}`} width={600} height={902} className="w-full h-auto" />
      </div>
      <div className="w-full max-w-sm mt-3 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-[11px] text-zinc-500">Llave Bre-B · Nequi Negocios</p>
          <p className="font-mono text-white font-bold tracking-wider">{deposit.key}</p>
          <p className="text-[11px] text-zinc-500 truncate">{deposit.holder}</p>
        </div>
        <button onClick={() => copy('key', deposit.key)} className="btn-dark-glass px-3 py-2 rounded-xl text-xs font-semibold min-h-[36px] shrink-0">
          {copied === 'key' ? <Check size={13} /> : <Copy size={13} />} {copied === 'key' ? 'Copiada' : 'Copiar llave'}
        </button>
      </div>
      <p className="text-[11px] text-zinc-500 mt-2 max-w-sm text-center">
        Abre tu app (Nequi, Bancolombia, Daviplata u otra con Bre-B), escanea el código o usa la llave, y escribe el valor {formatCOP(amount)}.
      </p>

      <div className="w-full max-w-sm mt-6 space-y-3">
        <label className="block">
          <span className="text-xs text-zinc-400">Nombre de quien hizo el pago</span>
          <input
            value={payer}
            onChange={(e) => setPayer(e.target.value)}
            maxLength={80}
            className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-3 text-white text-sm focus:outline-none focus:border-gold/50"
          />
        </label>
        <label className="flex items-center gap-3 rounded-xl border border-dashed border-gold/40 bg-white/[0.02] px-4 py-3 cursor-pointer hover:bg-gold/5 min-h-[56px]">
          {preview ? <img src={preview} alt="Comprobante adjunto" className="w-12 h-12 rounded-lg object-cover" /> : <ImageIcon size={22} className="text-gold shrink-0" />}
          <span className="text-sm text-zinc-300 min-w-0">
            {file ? <span className="truncate block">{file.name}</span> : 'Adjunta la captura del comprobante'}
            <span className="block text-[11px] text-zinc-500">Foto o pantallazo del pago</span>
          </span>
          <input type="file" accept={IMAGE_ACCEPT} className="sr-only" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(''); }} />
        </label>

        {error && <p className="text-sm text-rose-300">{error}</p>}

        <button onClick={send} disabled={sending || expired} className="btn-gold w-full min-h-[48px] py-3 rounded-full text-base font-bold disabled:opacity-60">
          {sending ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
          <span>Ya pagué · enviar comprobante</span>
        </button>
        <p className="flex items-start gap-1.5 text-[11px] text-zinc-500">
          <ShieldCheck size={12} className="mt-0.5 shrink-0 text-gold" />
          La barbería revisa el pago y te confirma la cita. Si no envías el comprobante a tiempo, la hora se libera.
          Si cancelas con al menos 2 horas de anticipación te devolvemos el anticipo.
        </p>
      </div>
    </div>
  );
}
