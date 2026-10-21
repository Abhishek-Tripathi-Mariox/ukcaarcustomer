/** Display estimate shared by route cards and alternative route selections. */
export function scheduledRouteDuration(stops: { lat: number; lng: number; sequence: number }[]): number {
  const ordered = [...stops].sort((a, b) => a.sequence - b.sequence);
  if (ordered.length < 2) return 0;
  let km = 0;
  const rad = (degrees: number) => degrees * Math.PI / 180;
  for (let i = 1; i < ordered.length; i++) {
    const a = ordered[i - 1], b = ordered[i];
    const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.sin(rad(b.lng - a.lng) / 2) ** 2 * Math.cos(rad(a.lat)) * Math.cos(rad(b.lat));
    km += 6371 * 2 * Math.asin(Math.sqrt(h));
  }
  return Math.max(1, Math.round(km / 35 * 60));
}
