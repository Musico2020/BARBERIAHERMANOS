 import { useState, useEffect } from 'react';
import { Star, CheckCircle } from 'lucide-react';
import { ClipperIcon } from '../../components/common/BarberIcons';
import { getBarbers } from '../../services/barbers';
import { supabase } from '../../lib/supabase';
import type { Barber } from '../../types';
import BarberAvatar from '../../components/common/BarberAvatar';

export default function ReviewPage() {
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [selectedBarber, setSelectedBarber] = useState<Barber | null>(null);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [clientName, setClientName] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getBarbers()
      .then(setBarbers)
      .catch((err) => console.error('No se pudieron cargar los barberos', err));
  }, []);

  const handleSubmit = async () => {
    if (!selectedBarber) { setError('Selecciona un barbero'); return; }
    if (rating === 0) { setError('Selecciona una calificación'); return; }
    if (!clientName.trim()) { setError('Escribe tu nombre'); return; }
    setError('');
    setSubmitting(true);

    try {
      // Guardar reseña
      const { error: insertError } = await supabase.from('reviews').insert({
        barber_id: selectedBarber.id,
        barber_name: selectedBarber.name,
        client_name: clientName.trim(),
        rating,
        comment: comment.trim() || null,
      });
      if (insertError) throw insertError;
      // La calificación promedio del barbero la recalcula la base de datos (trigger reviews_refresh_rating)

      setSubmitted(true);
    } catch (err) {
      console.error('No se pudo enviar la reseña', err);
      setError('Error al enviar. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#0c0c0c] flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={40} className="text-green-400" />
          </div>
          <h2 className="font-serif text-3xl font-bold text-white mb-3">¡Gracias!</h2>
          <p className="text-zinc-400 text-lg mb-2">Tu reseña fue enviada exitosamente.</p>
          <p className="text-zinc-600 text-sm">Tu opinión nos ayuda a mejorar cada día.</p>
          <div className="flex justify-center gap-1 mt-6">
            {[...Array(rating)].map((_, i) => (
              <Star key={i} size={24} className="text-gold fill-gold" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0c0c0c] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center mx-auto mb-4">
            <ClipperIcon size={26} className="text-black" />
          </div>
          <h1 className="font-serif text-3xl font-bold text-white mb-2">Salón Hermanos</h1>
          <p className="text-zinc-400">¿Qué tal te pareció nuestro servicio?</p>
        </div>

        <div className="glass border border-white/10 rounded-2xl p-6 space-y-6">

          {/* Seleccionar barbero */}
          <div>
            <label className="text-zinc-400 text-sm mb-3 block font-medium">¿Con quién fue tu cita?</label>
            <div className="grid grid-cols-1 gap-2">
              {barbers.filter(b => b.available).map((barber) => (
                <button
                  key={barber.id}
                  onClick={() => setSelectedBarber(barber)}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                    selectedBarber?.id === barber.id
                      ? 'border-yellow-500/60 bg-yellow-500/10'
                      : 'border-white/10 bg-white/5 hover:border-white/20'
                  }`}
                >
                  <BarberAvatar barber={barber} className="w-10 h-10 rounded-full text-sm" />
                  <div>
                    <p className="text-white font-medium text-sm">{barber.name}</p>
                    <p className="text-zinc-500 text-xs">{barber.specialties.slice(0, 2).join(', ')}</p>
                  </div>
                  {selectedBarber?.id === barber.id && (
                    <div className="ml-auto w-5 h-5 rounded-full bg-yellow-500 flex items-center justify-center">
                      <CheckCircle size={14} className="text-black" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Calificación */}
          <div>
            <label className="text-zinc-400 text-sm mb-3 block font-medium">Calificación</label>
            <div className="flex gap-2 justify-center">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="transition-transform hover:scale-110"
                >
                  <Star
                    size={36}
                    className={`transition-colors ${
                      star <= (hoverRating || rating)
                        ? 'text-yellow-400 fill-yellow-400'
                        : 'text-zinc-600'
                    }`}
                  />
                </button>
              ))}
            </div>
            {rating > 0 && (
              <p className="text-center text-zinc-400 text-sm mt-2">
                {rating === 1 ? 'Muy malo' : rating === 2 ? 'Malo' : rating === 3 ? 'Regular' : rating === 4 ? 'Bueno' : '¡Excelente!'}
              </p>
            )}
          </div>

          {/* Nombre */}
          <div>
            <label className="text-zinc-400 text-sm mb-1.5 block font-medium">Tu nombre</label>
            <input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Ej: Juan García"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-yellow-500/50 transition-colors"
            />
          </div>

          {/* Comentario */}
          <div>
            <label className="text-zinc-400 text-sm mb-1.5 block font-medium">
              Comentario <span className="text-zinc-600">(opcional)</span>
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Cuéntanos tu experiencia..."
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-yellow-500/50 transition-colors resize-none"
            />
          </div>

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-3 bg-gradient-to-r from-yellow-500 to-yellow-400 text-black font-bold rounded-xl text-sm transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Enviando...' : 'Enviar reseña'}
          </button>
        </div>

        <p className="text-center text-zinc-700 text-xs mt-4">
          Tu reseña aparecerá en nuestra web inmediatamente
        </p>
      </div>
    </div>
  );
}