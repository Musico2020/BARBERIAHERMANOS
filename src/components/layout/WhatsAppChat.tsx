import { useState, useEffect, useRef } from 'react';
import { X, Send, Loader2, CheckCheck, CalendarPlus, RotateCcw, Sparkles, MessageSquareText, ArrowLeft } from 'lucide-react';
import { businessConfig } from '../../config/business';
import { sendContactMessage, ContactMessageSendError, type ContactMessageError } from '../../services/contactMessages';
import { askAssistant, AssistantError, type AssistantAction, type ChatTurn } from '../../services/assistant';
import { loadClientContact, saveClientContact } from '../../lib/clientContact';

// Chat flotante de la web con asistente (IA): responde precios, horarios, ubicación y cupos al instante
// y lleva a reservar. Lo que no sabe lo deja en Panel → Mensajes para que la barbería responda por WhatsApp.
// Si el asistente no está disponible, el chat pasa al modo anterior: el cliente deja su mensaje.

function WhatsAppIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

const ERRORS: Record<ContactMessageError, string> = {
  INVALID_NAME: 'Escribe tu nombre.',
  INVALID_PHONE: 'Revisa tu celular: debe tener al menos 10 dígitos.',
  INVALID_MESSAGE: 'Escribe tu mensaje (máximo 1000 caracteres).',
  TOO_MANY_MESSAGES: 'Ya recibimos varios mensajes tuyos. Espera un momento o escríbenos directo por WhatsApp.',
  UNKNOWN: 'No se pudo enviar. Revisa tu conexión o escríbenos directo por WhatsApp.',
};

const SUGGESTIONS = ['¿Cuánto cuesta un corte?', '¿Hay cupo hoy?', '¿Dónde quedan?', '¿Qué horario tienen?'];
const STORAGE_KEY = 'eb-chat';

interface ChatItem extends ChatTurn {
  actions?: AssistantAction[];
  /** Respuesta de error local (no se envía al asistente como historial) */
  local?: boolean;
  time?: string;
}

const clock = () => new Date().toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true });

function loadConversation(): ChatItem[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ChatItem[]) : [];
  } catch {
    return [];
  }
}

interface Props {
  /** Abre la ventana de reserva */
  onBooking?: () => void;
}

