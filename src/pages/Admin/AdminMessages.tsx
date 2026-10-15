import { useState } from 'react';
import { Loader2, MessageCircle, Check, Mail, MailOpen } from 'lucide-react';
import { getContactMessages, setContactMessageRead, type ContactMessage } from '../../services/contactMessages';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import { relativeTime } from '../../hooks/useAdminNotifications';

function formatPhone(phone: string): string {
  return phone.length === 10 ? `${phone.slice(0, 3)} ${phone.slice(3, 6)} ${phone.slice(6)}` : phone;
}

function replyLink(m: ContactMessage): string {
  const text = `Hola ${m.name.split(' ')[0]}, te escribimos de Salón Hermanos por tu mensaje: "${m.message.slice(0, 120)}"`;
  return `https://wa.me/57${m.phone}?text=${encodeURIComponent(text)}`;
}

export default function AdminMessages() {
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  useAutoRefresh(() => {
    getContactMessages()
      .then((list) => { setMessages(list); setError(''); })
      .catch((err) => {
        console.error('No se pudieron cargar los mensajes', err);
        setError('No se pudieron cargar los mensajes. Se reintentará automáticamente.');
      })
      .finally(() => setLoading(false));
  }, [], 20_000);

  const toggleRead = async (m: ContactMessage, read: boolean) => {
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, read } : x)));
    try {
      await setContactMessageRead(m.id, read);
    } catch (err) {
      console.error('No se pudo actualizar el mensaje', err);
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, read: !read } : x)));
      setError('No se pudo guardar el cambio. Intenta de nuevo.');
    }
  };

  const unread = messages.filter((m) => !m.read).length;
  const shown = filter === 'unread' ? messages.filter((m) => !m.read) : messages;

  return (
    <div className="space-y-5">
      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-zinc-400 text-sm">
          Mensajes enviados desde el chat de la web. Respóndelos por WhatsApp.
        </p>
        <div className="flex glass rounded-xl overflow-hidden border border-white/10">
          {([['all', `Todos (${messages.length})`], ['unread', `Sin leer (${unread})`]] as const).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`px-4 py-2 text-sm transition-all ${filter === value ? 'bg-gold/20 text-gold' : 'text-zinc-400 hover:text-white'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-gold" />
        </div>
      ) : shown.length === 0 ? (
        <div className="glass rounded-2xl border border-white/8 py-16 text-center">
          <MessageCircle size={28} className="mx-auto text-zinc-700 mb-3" />
          <p className="text-zinc-500 text-sm">
            {filter === 'unread' ? 'No hay mensajes sin leer.' : 'Todavía no han llegado mensajes desde la web.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map((m) => (
            <div
              key={m.id}
              className={`glass rounded-2xl border p-5 transition-colors ${m.read ? 'border-white/8' : 'border-gold/40 bg-gold/[0.03]'}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gold/30 to-gold/10 border border-gold/20 flex items-center justify-center text-xs font-bold text-gold">
                    {m.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-white font-semibold flex items-center gap-2">
                      {m.name}
                      {!m.read && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gold text-dark">NUEVO</span>}
                    </p>
                    <p className="text-zinc-500 text-xs">{formatPhone(m.phone)} · {relativeTime(m.createdAt)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleRead(m, !m.read)}
                    title={m.read ? 'Marcar como no leído' : 'Marcar como leído'}
                    className="p-2 glass border border-white/10 rounded-xl text-zinc-400 hover:text-white transition-colors"
                  >
                    {m.read ? <Mail size={15} /> : <MailOpen size={15} />}
                  </button>
                  <a
                    href={replyLink(m)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => !m.read && toggleRead(m, true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-semibold transition-colors"
                  >
                    <MessageCircle size={15} />
                    Responder por WhatsApp
                  </a>
                </div>
              </div>
              <p className="text-zinc-200 text-sm whitespace-pre-wrap break-words leading-relaxed">{m.message}</p>
              {m.read && (
                <p className="text-zinc-600 text-xs mt-3 flex items-center gap-1"><Check size={12} /> Leído</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
