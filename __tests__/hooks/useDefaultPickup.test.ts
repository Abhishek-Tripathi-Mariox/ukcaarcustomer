import { renderHook } from '@testing-library/react-native';
import { useDefaultPickup, LiveLocationLike } from '../../src/hooks/useDefaultPickup';

// useDefaultPickup no longer subscribes to GPS itself — the caller hands
// it the live state. We only need to mock the Redux selector here.
jest.mock('@/store/hooks', () => ({
  useAppSelector: jest.fn(),
}));

import { useAppSelector } from '@/store/hooks';

const mockUseSel = useAppSelector as jest.Mock;

function mockSelector(savedAddresses: any[]) {
  mockUseSel.mockImplementation((sel: any) =>
    sel({ auth: { user: { savedAddresses } } }),
  );
}

const liveOf = (
  coords: LiveLocationLike['coords'],
  address: LiveLocationLike['address'],
): LiveLocationLike => ({ coords, address });

describe('useDefaultPickup', () => {
  beforeEach(() => {
    mockUseSel.mockReset();
  });

  it("returns source='gps' when live coords + address are available", () => {
    mockSelector([
      { address: 'Home addr', lat: 1, lng: 1, isPrimary: true, label: 'Home', icon: 'home' },
    ]);

    const { result } = renderHook(() =>
      useDefaultPickup(liveOf({ lat: 30.3165, lng: 78.0322 }, '123 Main Rd, Dehradun')),
    );
    expect(result.current.source).toBe('gps');
    expect(result.current.location).toEqual({
      address: '123 Main Rd, Dehradun',
      lat: 30.3165,
      lng: 78.0322,
    });
  });

  it("returns source='saved' (primary) when GPS is missing", () => {
    mockSelector([
      { address: 'Work', lat: 2, lng: 2, isPrimary: false, label: 'Work', icon: 'briefcase' },
      { address: 'Home', lat: 3, lng: 3, isPrimary: true, label: 'Home', icon: 'home' },
    ]);

    const { result } = renderHook(() => useDefaultPickup(liveOf(null, null)));
    expect(result.current.source).toBe('saved');
    expect(result.current.location).toEqual({ address: 'Home', lat: 3, lng: 3 });
  });

  it("returns source='saved' (first) when no primary exists", () => {
    mockSelector([
      { address: 'Work', lat: 2, lng: 2, isPrimary: false, label: 'Work', icon: 'briefcase' },
    ]);

    const { result } = renderHook(() => useDefaultPickup(liveOf(null, null)));
    expect(result.current.source).toBe('saved');
    expect(result.current.location).toEqual({ address: 'Work', lat: 2, lng: 2 });
  });

  it("returns source='none' when GPS is missing and no saved addresses", () => {
    mockSelector([]);

    const { result } = renderHook(() => useDefaultPickup(liveOf(null, null)));
    expect(result.current.source).toBe('none');
    expect(result.current.location).toBeNull();
  });

  it("falls back to saved when GPS coords are present but reverse-geocode hasn't returned yet", () => {
    mockSelector([
      { address: 'Home', lat: 3, lng: 3, isPrimary: true, label: 'Home', icon: 'home' },
    ]);

    const { result } = renderHook(() =>
      useDefaultPickup(liveOf({ lat: 30.3165, lng: 78.0322 }, null)),
    );
    // Saved address beats a half-baked GPS hit (coords without address).
    expect(result.current.source).toBe('saved');
    expect(result.current.location).toEqual({ address: 'Home', lat: 3, lng: 3 });
  });

  it("treats lat:0, lng:0 saved addresses as having no valid coords (returns 'none')", () => {
    mockSelector([
      { address: 'Legacy primary', lat: 0, lng: 0, isPrimary: true, label: 'Home', icon: 'home' },
    ]);

    const { result } = renderHook(() => useDefaultPickup(liveOf(null, null)));
    expect(result.current.source).toBe('none');
    expect(result.current.location).toBeNull();
  });

  it("returns source='gps' with 'Current location' label when coords exist but no address AND no saved fallback", () => {
    mockSelector([]);

    const { result } = renderHook(() =>
      useDefaultPickup(liveOf({ lat: 30.3165, lng: 78.0322 }, null)),
    );
    // No saved fallback; surface the coords so the pickup row isn't empty
    // while reverse-geocoding is still in flight.
    expect(result.current.source).toBe('gps');
    expect(result.current.location).toEqual({
      address: 'Current location',
      lat: 30.3165,
      lng: 78.0322,
    });
  });
});
