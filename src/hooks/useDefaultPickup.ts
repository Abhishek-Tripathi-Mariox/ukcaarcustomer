import { useMemo } from 'react';
import { useAppSelector } from '@/store/hooks';
import { SavedAddress } from '@/services/authService';

/**
 * Default pickup resolver for the customer Home screen.
 *
 * Priority:
 *   1. Live GPS coords + reverse-geocoded address ('gps').
 *   2. User's saved addresses — primary first, else first entry ('saved').
 *   3. GPS coords with no address yet — shows a friendly placeholder while
 *      reverse-geocoding is in flight.
 *   4. None — caller should show a placeholder ('none').
 *
 * The caller passes its own `useLiveLocation` result so we don't create a
 * second watchPosition subscription. Two concurrent subscriptions on
 * Android race each other's permission prompts; the user has seen the
 * symptom as "pickup label never resolves" on first launch.
 */
export type DefaultPickup = {
  source: 'gps' | 'saved' | 'none';
  location: { address: string; lat: number; lng: number } | null;
};

export interface LiveLocationLike {
  coords: { lat: number; lng: number } | null;
  address: string | null;
}

// Stable empty-array reference so the selector doesn't return a fresh [] on
// every call when the user has no saved addresses (which triggers React-Redux's
// "Selector returned a different result" warning and unnecessary rerenders).
const EMPTY_SAVED_ADDRESSES: SavedAddress[] = [];

export function useDefaultPickup(live: LiveLocationLike): DefaultPickup {
  const savedAddresses = useAppSelector(
    (state) => state.auth?.user?.savedAddresses ?? EMPTY_SAVED_ADDRESSES,
  );

  return useMemo<DefaultPickup>(() => {
    // 1. GPS with reverse-geocoded address.
    if (live.coords && live.address) {
      return {
        source: 'gps',
        location: {
          address: live.address,
          lat: live.coords.lat,
          lng: live.coords.lng,
        },
      };
    }

    // 2. Saved address — primary first, else first entry.
    if (savedAddresses.length > 0) {
      const primary =
        savedAddresses.find((a: SavedAddress) => a?.isPrimary) ?? savedAddresses[0];
      if (
        primary?.address &&
        typeof primary.lat === 'number' &&
        typeof primary.lng === 'number' &&
        (primary.lat !== 0 || primary.lng !== 0)
      ) {
        return {
          source: 'saved',
          location: {
            address: primary.address,
            lat: primary.lat,
            lng: primary.lng,
          },
        };
      }
    }

    // 3. GPS coords but reverse-geocode hasn't returned yet (Nominatim can
    //    be slow or rate-limited). Show the user a friendly label backed by
    //    real coords so the pickup row never sits empty after permission
    //    is granted. The label upgrades to the real street address as soon
    //    as the geocoder responds and we re-enter branch 1.
    if (live.coords) {
      return {
        source: 'gps',
        location: {
          address: 'Current location',
          lat: live.coords.lat,
          lng: live.coords.lng,
        },
      };
    }

    // 4. Nothing.
    return { source: 'none', location: null };
  // savedAddresses is intentionally listed: RTK produces a new array reference whenever content changes, so the memo updates correctly.
  }, [
    live.coords?.lat,
    live.coords?.lng,
    live.address,
    savedAddresses,
  ]);
}
