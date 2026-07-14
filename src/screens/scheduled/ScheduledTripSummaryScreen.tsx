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
import { SafeQR } from '@/components/SafeQR';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Shadow, alpha } from '@/theme';
import { fs, s, vs } from '@/theme/responsive';
import { useAppSelector } from '@/store/hooks';
import { rideService, Ride } from '@/services/rideService';
import type { ScheduledRoute } from './ScheduledRouteScreen';
import type { Passenger } from './ScheduledPassengerDetailsScreen';

interface Stop { id: string; name: string; time: string }

interface Props {
  navigation: any;
  route: {
    // Full set of params arrives from the booking flow. The Activity tab's
    // "View Details" sends only `rideId`, so everything else is optional and
    // the screen fetches what it can.
    params: {
      route?: ScheduledRoute;
      boarding?: Stop;
      dropping?: Stop;
      seats?: number[];
      passengers?: Passenger[];
      total?: number;
      departureDate?: string;
      departureIndex?: number;
      returnDeparture?: { time: string };
      rideId?: string;
      /** Persisted booking id — the key the driver app validates the scan
       *  against. `sched_`-prefixed or raw. */
      bookingId?: string;
      /** Driver/vehicle the seats are on (per-vehicle validation). */
      driverId?: string;
    };
  };
}

