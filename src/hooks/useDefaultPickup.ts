import { useLiveLocation } from '@/hooks/useLiveLocation';
import { useAppSelector } from '@/store/hooks';

export type DefaultPickup = {
  source: 'gps' | 'saved' | 'none';
  location: { address: string; lat: number; lng: number } | null;
};

export function useDefaultPickup(): DefaultPickup {
  // Placeholder. Tests should still fail for the wrong reasons (assertions),
  // not "module not found".
  void useLiveLocation;
  void useAppSelector;
  return { source: 'none', location: null };
}
