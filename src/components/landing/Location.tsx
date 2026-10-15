import { useState, useEffect } from 'react';
import { Navigation, Copy, Check, Car } from 'lucide-react';
import { businessConfig } from '../../config/business';
import { openStatus } from '../../lib/businessHours';
import BarberMap from './BarberMap';
import ContactInfo from './ContactInfo';

// Con coordenadas se va al punto exacto; sin ellas, a la dirección escrita
const place = businessConfig.location;
const query = encodeURIComponent(`${businessConfig.address}, Colombia`);
const GOOGLE_DIRECTIONS = place
  ? `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`
  : `https://www.google.com/maps/dir/?api=1&destination=${query}`;
const WAZE = place ? `https://waze.com/ul?ll=${place.lat},${place.lng}&navigate=yes` : `https://waze.com/ul?q=${query}&navigate=yes`;

export default function Location() {
  const [status, setStatus] = useState(openStatus);
  const [copied, setCopied] = useState(false);

  // Actualiza "Abierto / Cerrado" cada minuto
  useEffect(() => {
    const timer = window.setInterval(() => setStatus(openStatus()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(`${businessConfig.name}, ${businessConfig.address}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('No se pudo copiar la dirección', err);
    }
  };

  return (
    <section id="contacto" className="py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-14">
          <p className="section-label mb-3">Ubicación y horarios</p>
          <h2 className="font-serif text-4xl sm:text-5xl font-bold text-white mb-4">
            Visítanos en <span className="gold-text">{businessConfig.city}</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 order-1 lg:order-2 rounded-2xl overflow-hidden border border-gold/25 relative min-h-[420px] lg:min-h-[560px] shadow-2xl">
            <BarberMap />

            <div className="absolute top-4 left-4 z-[500] pointer-events-none">
              <span
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-semibold border backdrop-blur-md ${
                  status.open ? 'bg-green-500/15 border-green-500/40 text-green-300' : 'bg-black/70 border-white/15 text-zinc-300'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${status.open ? 'bg-green-400 animate-pulse' : 'bg-zinc-500'}`} />
                {status.label}
              </span>
            </div>

            <div className="absolute bottom-0 inset-x-0 z-[500] p-3 sm:p-4 bg-gradient-to-t from-black/90 via-black/60 to-transparent">
              <div className="flex flex-wrap gap-2">
                <a
                  href={GOOGLE_DIRECTIONS}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 min-w-[140px] flex items-center justify-center gap-2 py-3 rounded-xl btn-gold text-sm font-semibold"
                >
                  <Navigation size={16} />
                  <span>Cómo llegar</span>
                </a>
                <a
                  href={WAZE}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#141414]/90 border border-white/15 text-white text-sm font-medium hover:border-gold/50 transition-colors"
                >
                  <Car size={16} className="text-gold" />
                  Waze
                </a>
                <button
                  onClick={copyAddress}
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#141414]/90 border border-white/15 text-white text-sm font-medium hover:border-gold/50 transition-colors"
                >
                  {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} className="text-gold" />}
                  {copied ? 'Copiada' : 'Copiar dirección'}
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 order-2 lg:order-1">
            <ContactInfo status={status} googleDirections={GOOGLE_DIRECTIONS} waze={WAZE} />
          </div>
        </div>
      </div>
    </section>
  );
}
