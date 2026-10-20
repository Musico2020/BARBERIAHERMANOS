import { useEffect, useState } from 'react';
import { Copy, Check, Upload, Loader2, Clock, ShieldCheck, ImageIcon, AlertTriangle, Banknote, Smartphone, BadgeCheck } from 'lucide-react';
import { businessConfig } from '../../config/business';
import { formatCOP } from '../../data';
import { IMAGE_ACCEPT } from '../../lib/imageFile';
import { uploadReceipt, submitDeposit, chooseCashDeposit, type SubmitDepositResult } from '../../services/deposits';

// Paso de pago al terminar la reserva. El cliente elige:
//   · anticipo por transferencia (QR de Nequi / Bre-B),
//   · pago total por transferencia,
//   · anticipo en efectivo en el salón (se compromete a ir a pagarlo antes de su cita).
// En todos los casos acepta las condiciones y queda constancia en la reserva.

export type PayChoice = 'deposit' | 'full' | 'cash';

export interface DepositDone {
  method: 'transfer' | 'cash';
  /** Lo que pagó o pagará como anticipo */
  amount: number;
}

interface Props {
  bookingIds: string[];
  amount: number;
  total: number;
  /** Hasta cuándo hay plazo para elegir y pagar (ISO) */
  expiresAt: string | null;
  clientName: string;
  onDone: (result: DepositDone) => void;
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

const ERRORS: Partial<Record<SubmitDepositResult, string>> = {
  EXPIRED: 'El tiempo para pagar se venció y la hora se liberó. Escríbenos por WhatsApp y te ayudamos.',
  NOT_FOUND: 'No encontramos tu reserva. Escríbenos por WhatsApp y te ayudamos.',
  TERMS_REQUIRED: 'Debes aceptar las condiciones para continuar.',
  CASH_DISABLED: 'El pago en efectivo no está disponible en este momento. Elige transferencia.',
};

export default function DepositStep({ bookingIds, amount, total, expiresAt, clientName, onDone }: Props) {
  const { deposit } = businessConfig;
  const allowFull = deposit.allowFull !== false && total > amount;
  const allowCash = deposit.allowCash !== false;
  const countdown = useCountdown(expiresAt);
  const [choice, setChoice] = useState<PayChoice>('deposit');
  const [copied, setCopied] = useState<'key' | 'amount' | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [payer, setPayer] = useState(clientName);
  const [accepted, setAccepted] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const expired = countdown !== null && countdown.left === 0;
  const toPay = choice === 'full' ? total : amount;

  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pick = (c: PayChoice) => { setChoice(c); setAccepted(false); setError(''); };

  const copy = async (what: 'key' | 'amount', text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      window.setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      console.error('No se pudo copiar', err);
    }
  };