export default function WhatsAppChat({ onBooking }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'ai' | 'form'>('ai');
  // true si se pasó a «dejar mensaje» porque el asistente no respondió (no porque el cliente lo eligió)
  const [assistantDown, setAssistantDown] = useState(false);
  const [items, setItems] = useState<ChatItem[]>(loadConversation);
  const [contact, setContact] = useState(loadClientContact);
  const [editingContact, setEditingContact] = useState(() => !loadClientContact().name);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(-40))); } catch { /* sin almacenamiento: no pasa nada */ }
  }, [items]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => textareaRef.current?.focus(), 150);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [items, open, sending]);

  // ---------------- modo asistente
  const askAI = async (text: string) => {
    const question = text.trim();
    if (!question || sending) return;
    const next: ChatItem[] = [...items, { role: 'user', content: question, time: clock() }];
    setItems(next);
    setMessage('');
    setError('');
    setSending(true);
    try {
      const history = next.filter((i) => !i.local).map(({ role, content }) => ({ role, content }));
      const { reply, actions } = await askAssistant(history);
      setItems((prev) => [...prev, { role: 'assistant', content: reply, actions, time: clock() }]);
    } catch (err) {
      console.error('El asistente no respondió', err);
      if (err instanceof AssistantError && err.unavailable) {
        // Sin asistente: se guarda la pregunta para enviarla como mensaje a la barbería
        setMode('form');
        setAssistantDown(true);
        setMessage(question);
        setItems((prev) => prev.slice(0, -1));
      } else {
        setItems((prev) => [...prev, { role: 'assistant', local: true, content: err instanceof Error ? err.message : 'No pude responder. Intenta de nuevo.' }]);
      }
    } finally {
      setSending(false);
    }
  };

  // ---------------- modo mensaje (sin asistente)
  const phoneDigits = contact.phone.replace(/\D/g, '');
  const canSendForm = contact.name.trim().length >= 2 && phoneDigits.length >= 10 && message.trim().length > 0 && !sending;

  const sendForm = async () => {
    if (!canSendForm) return;
    setSending(true);
    setError('');
    const text = message.trim();
    try {
      await sendContactMessage(contact.name.trim(), contact.phone.trim(), text);
      saveClientContact(contact);
      setItems((prev) => [
        ...prev,
        { role: 'user', content: text, time: clock(), local: true },
        { role: 'assistant', local: true, content: `¡Recibido, ${contact.name.split(' ')[0]}! Te escribiremos al WhatsApp ${contact.phone}. ¿Algo más?` },
      ]);
      setMessage('');
      setEditingContact(false);
    } catch (err) {
      console.error('No se pudo enviar el mensaje del chat', err);
      setError(ERRORS[err instanceof ContactMessageSendError ? err.code : 'UNKNOWN']);
    } finally {
      setSending(false);
    }
  };

  const submit = () => (mode === 'ai' ? askAI(message) : sendForm());
  const canSubmit = mode === 'ai' ? message.trim().length > 0 && !sending : canSendForm;
  const reset = () => { setItems([]); setError(''); setMode('ai'); setAssistantDown(false); };

  // Pasar a «dejar mensaje» con la última pregunta del cliente ya escrita
  const startHandoff = () => {
    const lastQuestion = [...items].reverse().find((i) => i.role === 'user')?.content ?? '';
    setMode('form');
    setMessage((m) => m || lastQuestion);
    setEditingContact(!contact.name || contact.phone.replace(/\D/g, '').length < 10);
  };

  const whatsappLink = `https://wa.me/${businessConfig.whatsapp}?text=${encodeURIComponent(message.trim() || 'Hola, quiero información sobre sus servicios.')}`;
  const hasUserMessages = items.some((i) => i.role === 'user');

  return (
    <div className="fixed bottom-5 right-5 z-[90] flex flex-col items-end gap-3">
      {open && (
        <div
          role="dialog"
          aria-label="Chat con Salón Hermanos"
          className="w-[calc(100vw-2.5rem)] max-w-sm rounded-2xl overflow-hidden border border-gold/30 shadow-2xl bg-[#111] flex flex-col animate-slide-up"
          style={{ height: 'min(600px, calc(100vh - 7rem))' }}
        >
          <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-gold-500 to-gold-400 text-dark">
            <div className="w-10 h-10 rounded-full bg-dark flex items-center justify-center shrink-0">
              <img src="/logo-salon-hermanos.png" alt="" className="w-8 h-8 object-contain" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold leading-tight">{businessConfig.name}</p>
              <p className="text-xs opacity-80 flex items-center gap-1.5">
                {mode === 'ai'
                  ? <><Sparkles size={11} /> Asistente virtual · responde al instante</>
                  : <><span className="w-1.5 h-1.5 rounded-full bg-green-700" /> Te respondemos por WhatsApp</>}
              </p>
            </div>
            {hasUserMessages && (
              <button onClick={reset} aria-label="Empezar de nuevo" title="Empezar de nuevo" className="w-9 h-9 rounded-full hover:bg-black/10 flex items-center justify-center">
                <RotateCcw size={16} />
              </button>
            )}
            <button onClick={() => setOpen(false)} aria-label="Cerrar chat" className="w-9 h-9 rounded-full hover:bg-black/10 flex items-center justify-center">
              <X size={18} />
            </button>
          </div>

          <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-[#0b0b0b]" aria-live="polite">
            <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white/8 border border-white/10 px-3.5 py-2.5 text-sm text-zinc-200">
              {mode === 'ai'
                ? <>¡Hola! 👋 Soy el asistente de {businessConfig.name}. Pregúntame por precios, horarios, cómo llegar o si hay cupo, y te ayudo a reservar.</>
                : assistantDown
                  ? <>¡Hola! 👋 Ahora mismo el asistente no está disponible. Déjanos tu mensaje y te responderemos por WhatsApp lo antes posible.</>
                  : <>Déjanos tu nombre, tu celular y tu mensaje: la barbería te responde por WhatsApp lo antes posible.</>}
            </div>

            {items.map((m, i) => m.role === 'user' ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-gold/90 text-dark px-3.5 py-2.5 text-sm whitespace-pre-wrap break-words">
                  {m.content}
                  {m.time && <span className="flex items-center justify-end gap-1 text-[10px] opacity-70 mt-1">{m.time} <CheckCheck size={12} /></span>}
                </div>
              </div>
            ) : (
              <div key={i} className="space-y-2">
                <div className={`max-w-[85%] rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-sm whitespace-pre-wrap break-words ${m.local && mode === 'ai' ? 'bg-red-500/10 border border-red-500/20 text-red-300' : 'bg-white/8 border border-white/10 text-zinc-200'}`}>
                  {m.content}
                </div>
                {m.actions?.some((a) => a.type === 'message_sent') && (
                  <p className="flex items-center gap-1.5 text-[11px] text-emerald-400"><CheckCheck size={13} /> Mensaje enviado a la barbería</p>
                )}
                {m.actions?.some((a) => a.type === 'handoff') && mode === 'ai' && i === items.length - 1 && (
                  <button
                    onClick={startHandoff}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-gold/50 text-gold text-sm font-semibold hover:bg-gold/10 mr-2"
                  >
                    <MessageSquareText size={16} /> Dejar mensaje a la barbería
                  </button>
                )}
                {m.actions?.some((a) => a.type === 'book') && onBooking && (
                  <button
                    onClick={() => { setOpen(false); onBooking(); }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-gold-400 to-gold-500 text-dark text-sm font-semibold hover:brightness-110"
                  >
                    <CalendarPlus size={16} /> Reservar ahora
                  </button>
                )}
              </div>
            ))}

            {sending && mode === 'ai' && (
              <div className="inline-flex items-center gap-1 rounded-2xl rounded-tl-sm bg-white/8 border border-white/10 px-4 py-3" aria-label="Escribiendo">
                {[0, 1, 2].map((d) => <span key={d} className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: `${d * 150}ms` }} />)}
              </div>
            )}

            {mode === 'ai' && !hasUserMessages && (
              <div className="flex flex-wrap gap-2 pt-1">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => askAI(s)} className="px-3 py-1.5 rounded-full border border-gold/40 text-gold text-xs hover:bg-gold/10">
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-white/10 p-3 space-y-2 bg-[#111]">
            {mode === 'form' && (editingContact ? (
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={contact.name}
                  onChange={(e) => setContact((c) => ({ ...c, name: e.target.value }))}
                  placeholder="Tu nombre"
                  aria-label="Tu nombre"
                  autoComplete="name"
                  maxLength={80}
                  className="px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-gold/50"
                />
                <input
                  value={contact.phone}
                  onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))}
                  placeholder="Tu celular"
                  aria-label="Tu celular"
                  type="tel"
                  autoComplete="tel"
                  maxLength={20}
                  className="px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-gold/50"
                />
              </div>
            ) : (
              <p className="text-xs text-zinc-500">
                Como <span className="text-zinc-300">{contact.name}</span> · {contact.phone}{' '}
                <button onClick={() => setEditingContact(true)} className="text-gold hover:underline">cambiar</button>
              </p>
            ))}

            {mode === 'form' && !assistantDown && (
              <button onClick={() => { setMode('ai'); setError(''); }} className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-gold">
                <ArrowLeft size={12} /> Volver al asistente
              </button>
            )}
            {error && <p className="text-xs text-red-400">{error}</p>}

            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder={mode === 'ai' ? 'Escribe tu pregunta...' : 'Escribe tu mensaje...'}
                aria-label="Mensaje"
                rows={1}
                maxLength={1000}
                className="flex-1 resize-none max-h-28 px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-gold/50"
              />
              <button
                onClick={submit}
                disabled={!canSubmit}
                aria-label="Enviar mensaje"
                className="w-11 h-11 shrink-0 rounded-full bg-gradient-to-br from-gold-300 to-gold-500 text-dark flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition"
              >
                {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={17} />}
              </button>
            </div>
            <a
              href={whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center text-[11px] text-zinc-500 hover:text-gold transition-colors"
            >
              ¿Prefieres hablar con una persona? Escríbenos por WhatsApp
            </a>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Cerrar chat' : 'Abrir chat con el asistente'}
        aria-expanded={open}
        className="relative w-14 h-14 rounded-full bg-gradient-to-br from-gold-300 via-gold-400 to-gold-600 text-white shadow-gold-lg flex items-center justify-center hover:scale-105 transition-transform"
      >
        {!open && <span className="absolute inset-0 rounded-full bg-gold/40 animate-ping" style={{ animationDuration: '2.5s' }} />}
        {open ? <X size={24} className="relative" /> : <WhatsAppIcon className="relative w-7 h-7 drop-shadow" />}
      </button>
    </div>
  );
}
