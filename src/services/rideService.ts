import api from './api';

export interface Location {
  address: string;
  lat: number;
  lng: number;
  /** 6-digit pincode parsed from the autocomplete suggestion at pick
   *  time. Used by the scheduled-routes lookup to match the rider to a
   *  route serving their PIN, since exact lat/lng rarely sits on a stop. */
  pincode?: string;
}

export interface FareEstimate {
  vehicleType: string;
  estimatedFare: number;
  estimatedTime: number;
  distance: number;
  surge?: number;
}

export interface CreateRidePayload {
  pickup: Location;
  dropoff: Location;
  /**
   * Admin-defined VehicleType.code (e.g. 'sedan', 'premium-suv'). Backend
   * accepts any string; falls back to 'economy' fares for unknowns.
   */
  rideType: string;
  paymentMethod?: string;
  promoCode?: string;
  isScheduled?: boolean;
  scheduledAt?: string;
  /** Routes the ride to the private (premium) driver pool. */
  isPrivate?: boolean;
  /**
   * Real-route distance (km) / duration (min) resolved via /geo/directions and
   * already shown to the rider on SelectRide. Sent so the backend persists the
   * quoted road distance instead of recomputing straight-line Haversine (which
   * disagrees with the quote whenever Google/OSRM are reachable).
   */
  distance?: number;
  duration?: number;
}

export interface Ride {
  _id: string;
  status: 'searching' | 'driver_assigned' | 'driver_arriving' | 'driver_arrived' | 'in_progress' | 'payment_pending' | 'completed' | 'cancelled';
  pickup: Location;
  dropoff: Location;
  rideType: string;
  estimatedFare: number;
  estimatedDistance: number;
  estimatedDuration: number;
  actualFare?: number;
  actualDistance?: number;
  actualDuration?: number;
  /** ISO timestamps set by the backend when the trip transitions through
   *  in_progress → completed. Used by RideCompleteScreen to show the rider
   *  the actual pickup/drop-off times alongside the duration. */
  startedAt?: string;
  completedAt?: string;
  baseFare: number;
  distanceFare: number;
  timeFare: number;
  surgeFare?: number;
  discount: number;
  tip?: number;
  paymentMethod: string;
  pickupOtp?: string;
  driver?: any;
  createdAt: string;
}

export interface EstimateResponse {
  estimates: {
    rideType: string;
    estimatedFare: number;
    /** ₹ already removed from estimatedFare by the rider's loyalty (tier + voucher). */
    loyaltyDiscount?: number;
    baseFare: number;
    distanceFare: number;
    timeFare: number;
    estimatedDistance: number;
    estimatedDuration: number;
  }[];
  distance: number;
  duration: number;
  /** Loyalty context applied to the estimates (auto). */
  loyalty?: {
    tierPct: number;
    voucher: { code: string; type: string; value: number } | null;
  };
}

export const rideService = {
  estimateFare: async (
    pickup: Location,
    dropoff: Location,
    opts?: { distance?: number; duration?: number },
  ): Promise<EstimateResponse> => {
    // When the caller has already resolved a real-route distance/duration
    // (via /geo/directions on the map), forward them so the backend skips
    // its Haversine + 3-min/km fallback. Without this, the fare cards on
    // SelectRide show a duration that doesn't match the time chip on the
    // map above them.
    const body: Record<string, unknown> = { pickup, dropoff };
    if (opts?.distance !== undefined && opts.distance !== null) {
      body.distance = opts.distance;
    }
    if (opts?.duration !== undefined && opts.duration !== null) {
      body.duration = opts.duration;
    }
    const { data } = await api.post('/rides/estimate', body);
    return data.data;
  },

  createRide: async (payload: CreateRidePayload): Promise<Ride> => {
    const { data } = await api.post('/rides', payload);
    return data.data.ride;
  },

  getRide: async (id: string): Promise<Ride> => {
    const { data } = await api.get(`/rides/${id}`);
    return data.data.ride;
  },

  /**
   * Active ride for the current user (any status in
   * searching/driver_assigned/driver_arriving/driver_arrived/in_progress),
   * or null if the user has nothing in flight. Used by the app shell to
   * resume the right screen on cold start instead of dropping a user with
   * an active booking on Home.
   */
  getActive: async (): Promise<Ride | null> => {
    try {
      const { data } = await api.get('/rides/active');
      return data?.data?.ride ?? null;
    } catch {
      return null;
    }
  },

  getRides: async (page = 1, limit = 20) => {
    const { data } = await api.get('/rides', { params: { page, limit } });
    return data.data;
  },

  cancelRide: async (id: string, reason?: string) => {
    const { data } = await api.put(`/rides/${id}/cancel`, { reason });
    return data.data;
  },

  rateRide: async (id: string, rating: number, review?: string, tags?: string[], tip?: number) => {
    const { data } = await api.put(`/rides/${id}/rate`, { rating, comment: review, tags, tip });
    return data.data;
  },

  updateRideStatus: async (id: string, status: string) => {
    const { data } = await api.put(`/rides/${id}/status`, { status });
    return data.data;
  },

  simulateComplete: async (id: string) => {
    const { data } = await api.put(`/rides/${id}/simulate-complete`);
    return data.data;
  },

  getNearbyDrivers: async (lat: number, lng: number) => {
    const { data } = await api.get('/drivers/nearby', { params: { lat, lng } });
    return data.data?.drivers || [];
  },

  /**
   * Returns the vehicle types currently available within 7 km of pickup,
   * grouped by `tier` (instant vs private). The customer ride-selection
   * screen uses this to drive its tab content — only types with at least
   * one nearby online driver appear, so we never let the customer book
   * something nobody can take.
   */
  getNearbyVehicleTypes: async (
    lat: number,
    lng: number,
  ): Promise<{
    radiusKm: number;
    instant: NearbyVehicleType[];
    private: NearbyVehicleType[];
  }> => {
    const { data } = await api.get('/vehicle-types/nearby', {
      params: { lat, lng },
    });
    return data.data;
  },
};

export interface NearbyVehicleType {
  _id: string;
  name: string;
  code: string;
  description?: string;
  tier: 'instant' | 'private';
  /** How many drivers within 7km are registered for this type. */
  availableCount: number;
  /** Admin-configured passenger seat capacity. Undefined until an admin sets
   *  it on the vehicle type, in which case the app uses a code heuristic. */
  seats?: number;
}
