import { useEffect, useRef, useState, useCallback } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import { geoService } from '@/services/geoService';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  setGeolocationCoords,
  setGeolocationAddress,
} from '@/store/slices/geolocationSlice';

interface GeoPositionLike {
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number;
    heading: number | null;
    speed: number | null;
  };
  timestamp: number;
}

interface GeoErrorLike {
  code: number;
  message: string;
}

export interface LiveCoords {
  lat: number;
  lng: number;
  accuracy?: number;
  heading?: number | null;
  speed?: number | null;
  timestamp: number;
}

export interface LiveLocationState {
  coords: LiveCoords | null;
  address: string | null;
  permissionGranted: boolean;
  loading: boolean;
  error: string | null;
}

interface Options {
  /** Subscribe to GPS via watchPosition. Default true. */
  watch?: boolean;
  /** Reverse-geocode the coordinate to a human address. Default true. */
  reverseGeocode?: boolean;
  /**
   * Minimum movement (in metres) before a fresh reverse geocode is fired.
   * Avoids hammering Nominatim when the dot drifts a few feet.
   */
  reverseGeocodeMinMeters?: number;
}

const haversineMeters = (a: LiveCoords, b: { lat: number; lng: number }) => {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
};

const requestPermission = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') return true;
  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
};

/**
 * Real-time device location with optional reverse-geocoded address.
 *
 * - Asks for ACCESS_FINE_LOCATION on Android the first time it runs.
 * - With watch=true, keeps a watchPosition subscription alive and updates
 *   coords every time the OS reports a new fix.
 * - Reverse-geocodes via the project's /geo/reverse endpoint (Nominatim
 *   under the hood) but only when the user has actually moved
 *   `reverseGeocodeMinMeters` away from the last geocoded point.
 */
export const useLiveLocation = (opts: Options = {}): LiveLocationState & {
  refresh: () => void;
} => {
  const watch = opts.watch ?? true;
  const reverseGeocode = opts.reverseGeocode ?? true;
  const minMeters = opts.reverseGeocodeMinMeters ?? 50;

  // Seed from the geolocation slice. The splash screen invokes
  // `useResolveLocation` while the user is staring at the logo, so by the
  // time this hook mounts on Home/SelectRide we usually have a real fix
  // in Redux already — no Dehradun fallback round-trip to the backend.
  const dispatch = useAppDispatch();
  const cached = useAppSelector((s) => s.geolocation);
  const cachedCoords: LiveCoords | null = cached?.coords
    ? {
        lat: cached.coords.lat,
        lng: cached.coords.lng,
        accuracy: cached.coords.accuracy,
        heading: cached.coords.heading,
        speed: cached.coords.speed,
        timestamp: cached.coords.timestamp,
      }
    : null;

  const [coords, setCoords] = useState<LiveCoords | null>(cachedCoords);
  const [address, setAddress] = useState<string | null>(cached?.address ?? null);
  const [permissionGranted, setPermissionGranted] = useState(
    cached?.permissionGranted ?? false,
  );
  const [loading, setLoading] = useState(!cachedCoords);
  const [error, setError] = useState<string | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const lastGeocodedRef = useRef<{ lat: number; lng: number } | null>(null);
  const geocodeSeqRef = useRef(0);
  const mountedRef = useRef(true);

  const handleFix = useCallback(
    (pos: GeoPositionLike) => {
      if (!mountedRef.current) return;
      const next: LiveCoords = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        heading: pos.coords.heading,
        speed: pos.coords.speed,
        timestamp: pos.timestamp,
      };
      setCoords(next);
      setLoading(false);

      // Push every fresh fix into the shared geolocation slice so other
      // screens (and the next cold-start) see the latest position even if
      // their own watchPosition hasn't fired yet.
      dispatch(setGeolocationCoords(next));

      if (!reverseGeocode) return;

      const last = lastGeocodedRef.current;
      const moved =
        !last || haversineMeters(next, last) >= minMeters;
      if (!moved) return;

      lastGeocodedRef.current = { lat: next.lat, lng: next.lng };
      const seq = ++geocodeSeqRef.current;
      geoService
        .reverse(next.lat, next.lng)
        .then((r) => {
          if (!mountedRef.current || seq !== geocodeSeqRef.current) return;
          if (r) {
            const addr = r.address || r.displayName;
            setAddress(addr);
            dispatch(setGeolocationAddress(addr));
          }
        })
        .catch(() => {
          /* leave previous address in place */
        });
    },
    [reverseGeocode, minMeters, dispatch],
  );

  const handleError = useCallback((e: GeoErrorLike) => {
    if (!mountedRef.current) return;
    setLoading(false);
    setError(e.message || 'Location unavailable');
  }, []);

  const start = useCallback(async () => {
    setLoading(true);
    setError(null);
    const ok = await requestPermission();
    if (!mountedRef.current) return;
    setPermissionGranted(ok);
    if (!ok) {
      setLoading(false);
      setError('Location permission denied');
      return;
    }

    // Two-stage first fix: the fast lookup (low accuracy, huge maxAge)
    // hands back the OS's cached fix in ~100 ms so the UI unblocks
    // instantly, then the accurate lookup upgrades the coordinate once
    // the GPS chip warms up. Without the fast stage the rider waits up to
    // a minute on cold-start before anything renders.
    Geolocation.getCurrentPosition(handleFix, () => {}, {
      enableHighAccuracy: false,
      timeout: 5000,
      maximumAge: 24 * 60 * 60 * 1000,
    });
    Geolocation.getCurrentPosition(handleFix, handleError, {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 60 * 1000,
    });

    if (watch) {
      if (watchIdRef.current != null) {
        Geolocation.clearWatch(watchIdRef.current);
      }
      watchIdRef.current = Geolocation.watchPosition(handleFix, handleError, {
        enableHighAccuracy: true,
        distanceFilter: 10, // metres — only fire when user actually moves
        interval: 5000, // android: hint, every 5s
        fastestInterval: 2000,
      });
    }
  }, [watch, handleFix, handleError]);

  useEffect(() => {
    mountedRef.current = true;
    start();
    return () => {
      mountedRef.current = false;
      if (watchIdRef.current != null) {
        Geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [start]);

  const refresh = useCallback(() => {
    lastGeocodedRef.current = null; // force re-geocode on next fix
    Geolocation.getCurrentPosition(handleFix, handleError, {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 0,
    });
  }, [handleFix, handleError]);

  return { coords, address, permissionGranted, loading, error, refresh };
};
