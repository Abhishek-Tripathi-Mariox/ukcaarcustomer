import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Image,
  ActivityIndicator,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Shadow } from '@/theme';
import { TargetIcon } from '@/components/icons/HomeIcons';
import { routeService, type ScheduledRouteApi } from '@/services/routeService';
import { geoService } from '@/services/geoService';

const pickupGif = require('../../../assets/home-screen/gifs/charging-station.gif');
const dropGif = require('../../../assets/home-screen/gifs/location.gif');

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
  const [pickup] = useState(route?.params?.pickup || 'khora, Noida 62');
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
          hasApprovedDriver: true,
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
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Select Route</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Pickup */}
        <View style={styles.inputWrapper}>
          <Text style={styles.inputFloatLabel}>Pickup location</Text>
          <View style={[styles.inputContainer, styles.inputContainerActive]}>
            <View style={styles.inputIconCircle}>
              <Image source={pickupGif} style={styles.inputIconImage} resizeMode="contain" />
            </View>
            <Text style={styles.inputValue} numberOfLines={1}>{pickup}</Text>
            <TouchableOpacity style={styles.gpsButton}>
              <TargetIcon size={24} color={Colors.primary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Dropoff */}
        <View style={styles.inputWrapper}>
          <Text style={styles.inputFloatLabel}>Where to?</Text>
          <View style={styles.inputContainer}>
            <View style={[styles.inputIconCircle, { backgroundColor: 'transparent' }]}>
              <Image source={dropGif} style={styles.inputIconImage} resizeMode="contain" />
            </View>
            <Text style={styles.inputPlaceholder} numberOfLines={1}>
              {dropoff || 'Where is your Drop?'}
            </Text>
          </View>
        </View>

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
                <Text style={styles.stopText} numberOfLines={1}>
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
                <Text style={styles.stopText} numberOfLines={1}>
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
                  <Text style={styles.metricValue}>\u20B9 {r.price}</Text>
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
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 18,
    color: Colors.white,
  },
  content: { padding: 16, paddingBottom: 120 },

  inputWrapper: { marginBottom: 14, position: 'relative', paddingTop: 8 },
  inputFloatLabel: {
    position: 'absolute',
    top: 0,
    left: 20,
    zIndex: 2,
    backgroundColor: Colors.white,
    paddingHorizontal: 8,
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    color: Colors.textSecondary,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    height: 60,
    gap: 10,
    ...Shadow.sm,
  },
  inputContainerActive: { borderColor: Colors.primary },
  inputIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  inputIconImage: { width: 40, height: 40 },
  inputValue: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: Colors.textSecondary,
    flex: 1,
  },
  inputPlaceholder: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: Colors.textMuted,
    flex: 1,
  },
  gpsButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },

  // Route card — matches Figma node 67:5970 (24px radius, generous
  // shadow, 2px teal border when selected).
  routeCard: {
    backgroundColor: Colors.white,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: 'transparent',
    paddingVertical: 22,
    paddingHorizontal: 23,
    marginTop: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  routeCardActive: { borderColor: Colors.primary },
  routeName: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 24,
    lineHeight: 30,
    color: Colors.textPrimary,
    opacity: 0.85,
    marginBottom: 18,
  },

  stopRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stopIconWrap: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopText: {
    fontFamily: 'Poppins-Light',
    fontSize: 14,
    lineHeight: 20,
    color: Colors.textPrimary,
    opacity: 0.85,
    flex: 1,
  },
  stopConnector: {
    width: 1.5,
    height: 18,
    backgroundColor: '#D1D5DB',
    marginLeft: 8.25, // (18 / 2) - 0.75, centred under the icon
    marginVertical: 4,
  },

  // Metrics row — label+icon stack on top, big value below. Matches
  // Figma's three equal-width columns.
  metricsRow: {
    flexDirection: 'row',
    marginTop: 20,
  },
  metricCell: { flex: 1 },
  metricHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    opacity: 0.3,
    marginBottom: 4,
  },
  metricLabel: {
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    lineHeight: 16,
    color: '#000000',
  },
  metricValue: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 16,
    lineHeight: 22,
    color: Colors.textPrimary,
    opacity: 0.85,
  },

  cardDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginTop: 16,
    marginBottom: 12,
  },
  nextDeparture: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 15,
    lineHeight: 22,
    color: Colors.textPrimary,
    opacity: 0.85,
  },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    backgroundColor: Colors.backgroundCard,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  cta: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    color: Colors.white,
  },
});
