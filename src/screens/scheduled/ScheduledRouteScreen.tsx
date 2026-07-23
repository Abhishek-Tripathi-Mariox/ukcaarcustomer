import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Shadow } from '@/theme';
import { fs, s, vs } from '@/theme/responsive';
import { routeService, type ScheduledRouteApi } from '@/services/routeService';
import { geoService } from '@/services/geoService';

interface ScheduledRouteScreenProps {
  navigation: any;
  route?: { params?: { pickup?: string; drop?: string } };
}

/**
 * UI shape for a route row — derived from the backend's ScheduledRouteApi
 * by `routeToUi()` below. Kept separate from the API type so the rendering
 * code stays simple and we can compute things like `nextDeparture` once per
 * route rather than on every re-render.
 */
export interface ScheduledRoute {
  id: string;
  name: string;
  from: string;
  to: string;
  capacity: number;
  price: number;
  nextDeparture: string;
  approvedDriverCount: number;
  returnDepartures?: { stopIndex: number; time: string }[];
  hasRoundTripDriver: boolean;
  /** Nearest departure stop to the rider's pickup, and how far it is.
   *  Only populated when the backend received pickup coords. The home
   *  screen surfaces this so the rider knows which boarding point this
   *  route starts from before they tap into the seats screen. */
  nearestPickupStopName?: string | null;
  nearestPickupStopKm?: number | null;
  /** Estimated trip length in minutes — computed client-side from the
   *  stop polyline (Haversine total ÷ assumed 35 km/h cruise) because
   *  the Route model doesn't store this. Surfaced on the Select Route
   *  card's Duration column. */
  durationMin: number;
  /** Booked seats on the next-upcoming trip. Available = capacity − this. */
  bookedSeats: number;
}

// Exported so BoardingDrop / Seat / Summary screens can format the
// same way without duplicating the conversion. Pure function, no deps.
export const fmt12h = (hhmm: string): string => {
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h)) return hhmm;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
};

/**
 * Find the next upcoming departure time today (or earliest tomorrow) from
 * the route's schedule. Falls back to the literal first time slot if all
 * of today's are in the past.
 */
const computeNextDeparture = (route: ScheduledRouteApi): string => {
  const departures = route.schedule?.departures ?? [];
  if (departures.length === 0) return '—';
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const sorted = [...departures].sort((a, b) => a.time.localeCompare(b.time));
  const upcoming = sorted.find(d => {
    const [h, m] = d.time.split(':').map(Number);
    return h * 60 + m > nowMin;
  });
  return fmt12h((upcoming ?? sorted[0]).time);
};

// Approximate cruise speed for a shuttle on Indian roads. Used to
// translate the stop-polyline distance into a "Duration" the rider can
// trust without a real routing engine round-trip.
const SHUTTLE_KMH = 35;

const haversineKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }): number => {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
};

const computeDurationMin = (r: ScheduledRouteApi): number => {
  const stops = [...(r.stops ?? [])].sort(
    (a, b) => (a.sequence ?? 0) - (b.sequence ?? 0),
  );
  if (stops.length < 2) return 0;
  let totalKm = 0;
  for (let i = 1; i < stops.length; i += 1) {
    totalKm += haversineKm(stops[i - 1], stops[i]);
  }
  return Math.max(1, Math.round((totalKm / SHUTTLE_KMH) * 60));
};

// Exported so HomeScreen can render the same route cards inline without
// duplicating the API → UI mapping logic.
export const routeToUi = (r: ScheduledRouteApi): ScheduledRoute => {
  const first = r.stops[0];
  const last = r.stops[r.stops.length - 1];
  const meters = r.nearestPickupStopMeters;
  return {
    id: r._id,
    name: r.name,
    from: first?.name ?? '—',
    to: last?.name ?? '—',
    capacity: r.schedule?.totalSeats ?? 0,
    price: r.schedule?.seatPrice ?? 0,
    durationMin: computeDurationMin(r),
    bookedSeats: r.nextDepartureBookedSeats ?? 0,
    nextDeparture: computeNextDeparture(r),
    approvedDriverCount: r.approvedDriverCount ?? 0,
    returnDepartures: r.schedule?.returnDepartures,
    hasRoundTripDriver: r.hasRoundTripDriver ?? false,
    nearestPickupStopName: r.nearestPickupStopName ?? null,
    nearestPickupStopKm:
      typeof meters === 'number' && Number.isFinite(meters)
        ? Math.round(meters / 100) / 10 // 1 decimal km
        : null,
  };
};

