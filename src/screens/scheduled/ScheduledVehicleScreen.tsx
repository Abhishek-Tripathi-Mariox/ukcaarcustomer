import { scheduledRouteDuration } from '@/utils/scheduledRouteDuration';
import React, { useEffect, useState } from 'react';
import { driverRatingText } from '@/utils/driverRating';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  AppState,
  RefreshControl,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Shadow, alpha } from '@/theme';
import { fs, s, vs } from '@/theme/responsive';
import type { ScheduledRoute } from './ScheduledRouteScreen';
import { routeService, type RouteVehicle, type ScheduledAlternative } from '@/services/routeService';

interface Stop { id: string; name: string; time: string; sequence: number }

interface Props {
  navigation: any;
  route: {
    params: {
      route: ScheduledRoute;
      boarding: Stop;
      dropping: Stop;
      departureDate: string;
      departureIndex: number;
      // Per-seat fare for the chosen boarding→dropping segment (computed on
      // the previous screen from the stops' fareFromPrevious; falls back to
      // the flat seat price when no segment fares are configured).
      unitFare: number;
      seatsNeeded?: number;
    };
  };
}

/**
 * Step 3 of the scheduled booking flow (between Boarding/Drop and the seat
 * map). Shows every approved driver's vehicle on this trip with its own
 * live seat availability. The rider sets how many seats they need, then
 * picks a vehicle — any vehicle that's full, or has fewer free seats than
 * requested, is greyed out and unselectable. The chosen vehicle (driverId)
 * scopes the seat map and the final booking.
 */
