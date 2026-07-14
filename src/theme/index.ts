export { Colors } from './colors';
export { Typography, FontFamily, SystemFonts } from './typography';
export { Spacing, BorderRadius, IconSize, HitSlop, Shadow } from './spacing';
export { s, vs, ms, fs } from './responsive';

/**
 * Return a color at the given opacity, e.g. `alpha(Colors.primary, 0.1)`.
 * Accepts `#RGB` / `#RRGGBB`; anything it can't parse is returned unchanged
 * so a bad value can never crash a render.
 */
export const alpha = (color: string, opacity: number): string => {
  const hex = String(color).trim().replace('#', '');
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  if (full.length !== 6 || /[^0-9a-fA-F]/.test(full)) return color;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};
