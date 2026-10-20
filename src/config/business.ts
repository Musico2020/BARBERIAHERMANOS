import type { BusinessConfig } from '../types';

// Datos de Salón Hermanos. Los que tienen «PENDIENTE» son provisionales: se cambian en
// Panel → Configuración (se guardan en la base de datos y reemplazan estos valores).
export const businessConfig: BusinessConfig = {
  name: 'Salón Hermanos',
  tagline: 'Barbería tradicional · Club de Caballeros',
  address: 'Barrio Tobías Daza, Mz B casa 16, segunda etapa, Valledupar',
  // PENDIENTE: número de WhatsApp del negocio (con 57 adelante, sin espacios)
  phone: '',
  whatsapp: '',
  email: '',
  instagram: '',
  tiktok: '',
  facebook: '',
  city: 'Valledupar',
  country: 'Colombia',
  primaryColor: '#D9AD50',
  accentColor: '#D71920',
  mapEmbedUrl: '',
  // Punto exacto del local (confirmado por el negocio); el mapa y «Cómo llegar» lo usan,
  // y en pantalla se muestra la dirección escrita de arriba
  location: { lat: 10.451021821669805, lng: -73.27921320802251 },
  // PENDIENTE: confirmar el horario real con la barbería
  hours: [
    { day: 'Lunes', open: '08:00', close: '19:00', closed: false },
    { day: 'Martes', open: '08:00', close: '19:00', closed: false },
    { day: 'Miércoles', open: '08:00', close: '19:00', closed: false },
    { day: 'Jueves', open: '08:00', close: '19:00', closed: false },
    { day: 'Viernes', open: '08:00', close: '19:00', closed: false },
    { day: 'Sábado', open: '08:00', close: '19:00', closed: false },
    { day: 'Domingo', open: '09:00', close: '13:00', closed: false },
  ],
  // Los festivos de Colombia se detectan solos (src/lib/holidays.ts) y usan este horario, de corrido
  holidayHours: { day: 'Festivos', open: '09:00', close: '13:00', closed: false },
  // «El primero que esté libre» al reservar (se apaga en Panel → Configuración → Reglas)
  allowAnyBarber: true,
  // Almuerzo: no se reciben reservas por la web en ese rango, salvo domingos y festivos
  lunch: { enabled: true, start: '12:00', end: '14:00' },
  // Reglas de reserva (se cambian en Panel → Configuración → Reglas)
  slotStep: 15,
  daysAhead: 14,
  // Fechas puntuales que cambian el horario ('closed' o 'walk-in'); se editan en el panel
  specialDays: [],
  // Ajustes de fechas puntuales (Panel → Turnos)
  dayOverrides: [],
  // Anticipo al reservar por la web: se paga con el QR de Nequi (public/pago-qr.jpg) y se verifica en Panel → Pagos
  deposit: { enabled: true, percent: 30, minutes: 30, key: '0092002945', holder: 'Walter Camilo Manjarrez Blandon' },
};
