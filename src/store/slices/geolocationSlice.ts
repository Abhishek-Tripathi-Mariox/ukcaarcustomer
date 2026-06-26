import { createSlice, PayloadAction } from '@reduxjs/toolkit';

/**
 * App-wide cache for the rider's current device location.
 *
 * Resolved once on the splash screen (via `useResolveLocation`) so by the
 * time the home screen mounts, we already have real coords + a reverse-
 * geocoded address — no Dehradun-fallback fetches to `/drivers/nearby`
 * with hardcoded coordinates while the GPS subscription is still warming
 * up. Other screens read this slice for an instant initial value and may
 * subscribe to live updates separately.
 */
export interface GeolocationCoords {
  lat: number;
  lng: number;
  accuracy?: number;
  heading?: number | null;
  speed?: number | null;
  timestamp: number;
}

export interface GeolocationState {
  coords: GeolocationCoords | null;
  address: string | null;
  permissionGranted: boolean;
  /** True once we've completed at least one resolve attempt (whether it
   *  produced coords or not). Lets callers know "the splash has finished
   *  asking" so they can apply their own fallback if needed. */
  hasResolved: boolean;
  /** Last error from the resolver, or null. Surfaces a permission-denied
   *  state to screens that want to prompt the user themselves. */
  error: string | null;
}

const initialState: GeolocationState = {
  coords: null,
  address: null,
  permissionGranted: false,
  hasResolved: false,
  error: null,
};

const geolocationSlice = createSlice({
  name: 'geolocation',
  initialState,
  reducers: {
    setGeolocationCoords(state, action: PayloadAction<GeolocationCoords>) {
      state.coords = action.payload;
      state.error = null;
    },
    setGeolocationAddress(state, action: PayloadAction<string | null>) {
      state.address = action.payload;
    },
    setGeolocationPermission(state, action: PayloadAction<boolean>) {
      state.permissionGranted = action.payload;
    },
    setGeolocationResolved(state, action: PayloadAction<boolean>) {
      state.hasResolved = action.payload;
    },
    setGeolocationError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
    },
    clearGeolocation(state) {
      state.coords = null;
      state.address = null;
      state.error = null;
      state.hasResolved = false;
      // Keep permissionGranted across clears — the OS-level grant doesn't
      // disappear just because we wiped the cached fix.
    },
  },
});

export const {
  setGeolocationCoords,
  setGeolocationAddress,
  setGeolocationPermission,
  setGeolocationResolved,
  setGeolocationError,
  clearGeolocation,
} = geolocationSlice.actions;

export default geolocationSlice.reducer;