  const sendTransfer = async () => {
    if (!file) { setError('Adjunta la foto o captura del comprobante de pago.'); return; }
    if (payer.trim().length < 3) { setError('Escribe el nombre de quien hizo el pago.'); return; }
    if (!accepted) { setError(ERRORS.TERMS_REQUIRED!); return; }
    setSending(true);
    setError('');
    try {
      const path = await uploadReceipt(bookingIds[0], file);
      const result = await submitDeposit(bookingIds, payer.trim(), path, choice === 'full', accepted);
      if (result === 'OK') onDone({ method: 'transfer', amount: toPay });
      else setError(ERRORS[result] ?? ERRORS.NOT_FOUND!);
    } catch (err) {
      console.error('No se pudo enviar el comprobante', err);
      setError(err instanceof Error && err.message === 'NOT_IMAGE'
        ? 'El archivo no es una imagen. Sube una foto o captura del comprobante.'
        : 'No se pudo enviar el comprobante. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setSending(false);
    }
  };

  const sendCash = async () => {
    if (!accepted) { setError('Para reservar con efectivo debes aceptar el compromiso.'); return; }
    setSending(true);
    setError('');
    try {
      const result = await chooseCashDeposit(bookingIds, accepted);
      if (result === 'OK') onDone({ method: 'cash', amount });
      else setError(ERRORS[result] ?? ERRORS.NOT_FOUND!);
    } catch (err) {
      console.error('No se pudo guardar el pago en efectivo', err);
      setError('No se pudo guardar tu elección. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setSending(false);
    }
  };

  const options: { value: PayChoice; title: string; detail: string; price: number; icon: React.ElementType }[] = [
    { value: 'deposit', title: `Anticipo ${deposit.percent} %`, detail: 'Transferencia · QR Nequi / Bre-B', price: amount, icon: Smartphone },
    ...(allowFull ? [{ value: 'full' as const, title: 'Pago total 100 %', detail: 'Transferencia · no pagas nada en el salón', price: total, icon: BadgeCheck }] : []),
    ...(allowCash ? [{ value: 'cash' as const, title: 'Anticipo en efectivo', detail: 'Vas al salón a pagarlo antes de tu cita', price: amount, icon: Banknote }] : []),
  ];

  return (
    <div className="flex flex-col items-center px-5 py-6 sm:px-8 overflow-y-auto max-h-[92vh]">
      <p className="section-label">Último paso</p>
      <h2 className="font-serif text-2xl font-bold text-white mt-1 text-center">Separa tu turno</h2>
      <p className="text-zinc-400 text-sm text-center mt-2 max-w-sm">
        Elige cómo pagas. Total del servicio: <strong className="text-white">{formatCOP(total)}</strong>
      </p>
      {countdown && (
        <p className={`inline-flex items-center gap-1.5 text-xs font-semibold mt-3 px-2.5 py-1 rounded-full ${expired ? 'bg-rose-500/15 text-rose-300' : 'bg-white/5 text-zinc-200'}`}>
          <Clock size={12} /> {expired ? 'El tiempo para pagar se venció' : `Te guardamos la hora ${countdown.text} min`}
        </p>
      )}

      <div role="radiogroup" aria-label="Forma de pago" className="w-full max-w-sm mt-4 space-y-2">
        {options.map(({ value, title, detail, price, icon: Icon }) => {
          const active = choice === value;
          return (
            <button
              key={value}
              role="radio"
              aria-checked={active}
              onClick={() => pick(value)}
              className={`w-full flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors min-h-[60px] ${
                active ? 'border-gold bg-gold/[0.10]' : 'border-white/10 bg-white/[0.02] hover:border-gold/40'}`}
            >
              <span className={`w-4 h-4 rounded-full border-2 shrink-0 ${active ? 'border-gold bg-gold shadow-[inset_0_0_0_3px_#111]' : 'border-zinc-500'}`} />
              <Icon size={18} className={active ? 'text-gold shrink-0' : 'text-zinc-400 shrink-0'} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-white">{title}</span>
                <span className="block text-[11px] text-zinc-400">{detail}</span>
              </span>
              <span className={`font-mono text-sm font-bold shrink-0 ${active ? 'text-gold' : 'text-zinc-300'}`}>{formatCOP(price)}</span>
            </button>
          );
        })}
      </div>

      {choice === 'cash' ? (
        <div className="w-full max-w-sm mt-5 space-y-3">
          <div role="alert" className="rounded-2xl border border-amber-500/50 bg-amber-500/10 p-4">
            <p className="flex items-center gap-2 text-amber-300 font-bold text-sm">
              <AlertTriangle size={18} /> Atención: te comprometes a cumplir
            </p>
            <ul className="mt-2 space-y-1.5 text-[13px] text-zinc-200 leading-snug list-disc pl-5">
              <li>Debes <strong>responder por tu reserva</strong> y asistir a tu cita.</li>
              <li>
                Debes acercarte al salón (<span className="text-white">{businessConfig.address.trim()}</span>) a pagar el anticipo
                de <strong className="text-amber-200">{formatCOP(amount)}</strong> en efectivo <strong>antes de tu cita</strong>.
              </li>
              <li>Si no pagas el anticipo, la barbería puede cancelar tu reserva y liberar la hora.</li>
              <li>El resto, {formatCOP(total - amount)}, lo pagas el día del servicio.</li>
            </ul>
          </div>
          <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3">
            <input type="checkbox" checked={accepted} onChange={(e) => { setAccepted(e.target.checked); setError(''); }} className="mt-0.5 w-5 h-5 accent-yellow-500 shrink-0" />
            <span className="text-[13px] text-zinc-200">Me comprometo a cumplir mi reserva y a ir al salón a pagar el anticipo en efectivo.</span>
          </label>
          {error && <p className="text-sm text-rose-300">{error}</p>}
          <button onClick={sendCash} disabled={sending || expired || !accepted} className="btn-gold w-full min-h-[48px] py-3 rounded-full text-base font-bold disabled:opacity-60">
            {sending ? <Loader2 size={18} className="animate-spin" /> : <Banknote size={18} />}
            <span>Reservar · pago en efectivo</span>
          </button>
        </div>
      ) : (
        <>
          <div className="w-full max-w-sm mt-5 rounded-2xl border border-gold/30 bg-gold/[0.06] p-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs text-zinc-400 uppercase tracking-wider">{choice === 'full' ? 'Valor a pagar' : 'Anticipo a pagar'}</p>
                <p className="font-serif text-3xl font-extrabold text-gold leading-none mt-1">{formatCOP(toPay)}</p>
              </div>
              <button onClick={() => copy('amount', String(toPay))} className="btn-dark-glass px-3 py-2 rounded-xl text-xs font-semibold min-h-[36px]">
                {copied === 'amount' ? <Check size={13} /> : <Copy size={13} />} {copied === 'amount' ? 'Copiado' : 'Copiar valor'}
              </button>
            </div>
            <p className="text-xs text-zinc-400 mt-2">
              {choice === 'full' ? 'Pagas todo ahora; en el salón no pagas nada.' : `En el salón pagas ${formatCOP(total - amount)}`}
            </p>
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
            Abre tu app (Nequi, Bancolombia, Daviplata u otra con Bre-B), escanea el código o usa la llave, y escribe el valor {formatCOP(toPay)}.
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

            <div className="rounded-2xl border border-rose-500/40 bg-rose-500/[0.08] p-3.5">
              <p className="flex items-center gap-2 text-rose-300 font-bold text-[13px]">
                <AlertTriangle size={16} /> Importante
              </p>
              <p className="text-[12.5px] text-zinc-200 mt-1 leading-snug">
                Si <strong>no asistes a tu cita, pierdes el dinero pagado</strong>. Si necesitas cancelar, avísanos con al menos
                2 horas de anticipación.
              </p>
              <label className="flex items-start gap-3 cursor-pointer mt-3">
                <input type="checkbox" checked={accepted} onChange={(e) => { setAccepted(e.target.checked); setError(''); }} className="mt-0.5 w-5 h-5 accent-yellow-500 shrink-0" />
                <span className="text-[13px] text-white">Acepto: si no asisto a mi cita, pierdo el dinero pagado.</span>
              </label>
            </div>

            {error && <p className="text-sm text-rose-300">{error}</p>}

            <button onClick={sendTransfer} disabled={sending || expired || !accepted} className="btn-gold w-full min-h-[48px] py-3 rounded-full text-base font-bold disabled:opacity-60">
              {sending ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
              <span>Ya pagué · enviar comprobante</span>
            </button>
            <p className="flex items-start gap-1.5 text-[11px] text-zinc-500">
              <ShieldCheck size={12} className="mt-0.5 shrink-0 text-gold" />
              La barbería revisa el pago y te confirma la cita. Si no envías el comprobante a tiempo, la hora se libera.
              Al aceptar queda constancia en tu reserva.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
