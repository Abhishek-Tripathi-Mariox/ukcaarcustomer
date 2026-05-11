import { useMemo } from 'react';
import { useLiveLocation } from '@/hooks/useLiveLocation';
import { useAppSelector } from '@/store/hooks';

/**
 * Default pickup resolver for the customer Home screen.
 *
 * Priority:
 *   1. Live GPS coords + reverse-geocoded address ('gps').
 *   2. User's saved addresses — primary first, else first entry ('saved').
 *   3. None — caller should show a placeholder ('none').
 *
 * The hook only composes existing data sources; it does not trigger
 * permission prompts or geocoding of its own (the underlying
 * `useLiveLocation` already does that with watch=true by default).
 */
export type DefaultPickup = {
  source: 'gps' | 'saved' | 'none';
  location: { address: string; lat: number; lng: number } | null;
};

export function useDefaultPickup(): DefaultPickup {
  const live = useLiveLocation({ watch: true, reverseGeocode: true });
  const savedAddresses = useAppSelector(
    (state: any) => state.auth?.user?.savedAddresses ?? [],
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
        savedAddresses.find((a: any) => a?.isPrimary) ?? savedAddresses[0];
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

    // 3. Nothing.
    return { source: 'none', location: null };
  }, [
    live.coords?.lat,
    live.coords?.lng,
    live.address,
    savedAddresses,
  ]);
}
