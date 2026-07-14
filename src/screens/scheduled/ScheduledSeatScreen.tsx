import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Shadow, alpha } from '@/theme';
import { fs, s, vs } from '@/theme/responsive';
import type { ScheduledRoute } from './ScheduledRouteScreen';
import { routeService, type RouteVehicle } from '@/services/routeService';
import { BusSeatIcon, DriverHeadIcon } from '@/components/icons/SeatIcons';

// Figma node 70:8730 — selected seats use a rose-red border / icon.
// Available are teal, booked are neutral grey with 20% opacity tile.
const COLOR_AVAILABLE = Colors.primary;
const COLOR_SELECTED = Colors.error;
const COLOR_BOOKED = Colors.textPrimary;

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
      // The vehicle chosen on ScheduledVehicleScreen. driverId scopes the
      // seat map + booking to that shuttle; seatsNeeded caps how many seats
      // the rider may pick here (matches what they requested on the
      // previous screen).
      driverId: string;
      vehicle: RouteVehicle;
      seatsNeeded: number;
      // Per-seat fare for the chosen boarding→dropping segment.
      unitFare: number;
    };
  };
}

type SeatStatus = 'available' | 'booked' | 'selected';

/**
 * Step 3 of the scheduled booking flow. Loads the live seat-availability
 * for this exact trip (route + date + departure slot) so seats other
 * riders have already reserved appear greyed out. Refresh pulls the
 * latest in case someone else booked while this screen was open. The
 * actual reservation happens in ScheduledPaymentScreen.handlePay so a
 * rider who backs out without paying doesn't hold a seat hostage.
 */
