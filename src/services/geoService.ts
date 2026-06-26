import { api } from './api';

export interface GeoParts {
  houseNumber: string;
  road: string;
  area: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  countryCode: string;
}

export interface GeoSuggestion {
  id: string;
  displayName: string;
  address: string;
  lat: number;
  lng: number;
  parts: GeoParts;
}

export interface GeoReverseResult {
  displayName: string;
  address: string;
  lat: number;
  lng: number;
  parts: GeoParts;
}

export interface AutocompleteOptions {
  /** Center the search around this coordinate. When set, results are
   *  restricted to `radiusKm` (default 10) around it. */
  center?: { lat: number; lng: number };
  /** Hard cutoff in kilometres. Only used when `center` is provided. */
  radiusKm?: number;
}

export const geoService = {
  /** Address autocomplete. Returns up to `limit` suggestions (default 8). */
  autocomplete: async (
    q: string,
    limit = 8,
    opts: AutocompleteOptions = {},
  ): Promise<GeoSuggestion[]> => {
    const trimmed = q.trim();
    if (trimmed.length < 2) return [];
    try {
      const params: Record<string, any> = { q: trimmed, limit };
      if (opts.center) {
        params.lat = opts.center.lat;
        params.lng = opts.center.lng;
        params.radius = opts.radiusKm ?? 10;
      }
      const { data } = await api.get<{ success: boolean; data: { results: GeoSuggestion[] } }>(
        '/geo/autocomplete',
        { params },
      );
      return data?.data?.results ?? [];
    } catch (err: any) {
      // Surface the failure to the dev console so silent failures stop being a mystery.
      // eslint-disable-next-line no-console
      console.warn(
        '[geo.autocomplete] failed:',
        err?.response?.status,
        err?.response?.data?.message ?? err?.message,
      );
      throw err;
    }
  },

  /** Reverse-geocode a coordinate to a structured address. */
  reverse: async (lat: number, lng: number): Promise<GeoReverseResult | null> => {
    try {
      const { data } = await api.get<{ success: boolean; data: GeoReverseResult }>(
        '/geo/reverse',
        { params: { lat, lng } },
      );
      return data?.data ?? null;
    } catch {
      return null;
    }
  },

  /**
   * Driving directions between two coordinates. Backend prefers Google
   * Directions, falls back to OSRM, then to a straight line. The returned
   * `polyline` is a list of {lat,lng} points ready to feed straight into
   * react-native-maps Polyline.
   */
  directions: async (
    origin: { lat: number; lng: number },
    dest: { lat: number; lng: number },
  ): Promise<GeoDirections | null> => {
    try {
      const { data } = await api.get<{ success: boolean; data: GeoDirections }>(
        '/geo/directions',
        {
          params: {
            originLat: origin.lat,
            originLng: origin.lng,
            destLat: dest.lat,
            destLng: dest.lng,
          },
        },
      );
      return data?.data ?? null;
    } catch {
      return null;
    }
  },
};

export interface GeoDirections {
  provider: 'google' | 'osrm' | 'straight';
  polyline: Array<{ lat: number; lng: number }>;
  distanceMeters: number;
  durationSeconds: number;
}
