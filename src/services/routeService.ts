import api from './api';

export interface RouteStop {
  name: string;
  address?: string;
  lat: number;
  lng: number;
  sequence: number;
  fareFromPrevious?: number;
}

export interface RouteDeparture {
  stopIndex: number;
  /** HH:mm 24h. */
  time: string;
}

export interface RouteSchedule {
  daysOfWeek: number[];
  departures: RouteDeparture[];
  returnDepartures?: RouteDeparture[];
  seatPrice?: number;
  vehicleType?: string;
  totalSeats?: number;
}

/** One driver's vehicle serving a route+departure, with its own seat
 *  availability. Each approved driver runs a shuttle of `capacity`
 *  (= route totalSeats) seats; `available` = capacity − booked. */
export interface RouteVehicle {
  driverId: string;
  driverName: string;
  avatar: string | null;
  rating: number;
  totalTrips: number;
  vehicle: {
    make: string;
    model: string;
    color: string;
    plateNumber: string;
    typeCode: string | null;
  };
  capacity: number;
  booked: number;
  available: number;
}

export interface ScheduledRouteApi {
  _id: string;
  name: string;
  description?: string;
  type: 'private' | 'scheduled';
  stops: RouteStop[];
  corridorBufferMeters: number;
  schedule?: RouteSchedule;
  approvedDriverCount?: number;
  approvedDepartureIndexes?: number[];
  hasRoundTripDriver?: boolean;
  /** Backend-computed proximity hints when the request carried pickup
   *  coords. Lets the home Scheduled tab show "Departs from <stop> —
   *  1.2 km away" so the rider knows which boarding point the route
   *  starts the trip from. Null when no pickup was passed. */
  nearestPickupStopMeters?: number | null;
  nearestPickupStopName?: string | null;
  nearestPickupStopSequence?: number | null;
  /** Next-upcoming trip identifiers + booked-seat count for that trip.
   *  Used by the Select Route card's "Available" column. */
  nextDepartureDate?: string | null;
  nextDepartureIndex?: number | null;
  nextDepartureBookedSeats?: number;
}

/**
 * Customer-facing list of scheduled routes. By default the backend filters
 * to routes that have at least one approved driver — there's no point
 * showing a route to the customer that no driver actually operates.
 */
export const routeService = {
  listScheduled: async (
    opts: {
      hasApprovedDriver?: boolean;
      /** Lat/lng — used as a fallback proximity rank when no pincode is
       *  available. */
      pickup?: { lat: number; lng: number };
      drop?: { lat: number; lng: number };
      /** Pincode-based lookup. Preferred over lat/lng because the rider
       *  isn't standing exactly on a route's departure stop — matching
       *  by PIN catches "same town" cases that pure coords miss
       *  (e.g. a Kasganj → Aligarh route the rider can board from
       *  anywhere in pincode 207123). */
      pickupPincode?: string;
      dropPincode?: string;
    } = { hasApprovedDriver: false },
  ): Promise<ScheduledRouteApi[]> => {
    const params: Record<string, string> = {};
    if (opts.hasApprovedDriver) params.hasApprovedDriver = 'true';
    if (opts.pickup) {
      params.pickupLat = String(opts.pickup.lat);
      params.pickupLng = String(opts.pickup.lng);
    }
    if (opts.drop) {
      params.dropLat = String(opts.drop.lat);
      params.dropLng = String(opts.drop.lng);
    }
    if (opts.pickupPincode) params.pickupPincode = opts.pickupPincode;
    if (opts.dropPincode) params.dropPincode = opts.dropPincode;
    const { data } = await api.get<{
      success: boolean;
      data: { routes: ScheduledRouteApi[] };
    }>('/routes/scheduled', { params });
    return data?.data?.routes ?? [];
  },

  getById: async (id: string): Promise<ScheduledRouteApi> => {
    const { data } = await api.get<{
      success: boolean;
      data: { route: ScheduledRouteApi };
    }>(`/routes/${id}`);
    return data.data.route;
  },

  /**
   * Vehicles (approved drivers) serving a specific trip, each with its own
   * seat availability. The vehicle-selection screen renders these and greys
   * out any vehicle that's full or has fewer free seats than requested.
   */
  listVehicles: async (
    routeId: string,
    opts: { date: string; departureIndex: number },
  ): Promise<{ totalSeats: number; vehicles: RouteVehicle[] }> => {
    const { data } = await api.get<{
      success: boolean;
      data: { totalSeats: number; vehicles: RouteVehicle[] };
    }>(`/routes/${routeId}/vehicles`, {
      params: { date: opts.date, departureIndex: opts.departureIndex },
    });
    return data?.data ?? { totalSeats: 0, vehicles: [] };
  },

  /**
   * Live seat availability for a specific trip (route + day + departure
   * slot) on a specific vehicle. The select-seats screen calls this on
   * mount to grey out seats other riders have already reserved. `driverId`
   * scopes the booked set to the chosen vehicle.
   */
  getSeats: async (
    routeId: string,
    opts: { date: string; departureIndex: number; driverId?: string },
  ): Promise<{ totalSeats: number; booked: number[] }> => {
    const { data } = await api.get<{
      success: boolean;
      data: { totalSeats: number; booked: number[] };
    }>(`/routes/${routeId}/seats`, {
      params: {
        date: opts.date,
        departureIndex: opts.departureIndex,
        ...(opts.driverId ? { driverId: opts.driverId } : {}),
      },
    });
    return data.data;
  },

  /**
   * Atomically reserve seats for a trip. Throws (409) if any of the
   * picked seats were taken by another rider between fetch and book.
   */
  bookSeats: async (
    routeId: string,
    opts: {
      departureDate: string;
      departureIndex: number;
      driverId: string;
      seats: number[];
      totalAmount?: number;
      /** Per-seat passenger details, persisted so the ticket/history can
       *  show who each seat is for. */
      passengers?: { seat: number; name: string; contact?: string }[];
    },
  ): Promise<any> => {
    const { data } = await api.post(`/routes/${routeId}/book`, opts);
    return data?.data;
  },

  /**
   * Cancel a scheduled-seat booking. Accepts either the raw booking id or the
   * `sched_<id>` form the Activity list uses — the backend strips the prefix.
   */
  cancelBooking: async (bookingId: string): Promise<any> => {
    const { data } = await api.post(`/routes/bookings/${bookingId}/cancel`);
    return data?.data;
  },
};
