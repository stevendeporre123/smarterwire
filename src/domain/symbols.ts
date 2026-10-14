// Kleur per kring op het situatieplan. De symbolen zelf komen uit de AREI-set (areisymbols.ts).
const PALETTE = ['#008000', '#0066aa', '#e07800', '#8a2be2', '#cc2200', '#00897b', '#6d4c41', '#c2185b', '#546e7a', '#7cb342', '#f9a825', '#3949ab'];
export const circuitColor = (key: string | null | undefined, order: string[]) => {
  if (!key) return '#8f9a8f';
  const i = order.indexOf(key);
  return PALETTE[(i < 0 ? 0 : i) % PALETTE.length];
};