// Accepts a YYYY-MM-DD (booking flow) or a full ISO timestamp (fetched ride).
const formatDate = (iso?: string): string => {
  const d = !iso
    ? new Date()
    : /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? new Date(`${iso}T00:00:00`)
    : new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

// Estimate seat-leg distance (km) from the rider's chosen boarding /
// dropping stop coords — we get these as just names on this screen, so
// we fall back to the whole-route distance carried on ScheduledRoute
// (Haversine total over all stops). Same cruise-speed assumption used
// in the duration calc, so distance ÷ speed = the same `durationMin`.
const SHUTTLE_KMH = 35;

const estimateRouteDistanceKm = (r: ScheduledRoute): number => {
  if (!r.durationMin || r.durationMin <= 0) return 0;
  return (r.durationMin / 60) * SHUTTLE_KMH;
};

export const ScheduledTripSummaryScreen: React.FC<Props> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const user = useAppSelector((s) => s.auth.user);
  const params = route.params ?? {};
  const scheduledRoute = params.route;
  // Booking-flow entry carries the full route object; Activity entry doesn't.
  const isBookingMode = !!scheduledRoute;

  const seats = params.seats ?? [];
  const passengers = params.passengers ?? [];
  const returnDeparture = params.returnDeparture;

  // Activity → "View Details" passes only a rideId. Fetch the ride so the
  // ticket can still show route / from-to / date / fare. No-op in booking mode.
  // A `sched_`-prefixed id is a projected ScheduledBooking, NOT a real Ride —
  // calling getRide('sched_…') would 500/404 (and is what made "View Details"
  // dead-end). Those entries already carry their data via params, so skip the
  // fetch entirely for them.
  const canFetchRide = !!params.rideId && !params.rideId.startsWith('sched_');

  const [ride, setRide] = useState<Ride | null>(null);
  const [loading, setLoading] = useState(!isBookingMode && canFetchRide);

  useEffect(() => {
    const id = params.rideId;
    if (isBookingMode || !canFetchRide || !id) return;
    let cancelled = false;
    rideService
      .getRide(id)
      .then((r) => {
        if (!cancelled) setRide(r);
      })
      .catch(() => {
        /* leave the ticket with whatever params we have */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isBookingMode, params.rideId]);

  // ── Resolve display values from booking params first, then the fetched ride ──
  const routeName =
    scheduledRoute?.name ??
    (ride
      ? `${(ride.pickup?.address ?? 'Pickup').split(',')[0]} → ${
          (ride.dropoff?.address ?? 'Drop-off').split(',')[0]
        }`
      : 'Scheduled Trip');
  const fromName = params.boarding?.name ?? ride?.pickup?.address ?? '—';
  const toName = params.dropping?.name ?? ride?.dropoff?.address ?? '—';

  const departureIso =
    params.departureDate ?? (ride as any)?.scheduledAt ?? ride?.createdAt;
  const dateLabel = formatDate(departureIso);
  const depTime =
    params.boarding?.time ??
    (departureIso
      ? new Date(departureIso).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        })
      : '—');

  const durationMin =
    scheduledRoute?.durationMin ??
    ride?.actualDuration ??
    ride?.estimatedDuration ??
    0;
  const distanceKm = scheduledRoute
    ? estimateRouteDistanceKm(scheduledRoute)
    : ride?.actualDistance ?? ride?.estimatedDistance ?? 0;

  const pricePerSeat = scheduledRoute?.price ?? 0;
  const total = params.total ?? ride?.actualFare ?? ride?.estimatedFare ?? 0;

  const statusLabel =
    ride?.status === 'completed'
      ? 'Completed trip'
      : ride?.status === 'cancelled'
      ? 'Cancelled'
      : 'Upcoming trip';
  const seatLabel = seats.length > 0 ? seats.map((s) => `Seat ${s}`).join(', ') : '—';

  // Ticket reference + QR. Prefer the server ride id (verifiable at boarding)
  // when present; otherwise derive a code from the trip date + seats.
  // Booking id the driver app validates the scan against. Comes through
  // directly, or is unpacked from the `sched_<id>` ride id used by the
  // Activity list.
  const bookingId =
    params.bookingId ??
    (params.rideId?.startsWith('sched_')
      ? params.rideId.slice('sched_'.length)
      : params.rideId);

  const customerName =
    [user?.firstName, user?.lastName].filter(Boolean).join(' ') || undefined;

  const ticketRef = bookingId
    ? bookingId.slice(-8).toUpperCase()
    : `UK${(params.departureDate ?? '').replace(/-/g, '').slice(2) || 'XXXXXX'}-${
        seats.map((s) => String(s).padStart(2, '0')).join('') || '00'
      }`;

  // QR payload the driver scans to validate the ride at boarding. Carries
  // who the rider is (userId + name) and the booking/trip identity so the
  // driver app can confirm a real, reserved seat on their vehicle.
  const qrData = JSON.stringify({
    t: 'scheduled', // ticket type
    ref: ticketRef,
    bookingId: bookingId ?? null,
    userId: user?._id ?? null,
    name: customerName ?? null,
    route: routeName,
    date: params.departureDate ?? departureIso ?? '',
    departureIndex: params.departureIndex ?? null,
    time: depTime,
    from: fromName,
    to: toName,
    driverId: params.driverId ?? null,
    seats,
    pax: passengers.map((p) => ({ seat: p.seat, name: p.name })),
    total,
  });

  // Drop the rider on the bottom-tab home screen (with the nav bar)
  // instead of popping the booking-flow stack — the booking persists
  // on the backend and the rider can revisit it from Activity later.
  const handleGoHome = () => {
    navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      <View style={styles.header}>
        <TouchableOpacity onPress={handleGoHome} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={s(24)} color={Colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trip Summary</Text>
        <View style={{ width: s(32) }} />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* This screen is shown for a *pending* scheduled booking (not a
            completed ride), so the copy here reflects "your trip will
            start at …" rather than "thanks for riding". Once the driver
            or admin completes the journey, the rider's Activity tab
            will show it as completed. */}
        <Text style={styles.heading}>
          {isBookingMode ? 'Booking confirmed' : 'Trip details'}
        </Text>
        <Text style={styles.subheading}>
          {isBookingMode
            ? `Your trip starts at ${depTime} on ${dateLabel}.`
            : `Departure ${depTime} • ${dateLabel}`}
        </Text>

        <View style={styles.ticket}>
          <View style={styles.statusPill}>
            <Ionicons name="time-outline" size={14} color={Colors.primary} />
            <Text style={styles.statusPillText}>{statusLabel}</Text>
          </View>

          <Text style={styles.routeName} numberOfLines={1}>
            {routeName}
          </Text>

          <View style={styles.divider} />

          <View style={styles.row}>
            <Ionicons name="calendar-outline" size={18} color={Colors.textPrimary} />
            <View style={styles.rowBody}>
              <Text style={styles.rowLabel}>Departure</Text>
              <Text style={styles.rowValue}>
                {depTime}   {dateLabel}
              </Text>
            </View>
          </View>

          <View style={[styles.row, { marginTop: 14 }]}>
            <Ionicons name="location-outline" size={18} color={Colors.primary} />
            <View style={styles.rowBody}>
              <Text style={styles.rowLabel}>From</Text>
              <Text style={styles.rowValue}>{fromName}</Text>
            </View>
          </View>
          <View style={styles.routeLine} />
          <View style={styles.row}>
            <Ionicons name="location-outline" size={18} color={Colors.textMuted} />
            <View style={styles.rowBody}>
              <Text style={styles.rowLabel}>To</Text>
              <Text style={styles.rowValue}>{toName}</Text>
            </View>
          </View>

          {seats.length > 0 && (
            <View style={[styles.row, { marginTop: 14 }]}>
              <Ionicons name="person-outline" size={18} color={Colors.textPrimary} />
              <View style={styles.rowBody}>
                <Text style={styles.rowLabel}>Seats</Text>
                <Text style={styles.rowValue}>
                  {seatLabel} ({seats.length} seat{seats.length === 1 ? '' : 's'})
                </Text>
              </View>
            </View>
          )}

          {durationMin > 0 && (
            <View style={[styles.row, { marginTop: 14 }]}>
              <Ionicons name="time-outline" size={18} color={Colors.textPrimary} />
              <View style={styles.rowBody}>
                <Text style={styles.rowLabel}>Duration • Distance</Text>
                <Text style={styles.rowValue}>
                  {durationMin} min
                  {distanceKm > 0 ? `  •  ${distanceKm.toFixed(1)} km` : ''}
                </Text>
              </View>
            </View>
          )}

          {/* Passengers — one row per booked seat, with the name (and contact
              if provided) captured during the booking flow. */}
          {passengers.length > 0 && (
            <>
              <View style={styles.divider} />
              <View style={styles.row}>
                <Ionicons name="people-outline" size={18} color={Colors.textPrimary} />
                <Text style={[styles.rowValue, { marginLeft: 8, fontSize: 16 }]}>
                  Passenger{passengers.length === 1 ? '' : 's'}
                </Text>
              </View>
              {passengers.map((p) => (
                <View key={p.seat} style={styles.paxRow}>
                  <View style={styles.paxSeatBadge}>
                    <Text style={styles.paxSeatText}>{p.seat}</Text>
                  </View>
                  <View style={styles.paxBody}>
                    <Text style={styles.paxName} numberOfLines={1}>
                      {p.name?.trim() || 'Passenger'}
                    </Text>
                    {!!p.contact?.trim() && (
                      <Text style={styles.paxContact} numberOfLines={1}>
                        {p.contact}
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </>
          )}

          {returnDeparture && (
            <View style={styles.returnLegBlock}>
              <View style={styles.returnLegHeader}>
                <Ionicons name="repeat" size={16} color={Colors.primary} />
                <Text style={styles.returnLegTitle}>Return leg</Text>
              </View>
              <Text style={styles.returnLegTime}>{returnDeparture.time}</Text>
            </View>
          )}

          <View style={styles.divider} />

          <View style={styles.row}>
            <Ionicons name="card-outline" size={18} color={Colors.textPrimary} />
            <Text style={[styles.rowValue, { marginLeft: 8, fontSize: 16 }]}>
              Fare Breakdown
            </Text>
          </View>

          {isBookingMode && pricePerSeat > 0 ? (
            <>
              <View style={styles.fareRow}>
                <Text style={styles.fareLabel}>
                  Ticket Price ({seats.length} × ₹{pricePerSeat})
                </Text>
                <Text style={styles.fareValue}>₹{seats.length * pricePerSeat}</Text>
              </View>

              {returnDeparture && (
                <View style={styles.fareRow}>
                  <Text style={styles.fareLabel}>
                    Return leg ({seats.length} × ₹{pricePerSeat})
                  </Text>
                  <Text style={styles.fareValue}>₹{seats.length * pricePerSeat}</Text>
                </View>
              )}
            </>
          ) : (
            <View style={styles.fareRow}>
              <Text style={styles.fareLabel}>Fare</Text>
              <Text style={styles.fareValue}>₹{total}</Text>
            </View>
          )}

          <View style={styles.divider} />

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total Paid</Text>
            <Text style={styles.totalValue}>₹{total}</Text>
          </View>

          {/* Boarding QR — scanned by the driver/conductor to verify the
              ticket. Encodes the trip essentials + a reference code. */}
          <View style={styles.divider} />
          <View style={styles.qrSection}>
            <View style={styles.qrCard}>
              <SafeQR value={qrData} size={150} />
            </View>
            <Text style={styles.qrRef}>{ticketRef}</Text>
            <Text style={styles.qrHint}>Show this QR code at boarding</Text>
          </View>

          {/* Decorative tear edge to keep the existing ticket look. */}
          <View style={styles.tearRow}>
            {Array.from({ length: 18 }).map((_, i) => (
              <View key={i} style={styles.tearDot} />
            ))}
          </View>
        </View>

        <View style={styles.tipBanner}>
          <Ionicons name="information-circle-outline" size={18} color={Colors.primary} />
          <Text style={styles.tipText}>
            We'll remind you 30 minutes before departure. You can revisit
            this booking any time from the Activity tab.
          </Text>
        </View>
      </ScrollView>
      )}

      <View style={styles.footer}>
        <TouchableOpacity style={styles.cta} onPress={handleGoHome} activeOpacity={0.85}>
          <Ionicons name="home-outline" size={18} color={Colors.white} />
          <Text style={styles.ctaText}>Go to Home</Text>
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
  headerTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(18),
    color: Colors.white,
    flex: 1,
    textAlign: 'center',
  },

  content: { padding: s(16), paddingBottom: vs(120) },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  heading: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(20),
    color: Colors.textPrimary,
    textAlign: 'center',
    marginTop: vs(6),
  },
  subheading: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(14),
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: vs(4),
    marginBottom: vs(22),
  },

  ticket: {
    backgroundColor: Colors.white,
    borderRadius: s(18),
    padding: s(22),
    borderWidth: 1,
    borderColor: Colors.borderLight,
    ...Shadow.sm,
  },
  statusPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(6),
    paddingHorizontal: s(10),
    paddingVertical: vs(6),
    backgroundColor: alpha(Colors.primary, 0.1),
    borderRadius: 999,
  },
  statusPillText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(12),
    color: Colors.primary,
  },
  routeName: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(22),
    color: Colors.textPrimary,
    marginTop: vs(12),
  },

  divider: {
    height: 1,
    backgroundColor: Colors.borderLight,
    marginVertical: vs(14),
  },

  row: { flexDirection: 'row', alignItems: 'flex-start' },
  rowBody: { marginLeft: s(8), flex: 1 },
  rowLabel: { fontFamily: 'Inter-Regular', fontSize: fs(12), color: Colors.textMuted },
  rowValue: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(15),
    color: Colors.textPrimary,
    marginTop: vs(2),
  },
  routeLine: {
    width: 1.5,
    height: vs(14),
    backgroundColor: Colors.border,
    marginLeft: s(8),
    marginVertical: vs(4),
  },

  // Passengers
  paxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: vs(12),
  },
  paxSeatBadge: {
    width: s(34),
    height: s(34),
    borderRadius: s(8),
    backgroundColor: alpha(Colors.primary, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },
  paxSeatText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(13),
    color: Colors.primary,
  },
  paxBody: { marginLeft: s(12), flex: 1 },
  paxName: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(15),
    color: Colors.textPrimary,
  },
  paxContact: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(12),
    color: Colors.textMuted,
    marginTop: 1,
  },

  // QR
  qrSection: { alignItems: 'center', marginTop: vs(4) },
  qrCard: {
    padding: s(12),
    backgroundColor: Colors.white,
    borderRadius: s(12),
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  qrRef: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(14),
    letterSpacing: 1,
    color: Colors.textPrimary,
    marginTop: vs(12),
  },
  qrHint: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(12),
    color: Colors.textMuted,
    marginTop: vs(2),
  },

  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: vs(8),
  },
  fareLabel: { fontFamily: 'Inter-Regular', fontSize: fs(13), color: Colors.textSecondary },
  fareValue: { fontFamily: 'Inter-SemiBold', fontSize: fs(13), color: Colors.textPrimary },

  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: { fontFamily: 'Inter-SemiBold', fontSize: fs(16), color: Colors.textPrimary },
  totalValue: { fontFamily: 'Inter-SemiBold', fontSize: fs(18), color: Colors.textPrimary },

  tearRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: vs(14),
    marginHorizontal: -s(22),
    paddingHorizontal: s(8),
  },
  tearDot: {
    width: s(10),
    height: s(10),
    borderRadius: s(5),
    backgroundColor: Colors.backgroundCard,
    marginBottom: -s(5),
  },

  tipBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: s(8),
    backgroundColor: alpha(Colors.primary, 0.06),
    borderRadius: s(12),
    paddingVertical: vs(12),
    paddingHorizontal: s(14),
    marginTop: vs(18),
  },
  tipText: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: fs(12),
    lineHeight: fs(18),
    color: Colors.textSecondary,
  },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: s(16),
    backgroundColor: Colors.white,
    ...Shadow.top,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: s(8),
    backgroundColor: Colors.primary,
    borderRadius: s(8),
    height: vs(56),
  },
  ctaText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(16),
    color: Colors.white,
  },

  returnLegBlock: {
    marginTop: vs(12),
    paddingTop: vs(12),
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  returnLegHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(6),
    marginBottom: vs(4),
  },
  returnLegTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(14),
    color: Colors.primary,
  },
  returnLegTime: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(18),
    color: Colors.textPrimary,
  },
});
