import { useState, useEffect } from 'react';
import { Star, Calendar, Zap, Images } from 'lucide-react';
import { getBarbers } from '../../services/barbers';
import { businessConfig } from '../../config/business';
import type { Barber } from '../../types';
import BarberAvatar from '../common/BarberAvatar';

interface TeamProps {
  onBooking: (barber?: Barber) => void;
}

export default function Team({ onBooking }: TeamProps) {
  const [barbers, setBarbers] = useState<Barber[]>([]);

  useEffect(() => {
    getBarbers()
      .then(setBarbers)
      .catch((err) => console.error('No se pudieron cargar los barberos', err));
  }, []);

  return (
    <section id="equipo" className="py-24 relative">
      <div
        className="absolute inset-0 opacity-30"
        style={{ background: 'radial-gradient(ellipse at 70% 50%, rgba(217,173,80,0.12) 0%, transparent 60%)' }}
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10">
        <div className="text-center mb-14">
          <p className="section-label mb-3">El equipo</p>
          <h2 className="font-serif text-4xl sm:text-5xl font-extrabold text-ivory mb-4">
            {barbers.some((b) => b.role === 'manicurista')
              ? <>Nuestro <span className="font-script font-normal text-gold">equipo</span></>
              : <>Manos de <span className="font-script font-normal text-gold">oficio</span></>}
          </h2>
          <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
            Barberos de la casa, con la tijera y la navaja de siempre. Elige con quién quieres tu turno.
          </p>
        </div>

        {/* Centrado: con 1, 2 o 3 barberos quedan en el medio, y al agregar más bajan a otra fila */}
        <div className="flex flex-wrap justify-center gap-6">
          {barbers.map((barber, i) => (
            <div
              key={barber.id}
              className="w-full sm:w-[calc(50%-12px)] lg:w-[calc(33.333%-16px)] max-w-md frame-gold rounded-3xl p-7 card-hover text-center group flex flex-col"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <div className="relative inline-block mb-5 mx-auto">
                <BarberAvatar barber={barber} className="w-28 h-28 rounded-full text-3xl shadow-gold-lg mx-auto border-2 border-gold/40" />
                <span
                  className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-dark ${
                    barber.available ? 'bg-green-500' : 'bg-red-500'
                  }`}
                />
              </div>

              <span
                className={`self-center inline-block text-xs font-semibold px-3 py-1 rounded-full mb-3 ${
                  barber.available ? 'status-available' : 'status-busy'
                }`}
              >
                {barber.available ? '● Disponible' : '● Ocupado'}
              </span>

              <h3 className="font-serif text-xl font-bold text-white mb-1 group-hover:text-gold transition-colors">
                {barber.name}
              </h3>
              <p className={`text-[11px] font-semibold uppercase tracking-[0.2em] mb-2 ${barber.role === 'manicurista' ? 'text-pink-300' : 'text-gold/80'}`}>
                {barber.role === 'manicurista' ? 'Manicurista' : 'Barbero'}
              </p>

              {/* La calificación solo se muestra cuando hay reseñas reales */}
              {barber.reviewCount > 0 && (
                <div className="flex items-center justify-center gap-1 mb-4">
                  <Star size={13} className="text-gold fill-gold" />
                  <span className="text-white font-mono font-semibold text-sm">{barber.rating}</span>
                  <span className="text-zinc-500 text-xs">({barber.reviewCount} reseñas)</span>
                </div>
              )}

              <div className="flex flex-wrap gap-1.5 justify-center mb-6">
                {barber.specialties.map((spec) => (
                  <span
                    key={spec}
                    className="text-xs px-2.5 py-1 rounded-full glass border border-white/10 text-zinc-400"
                  >
                    {spec}
                  </span>
                ))}
              </div>

              <p className="text-zinc-500 text-sm mb-6 leading-relaxed flex-1">{barber.bio}</p>

              <div className="grid grid-cols-2 gap-2 mt-auto">
                <a
                  href={`/galeria?barbero=${barber.id}`}
                  className="btn-outline-gold py-2.5 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-gold/10 transition-colors"
                >
                  <Images size={14} />
                  Ver trabajos
                </a>
                <button
                  type="button"
                  onClick={() => onBooking(barber)}
                  className="btn-gold py-2.5 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 shadow-gold"
                >
                  <Calendar size={14} />
                  Reservar
                </button>
              </div>
            </div>
          ))}
        </div>

        {businessConfig.allowAnyBarber && (
        <div className="mt-10 glass-gold rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gold/20 flex items-center justify-center">
              <Zap size={18} className="text-gold" />
            </div>
            <div>
              <p className="text-white font-semibold">¿Te da igual con quién?</p>
              <p className="text-zinc-400 text-sm">Te asignamos al primer barbero que esté libre</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onBooking()}
            className="btn-gold px-6 py-2.5 rounded-full text-sm font-semibold whitespace-nowrap"
          >
            <span>Reservar ahora</span>
          </button>
        </div>
        )}
      </div>
    </section>
  );
}
