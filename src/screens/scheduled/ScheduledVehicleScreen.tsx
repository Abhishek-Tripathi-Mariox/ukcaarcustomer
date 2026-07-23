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
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Shadow, alpha } from '@/theme';
import { fs, s, vs } from '@/theme/responsive';
import type { ScheduledRoute } from './ScheduledRouteScreen';
import { routeService, type RouteVehicle } from '@/services/routeService';

interface Stop { id: string; name: string; time: string }

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
  const [routeCapacity, setRouteCapacity] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [seatsNeeded, setSeatsNeeded] = useState(1);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setVehicles(null);
    routeService
      .listVehicles(scheduledRoute.id, { date: departureDate, departureIndex })
      .then((res) => {
        if (cancelled) return;
        setVehicles(res.vehicles);
        setRouteCapacity(res.totalSeats || 0);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setError(
          err?.response?.data?.message || err?.message || 'Could not load vehicles',
        );
        setVehicles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [scheduledRoute.id, departureDate, departureIndex]);

  // A vehicle is selectable only if it can seat the whole request.
  const isSelectable = (v: RouteVehicle) => v.available >= seatsNeeded && v.available > 0;

  // Drop the selection if the seat-count change makes it no longer fit.
  useEffect(() => {
    if (!selectedDriverId) return;
    const sel = vehicles?.find((v) => v.driverId === selectedDriverId);
    if (sel && !isSelectable(sel)) setSelectedDriverId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seatsNeeded, vehicles]);

  // Stepper upper bound = the route's seat capacity (returned by the API
  // even when no vehicles are loaded yet). The rider may request up to a
  // full vehicle; vehicles with fewer free seats than the request are then
  // greyed out below.
  const maxSeats = Math.max(1, routeCapacity);

  const selectedVehicle = vehicles?.find((v) => v.driverId === selectedDriverId) ?? null;

  const handleContinue = () => {
    if (!selectedVehicle) return;
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
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.routeBanner}>
            <Text style={styles.routeBannerTitle} numberOfLines={2}>{scheduledRoute.name}</Text>
            <Text style={styles.routeBannerSub} numberOfLines={2}>
              {boarding.name} → {dropping.name}
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
              No vehicles are available for this departure yet. Try another
              route or check back closer to departure time.
            </Text>
          )}

          {vehicles.map(renderVehicle)}
        </ScrollView>
      )}

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={[styles.cta, !selectedVehicle && { opacity: 0.5 }]}
          onPress={handleContinue}
          activeOpacity={0.85}
          disabled={!selectedVehicle}
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
  cardDisabled: { backgroundColor: Colors.backgroundDisabled, borderColor: Colors.borderLight, shadowOpacity: 0, elevation: 0 },
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
