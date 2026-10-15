export const formatCOP = (amount: number): string => {
  return `$${amount.toLocaleString('es-CO').replace(',', '.')}`;
};
