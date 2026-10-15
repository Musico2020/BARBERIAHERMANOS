import type { Barber } from '../../types';

interface Props {
  barber: Pick<Barber, 'name' | 'avatar' | 'photoUrl'>;
  /** Tamaño, forma y texto, por ejemplo "w-12 h-12 rounded-full text-base" */
  className?: string;
}

/** Foto del barbero; si no tiene, sus iniciales sobre fondo dorado. */
export default function BarberAvatar({ barber, className = '' }: Props) {
  if (barber.photoUrl) {
    return <img src={barber.photoUrl} alt={barber.name} className={`${className} object-cover`} />;
  }
  return (
    <div
      className={`${className} flex items-center justify-center font-bold text-dark`}
      style={{ background: 'linear-gradient(135deg, #D9AD50, #9C7B22)' }}
    >
      {barber.avatar}
    </div>
  );
}
