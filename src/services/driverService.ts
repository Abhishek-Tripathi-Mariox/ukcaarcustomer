import { api } from './api';

export interface NearbyDriver {
  id: string;
  name: string;
  location: { lat: number; lng: number };
  rating?: number;
  vehicle: {
    make?: string;
    model?: string;
    color?: string;
  };
}

export interface NearbyDriversResponse {
  success: boolean;
  data: {
    drivers: NearbyDriver[];
    count: number;
  };
}

export const driverService = {
  /**
   * Fetches online drivers within `radiusKm` of (lat, lng). Used by the home
   * screen to render live cab markers on the map.
   */
  getNearby: async (
    lat: number,
    lng: number,
    radiusKm: number = 5,
  ): Promise<NearbyDriver[]> => {
    const { data } = await api.get<NearbyDriversResponse>('/drivers/nearby', {
      params: { lat, lng, radius: radiusKm },
    });
    return data?.data?.drivers ?? [];
  },

  /**
   * Distinct approved-driver count across active scheduled routes whose
   * corridor includes (lat,lng). Used by the Home Scheduled-tab badge.
   *
   * Note: lat/lng are intentionally accepted but the backend currently
   * returns the aggregate over *all* routes the user could reach. Corridor
   * filtering by pickup coords lands in Slice 3.
   */
  getScheduledNearbyCount: async (
    _lat: number,
    _lng: number,
  ): Promise<number> => {
    const { data } = await api.get<{
      success: boolean;
      data: { routes: unknown[]; totalApprovedDrivers: number };
    }>('/routes/scheduled', {
      params: { hasApprovedDriver: 'true' },
    });
    return data?.data?.totalApprovedDrivers ?? 0;
  },
};
