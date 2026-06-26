import { Dimensions, PixelRatio } from 'react-native';

/**
 * Responsive scaling helpers.
 *
 * The screens were laid out against a single reference frame (the Figma
 * canvas: ~411dp wide, taken from the 362dp-wide input + Spacing.xl padding
 * on each side). On that exact device everything "fits". On narrower or
 * shorter devices the same hardcoded pixels are proportionally too large
 * (looks zoomed); on larger devices they look too small.
 *
 * These helpers re-express a value as a fraction of the reference frame and
 * re-apply it to the actual screen, so a layout designed once renders
 * proportionally on any device.
 *
 *   s(n)   — scale by width. Use for widths, horizontal padding, icon sizes,
 *            border radius — anything that should track how wide the screen is.
 *   vs(n)  — scale by height. Use for vertical gaps / element heights that
 *            should track how tall the screen is.
 *   ms(n)  — "moderate" width scale: scales, but dampened (factor 0.5 by
 *            default) so values don't balloon on tablets / shrink to nothing
 *            on tiny phones. Good default for most sizes.
 *   fs(n)  — font scale: moderate scale + snap to the device pixel grid so
 *            text stays crisp. Use for every fontSize / lineHeight.
 */

const { width, height } = Dimensions.get('window');

// Reference frame the designs were built on.
const GUIDELINE_BASE_WIDTH = 411;
const GUIDELINE_BASE_HEIGHT = 891;

// Use the short/long edge rather than raw width/height so the math is stable
// regardless of orientation (these screens are portrait, but this keeps the
// helper reusable elsewhere).
const shortEdge = Math.min(width, height);
const longEdge = Math.max(width, height);

export const s = (size: number): number => (shortEdge / GUIDELINE_BASE_WIDTH) * size;

export const vs = (size: number): number => (longEdge / GUIDELINE_BASE_HEIGHT) * size;

export const ms = (size: number, factor = 0.5): number =>
  size + (s(size) - size) * factor;

export const fs = (size: number): number =>
  Math.round(PixelRatio.roundToNearestPixel(ms(size, 0.3)));
