/**
 * Single source of truth for the app's fallback map location.
 *
 * Used only when we have no GPS fix yet (permission denied / still resolving).
 * Previously each screen hardcoded its own fallback — two used Delhi and three
 * used Dehradun — so with GPS denied the pickup could land in Delhi while the
 * map/estimate defaulted to Dehradun (~230 km apart), producing wildly wrong
 * distances. UKCAAR operates in Uttarakhand, so the whole app now falls back to
 * Dehradun consistently.
 */
export const DEFAULT_COORDS = {
  lat: 30.3165,
  lng: 78.0322,
} as const;

/** react-native-maps Region centred on {@link DEFAULT_COORDS} (city-level zoom). */
export const DEFAULT_REGION = {
  latitude: DEFAULT_COORDS.lat,
  longitude: DEFAULT_COORDS.lng,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
} as const;
