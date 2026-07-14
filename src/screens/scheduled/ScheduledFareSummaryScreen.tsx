import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Shadow, alpha } from '@/theme';
import { fs, s, vs } from '@/theme/responsive';
import type { ScheduledRoute } from './ScheduledRouteScreen';
import type { Passenger } from './ScheduledPassengerDetailsScreen';
import type { RouteVehicle } from '@/services/routeService';

interface Stop { id: string; name: string; time: string }

interface Props {
  navigation: any;
  route: {
    params: {
      route: ScheduledRoute;
      boarding: Stop;
      dropping: Stop;
      seats: number[];
      passengers: Passenger[];
      departureDate: string;
      departureIndex: number;
      driverId: string;
      vehicle: RouteVehicle;
      unitFare: number;
    };
  };
}

/**
 * Format the trip date as "Jan 18, 2026" — matches the Figma layout's
 * "6:00 AM   Jan 18, 2026" departure line. Falls back to the raw ISO
 * string if it's malformed.
 */
const formatDate = (iso: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  try {
    const d = new Date(`${iso}T00:00:00`);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
};

export const ScheduledFareSummaryScreen: React.FC<Props> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const {
    route: scheduledRoute,
    boarding,
    dropping,
    seats,
    passengers,
    departureDate,
    departureIndex,
    driverId,
    vehicle,
    unitFare,
  } = route.params;

  // Per-seat price: segment fare when configured, else flat seat price.
  const perSeat = unitFare || scheduledRoute.price;

  const returnAvailable =
    !!scheduledRoute.hasRoundTripDriver &&
    (scheduledRoute.returnDepartures?.length ?? 0) > 0;

  const [returnEnabled, setReturnEnabled] = useState(false);
  const [returnTime, setReturnTime] = useState<string | null>(
    returnAvailable ? scheduledRoute.returnDepartures![0].time : null,
  );

  const seatsList = seats.join(', ');
  const oneWayTotal = seats.length * perSeat;
  const total = returnEnabled ? oneWayTotal * 2 : oneWayTotal;
  const dateLabel = formatDate(departureDate);

  // Return departures filtered to those strictly after the forward time.
  // Keeps the picker honest: a return can't be scheduled before the rider
  // even leaves.
  const returnOptions = useMemo(() => {
    const all = scheduledRoute.returnDepartures ?? [];
    const forwardTime = boarding?.time;
    if (!forwardTime) return all;
    return all.filter((d) => d.time > forwardTime);
  }, [scheduledRoute.returnDepartures, boarding?.time]);

  const handleConfirm = () => {
    navigation.navigate('ScheduledPayment', {
      route: scheduledRoute,
      boarding,
      dropping,
      seats,
      passengers,
      total,
      departureDate,
      departureIndex,
      driverId,
      vehicle,
      returnDeparture:
        returnEnabled && returnTime ? { time: returnTime } : undefined,
    });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Fare Summary</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.subtitle}>Review your booking details</Text>

        <View style={styles.card}>
          {/* Route name — Poppins-SemiBold 24 at 0.8 opacity */}
          <Text style={styles.routeName} numberOfLines={2}>
            {scheduledRoute.name}
          </Text>

          {/* From → To with vertical connector */}
          <View style={styles.stopBlock}>
            <View style={styles.stopRow}>
              <View style={styles.stopIconWrap}>
                <Ionicons
                  name="navigate-circle-outline"
                  size={18}
                  color={Colors.primary}
                />
              </View>
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={styles.stopLabel}>From</Text>
                <Text style={styles.stopValue} numberOfLines={2}>{boarding.name}</Text>
              </View>
            </View>
            <View style={styles.stopConnector} />
            <View style={styles.stopRow}>
              <View style={styles.stopIconWrap}>
                <Ionicons name="location-outline" size={18} color="#9CA3AF" />
              </View>
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={styles.stopLabel}>To</Text>
                <Text style={styles.stopValue} numberOfLines={2}>{dropping.name}</Text>
              </View>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Departure */}
          <View style={styles.detailRow}>
            <Ionicons name="time-outline" size={16} color="#333" />
            <View style={{ marginLeft: 12 }}>
              <Text style={styles.detailLabel}>Departure</Text>
              <Text style={styles.detailValue}>
                {boarding.time}   {dateLabel}
              </Text>
            </View>
          </View>

          {/* Seats */}
          <View style={[styles.detailRow, { marginTop: 18 }]}>
            <Ionicons name="person-outline" size={16} color="#333" />
            <View style={{ marginLeft: 12 }}>
              <Text style={styles.detailLabel}>Seats</Text>
              <Text style={styles.detailValue}>
                {seatsList} ({seats.length} seat{seats.length === 1 ? '' : 's'})
              </Text>
            </View>
          </View>

          {/* Round-trip — only when the route supports it. Kept the
              existing UX since the Figma covers the base case but the
              feature itself is admin-configured per route. */}
          {returnAvailable && (
            <>
              <View style={styles.divider} />
              <View style={styles.returnCard}>
                <View style={styles.returnHeader}>
                  <Ionicons name="repeat" size={18} color={Colors.primary} />
                  <Text style={styles.returnTitle}>Round-trip available</Text>
                </View>
                <Text style={styles.returnHelp}>
                  Your driver also runs the return leg of this route.
                </Text>
                <TouchableOpacity
                  style={[styles.toggleRow, returnEnabled && styles.toggleRowOn]}
                  onPress={() => setReturnEnabled((v) => !v)}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[styles.toggleLabel, returnEnabled && styles.toggleLabelOn]}
                  >
                    {returnEnabled ? 'Return added' : 'Add return trip'}
                  </Text>
                  <View
                    style={[styles.toggleKnob, returnEnabled && styles.toggleKnobOn]}
                  />
                </TouchableOpacity>

                {returnEnabled && (
                  <View style={styles.returnPickerRow}>
                    <Text style={styles.returnPickerLabel}>Return at</Text>
                    <View style={styles.returnTimes}>
                      {returnOptions.map((d) => {
                        const selected = d.time === returnTime;
                        return (
                          <TouchableOpacity
                            key={d.time}
                            onPress={() => setReturnTime(d.time)}
                            style={[
                              styles.returnTimeChip,
                              selected && styles.returnTimeChipOn,
                            ]}
                            activeOpacity={0.8}
                          >
                            <Text
                              style={[
                                styles.returnTimeText,
                                selected && styles.returnTimeTextOn,
                              ]}
                            >
                              {d.time}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                      {returnOptions.length === 0 && (
                        <Text style={styles.returnPickerLabel}>
                          No return times left for today.
                        </Text>
                      )}
                    </View>
                  </View>
                )}
              </View>
            </>
          )}

          <View style={styles.divider} />

          {/* Fare Breakdown heading + per-leg rows */}
          <View style={styles.detailRow}>
            <Ionicons name="card-outline" size={16} color="#000000" style={{ opacity: 0.85 }} />
            <Text style={[styles.fareHeading, { marginLeft: 12 }]}>
              Fare Breakdown
            </Text>
          </View>

          <View style={styles.fareRow}>
            <Text style={styles.fareLabel}>
              Ticket Price ({seats.length} × ₹{perSeat})
            </Text>
            <Text style={styles.fareValue}>₹{oneWayTotal}</Text>
          </View>

          {returnEnabled && (
            <View style={styles.fareRow}>
              <Text style={styles.fareLabel}>
                Return leg ({seats.length} × ₹{perSeat})
              </Text>
              <Text style={styles.fareValue}>₹{oneWayTotal}</Text>
            </View>
          )}

          <View style={styles.divider} />

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total Amount</Text>
            <Text style={styles.totalValue}>₹{total}</Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.cta,
            returnEnabled && !returnTime && { opacity: 0.5 },
          ]}
          onPress={handleConfirm}
          disabled={returnEnabled && !returnTime}
          activeOpacity={0.85}
        >
          <Text style={styles.ctaText}>Confirm & Pay</Text>
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
  headerTitle: { fontFamily: 'Inter-SemiBold', fontSize: fs(18), color: Colors.white },

  content: { padding: s(16), paddingBottom: vs(120) },
  subtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(14),
    color: Colors.textSecondary,
    marginBottom: vs(16),
    paddingHorizontal: s(4),
  },

  card: {
    backgroundColor: Colors.white,
    borderRadius: s(16),
    paddingHorizontal: s(18),
    paddingVertical: vs(20),
    marginBottom: vs(16),
    ...Shadow.sm,
  },
  routeName: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(24),
    color: Colors.textPrimary,
    marginBottom: vs(16),
  },

  stopBlock: {
    marginLeft: s(4),
  },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stopIconWrap: {
    width: s(24),
    alignItems: 'center',
  },
  stopConnector: {
    width: 2,
    height: vs(16),
    backgroundColor: Colors.borderLight,
    marginLeft: s(11),
    marginVertical: vs(4),
  },
  stopLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(10),
    color: Colors.textSecondary,
  },
  stopValue: {
    fontFamily: 'Inter-Medium',
    fontSize: fs(14),
    color: Colors.textPrimary,
    marginTop: vs(2),
    flexShrink: 1,
  },

  divider: {
    height: 1,
    backgroundColor: Colors.borderLight,
    marginVertical: vs(18),
  },

  detailRow: { flexDirection: 'row', alignItems: 'flex-start' },
  detailLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(12),
    color: Colors.textPrimary,
  },
  detailValue: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(16),
    color: Colors.textPrimary,
    marginTop: vs(2),
  },

  fareHeading: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(16),
    color: Colors.textPrimary,
  },
  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: vs(14),
  },
  fareLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(12),
    color: Colors.textPrimary,
  },
  fareValue: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(12),
    color: Colors.textPrimary,
  },

  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(16),
    color: Colors.textPrimary,
  },
  totalValue: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(16),
    color: Colors.textPrimary,
  },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: s(16),
    paddingVertical: vs(18),
    backgroundColor: Colors.backgroundCard,
    ...Shadow.top,
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

  returnCard: {
    padding: s(14),
    backgroundColor: alpha(Colors.primary, 0.05),
    borderRadius: s(12),
    borderWidth: 1,
    borderColor: alpha(Colors.primary, 0.2),
  },
  returnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(6),
    marginBottom: vs(4),
  },
  returnTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(14),
    color: Colors.primary,
  },
  returnHelp: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(12),
    color: Colors.textSecondary,
    marginBottom: vs(10),
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.white,
    borderRadius: s(24),
    paddingHorizontal: s(14),
    paddingVertical: vs(10),
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  toggleRowOn: {
    borderColor: Colors.primary,
  },
  toggleLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: fs(14),
    color: Colors.textPrimary,
  },
  toggleLabelOn: { color: Colors.primary },
  toggleKnob: {
    width: s(24),
    height: s(24),
    borderRadius: s(12),
    backgroundColor: Colors.borderLight,
  },
  toggleKnobOn: { backgroundColor: Colors.primary },
  returnPickerRow: { marginTop: vs(10) },
  returnPickerLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(12),
    color: Colors.textSecondary,
    marginBottom: vs(6),
  },
  returnTimes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: s(8),
  },
  returnTimeChip: {
    paddingHorizontal: s(12),
    paddingVertical: vs(8),
    borderRadius: s(16),
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  returnTimeChipOn: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  returnTimeText: {
    fontFamily: 'Inter-Medium',
    fontSize: fs(13),
    color: Colors.textPrimary,
  },
  returnTimeTextOn: { color: Colors.white },
});