export const ScheduledVehicleScreen: React.FC<Props> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { route: scheduledRoute, boarding, dropping, departureDate, departureIndex, unitFare } =
    route.params;

  const [vehicles, setVehicles] = useState<RouteVehicle[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Server explanation for a date/slot that cannot be booked (past date,
  // closed departure, non-operating day). When set, the empty state renders
  // THIS instead of the generic "check back closer to departure" copy —
  // which is actively wrong for a closed date.
  const [closedMessage, setClosedMessage] = useState<string | null>(null);
  const [seatsNeeded, setSeatsNeeded] = useState(route.params.seatsNeeded ?? 1);
  const [refreshing, setRefreshing] = useState(false);
  const [alternatives, setAlternatives] = useState<ScheduledAlternative[]>([]);
  const [alternativesLoading, setAlternativesLoading] = useState(false);
  const [alternativesError, setAlternativesError] = useState<string | null>(null);
  const [retryAlternatives, setRetryAlternatives] = useState(0);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let requestId = 0;
    const load = async () => {
      if (navigation.isFocused && !navigation.isFocused()) return;
      const generation = ++requestId;
      setRefreshing(true);
      try {
        const res = await routeService.listVehicles(scheduledRoute.id, { date: departureDate, departureIndex });
        if (cancelled || generation !== requestId) return;
        setVehicles(res.vehicles); setClosedMessage(res.message ?? null); setError(null);
      } catch (err: any) {
        if (cancelled || generation !== requestId) return;
        setError(err?.response?.data?.message || err?.message || 'Could not load vehicles');
        setVehicles([]); setSelectedDriverId(null); setClosedMessage(null);
      } finally { if (!cancelled && generation === requestId) setRefreshing(false); }
    };
    setVehicles(null); setSelectedDriverId(null); load();
    const timer = setInterval(load, 15000);
    const focus = navigation.addListener?.('focus', load);
    const appState = AppState.addEventListener('change', state => { if (state === 'active') load(); });
    return () => { cancelled = true; clearInterval(timer); focus?.(); appState.remove(); };
  }, [scheduledRoute.id, departureDate, departureIndex, navigation, retryAlternatives]);

  const noSuitableVehicle = vehicles !== null && !error && !closedMessage && !vehicles.some(vehicle => vehicle.available >= seatsNeeded && vehicle.available > 0);
  useEffect(() => {
    let cancelled = false;
    if (!noSuitableVehicle && !closedMessage) { setAlternatives([]); setAlternativesError(null); setAlternativesLoading(false); return; }
    setAlternativesLoading(true); setAlternatives([]); setAlternativesError(null);
    routeService.listAlternatives(scheduledRoute.id, { date: departureDate, departureIndex,
      boardingStopSequence: boarding.sequence, droppingStopSequence: dropping.sequence, seats: seatsNeeded, days: 7,
    }).then(result => { if (!cancelled) setAlternatives(result); })
      .catch((err: any) => { if (!cancelled) setAlternativesError(err?.response?.data?.message || 'Could not load alternatives.'); })
      .finally(() => { if (!cancelled) setAlternativesLoading(false); });
    return () => { cancelled = true; };
  }, [noSuitableVehicle, closedMessage, scheduledRoute.id, departureDate, departureIndex, boarding.sequence, dropping.sequence, seatsNeeded, retryAlternatives, vehicles]);

  const chooseAlternative = (alternative: ScheduledAlternative) => {
    const segmentFare = alternative.route.stops.filter(stop => stop.sequence > alternative.boarding.sequence && stop.sequence <= alternative.dropping.sequence).reduce((sum, stop) => sum + (stop.fareFromPrevious ?? 0), 0);
    const nextRoute: ScheduledRoute = { ...scheduledRoute, id: alternative.route._id, name: alternative.route.name,
      direction: alternative.route.direction ?? 'outbound', selectionKey: `${alternative.route._id}_${alternative.route.direction ?? 'outbound'}`,
      from: alternative.route.stops[0]?.name ?? '', to: alternative.route.stops[alternative.route.stops.length - 1]?.name ?? '',
      durationMin: alternative.route.schedule?.minimumJourneyMinutes ?? scheduledRouteDuration(alternative.route.stops),
      nearestPickupStopName: alternative.boarding.name, nearestPickupStopKm: null,
      price: alternative.route.schedule?.seatPrice ?? 0, capacity: alternative.availableSeats, availableSeats: alternative.availableSeats,
      bookingCutoffMinutes: alternative.route.schedule?.bookingCutoffMinutes, bookedSeats: 0, nextDeparture: alternative.departureTime,
      approvedDriverCount: alternative.vehicleCount, hasRoundTripDriver: false, returnDepartures: alternative.route.schedule?.returnDepartures,
    };
    navigation.push('ScheduledVehicle', { route: nextRoute, departureDate: alternative.departureDate, departureIndex: alternative.departureIndex,
      boarding: { id: String(alternative.boarding.sequence), name: alternative.boarding.name, sequence: alternative.boarding.sequence, time: alternative.departureTime },
      dropping: { id: String(alternative.dropping.sequence), name: alternative.dropping.name, sequence: alternative.dropping.sequence, time: alternative.departureTime },
      seatsNeeded, unitFare: segmentFare > 0 ? segmentFare : nextRoute.price,
    });
  };

  // A vehicle is selectable only if it can seat the whole request.
  const isSelectable = (v: RouteVehicle) => v.available >= seatsNeeded && v.available > 0;

  // Drop the selection if the seat-count change makes it no longer fit.
  useEffect(() => {
    if (!selectedDriverId) return;
    const sel = vehicles?.find((v) => v.driverId === selectedDriverId);
    if (!sel || !isSelectable(sel)) setSelectedDriverId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seatsNeeded, vehicles]);

  const maxSeats = Math.max(seatsNeeded, 1, ...(vehicles ?? []).map(vehicle => vehicle.capacity), ...alternatives.map(alternative => alternative.availableSeats));

  const selectedVehicle = vehicles?.find((v) => v.driverId === selectedDriverId) ?? null;

  const handleContinue = () => {
    if (!selectedVehicle || !isSelectable(selectedVehicle) || refreshing || closedMessage || error) return;
    navigation.navigate('ScheduledSeat', {
      route: scheduledRoute,
      boarding,
      dropping,
      departureDate,
      departureIndex,
      driverId: selectedVehicle.driverId,
      vehicle: selectedVehicle,
      seatsNeeded,
      unitFare,
    });
  };

  const renderVehicle = (v: RouteVehicle) => {
    const selectable = isSelectable(v);
    const isActive = v.driverId === selectedDriverId;
    const vehicleName =
      [v.vehicle.color, v.vehicle.make, v.vehicle.model].filter(Boolean).join(' ') ||
      'Vehicle';
    const full = v.available <= 0;
    const tooFew = !full && v.available < seatsNeeded;
    return (
      <TouchableOpacity
        key={v.driverId}
        activeOpacity={selectable ? 0.85 : 1}
        disabled={!selectable}
        onPress={() => setSelectedDriverId(v.driverId)}
        style={[
          styles.card,
          isActive && styles.cardActive,
          !selectable && styles.cardDisabled,
        ]}
      >
        <View style={styles.cardIcon}>
          <Ionicons
            name="car-sport"
            size={26}
            color={selectable ? Colors.primary : '#9CA3AF'}
          />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={[styles.vehicleName, !selectable && styles.mutedText]} numberOfLines={1}>
            {vehicleName}
          </Text>
          <Text style={[styles.driverName, !selectable && styles.mutedText]} numberOfLines={1}>
            {v.driverName}
            {v.vehicle.plateNumber ? `  •  ${v.vehicle.plateNumber}` : ''}
            {v.vehicle.typeCode ? `  •  ${v.vehicle.typeCode}` : ''}
          </Text>
          <View style={styles.metaRow}>
            <Ionicons name="star" size={12} color={selectable ? '#F5A623' : '#C4C4C4'} />
            <Text style={[styles.metaText, !selectable && styles.mutedText]}>
              {driverRatingText(v.rating)}
            </Text>
            <Text style={styles.metaDot}>·</Text>
            <Text
              style={[
                styles.metaText,
                full ? styles.fullText : tooFew ? styles.warnText : styles.okText,
              ]}
            >
              {full
                ? 'Fully booked'
                : `${v.available}/${v.capacity} seats free`}
            </Text>
          </View>
          {tooFew && (
            <Text style={styles.tooFewNote}>
              Only {v.available} left — need {seatsNeeded}
            </Text>
          )}
        </View>

        <View style={[styles.radio, isActive && styles.radioActive]}>
          {isActive && <Ionicons name="checkmark" size={13} color={Colors.white} />}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Select Vehicle</Text>
        <View style={{ width: 32 }} />
      </View>

      {vehicles === null ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => setRetryAlternatives(value => value + 1)} />}>
          <View style={styles.routeBanner}>
            <Text style={styles.routeBannerTitle} numberOfLines={2}>{scheduledRoute.name}</Text>
            <Text style={styles.routeBannerSub} numberOfLines={2}>
              {boarding.name} → {dropping.name} · {departureDate}{boarding.time ? ` · ${boarding.time} IST` : ''}
            </Text>
          </View>

          {/* Seats-needed stepper */}
          <View style={styles.stepperRow}>
            <View>
              <Text style={styles.stepperLabel}>Seats needed</Text>
              <Text style={styles.stepperHint}>
                Vehicles with fewer free seats are disabled
              </Text>
            </View>
            <View style={styles.stepper}>
              <TouchableOpacity
                style={[styles.stepBtn, seatsNeeded <= 1 && styles.stepBtnDisabled]}
                onPress={() => setSeatsNeeded((n) => Math.max(1, n - 1))}
                disabled={seatsNeeded <= 1}
              >
                <Ionicons name="remove" size={20} color={seatsNeeded <= 1 ? '#B0B0B0' : Colors.primary} />
              </TouchableOpacity>
              <Text style={styles.stepValue}>{seatsNeeded}</Text>
              <TouchableOpacity
                style={[styles.stepBtn, seatsNeeded >= maxSeats && styles.stepBtnDisabled]}
                onPress={() => setSeatsNeeded((n) => Math.min(maxSeats, n + 1))}
                disabled={seatsNeeded >= maxSeats}
              >
                <Ionicons name="add" size={20} color={seatsNeeded >= maxSeats ? '#B0B0B0' : Colors.primary} />
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Available Vehicles</Text>

          {error && <Text style={styles.helperText}>{error}</Text>}

          {vehicles.length === 0 && !error && (
            <Text style={styles.helperText}>
              {closedMessage ??
                'No vehicles are available for this departure yet. Choose an alternative below.'}
            </Text>
          )}

          {vehicles.map(renderVehicle)}
          {(noSuitableVehicle || closedMessage) && <View style={styles.routeBanner}>
            <Text style={styles.sectionTitle}>Alternative departures</Text>
            <Text style={styles.stepperHint}>Same date first, then the next 7 days. All times are IST.</Text>
            {alternativesLoading && <ActivityIndicator color={Colors.primary} />}
            {alternativesError && <><Text style={styles.helperText}>{alternativesError}</Text><TouchableOpacity onPress={() => setRetryAlternatives(value => value + 1)}><Text style={styles.okText}>Retry alternatives</Text></TouchableOpacity></>}
            {!alternativesLoading && !alternativesError && alternatives.length === 0 && <Text style={styles.helperText}>No matching departures have enough seats in this period. Try another travel date.</Text>}
            {alternatives.map(alternative => <TouchableOpacity key={alternative.route._id + alternative.departureDate + alternative.departureIndex} onPress={() => chooseAlternative(alternative)} style={[styles.card, { marginTop: 12 }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.vehicleName}>{alternative.route.name}</Text>
                <Text style={styles.driverName}>{alternative.departureDate} · {alternative.departureTime} IST</Text>
                <Text style={styles.driverName}>{alternative.boarding.name} → {alternative.dropping.name}</Text>
                <Text style={styles.okText}>{alternative.availableSeats} seats free in one vehicle · Choose departure</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.primary} />
            </TouchableOpacity>)}
          </View>}
        </ScrollView>
      )}

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={[styles.cta, (!selectedVehicle || refreshing || !!closedMessage || !!error) && { opacity: 0.5 }]}
          onPress={handleContinue}
          activeOpacity={0.85}
          disabled={!selectedVehicle || refreshing || !!closedMessage || !!error}
        >
          <Text style={styles.ctaText}>
            {selectedVehicle ? `Continue (${seatsNeeded} seat${seatsNeeded === 1 ? '' : 's'})` : 'Select a vehicle'}
          </Text>
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
    paddingHorizontal: s(16),
    paddingVertical: vs(14),
  },
  backBtn: { width: s(32), height: s(32), alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: 'Inter-SemiBold', fontSize: fs(18), color: Colors.white, flex: 1, textAlign: 'center' },
  content: { padding: s(16), paddingBottom: vs(120) },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: s(24) },

  routeBanner: {
    backgroundColor: Colors.white,
    borderRadius: s(12),
    padding: s(14),
    marginBottom: vs(16),
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  routeBannerTitle: { fontFamily: 'Inter-SemiBold', fontSize: fs(16), color: Colors.textPrimary },
  routeBannerSub: { fontFamily: 'Inter-Regular', fontSize: fs(13), color: Colors.textSecondary, marginTop: vs(2), flexShrink: 1 },

  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.white,
    borderRadius: s(12),
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: s(14),
    marginBottom: vs(18),
  },
  stepperLabel: { fontFamily: 'Inter-SemiBold', fontSize: fs(15), color: Colors.textPrimary },
  stepperHint: { fontFamily: 'Inter-Regular', fontSize: fs(11), color: Colors.textMuted, marginTop: vs(2) },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: s(14) },
  stepBtn: {
    width: s(36),
    height: s(36),
    borderRadius: s(10),
    borderWidth: 1.5,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnDisabled: { borderColor: Colors.borderLight },
  stepValue: { fontFamily: 'Inter-SemiBold', fontSize: fs(18), color: Colors.textPrimary, minWidth: s(22), textAlign: 'center' },

  sectionTitle: { fontFamily: 'Inter-SemiBold', fontSize: fs(16), color: Colors.textPrimary, marginBottom: vs(12) },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(12),
    backgroundColor: Colors.white,
    borderRadius: s(14),
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
    padding: s(14),
    marginBottom: vs(12),
    ...Shadow.sm,
  },
  cardActive: { borderColor: Colors.primary, backgroundColor: alpha(Colors.primary, 0.05) },
  cardDisabled: { backgroundColor: Colors.backgroundInput, borderColor: Colors.borderLight, shadowOpacity: 0, elevation: 0 },
  cardIcon: {
    width: s(46),
    height: s(46),
    borderRadius: s(12),
    backgroundColor: alpha(Colors.primary, 0.10),
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleName: { fontFamily: 'Inter-SemiBold', fontSize: fs(15), color: Colors.textPrimary },
  driverName: { fontFamily: 'Inter-Regular', fontSize: fs(12), color: Colors.textSecondary, marginTop: vs(2) },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: s(4), marginTop: vs(6) },
  metaText: { fontFamily: 'Inter-Medium', fontSize: fs(12), color: Colors.textSecondary },
  metaDot: { color: Colors.textMuted, marginHorizontal: s(2) },
  okText: { color: Colors.primary },
  warnText: { color: Colors.warning },
  fullText: { color: Colors.error },
  tooFewNote: { fontFamily: 'Inter-Regular', fontSize: fs(11), color: Colors.warning, marginTop: vs(4) },
  mutedText: { color: Colors.textMuted },

  radio: {
    width: s(22),
    height: s(22),
    borderRadius: s(11),
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },

  helperText: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(13),
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: vs(16),
    paddingHorizontal: s(12),
  },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: s(16),
    paddingTop: vs(12),
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
  ctaText: { fontFamily: 'Inter-SemiBold', fontSize: fs(16), color: Colors.white },
});
