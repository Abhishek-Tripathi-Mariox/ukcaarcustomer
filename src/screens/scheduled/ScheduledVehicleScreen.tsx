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
              {v.rating?.toFixed(1) ?? '5.0'}
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
            <Text style={styles.routeBannerTitle}>{scheduledRoute.name}</Text>
            <Text style={styles.routeBannerSub}>
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
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: 'Inter-SemiBold', fontSize: 16, color: Colors.white, flex: 1, textAlign: 'center' },
  content: { padding: 16, paddingBottom: 120 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },

  routeBanner: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  routeBannerTitle: { fontFamily: 'Inter-SemiBold', fontSize: 16, color: Colors.textPrimary },
  routeBannerSub: { fontFamily: 'Inter-Regular', fontSize: 13, color: Colors.textSecondary, marginTop: 2 },

  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: 14,
    marginBottom: 18,
  },
  stepperLabel: { fontFamily: 'Inter-SemiBold', fontSize: 15, color: Colors.textPrimary },
  stepperHint: { fontFamily: 'Inter-Regular', fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnDisabled: { borderColor: '#E0E0E0' },
  stepValue: { fontFamily: 'Inter-SemiBold', fontSize: 18, color: Colors.textPrimary, minWidth: 22, textAlign: 'center' },

  sectionTitle: { fontFamily: 'Inter-SemiBold', fontSize: 16, color: Colors.textPrimary, marginBottom: 12 },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.white,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
    padding: 14,
    marginBottom: 12,
    ...Shadow.sm,
  },
  cardActive: { borderColor: Colors.primary, backgroundColor: 'rgba(0, 151, 179, 0.05)' },
  cardDisabled: { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB', shadowOpacity: 0, elevation: 0 },
  cardIcon: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 151, 179, 0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleName: { fontFamily: 'Inter-SemiBold', fontSize: 15, color: Colors.textPrimary },
  driverName: { fontFamily: 'Inter-Regular', fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  metaText: { fontFamily: 'Inter-Medium', fontSize: 12, color: Colors.textSecondary },
  metaDot: { color: Colors.textMuted, marginHorizontal: 2 },
  okText: { color: Colors.primary },
  warnText: { color: '#E08600' },
  fullText: { color: '#D11A2A' },
  tooFewNote: { fontFamily: 'Inter-Regular', fontSize: 11, color: '#E08600', marginTop: 4 },
  mutedText: { color: '#9CA3AF' },

  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },

  helperText: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 16,
    paddingHorizontal: 12,
  },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
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
  ctaText: { fontFamily: 'Inter-SemiBold', fontSize: 16, color: Colors.white },
});
