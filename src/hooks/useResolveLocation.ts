import { useCallback, useEffect, useRef } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Geolocation from '@react-native-community/geolocation';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  setGeolocationCoords,
  setGeolocationAddress,
  setGeolocationPermission,
  setGeolocationResolved,
  setGeolocationError,
} from '@/store/slices/geolocationSlice';
import { geoService } from '@/services/geoService';

const LAST_FIX_KEY = '@ukcaar/last_location_fix';

interface Options {
  /**
   * Skip work if the slice already has a fix newer than this many ms.
   * Default 5 minutes — re-resolving on every splash hot-reload is wasted
   * effort and just hammers the OS / reverse-geocoder.
   */
  staleAfterMs?: number;
  /** Reverse-geocode the fix to a human-readable address. Default true. */
  reverseGeocode?: boolean;
}

interface PersistedFix {
  lat: number;
  lng: number;
  accuracy?: number;
  heading?: number | null;
  speed?: number | null;
  timestamp: number;
  address?: string | null;
}

const requestAndroidPermission = async (): Promise<boolean> => {
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
 * One-shot location resolver intended for the splash screen.
 *
 * Three-stage strategy to make a fix land in Redux as fast as possible:
 *
 *   1. **Disk** — rehydrate the last persisted fix from AsyncStorage. Gets
 *      us off zero in a single React tick, even before the GPS hardware
 *      has spun up. The fix may be hours old but it's enough to render the
 *      home map / kick off the nearby-drivers call against a real point.
 *   2. **Fast network fix** — `getCurrentPosition` with `enableHighAccuracy:
 *      false` and a very large `maximumAge`. Returns the OS's last WiFi/cell-
 *      based fix in ~100 ms on most devices. Doesn't wait for satellites.
 *   3. **High-accuracy fix** — `enableHighAccuracy: true`. Slow on a cold
 *      GPS chip (15-60s on Android) but upgrades the cached coordinate to
 *      sub-10m accuracy once it lands. Runs in parallel with stage 2.
 *
 * Each stage that produces a coordinate immediately dispatches it (and
 * persists it). Whichever arrives first unblocks the UI; later, more
 * accurate fixes silently overwrite. The 1-minute "stuck on stale" lag
 * the rider was seeing on cold-start was stage 3 running alone — now
 * stages 1 and 2 fill the gap.
 */
export function useResolveLocation(opts: Options = {}): {
  hasResolved: boolean;
  refresh: () => void;
} {
  const dispatch = useAppDispatch();
  const { coords, hasResolved } = useAppSelector((s) => s.geolocation);

  const staleAfterMs = opts.staleAfterMs ?? 5 * 60 * 1000;
  const reverseGeocode = opts.reverseGeocode ?? true;
  const inFlightRef = useRef(false);

  const persist = useCallback(async (fix: PersistedFix) => {
    try {
      await AsyncStorage.setItem(LAST_FIX_KEY, JSON.stringify(fix));
    } catch {
      // Storage failures are non-fatal — Redux still has the fix.
    }
  }, []);

  const applyFix = useCallback(
    (pos: {
      coords: {
        latitude: number;
        longitude: number;
        accuracy: number;
        heading: number | null;
        speed: number | null;
      };
      timestamp: number;
    }) => {
      const next = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        heading: pos.coords.heading,
        speed: pos.coords.speed,
        timestamp: pos.timestamp,
      };
      dispatch(setGeolocationCoords(next));
      dispatch(setGeolocationResolved(true));
      persist(next);
    },
    [dispatch, persist],
  );

  const resolve = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      // Stage 1 — rehydrate from disk so something is in Redux *before*
      // we even ask the OS. Skipped if the slice already has a newer fix.
      try {
        const raw = await AsyncStorage.getItem(LAST_FIX_KEY);
        if (raw) {
          const cached: PersistedFix = JSON.parse(raw);
          if (
            cached?.lat &&
            cached?.lng &&
            (!coords || (cached.timestamp ?? 0) > (coords.timestamp ?? 0))
          ) {
            dispatch(
              setGeolocationCoords({
                lat: cached.lat,
                lng: cached.lng,
                accuracy: cached.accuracy,
                heading: cached.heading,
                speed: cached.speed,
                timestamp: cached.timestamp,
              }),
            );
            if (cached.address) dispatch(setGeolocationAddress(cached.address));
            dispatch(setGeolocationResolved(true));
          }
        }
      } catch {
        /* corrupted entry — ignore */
      }

      const ok = await requestAndroidPermission();
      dispatch(setGeolocationPermission(ok));
      if (!ok) {
        dispatch(setGeolocationError('Location permission denied'));
        dispatch(setGeolocationResolved(true));
        return;
      }

      let receivedAny = false;
      let bestAccuracy = Number.POSITIVE_INFINITY;

      // Stage 2 — fast, low-accuracy fix. The huge maximumAge means the OS
      // is allowed to hand back whatever it has cached (even hours-old)
      // instead of waking the GPS chip. Usually resolves in <500 ms.
      Geolocation.getCurrentPosition(
        (p) => {
          if (p.coords.accuracy < bestAccuracy) {
            bestAccuracy = p.coords.accuracy;
            applyFix(p);
            receivedAny = true;
            // Kick off a reverse-geocode against this fast fix so the
            // pickup label has *something* readable while the accurate
            // fix is still in flight.
            if (reverseGeocode) {
              geoService
                .reverse(p.coords.latitude, p.coords.longitude)
                .then((r) => {
                  if (r) {
                    const addr = r.address || r.displayName;
                    dispatch(setGeolocationAddress(addr));
                    persist({
                      lat: p.coords.latitude,
                      lng: p.coords.longitude,
                      accuracy: p.coords.accuracy,
                      heading: p.coords.heading,
                      speed: p.coords.speed,
                      timestamp: p.timestamp,
                      address: addr,
                    });
                  }
                })
                .catch(() => {});
            }
          }
        },
        () => {
          /* fast lookup failed — wait for stage 3 */
        },
        {
          enableHighAccuracy: false,
          timeout: 5000,
          maximumAge: 24 * 60 * 60 * 1000, // accept anything from the past day
        },
      );

      // Stage 3 — accurate fix. Runs in parallel with stage 2. The
      // `await` here exists only so we can flag the resolve as truly
      // finished — the UI is already unblocked by stage 1 or 2.
      await new Promise<void>((resolveP) => {
        Geolocation.getCurrentPosition(
          (p) => {
            if (p.coords.accuracy < bestAccuracy) {
              bestAccuracy = p.coords.accuracy;
              applyFix(p);
              receivedAny = true;
              if (reverseGeocode) {
                geoService
                  .reverse(p.coords.latitude, p.coords.longitude)
                  .then((r) => {
                    if (r) {
                      const addr = r.address || r.displayName;
                      dispatch(setGeolocationAddress(addr));
                      persist({
                        lat: p.coords.latitude,
                        lng: p.coords.longitude,
                        accuracy: p.coords.accuracy,
                        heading: p.coords.heading,
                        speed: p.coords.speed,
                        timestamp: p.timestamp,
                        address: addr,
                      });
                    }
                  })
                  .catch(() => {});
              }
            }
            resolveP();
          },
          () => {
            if (!receivedAny) {
              dispatch(setGeolocationError('Could not get a GPS fix'));
              dispatch(setGeolocationResolved(true));
            }
            resolveP();
          },
          {
            enableHighAccuracy: true,
            timeout: 20000,
            maximumAge: 60 * 1000,
          },
        );
      });
    } finally {
      inFlightRef.current = false;
    }
  }, [coords, dispatch, applyFix, persist, reverseGeocode]);

  useEffect(() => {
    const stale =
      !coords ||
      !coords.timestamp ||
      Date.now() - coords.timestamp > staleAfterMs;
    if (!hasResolved || stale) {
      resolve();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { hasResolved, refresh: resolve };
}