export const ScheduledSeatScreen: React.FC<Props> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const {
    route: scheduledRoute,
    boarding,
    dropping,
    departureDate,
    departureIndex,
    driverId,
    vehicle,
    seatsNeeded,
    unitFare,
  } = route.params;

  // Per-seat price for this trip: segment fare when configured, else the
  // route's flat seat price.
  const perSeat = unitFare || scheduledRoute.price;

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [totalSeats, setTotalSeats] = useState<number>(0);
  const [bookedSet, setBookedSet] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSeats = useCallback(async () => {
    try {
      setError(null);
      const data = await routeService.getSeats(scheduledRoute.id, {
        date: departureDate,
        departureIndex,
        driverId,
      });
      setTotalSeats(data.totalSeats || 0);
      setBookedSet(new Set(data.booked || []));
      // Drop any seats from the local selection that just became taken
      // (someone else grabbed them while this screen was open).
      setSelected((prev) => {
        const next = new Set<number>();
        for (const n of prev) if (!data.booked.includes(n)) next.add(n);
        return next;
      });
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Could not load seats');
    }
  }, [scheduledRoute.id, departureDate, departureIndex, driverId]);

  useEffect(() => {
    setLoading(true);
    loadSeats().finally(() => setLoading(false));
  }, [loadSeats]);

  const seats = useMemo(() => {
    return Array.from({ length: totalSeats }, (_, i) => {
      const num = i + 1;
      let status: SeatStatus = 'available';
      if (bookedSet.has(num)) status = 'booked';
      if (selected.has(num)) status = 'selected';
      return { num, status };
    });
  }, [totalSeats, bookedSet, selected]);

  // Cap how many seats can be picked at what the rider requested on the
  // vehicle screen. Falls back to the vehicle capacity if seatsNeeded wasn't
  // passed (legacy nav). Tapping a new seat past the cap is a no-op.
  const selectCap = seatsNeeded || totalSeats || Infinity;

  const toggleSeat = (num: number) => {
    if (bookedSet.has(num)) return;
    const next = new Set(selected);
    if (next.has(num)) {
      next.delete(num);
    } else {
      if (next.size >= selectCap) return;
      next.add(num);
    }
    setSelected(next);
  };

  const totalAmount = selected.size * perSeat;

  const handleContinue = () => {
    if (selected.size === 0) return;
    navigation.navigate('ScheduledPassengerDetails', {
      route: scheduledRoute,
      boarding,
      dropping,
      departureDate,
      departureIndex,
      driverId,
      vehicle,
      unitFare: perSeat,
      seats: Array.from(selected).sort((a, b) => a - b),
    });
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadSeats().finally(() => setRefreshing(false));
  };

  const renderSeat = (num: number, status: SeatStatus) => {
    // Booked tiles use a near-black border at 20% opacity (the icon and
    // number inherit the same washed-out look). Selected = rose, available
    // = teal — matches Figma node 70:8705 / 70:8730 / 70:8762 exactly.
    const color =
      status === 'booked'
        ? COLOR_BOOKED
        : status === 'selected'
        ? COLOR_SELECTED
        : COLOR_AVAILABLE;
    return (
      <TouchableOpacity
        key={num}
        activeOpacity={0.7}
        onPress={() => toggleSeat(num)}
        disabled={status === 'booked'}
        style={[
          styles.seatTile,
          { borderColor: color },
          status === 'booked' && styles.seatTileBooked,
        ]}
      >
        <BusSeatIcon size={25} color={color} />
        <Text style={[styles.seatNum, { color }]}>{num}</Text>
      </TouchableOpacity>
    );
  };

  // Lay seats out in rows of 4 like the existing UI — works for routes
  // up to ~28 seats (the model caps at totalSeats anyway).
  const seatRows = useMemo(() => {
    const rows: Array<typeof seats> = [];
    for (let i = 0; i < seats.length; i += 4) rows.push(seats.slice(i, i + 4));
    return rows;
  }, [seats]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.white} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.headerTitle}>Select Seats</Text>
          <Text style={styles.headerSub}>
            {selected.size}/{seatsNeeded || totalSeats} selected
          </Text>
        </View>
        <TouchableOpacity onPress={onRefresh} style={styles.backBtn}>
          <Ionicons name="refresh" size={22} color={Colors.white} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.loadingWrap}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={onRefresh} style={styles.retryBtn} activeOpacity={0.85}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : totalSeats === 0 ? (
        <View style={styles.loadingWrap}>
          <Text style={styles.errorText}>
            This route doesn't have seats configured yet. Ask the admin to
            set <Text style={{ fontStyle: 'italic' }}>Total seats</Text> on
            the route.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
              colors={[Colors.primary]}
            />
          }
        >
          {/* Driver tile — Figma node 70:8858. Teal-bordered rounded
              square with the driver-bust icon, "Driver" label below. */}
          <View style={styles.driverTile}>
            <DriverHeadIcon size={36} color={Colors.primary} />
          </View>
          <Text style={styles.driverLabel}>Driver</Text>

          <View style={styles.grid}>
            {seatRows.map((rowSeats, rowIdx) => (
              <View key={rowIdx} style={styles.row}>
                {rowSeats.map((s) => renderSeat(s.num, s.status))}
              </View>
            ))}
          </View>

          {/* Legend — small tinted seat icons + labels, matches Figma
              node 70:8655. Renders below the grid so the rider has a
              quick colour reference without scrolling. */}
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <BusSeatIcon size={20} color="#ADADAD" />
              <Text style={styles.legendText}>Booked</Text>
            </View>
            <View style={styles.legendItem}>
              <BusSeatIcon size={20} color={COLOR_SELECTED} />
              <Text style={styles.legendText}>Selected</Text>
            </View>
            <View style={styles.legendItem}>
              <BusSeatIcon size={22} color={COLOR_AVAILABLE} />
              <Text style={styles.legendText}>Available</Text>
            </View>
          </View>
        </ScrollView>
      )}

      <View style={styles.footer}>
        <View style={styles.totalRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.totalLabel}>Total Amount</Text>
            {/* Per-seat breakdown so it's clear the total scales with
                the seat count: e.g. "2 seats × ₹100" → ₹200. Hidden
                until at least one seat is picked so we don't tease an
                empty calculation. Pulls from the admin-set seatPrice on
                the route. */}
            {selected.size > 0 && (
              <Text style={styles.totalBreakdown}>
                {selected.size} seat{selected.size === 1 ? '' : 's'} × ₹
                {perSeat}
              </Text>
            )}
          </View>
          <Text style={styles.totalValue}>₹ {totalAmount}</Text>
        </View>
        <TouchableOpacity
          style={[styles.cta, selected.size === 0 && styles.ctaDisabled]}
          onPress={handleContinue}
          activeOpacity={0.85}
          disabled={selected.size === 0}
        >
          <Text style={styles.ctaText}>Select Seats({selected.size})</Text>
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
    backgroundColor: Colors.primary,
    paddingHorizontal: s(16),
    paddingVertical: vs(14),
  },
  backBtn: { width: s(32), height: s(32), alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: 'Inter-SemiBold', fontSize: fs(18), color: Colors.white },
  headerSub: { fontFamily: 'Inter-Regular', fontSize: fs(12), color: Colors.white, marginTop: vs(2) },

  content: { paddingHorizontal: s(24), paddingTop: vs(24), paddingBottom: vs(40), alignItems: 'center' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: s(24) },
  errorText: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(14),
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: fs(20),
  },
  retryBtn: {
    marginTop: vs(16),
    paddingHorizontal: s(24),
    paddingVertical: vs(10),
    borderRadius: s(8),
    backgroundColor: Colors.primary,
  },
  retryText: { fontFamily: 'Inter-SemiBold', fontSize: fs(14), color: Colors.white },

  driverTile: {
    width: s(67),
    height: s(67),
    borderRadius: s(20),
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: vs(6),
  },
  driverLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: fs(14),
    color: Colors.textPrimary,
    marginBottom: vs(24),
  },

  grid: { gap: s(16), alignItems: 'center' },
  row: { flexDirection: 'row', gap: s(17) },

  seatTile: {
    width: s(74),
    height: s(74),
    borderRadius: s(22),
    borderWidth: 1,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: vs(10),
    gap: s(4),
  },
  seatTileBooked: { opacity: 0.2 },
  seatNum: {
    fontFamily: 'Inter-Medium',
    fontSize: fs(16),
    lineHeight: fs(18),
  },

  legend: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    marginTop: vs(28),
    gap: s(23),
  },
  legendItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: s(8),
  },
  legendText: {
    fontFamily: 'Inter-Medium',
    fontSize: fs(12),
    color: Colors.textSecondary,
  },

  footer: {
    backgroundColor: Colors.white,
    padding: s(16),
    ...Shadow.top,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: vs(12),
    paddingHorizontal: s(4),
  },
  totalLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(16),
    color: Colors.textPrimary,
  },
  totalBreakdown: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(12),
    color: Colors.textSecondary,
    marginTop: vs(2),
  },
  totalValue: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(24),
    color: Colors.textPrimary,
  },
  cta: {
    backgroundColor: Colors.primary,
    borderRadius: s(8),
    height: vs(56),
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaDisabled: { opacity: 0.5 },
  ctaText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(16),
    color: Colors.white,
  },
});