export const ScheduledRouteScreen: React.FC<ScheduledRouteScreenProps> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const [routes, setRoutes] = useState<ScheduledRoute[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickup] = useState(route?.params?.pickup || '');
  const [dropoff] = useState(route?.params?.drop || '');

  useEffect(() => {
    let cancelled = false;

    const resolveCoords = async (text: string) => {
      const trimmed = text?.trim();
      if (!trimmed) return undefined;
      try {
        const results = await geoService.autocomplete(trimmed, 1);
        if (results.length === 0) return undefined;
        return { lat: results[0].lat, lng: results[0].lng };
      } catch {
        return undefined;
      }
    };

    (async () => {
      const pickupCoords = await resolveCoords(pickup);
      const dropCoords = await resolveCoords(dropoff);
      if (cancelled) return;
      routeService
        .listScheduled({
          hasApprovedDriver: false,
          pickup: pickupCoords,
          drop: dropCoords,
        })
        .then((apiRoutes) => {
          if (cancelled) return;
          const ui = apiRoutes.map(routeToUi);
          setRoutes(ui);
          if (ui.length > 0) setSelectedId(ui[0].id);
        })
        .catch((err) => {
          if (cancelled) return;
          console.warn('[scheduled-routes] fetch failed:', err);
          setLoadError(err?.message ?? 'Could not load routes');
        });
    })();

    return () => {
      cancelled = true;
    };
  }, [pickup, dropoff]);

  const selected = routes?.find((r) => r.id === selectedId) ?? null;

  const handleSelectSeats = () => {
    if (!selected) return;
    navigation.navigate('ScheduledBoardingDrop', { route: selected });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Dark icons — the header bar is white now, light-content was invisible. */}
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      {/* Header — matches Plan your ride (light bar, dark back arrow). */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={23} color="#1D262D" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Select Route</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Trip summary in the same combined box used on Plan your ride —
            read-only here; tapping it goes back so the rider can edit the
            stops that drive this route search. */}
        <TouchableOpacity
          style={styles.comboBox}
          activeOpacity={0.85}
          onPress={() => navigation.goBack()}
        >
          <View style={styles.comboRow}>
            <View style={styles.comboIconCol}>
              <View style={styles.dotOuter}><View style={styles.dotInner} /></View>
            </View>
            <Text style={styles.comboText} numberOfLines={1}>
              {pickup || 'Pickup location'}
            </Text>
          </View>

          <View style={styles.comboDivider} />

          <View style={styles.comboRow}>
            <View style={styles.comboIconCol}>
              <View style={styles.squareIcon} />
            </View>
            <Text
              style={[styles.comboText, !dropoff && styles.comboPlaceholder]}
              numberOfLines={1}
            >
              {dropoff || 'Where to?'}
            </Text>
            <Ionicons name="create-outline" size={17} color="#9CA3AF" />
          </View>
        </TouchableOpacity>

        {/* Routes \u2014 loading / empty / error states */}
        {routes === null && !loadError && (
          <View style={{ paddingVertical: 32, alignItems: 'center' }}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        )}
        {loadError && (
          <View style={{ paddingVertical: 24, alignItems: 'center' }}>
            <Text style={{ color: Colors.textSecondary }}>{loadError}</Text>
          </View>
        )}
        {routes && routes.length === 0 && (
          <View style={{ paddingVertical: 24, alignItems: 'center' }}>
            <Text style={{ color: Colors.textSecondary, textAlign: 'center' }}>
              No scheduled routes match these stops. Try changing your pickup
              or drop location.
            </Text>
          </View>
        )}
        {routes?.map((r) => {
          const isActive = r.id === selectedId;
          // Duration is computed in routeToUi from the stop polyline
          // (Haversine total \u00f7 assumed 35 km/h cruise) \u2014 gives the rider
          // a realistic trip length without a routing-engine round-trip.
          const durationLabel = r.durationMin > 0 ? `${r.durationMin}min` : '\u2014';
          // Available = remaining seats on the next trip. Falls back to
          // capacity when no bookings exist yet.
          const remaining = Math.max(0, r.capacity - (r.bookedSeats ?? 0));
          const availableLabel = r.capacity ? `${remaining}/${r.capacity}` : '\u2014';
          return (
            <TouchableOpacity
              key={r.id}
              activeOpacity={0.9}
              onPress={() => setSelectedId(r.id)}
              style={[styles.routeCard, isActive && styles.routeCardActive]}
            >
              <Text style={styles.routeName} numberOfLines={1}>
                {r.name}
              </Text>

              {/* Stop list with vertical connector \u2014 pickup then drop */}
              <View style={styles.stopRow}>
                <View style={styles.stopIconWrap}>
                  <Ionicons
                    name="navigate-circle-outline"
                    size={18}
                    color={Colors.primary}
                  />
                </View>
                <Text style={styles.stopText} numberOfLines={2}>
                  {r.from}
                </Text>
              </View>
              <View style={styles.stopConnector} />
              <View style={styles.stopRow}>
                <View style={styles.stopIconWrap}>
                  <Ionicons
                    name="location-outline"
                    size={18}
                    color="#9CA3AF"
                  />
                </View>
                <Text style={styles.stopText} numberOfLines={2}>
                  {r.to}
                </Text>
              </View>

              {/* Metrics \u2014 Duration / Available / Price.
                  Small icon+label above, big SemiBold value below. */}
              <View style={styles.metricsRow}>
                <View style={styles.metricCell}>
                  <View style={styles.metricHead}>
                    <Ionicons name="time-outline" size={12} color="#6A7282" />
                    <Text style={styles.metricLabel}>Duration</Text>
                  </View>
                  <Text style={styles.metricValue}>{durationLabel}</Text>
                </View>
                <View style={styles.metricCell}>
                  <View style={styles.metricHead}>
                    <Ionicons name="person-outline" size={12} color="#6A7282" />
                    <Text style={styles.metricLabel}>Available</Text>
                  </View>
                  <Text style={styles.metricValue}>{availableLabel}</Text>
                </View>
                <View style={styles.metricCell}>
                  <View style={styles.metricHead}>
                    <Ionicons name="card-outline" size={12} color="#6A7282" />
                    <Text style={styles.metricLabel}>Price</Text>
                  </View>
                  <Text style={styles.metricValue}>{'\u20B9'} {r.price}</Text>
                </View>
              </View>

              <View style={styles.cardDivider} />
              <Text style={styles.nextDeparture}>
                Next Departure: {r.nextDeparture}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.cta, !selected && { opacity: 0.5 }]}
          onPress={handleSelectSeats}
          activeOpacity={0.85}
          disabled={!selected}
        >
          <Text style={styles.ctaText}>Select Seats</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundCard },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: s(16),
    paddingVertical: vs(12),
  },
  backBtn: { width: s(32), height: s(32), alignItems: 'flex-start', justifyContent: 'center' },
  headerTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(18),
    color: '#1D262D',
  },
  content: { padding: s(16), paddingBottom: vs(120) },

  /* Trip summary box — mirrors the combined pickup/drop box on Plan your ride
     so the two screens read as one flow. */
  comboBox: {
    borderWidth: 1.5,
    borderColor: '#1D262D',
    borderRadius: s(12),
    paddingVertical: vs(4),
    marginBottom: vs(16),
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  comboRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: s(12),
    paddingVertical: vs(13),
    gap: s(4),
  },
  comboIconCol: { width: s(30), alignItems: 'center' },
  dotOuter: {
    width: s(16),
    height: s(16),
    borderRadius: s(8),
    borderWidth: 1.5,
    borderColor: '#1D262D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotInner: { width: s(7), height: s(7), borderRadius: s(3.5), backgroundColor: '#1D262D' },
  squareIcon: { width: s(13), height: s(13), borderRadius: s(2), backgroundColor: '#1D262D' },
  comboDivider: { height: 1, backgroundColor: '#E5E7EB', marginLeft: s(42) },
  comboText: {
    flex: 1,
    fontFamily: 'Inter-Medium',
    fontSize: fs(14.5),
    color: '#1D262D',
  },
  comboPlaceholder: { color: '#9CA3AF' },


  routeCard: {
    backgroundColor: Colors.white,
    borderRadius: s(24),
    borderWidth: 2,
    borderColor: 'transparent',
    paddingVertical: vs(22),
    paddingHorizontal: s(23),
    marginTop: vs(14),
    ...Shadow.md,
  },
  routeCardActive: { borderColor: Colors.primary },
  routeName: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: fs(24),
    lineHeight: fs(30),
    color: Colors.textPrimary,
    opacity: 0.85,
    marginBottom: vs(18),
  },

  stopRow: { flexDirection: 'row', alignItems: 'center', gap: s(12) },
  stopIconWrap: {
    width: s(18),
    height: s(18),
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopText: {
    fontFamily: 'Poppins-Light',
    fontSize: fs(14),
    lineHeight: fs(20),
    color: Colors.textPrimary,
    opacity: 0.85,
    flex: 1,
    flexShrink: 1,
  },
  stopConnector: {
    width: 1.5,
    height: vs(18),
    backgroundColor: Colors.borderLight,
    marginLeft: s(8.25),
    marginVertical: vs(4),
  },

  metricsRow: {
    flexDirection: 'row',
    marginTop: vs(20),
  },
  metricCell: { flex: 1 },
  metricHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(4),
    opacity: 0.3,
    marginBottom: vs(4),
  },
  metricLabel: {
    fontFamily: 'Poppins-Regular',
    fontSize: fs(12),
    lineHeight: fs(16),
    color: Colors.textPrimary,
  },
  metricValue: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: fs(16),
    lineHeight: fs(22),
    color: Colors.textPrimary,
    opacity: 0.85,
  },

  cardDivider: {
    height: 1,
    backgroundColor: Colors.borderLight,
    marginTop: vs(16),
    marginBottom: vs(12),
  },
  nextDeparture: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: fs(15),
    lineHeight: fs(22),
    color: Colors.textPrimary,
    opacity: 0.85,
  },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: s(16),
    backgroundColor: Colors.backgroundCard,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  cta: {
    backgroundColor: Colors.primary,
    borderRadius: s(8),
    height: vs(56),
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(16),
    color: Colors.white,
  },
});
