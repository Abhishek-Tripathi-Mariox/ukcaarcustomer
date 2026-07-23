/**
 * Driver rating shown to riders.
 *
 * The backend stores the TRUE average, which is 0 for a driver who hasn't
 * been rated yet. Showing "0.0" to a rider makes an unproven driver look
 * terrible, so we display a neutral 5.0 until the first real rating exists
 * (a real average is always >= 1, so `rating > 0` reliably means "has been
 * rated"). All server-side calculations still use the true value.
 */
export function driverDisplayRating(rating?: number | null): number {
  return typeof rating === 'number' && rating > 0 ? rating : 5;
}

/** Same, formatted to one decimal for display. */
export function driverRatingText(rating?: number | null): string {
  return driverDisplayRating(rating).toFixed(1);
}
