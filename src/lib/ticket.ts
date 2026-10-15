/** Código corto de la reserva que se muestra en el ticket, por ejemplo EB-3F2A9C. */
export const ticketCode = (bookingId: string) => `EB-${bookingId.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
