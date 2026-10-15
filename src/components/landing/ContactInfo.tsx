import { useState, type ReactNode } from 'react';
import { MapPin, PhoneCall, Clock3, Share2, ChevronDown, Navigation, Car, Copy, Check, Phone, Instagram, Facebook } from 'lucide-react';
import { businessConfig } from '../../config/business';
import { todayKey, formatDateLong } from '../../lib/dates';
import { holidayName, upcomingHolidays } from '../../lib/holidays';
import { WhatsAppIcon, TikTokIcon } from '../common/BrandIcons';
import { socialUrl, socialHandle } from '../../lib/social';

// Panel desplegable de la sección Contacto: horarios, dirección, teléfono y redes.
// Solo una fila abierta a la vez; Horarios arranca abierta.

type ItemId = 'horarios' | 'direccion' | 'telefono' | 'redes';

interface Props {
  status: { open: boolean; label: string };
  googleDirections: string;
  waze: string;
}

function formatPhone(phone: string): string {
  const d = phone.replace(/\D/g, '').replace(/^57(?=\d{10}$)/, '');
  return d.length === 10 ? `+57 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : phone;
}

function todayIndex(): number {
  const [y, m, d] = todayKey().split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // 0 = lunes
}

function Item({
  id, icon: Icon, label, summary, open, onToggle, children,
}: {
  id: ItemId;
  icon: React.ElementType;
  label: string;
  summary: ReactNode;
  open: boolean;
  onToggle: (id: ItemId) => void;
  children: ReactNode;
}) {
  return (
    <div className={`rounded-2xl border transition-colors ${open ? 'border-gold/40 bg-gold/[0.04]' : 'border-white/10 bg-white/[0.02] hover:border-gold/30'}`}>
      <button
        type="button"
        onClick={() => onToggle(id)}
        aria-expanded={open}
        aria-controls={`contacto-${id}`}
        className="w-full flex items-center gap-4 p-4 sm:p-5 text-left"
      >
        <span className="relative w-12 h-12 rounded-2xl shrink-0 flex items-center justify-center bg-gradient-to-br from-[#F1DCA8] via-[#D9AD50] to-[#8C6A2A] text-[#141008] shadow-[0_6px_20px_-6px_rgba(217,173,80,0.7)] ring-1 ring-[#F1DCA8]/40">
          <Icon size={21} strokeWidth={2.1} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[11px] text-gold/80 uppercase tracking-[0.18em] font-semibold">{label}</span>
          <span className="block text-white font-medium mt-0.5 leading-snug">{summary}</span>
        </span>
        <ChevronDown size={20} className={`text-zinc-500 shrink-0 transition-transform duration-300 ${open ? 'rotate-180 text-gold' : ''}`} />
      </button>
      <div
        id={`contacto-${id}`}
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        {/* invisible al cerrar: así el teclado no entra a enlaces ocultos */}
        <div className={`overflow-hidden transition-[visibility] duration-300 ${open ? 'visible' : 'invisible'}`}>
          <div className="px-4 sm:px-5 pb-5">{children}</div>
        </div>
      </div>
    </div>
  );
}

const actionClass =
  'flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-white/[0.04] border border-white/12 text-white text-sm font-medium hover:border-gold/50 hover:text-gold transition-colors';

export default function ContactInfo({ status, googleDirections, waze }: Props) {
  const [openId, setOpenId] = useState<ItemId | null>('horarios');
  const [copied, setCopied] = useState(false);
  const toggle = (id: ItemId) => setOpenId((current) => (current === id ? null : id));

  const todayHoliday = holidayName(todayKey());
  const today = todayHoliday ? -1 : todayIndex(); // en festivo se resalta la fila "Festivos"
  const nextHoliday = upcomingHolidays(todayKey(), 1)[0];
  const { holidayHours } = businessConfig;
  const hourRows = [...businessConfig.hours.map((h, i) => ({ ...h, isToday: i === today })), { ...holidayHours, isToday: Boolean(todayHoliday) }];

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(`${businessConfig.address}, ${businessConfig.city}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('No se pudo copiar la dirección', err);
    }
  };

  return (
    <div className="rounded-3xl p-3 sm:p-4 border border-gold/15 bg-black/40 backdrop-blur-sm flex flex-col gap-3">
      <Item
        id="horarios"
        icon={Clock3}
        label="Horarios"
        open={openId === 'horarios'}
        onToggle={toggle}
        summary={
          <span className="flex items-start gap-2">
            <span className={`w-2 h-2 mt-2 rounded-full shrink-0 ${status.open ? 'bg-green-400 animate-pulse' : 'bg-zinc-500'}`} />
            <span>{status.label}</span>
          </span>
        }
      >
        <div className="space-y-1">
          {hourRows.map((h) => (
            <div
              key={h.day}
              className={`flex items-center justify-between px-3 py-2 rounded-lg ${h.isToday ? 'bg-gold/10 border border-gold/25' : ''}`}
            >
              <span className={`text-sm ${h.isToday ? 'text-gold font-semibold' : 'text-zinc-400'}`}>
                {h.day}{h.isToday && <span className="text-[10px] uppercase tracking-wider ml-2 opacity-80">Hoy</span>}
              </span>
              {h.closed ? (
                <span className="text-xs px-2.5 py-1 rounded-full status-busy">Cerrado</span>
              ) : (
                <span className="text-xs px-2.5 py-1 rounded-full status-available font-mono">{h.open} — {h.close}</span>
              )}
            </div>
          ))}
        </div>
        {nextHoliday && (
          <p className="text-zinc-500 text-xs mt-4 px-3">
            {todayHoliday
              ? <>Hoy es festivo: <span className="text-zinc-300">{todayHoliday}</span>.</>
              : <>Próximo festivo: <span className="text-zinc-300">{nextHoliday.name}</span>, {formatDateLong(nextHoliday.date)}.</>}
          </p>
        )}
      </Item>

      <Item id="direccion" icon={MapPin} label="Dirección" summary={businessConfig.address} open={openId === 'direccion'} onToggle={toggle}>
        <p className="text-zinc-400 text-sm mb-4">{businessConfig.address}, {businessConfig.city}, {businessConfig.country}.</p>
        <div className="grid grid-cols-2 gap-2">
          <a href={googleDirections} target="_blank" rel="noopener noreferrer" className="col-span-2 flex items-center justify-center gap-2 py-3 rounded-xl btn-gold text-sm font-semibold">
            <Navigation size={16} /> Cómo llegar
          </a>
          <a href={waze} target="_blank" rel="noopener noreferrer" className={actionClass}>
            <Car size={16} className="text-gold" /> Waze
          </a>
          <button type="button" onClick={copyAddress} className={actionClass}>
            {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} className="text-gold" />}
            {copied ? 'Copiada' : 'Copiar'}
          </button>
        </div>
      </Item>

      <Item id="telefono" icon={PhoneCall} label="Teléfono y WhatsApp" summary={formatPhone(businessConfig.phone)} open={openId === 'telefono'} onToggle={toggle}>
        <div className="grid grid-cols-2 gap-2">
          <a href={`tel:+${businessConfig.phone}`} className={actionClass}>
            <Phone size={16} className="text-gold" /> Llamar
          </a>
          <a href={`https://wa.me/${businessConfig.whatsapp}`} target="_blank" rel="noopener noreferrer" className={actionClass}>
            <WhatsAppIcon size={16} className="text-gold" /> WhatsApp
          </a>
        </div>
      </Item>

      <Item id="redes" icon={Share2} label="Síguenos" summary={socialHandle('instagram') || socialHandle('tiktok') || 'Redes sociales'} open={openId === 'redes'} onToggle={toggle}>
        <div className="grid grid-cols-3 gap-2">
          <a href={socialUrl('instagram')} target="_blank" rel="noopener noreferrer" className={`${actionClass} flex-col !gap-1.5 !py-3.5`}>
            <Instagram size={20} className="text-gold" /> Instagram
          </a>
          <a href={socialUrl('facebook')} target="_blank" rel="noopener noreferrer" className={`${actionClass} flex-col !gap-1.5 !py-3.5`}>
            <Facebook size={20} className="text-gold" /> Facebook
          </a>
          <a href={socialUrl('tiktok')} target="_blank" rel="noopener noreferrer" className={`${actionClass} flex-col !gap-1.5 !py-3.5`}>
            <TikTokIcon size={20} className="text-gold" /> TikTok
          </a>
        </div>
      </Item>
    </div>
  );
}
