import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { rideService, Location, Ride, CreateRidePayload, EstimateResponse } from '@/services/rideService';

type RideType = 'instant' | 'private' | 'scheduled';

interface RideState {
  pickup: Location | null;
  dropoff: Location | null;
  rideType: RideType;
  estimateData: EstimateResponse | null;
  /** requestId of the most recently DISPATCHED estimateFare. Used to ignore a
   *  slow earlier response (the straight-line estimate) that resolves after the
   *  routed one — otherwise it overwrites estimateData with the Haversine
   *  distance/fare, so the booked ride (and wallet debit) revert to a lower
   *  amount than the routed fare the rider actually saw. */
  estimateReqId: string | null;
  selectedVehicle: string | null;
  currentRide: Ride | null;
  rides: Ride[];
  loading: boolean;
  error: string | null;
}

const initialState: RideState = {
  pickup: null,
  dropoff: null,
  rideType: 'instant',
  estimateData: null,
  estimateReqId: null,
  selectedVehicle: null,
  currentRide: null,
  rides: [],
  loading: false,
  error: null,
};

export const estimateFare = createAsyncThunk(
  'ride/estimateFare',
  async (
    {
      pickup,
      dropoff,
      distance,
      duration,
    }: {
      pickup: Location;
      dropoff: Location;
      // Optional real-route values resolved via /geo/directions. When the
      // caller passes them, the backend uses them verbatim instead of its
      // straight-line Haversine + 3-min/km fallback — keeps the fare cards
      // on SelectRide in sync with the time chip on the map.
      distance?: number;
      duration?: number;
    },
    { rejectWithValue },
  ) => {
    try {
      return await rideService.estimateFare(pickup, dropoff, { distance, duration });
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.message || 'Failed to get estimate');
    }
  },
);

export const createRide = createAsyncThunk(
  'ride/createRide',
  async (payload: CreateRidePayload, { rejectWithValue }) => {
    try {
      return await rideService.createRide(payload);
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.message || 'Failed to create ride');
    }
  },
);

export const cancelRide = createAsyncThunk(
  'ride/cancelRide',
  async ({ id, reason }: { id: string; reason?: string }, { rejectWithValue }) => {
    try {
      return await rideService.cancelRide(id, reason);
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.message || 'Failed to cancel ride');
    }
  },
);

export const fetchRides = createAsyncThunk(
  'ride/fetchRides',
  async (_, { rejectWithValue }) => {
    try {
      const data = await rideService.getRides();
      return data.rides as Ride[];
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch rides');
    }
  },
);

const rideSlice = createSlice({
  name: 'ride',
  initialState,
  reducers: {
    setPickup: (state, action: PayloadAction<Location>) => { state.pickup = action.payload; },
    setDropoff: (state, action: PayloadAction<Location>) => { state.dropoff = action.payload; },
    // Per-field clears. Emptying an address input has to drop the stored
    // location too — otherwise the text reappears the moment the field loses
    // focus and the ride books against an address the rider already deleted.
    clearPickup: (state) => { state.pickup = null; state.estimateData = null; },
    clearDropoff: (state) => { state.dropoff = null; state.estimateData = null; },
    setRideType: (state, action: PayloadAction<RideType>) => { state.rideType = action.payload; },
    setSelectedVehicle: (state, action: PayloadAction<string>) => { state.selectedVehicle = action.payload; },
    setCurrentRide: (state, action: PayloadAction<Ride | null>) => { state.currentRide = action.payload; },
    clearRide: (state) => {
      state.pickup = null;
      state.dropoff = null;
      state.estimateData = null;
      state.selectedVehicle = null;
      state.currentRide = null;
      state.error = null;
    },
    clearError: (state) => { state.error = null; },
  },
  extraReducers: (builder) => {
    builder
      .addCase(estimateFare.pending, (state, action) => {
        state.loading = true;
        // Mark this as the latest estimate request. Only its result will be
        // applied — a slower earlier request that resolves afterward is dropped.
        state.estimateReqId = action.meta.requestId;
      })
      .addCase(estimateFare.fulfilled, (state, action) => {
        // Ignore stale responses: only the most-recently-dispatched estimate
        // (the routed one) is allowed to set estimateData.
        if (action.meta.requestId !== state.estimateReqId) return;
        state.loading = false;
        state.estimateData = action.payload;
      })
      .addCase(estimateFare.rejected, (state, action) => {
        if (action.meta.requestId !== state.estimateReqId) return;
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(createRide.pending, (state) => { state.loading = true; })
      .addCase(createRide.fulfilled, (state, action) => {
        state.loading = false;
        state.currentRide = action.payload;
      })
      .addCase(createRide.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(cancelRide.fulfilled, (state) => {
        state.currentRide = null;
      })
      .addCase(fetchRides.fulfilled, (state, action) => {
        state.rides = action.payload;
      });
  },
});

export const {
  setPickup,
  setDropoff,
  setRideType,
  setSelectedVehicle,
  setCurrentRide,
  clearPickup,
  clearDropoff,
  clearRide,
  clearError,
} = rideSlice.actions;
export default rideSlice.reducer;
