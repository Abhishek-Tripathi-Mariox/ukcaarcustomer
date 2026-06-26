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
import { Colors } from '@/theme';
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
          <Text style={styles.routeName} numberOfLines={1}>
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
              <View style={{ marginLeft: 12 }}>
                <Text style={styles.stopLabel}>From</Text>
                <Text style={styles.stopValue}>{boarding.name}</Text>
              </View>
            </View>
            <View style={styles.stopConnector} />
            <View style={styles.stopRow}>
              <View style={styles.stopIconWrap}>
                <Ionicons name="location-outline" size={18} color="#9CA3AF" />
              </View>
              <View style={{ marginLeft: 12 }}>
                <Text style={styles.stopLabel}>To</Text>
                <Text style={styles.stopValue}>{dropping.name}</Text>
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
  container: { flex: 1, backgroundColor: Colors.white },
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
    fontFamily: 'Poppins-SemiBold',
    fontSize: 16,
    color: Colors.white,
    flex: 1,
    textAlign: 'center',
  },

  content: { padding: 16, paddingBottom: 140 },

  subtitle: {
    fontFamily: 'Poppins-Regular',
    fontSize: 16,
    color: '#333',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 22,
  },

  // Card — Figma node 73:1854. 24px radius, generous shadow, lots of
  // internal vertical space.
  card: {
    backgroundColor: Colors.white,
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingVertical: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  routeName: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 24,
    lineHeight: 30,
    color: '#000000',
    opacity: 0.85,
    marginBottom: 18,
  },

  // From/To with vertical connector — same shape as the route-card
  // stop list on the Select Route screen.
  stopBlock: {},
  stopRow: { flexDirection: 'row', alignItems: 'center' },
  stopIconWrap: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopConnector: {
    width: 1.5,
    height: 18,
    backgroundColor: '#D1D5DB',
    marginLeft: 8.25,
    marginVertical: 6,
  },
  stopLabel: {
    fontFamily: 'Poppins-Light',
    fontSize: 10,
    color: '#000000',
    opacity: 0.8,
  },
  stopValue: {
    fontFamily: 'Poppins-Medium',
    fontSize: 14,
    color: '#000000',
    opacity: 0.85,
    marginTop: 2,
  },

  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 18,
  },

  // Departure / Seats rows — small Poppins-Regular caption above a
  // Poppins-SemiBold 16 value.
  detailRow: { flexDirection: 'row', alignItems: 'flex-start' },
  detailLabel: {
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    color: '#333',
  },
  detailValue: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 16,
    color: '#000000',
    opacity: 0.85,
    marginTop: 2,
  },

  fareHeading: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 16,
    color: '#000000',
    opacity: 0.85,
  },
  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
  },
  fareLabel: {
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    color: '#333',
  },
  fareValue: {
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    color: '#333',
  },

  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 16,
    color: '#000000',
    opacity: 0.85,
  },
  totalValue: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 16,
    color: '#000000',
    opacity: 0.85,
  },

  // Footer — white card with top-only shadow, full-width teal CTA.
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingVertical: 18,
    backgroundColor: Colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 8,
  },
  cta: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    fontFamily: 'Inter-Bold',
    fontSize: 14,
    lineHeight: 24,
    letterSpacing: -0.3,
    color: Colors.white,
  },

  returnCard: {
    padding: 14,
    backgroundColor: 'rgba(0,151,179,0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,151,179,0.2)',
  },
  returnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  returnTitle: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 14,
    color: Colors.primary,
  },
  returnHelp: {
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    color: '#6A7282',
    marginBottom: 10,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.white,
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  toggleRowOn: {
    borderColor: Colors.primary,
  },
  toggleLabel: {
    fontFamily: 'Poppins-Medium',
    fontSize: 14,
    color: '#111827',
  },
  toggleLabelOn: { color: Colors.primary },
  toggleKnob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#E5E7EB',
  },
  toggleKnobOn: { backgroundColor: Colors.primary },
  returnPickerRow: { marginTop: 10 },
  returnPickerLabel: {
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    color: '#6A7282',
    marginBottom: 6,
  },
  returnTimes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  returnTimeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  returnTimeChipOn: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  returnTimeText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 13,
    color: '#111827',
  },
  returnTimeTextOn: { color: Colors.white },
});
