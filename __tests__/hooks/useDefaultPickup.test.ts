import { renderHook } from '@testing-library/react-hooks';
import { useDefaultPickup } from '../../src/hooks/useDefaultPickup';

// Mock the dependencies. Each test sets the return values it needs.
jest.mock('@/hooks/useLiveLocation', () => ({
  useLiveLocation: jest.fn(),
}));
jest.mock('@/store/hooks', () => ({
  useAppSelector: jest.fn(),
}));

import { useLiveLocation } from '@/hooks/useLiveLocation';
import { useAppSelector } from '@/store/hooks';

const mockUseLive = useLiveLocation as jest.Mock;
const mockUseSel = useAppSelector as jest.Mock;

function mockSelector(savedAddresses: any[]) {
  // The hook calls useAppSelector(state => state.auth.user). Return a
  // shaped user object when the selector is invoked.
  mockUseSel.mockImplementation((sel: any) =>
    sel({ auth: { user: { savedAddresses } } }),
  );
}

describe('useDefaultPickup', () => {
  beforeEach(() => {
    mockUseLive.mockReset();
    mockUseSel.mockReset();
  });

  it("returns source='gps' when live coords + address are available", () => {
    mockUseLive.mockReturnValue({
      coords: { lat: 30.3165, lng: 78.0322 },
      address: '123 Main Rd, Dehradun',
    });
    mockSelector([
      { address: 'Home addr', lat: 1, lng: 1, isPrimary: true, label: 'Home', icon: 'home' },
    ]);

    const { result } = renderHook(() => useDefaultPickup());
    expect(result.current.source).toBe('gps');
    expect(result.current.location).toEqual({
      address: '123 Main Rd, Dehradun',
      lat: 30.3165,
      lng: 78.0322,
    });
  });

  it("returns source='saved' (primary) when GPS is missing", () => {
    mockUseLive.mockReturnValue({ coords: null, address: null });
    mockSelector([
      { address: 'Work', lat: 2, lng: 2, isPrimary: false, label: 'Work', icon: 'briefcase' },
      { address: 'Home', lat: 3, lng: 3, isPrimary: true, label: 'Home', icon: 'home' },
    ]);

    const { result } = renderHook(() => useDefaultPickup());
    expect(result.current.source).toBe('saved');
    expect(result.current.location).toEqual({ address: 'Home', lat: 3, lng: 3 });
  });

  it("returns source='saved' (first) when no primary exists", () => {
    mockUseLive.mockReturnValue({ coords: null, address: null });
    mockSelector([
      { address: 'Work', lat: 2, lng: 2, isPrimary: false, label: 'Work', icon: 'briefcase' },
    ]);

    const { result } = renderHook(() => useDefaultPickup());
    expect(result.current.source).toBe('saved');
    expect(result.current.location).toEqual({ address: 'Work', lat: 2, lng: 2 });
  });

  it("returns source='none' when GPS is missing and no saved addresses", () => {
    mockUseLive.mockReturnValue({ coords: null, address: null });
    mockSelector([]);

    const { result } = renderHook(() => useDefaultPickup());
    expect(result.current.source).toBe('none');
    expect(result.current.location).toBeNull();
  });

  it("falls back to saved when GPS coords are present but reverse-geocode hasn't returned yet", () => {
    mockUseLive.mockReturnValue({
      coords: { lat: 30.3165, lng: 78.0322 },
      address: null, // not geocoded yet
    });
    mockSelector([
      { address: 'Home', lat: 3, lng: 3, isPrimary: true, label: 'Home', icon: 'home' },
    ]);

    const { result } = renderHook(() => useDefaultPickup());
    // Without an address string we don't surface a half-baked label.
    expect(result.current.source).toBe('saved');
    expect(result.current.location).toEqual({ address: 'Home', lat: 3, lng: 3 });
  });
});
