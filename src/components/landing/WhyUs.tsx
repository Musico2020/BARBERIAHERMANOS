import { Zap, Wallet, Ticket } from 'lucide-react';
import { businessConfig } from '../../config/business';

const features = [
  {
    icon: Zap,
    title: 'Tu turno en un minuto',
    desc: 'Eliges servicio, día, barbero y hora desde el celular. Llegas a tu hora y te atendemos sin esperas.',
    color: 'from-gold/20 to-transparent',
    border: 'border-gold/25',
  },
  {
    icon: Wallet,
    title: businessConfig.deposit.enabled ? 'Separas con un anticipo' : 'Pagas en el salón',
    desc: businessConfig.deposit.enabled
      ? `Apartas tu hora con el ${businessConfig.deposit.percent} % por Nequi o Bre-B desde la misma reserva (o lo pagas en efectivo en el salón antes de tu cita), y el resto el día del servicio.`
      : 'No necesitas tarjeta para reservar. Pagas el servicio cuando llegas, sin cobros anticipados.',
    color: 'from-barber-blue/25 to-transparent',
    border: 'border-barber-blue/40',
  },
  {
    icon: Ticket,
    title: 'Ticket y confirmación',
    desc: 'Al reservar recibes tu ticket con el código de tu cita y la confirmación por WhatsApp.',
    color: 'from-barber-red/20 to-transparent',
    border: 'border-barber-red/35',
  },
];

export default function WhyUs() {
  return (
    <section className="py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <p className="section-label mb-3">Club de Caballeros</p>
          <h2 className="font-serif text-4xl sm:text-5xl font-extrabold text-ivory">
            Tradición con <span className="font-script font-normal text-gold">comodidad</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className={`frame-gold rounded-3xl p-7 border ${f.border} card-hover relative overflow-hidden group`}
              >
                <div
                  className={`absolute top-0 left-0 w-full h-full bg-gradient-to-br ${f.color} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
                />
                <div className="relative z-10">
                  <div className="w-12 h-12 rounded-xl glass border border-white/10 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                    <Icon size={22} className="text-gold" />
                  </div>
                  <h3 className="font-serif text-xl font-bold text-white mb-3">{f.title}</h3>
                  <p className="text-zinc-400 text-sm leading-relaxed">{f.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
