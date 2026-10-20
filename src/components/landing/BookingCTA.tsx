import { ArrowRight } from 'lucide-react';
import { ClipperIcon } from '../common/BarberIcons';
import { businessConfig } from '../../config/business';

interface BookingCTAProps {
  onBooking: () => void;
}

export default function BookingCTA({ onBooking }: BookingCTAProps) {
  return (
    <section className="py-20 relative overflow-hidden">
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(135deg, #1A1A1A 0%, #111111 50%, #161616 100%)' }}
      />
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 50%, rgba(217,173,80,0.15) 0%, transparent 50%), radial-gradient(circle at 80% 50%, rgba(215,25,32,0.1) 0%, transparent 50%)',
        }}
      />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 relative z-10">
        <div className="frame-gold rounded-3xl p-8 sm:p-16 text-center overflow-hidden">
          <div className="barber-stripe absolute top-0 left-0 right-0" />
          <div className="w-16 h-16 rounded-full bg-gold/20 border border-gold/30 flex items-center justify-center mx-auto mb-6">
            <ClipperIcon size={30} className="text-gold" />
          </div>

          <h2 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-extrabold text-ivory mb-4">
            Tu silla te espera en el{' '}
            <span className="font-script font-normal text-gold">Salón</span>
          </h2>

          <p className="text-zinc-400 text-lg max-w-2xl mx-auto mb-10">
            Reserva tu turno en línea en un minuto. Eliges el servicio, el día y con quién,
            y te esperamos en el salón.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={onBooking}
              className="btn-gold px-10 py-4 rounded-full text-base font-semibold tracking-wide w-full sm:w-auto flex items-center justify-center gap-3"
            >
              <span className="flex items-center gap-2">
                Reservar mi cita
                <ArrowRight size={18} />
              </span>
            </button>
          </div>

          <p className="text-zinc-600 text-sm mt-6">
            {businessConfig.deposit.enabled
              ? `Anticipo del ${businessConfig.deposit.percent} % por Nequi${businessConfig.deposit.allowCash === true ? ' o en efectivo' : ''} · El resto en el salón · Cambios o cancelaciones con 2 horas de anticipación`
              : 'Pago al llegar · Sin anticipo · Cambios o cancelaciones con 2 horas de anticipación'}
          </p>
        </div>
      </div>
    </section>
  );
}
