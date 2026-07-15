import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  Linking,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Shadow, alpha } from '@/theme';
import { fs, s, vs } from '@/theme/responsive';
import { routeService, type BookingStatus } from '@/services/routeService';
import { setSocketListeners } from '@/services/socketService';

interface Props {
  navigation: any;
  route: {
    params: {
      // Rich params (from booking-confirmed / activity) used for the ticket +
      // sub-screens. `bookingId` is the only hard requirement.
      bookingId: string;
      routeId?: string;
      route?: any;
      boarding?: any;
      dropping?: any;
      seats?: number[];
      passengers?: any[];
      total?: number;
      departureDate?: string;
      departureIndex?: number;
      driverId?: string;
    };
  };
}

type Stage =
  | 'loading'
  | 'confirmed'
  | 'departing'
  | 'arriving'
  | 'arrived'
  | 'boarded'
  | 'dropped'
  | 'completed'
  | 'cancelled';

const STEPS: { key: Stage; label: string }[] = [
  { key: 'confirmed', label: 'Booked' },
  { key: 'departing', label: 'Departing' },
  { key: 'arrived', label: 'Boarding' },
  { key: 'boarded', label: 'On Board' },
  { key: 'completed', label: 'Done' },
];
const STEP_INDEX: Record<string, number> = {
  confirmed: 0, departing: 1, arriving: 1, arrived: 2, boarded: 3, dropped: 4, completed: 4, cancelled: 0,
};

const computeStage = (st: BookingStatus): Stage => {
  if (st.status === 'cancelled') return 'cancelled';
  if (st.status === 'completed') return 'completed';
  if (st.earlyDrop?.status === 'approved') return 'dropped';
  if (st.boarded) return 'boarded';
  if (st.journeyActive && st.atBoarding) return 'arrived';
  if (st.journeyActive) return 'arriving';
  if (st.minutesToDeparture != null && st.minutesToDeparture <= 60) return 'departing';
  return 'confirmed';
};

const fmtCountdown = (mins: number | null): string => {
  if (mins == null) return '';
  if (mins <= 0) return 'now';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
};

/**
 * The rider's live "My Scheduled Trip" hub. One screen that walks the whole
 * onboarding journey from the Figma flow — Departing → Bus Arriving → Bus
 * Arrived → Show Ticket → Boarded → Track Live Ride — by reading the trip's
 * real state (countdown to departure, driver journey status, live GPS proximity
 * to the boarding stop, and boarding check-in). Polls + listens for the
 * `scheduled:boarded` push so it advances the moment the driver scans the ticket.
 */
export const ScheduledTripHubScreen: React.FC<Props> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const p = route.params;
  const bookingId = String(p.bookingId).replace(/^sched_/, '');

  const [status, setStatus] = useState<BookingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const st = await routeService.getBookingStatus(bookingId);
      setStatus(st);
    } catch {
      /* keep last state */
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useFocusEffect(
    useCallback(() => {
      load();
      pollRef.current = setInterval(load, 15000);
      setSocketListeners({
        onScheduledBoarded: (payload) => {
          if (payload.bookingId === bookingId) load();
        },
        onEarlyDropApproved: (payload) => {
          if (payload.bookingId === bookingId) load();
        },
      });
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
      };
    }, [load, bookingId]),
  );

  const stage: Stage = useMemo(() => (status ? computeStage(status) : 'loading'), [status]);

  const call = (phone?: string | null) => {
    if (!phone) return Alert.alert('Number unavailable');
    Linking.openURL(`tel:${phone}`).catch(() => {});
  };

  const openTicket = () =>
    navigation.navigate('ScheduledTripSummary', {
      route: p.route ?? { id: status?.routeId, name: status?.routeName },
      boarding: p.boarding ?? { name: status?.boardingName, time: status?.departureTime },
      dropping: p.dropping ?? { name: status?.droppingName, time: status?.departureTime },
      seats: p.seats ?? status?.seats ?? [],
      passengers: p.passengers ?? [],
      total: p.total ?? 0,
      departureDate: p.departureDate ?? status?.departureDate,
      departureIndex: p.departureIndex,
      bookingId,
      driverId: p.driverId ?? status?.driver?.id,
    });

  const openTrackVehicle = () =>
    navigation.navigate('ScheduledTrack', { routeId: status?.routeId ?? p.routeId });

  const openSummary = () => {
    const st = status;
    const earlyDropped = st?.earlyDrop?.status === 'approved';
    navigation.navigate('ScheduledEarlyDropSummary', {
      bookingId,
      routeId: st?.routeId ?? p.routeId,
      routeName: st?.routeName ?? undefined,
      fromName: st?.boardingName ?? undefined,
      toName: st?.droppingName ?? undefined,
      seats: st?.seats ?? p.seats ?? [],
      passengers: p.passengers ?? [],
      departureDate: st?.departureDate ?? p.departureDate,
      departureIndex: p.departureIndex,
      driverId: st?.driver?.id ?? p.driverId,
      dateLabel: `${st?.departureDate ?? ''} ${st?.departureTime ?? ''}`.trim() || undefined,
      completed: !earlyDropped,
      ...(earlyDropped
        ? {
            originalFare: st?.earlyDrop?.originalFare ?? 0,
            partialFare: st?.earlyDrop?.partialFare ?? 0,
            refund: st?.earlyDrop?.refund ?? 0,
          }
        : { fare: p.total ?? 0 }),
    });
  };

  const openLiveRide = () => {
    const st = status;
    navigation.navigate('ScheduledLiveTrack', {
      ride: {
        _id: `sched_${bookingId}`,
        pickup: { address: st?.boardingName ?? '' },
        dropoff: { address: st?.droppingName ?? '' },
        driver: st?.driver
          ? { _id: st.driver.id, firstName: st.driver.name, driverProfile: { rating: st.driver.rating } }
          : null,
        booking: {
          id: bookingId,
          route: st?.routeId ?? p.routeId,
          routeName: st?.routeName,
          driver: st?.driver?.id,
          driverName: st?.driver?.name,
          driverPhone: st?.driver?.phone,
          driverRating: st?.driver?.rating,
          vehicle: st?.driver?.vehicle,
          seats: st?.seats ?? [],
          departureTime: st?.departureTime,
          earlyDrop: st?.earlyDrop,
        },
      },
    });
  };

  const cancelBooking = () => {
    Alert.alert('Cancel Ride', 'Cancel this scheduled ride?', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel Ride',
        style: 'destructive',
        onPress: async () => {
          try {
            await routeService.cancelBooking(bookingId);
            navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
          } catch {
            Alert.alert('Error', 'Failed to cancel. Please try again.');
          }
        },
      },
    ]);
  };

  const seatLabel = (status?.seats ?? p.seats ?? []).map((n) => `Seat ${n}`).join(', ') || '—';
  const driverName = status?.driver?.name ?? 'Your driver';
  const plate = status?.driver?.vehicle?.plateNumber ?? '';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.reset({ index: 0, routes: [{ name: 'MainTabs', params: { screen: 'Activity' } }] })}
          style={styles.iconBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={s(24)} color={Colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Scheduled Trip</Text>
        <View style={styles.iconBtn} />
      </View>

      {loading && !status ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + vs(28) }]}>
          {/* Progress stepper */}
          {stage !== 'cancelled' && (
            <View style={styles.stepper}>
              {STEPS.map((step, i) => {
                const cur = STEP_INDEX[stage] ?? 0;
                const done = i < cur;
                const active = i === cur;
                return (
                  <React.Fragment key={step.key}>
                    <View style={styles.stepItem}>
                      <View
                        style={[
                          styles.stepDot,
                          done && styles.stepDotDone,
                          active && styles.stepDotActive,
                        ]}
                      >
                        {done ? (
                          <Ionicons name="checkmark" size={s(12)} color={Colors.white} />
                        ) : (
                          <Text style={[styles.stepNum, active && { color: Colors.white }]}>{i + 1}</Text>
                        )}
                      </View>
                      <Text style={[styles.stepLabel, (done || active) && styles.stepLabelOn]} numberOfLines={1}>
                        {step.label}
                      </Text>
                    </View>
                    {i < STEPS.length - 1 && <View style={[styles.stepBar, done && styles.stepBarDone]} />}
                  </React.Fragment>
                );
              })}
            </View>
          )}

          {stage === 'cancelled' && (
            <StageCard icon="close-circle" tint={Colors.error} title="Booking Cancelled"
              subtitle="This scheduled ride was cancelled." />
          )}

          {stage === 'completed' && (
            <>
              <StageCard icon="checkmark-done-circle" tint={Colors.success} title="Trip Completed"
                subtitle={`Thanks for riding with UKCAAR${status?.droppingName ? ` to ${status.droppingName}` : ''}.`} />
              <PrimaryBtn label="View Trip Summary" icon="receipt-outline" onPress={openSummary} />
              <OutlineBtn label="View Ticket" icon="qr-code-outline" onPress={openTicket} />
            </>
          )}

          {stage === 'dropped' && (
            <>
              <StageCard icon="exit" tint="#EA580C" title="Early Drop Complete"
                subtitle="You were dropped off before your booked stop. Any refund is on its way." />
              <PrimaryBtn label="View Trip Summary" icon="receipt-outline" onPress={openSummary} />
              <OutlineBtn label="View Ticket" icon="qr-code-outline" onPress={openTicket} />
            </>
          )}

          {stage === 'confirmed' && (
            <>
              <StageCard icon="checkmark-circle" tint={Colors.primary} title="Booking Confirmed"
                subtitle={
                  status?.minutesToDeparture != null
                    ? `Departs in ${fmtCountdown(status.minutesToDeparture)}`
                    : 'Your seat is reserved.'
                } />
              <DetailsCard status={status} p={p} seatLabel={seatLabel} />
              <View style={styles.reminder}>
                <Text style={styles.reminderText}>💡 We'll remind you before departure. Live tracking opens closer to departure.</Text>
              </View>
              <OutlineBtn label="Show Ticket / QR" icon="qr-code-outline" onPress={openTicket} />
              <TextBtn label="Cancel Ride" tint={Colors.error} onPress={cancelBooking} />
            </>
          )}

          {stage === 'departing' && (
            <>
              <View style={[styles.banner, { backgroundColor: alpha(Colors.primary, 0.1) }]}>
                <Ionicons name="time" size={s(20)} color={Colors.primary} />
                <Text style={styles.bannerText}>Your Caar departs in {fmtCountdown(status?.minutesToDeparture ?? null)}!</Text>
              </View>
              <View style={styles.boardingCard}>
                <Text style={styles.boardingLabel}>Boarding Point</Text>
                <View style={styles.boardingRow}>
                  <Ionicons name="location" size={s(22)} color={Colors.error} />
                  <Text style={styles.boardingName}>{status?.boardingName ?? '—'}</Text>
                </View>
                <View style={styles.boardingSub}>
                  <Ionicons name="bus" size={s(16)} color={Colors.primary} />
                  <Text style={styles.boardingSubText} numberOfLines={2}>
                    {status?.boardingName} → {status?.droppingName}
                  </Text>
                </View>
                <View style={styles.boardingSub}>
                  <Ionicons name="time-outline" size={s(16)} color={Colors.textSecondary} />
                  <Text style={styles.boardingSubText}>Departure: {status?.departureTime}</Text>
                </View>
              </View>
              <PrimaryBtn label="Track Vehicle" icon="navigate" onPress={openTrackVehicle} />
              <OutlineBtn label="Show Ticket / QR Code" icon="qr-code-outline" onPress={openTicket} />
            </>
          )}

          {stage === 'arriving' && (
            <>
              <View style={[styles.banner, { backgroundColor: alpha(Colors.primary, 0.12) }]}>
                <Ionicons name="bus" size={s(20)} color={Colors.primary} />
                <Text style={styles.bannerText}>Your bus is on the way</Text>
              </View>
              <DriverCard status={status} badge="En Route" />
              <PrimaryBtn label="Track Vehicle" icon="navigate" onPress={openTrackVehicle} />
              <OutlineBtn label="Show My Ticket for Scan" icon="qr-code-outline" onPress={openTicket} />
              {!!status?.driver?.phone && (
                <TextBtn label="Call Driver" tint={Colors.primary} onPress={() => call(status?.driver?.phone)} />
              )}
            </>
          )}

          {stage === 'arrived' && (
            <>
              <StageCard icon="bus" tint={Colors.success} title="Your Bus Has Arrived!"
                subtitle={`${driverName}${plate ? ` · ${plate}` : ''} is at ${status?.boardingName ?? 'your stop'}.`} />
              <View style={styles.stepsCard}>
                <Text style={styles.stepsTitle}>Next Steps</Text>
                <NextStep n={1} text="Open your ticket and show the QR code" />
                <NextStep n={2} text="Wait for the driver to scan it" />
                <NextStep n={3} text={`Board and take ${seatLabel}`} />
              </View>
              <View style={styles.safety}>
                <Ionicons name="shield-checkmark" size={s(16)} color={Colors.primary} />
                <Text style={styles.safetyText}>Keep your ticket ready — the driver verifies every rider before departure.</Text>
              </View>
              <PrimaryBtn label="Show My Ticket for Scan" icon="qr-code" onPress={openTicket} />
            </>
          )}

          {stage === 'boarded' && (
            <>
              <StageCard icon="checkmark-circle" tint={Colors.success} title="You've Boarded Successfully!"
                subtitle={`Your journey${status?.boardingName ? ` from ${status.boardingName}` : ''}${status?.droppingName ? ` to ${status.droppingName}` : ''} has begun.`} />
              <View style={styles.boardedCard}>
                <BoardedRow label="Your Seat" value={seatLabel} />
                {!!plate && <BoardedRow label="Vehicle Number" value={plate} />}
                <BoardedRow label="Driver" value={driverName} />
              </View>
              <PrimaryBtn label="Track Live Ride" icon="navigate" onPress={openLiveRide} />
              {!!status?.driver?.phone && (
                <OutlineBtn label="Call Driver" icon="call-outline" onPress={() => call(status?.driver?.phone)} />
              )}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
};

// ── Small presentational helpers ──
const StageCard: React.FC<{ icon: string; tint: string; title: string; subtitle: string }> = ({ icon, tint, title, subtitle }) => (
  <View style={styles.stageCard}>
    <View style={[styles.stageIcon, { backgroundColor: alpha(tint, 0.14) }]}>
      <Ionicons name={icon as any} size={s(34)} color={tint} />
    </View>
    <Text style={styles.stageTitle}>{title}</Text>
    <Text style={styles.stageSub}>{subtitle}</Text>
  </View>
);

const DetailsCard: React.FC<{ status: BookingStatus | null; p: any; seatLabel: string }> = ({ status, p, seatLabel }) => (
  <View style={styles.detailsCard}>
    <DRow label="Route" value={`${status?.boardingName ?? p.boarding?.name ?? '—'} → ${status?.droppingName ?? p.dropping?.name ?? '—'}`} />
    <DRow label="Date & Time" value={`${status?.departureDate ?? ''}  ${status?.departureTime ?? ''}`.trim() || '—'} />
    <DRow label="Seat" value={seatLabel} />
  </View>
);

const DriverCard: React.FC<{ status: BookingStatus | null; badge: string }> = ({ status, badge }) => (
  <View style={styles.driverCard}>
    <View style={styles.driverHead}>
      <Text style={styles.driverCardTitle}>Driver Details</Text>
      <View style={styles.enroute}><Text style={styles.enrouteText}>{badge}</Text></View>
    </View>
    <View style={styles.driverRow}>
      <View style={styles.driverAvatar}>
        <Ionicons name="person" size={s(22)} color={Colors.white} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.driverName}>{status?.driver?.name ?? 'Driver'}</Text>
        <Text style={styles.driverMeta}>
          {status?.driver?.rating ? `★ ${Number(status.driver.rating).toFixed(1)}` : ''}
          {status?.driver?.vehicle?.plateNumber ? `  ·  ${status.driver.vehicle.plateNumber}` : ''}
        </Text>
      </View>
    </View>
  </View>
);

const NextStep: React.FC<{ n: number; text: string }> = ({ n, text }) => (
  <View style={styles.nextStep}>
    <View style={styles.nextNum}><Text style={styles.nextNumText}>{n}</Text></View>
    <Text style={styles.nextText}>{text}</Text>
  </View>
);

const BoardedRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.boardedRow}>
    <Text style={styles.boardedLabel}>{label}</Text>
    <Text style={styles.boardedValue}>{value}</Text>
  </View>
);

const DRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.dRow}>
    <Text style={styles.dLabel}>{label}</Text>
    <Text style={styles.dValue} numberOfLines={1}>{value}</Text>
  </View>
);

const PrimaryBtn: React.FC<{ label: string; icon?: string; onPress: () => void }> = ({ label, icon, onPress }) => (
  <TouchableOpacity style={styles.primaryBtn} activeOpacity={0.85} onPress={onPress}>
    {icon && <Ionicons name={icon as any} size={s(18)} color={Colors.white} />}
    <Text style={styles.primaryBtnText}>{label}</Text>
  </TouchableOpacity>
);

const OutlineBtn: React.FC<{ label: string; icon?: string; onPress: () => void }> = ({ label, icon, onPress }) => (
  <TouchableOpacity style={styles.outlineBtn} activeOpacity={0.85} onPress={onPress}>
    {icon && <Ionicons name={icon as any} size={s(18)} color={Colors.primary} />}
    <Text style={styles.outlineBtnText}>{label}</Text>
  </TouchableOpacity>
);

const TextBtn: React.FC<{ label: string; tint: string; onPress: () => void }> = ({ label, tint, onPress }) => (
  <TouchableOpacity style={styles.textBtn} onPress={onPress}>
    <Text style={[styles.textBtnText, { color: tint }]}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundCard },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.primary,
    paddingHorizontal: s(8),
    paddingVertical: vs(12),
  },
  iconBtn: { width: s(40), height: s(40), alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: 'Inter-SemiBold', fontSize: fs(18), color: Colors.white },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: s(16) },

  // Stepper
  stepper: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: vs(20), paddingHorizontal: s(4) },
  stepItem: { alignItems: 'center', width: s(56) },
  stepDot: {
    width: s(26), height: s(26), borderRadius: s(13),
    backgroundColor: Colors.borderLight, alignItems: 'center', justifyContent: 'center',
  },
  stepDotDone: { backgroundColor: Colors.success },
  stepDotActive: { backgroundColor: Colors.primary },
  stepNum: { fontFamily: 'Inter-SemiBold', fontSize: fs(12), color: Colors.textSecondary },
  stepLabel: { fontFamily: 'Inter-Regular', fontSize: fs(10), color: Colors.textMuted, marginTop: vs(4) },
  stepLabelOn: { color: Colors.textPrimary, fontFamily: 'Inter-SemiBold' },
  stepBar: { flex: 1, height: 2, backgroundColor: Colors.borderLight, marginTop: s(13) },
  stepBarDone: { backgroundColor: Colors.success },

  stageCard: { alignItems: 'center', marginVertical: vs(8) },
  stageIcon: { width: s(74), height: s(74), borderRadius: s(37), alignItems: 'center', justifyContent: 'center', marginBottom: vs(12) },
  stageTitle: { fontFamily: 'Inter-Bold', fontSize: fs(22), color: Colors.textPrimary, textAlign: 'center' },
  stageSub: { fontFamily: 'Inter-Regular', fontSize: fs(14), color: Colors.textSecondary, textAlign: 'center', marginTop: vs(6), lineHeight: fs(20), paddingHorizontal: s(10) },

  banner: { flexDirection: 'row', alignItems: 'center', gap: s(10), borderRadius: s(14), padding: s(14), marginBottom: vs(14) },
  bannerText: { fontFamily: 'Inter-SemiBold', fontSize: fs(16), color: Colors.primary, flex: 1 },

  detailsCard: { backgroundColor: Colors.white, borderRadius: s(14), padding: s(16), marginTop: vs(14), ...Shadow.sm },
  dRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: vs(7), gap: s(10) },
  dLabel: { fontFamily: 'Inter-Regular', fontSize: fs(13), color: Colors.textSecondary },
  dValue: { fontFamily: 'Inter-SemiBold', fontSize: fs(14), color: Colors.textPrimary, flex: 1, textAlign: 'right' },

  boardingCard: { backgroundColor: Colors.white, borderRadius: s(14), padding: s(16), ...Shadow.sm },
  boardingLabel: { fontFamily: 'Inter-Bold', fontSize: fs(16), color: Colors.textPrimary, marginBottom: vs(10) },
  boardingRow: { flexDirection: 'row', alignItems: 'center', gap: s(8), marginBottom: vs(10) },
  boardingName: { fontFamily: 'Inter-SemiBold', fontSize: fs(16), color: Colors.textPrimary, flex: 1 },
  boardingSub: { flexDirection: 'row', alignItems: 'center', gap: s(8), marginTop: vs(4) },
  boardingSubText: { fontFamily: 'Inter-Regular', fontSize: fs(13), color: Colors.textSecondary, flex: 1 },

  driverCard: { backgroundColor: Colors.white, borderRadius: s(14), padding: s(16), marginBottom: vs(4), ...Shadow.sm },
  driverHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: vs(12) },
  driverCardTitle: { fontFamily: 'Inter-Bold', fontSize: fs(16), color: Colors.textPrimary },
  enroute: { backgroundColor: alpha(Colors.primary, 0.12), paddingHorizontal: s(10), paddingVertical: vs(4), borderRadius: s(999) },
  enrouteText: { fontFamily: 'Inter-SemiBold', fontSize: fs(12), color: Colors.primary },
  driverRow: { flexDirection: 'row', alignItems: 'center', gap: s(12) },
  driverAvatar: { width: s(46), height: s(46), borderRadius: s(23), backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  driverName: { fontFamily: 'Inter-SemiBold', fontSize: fs(16), color: Colors.textPrimary },
  driverMeta: { fontFamily: 'Inter-Regular', fontSize: fs(13), color: Colors.textSecondary, marginTop: vs(2) },

  stepsCard: { backgroundColor: Colors.white, borderRadius: s(14), padding: s(16), marginTop: vs(14), ...Shadow.sm },
  stepsTitle: { fontFamily: 'Inter-Bold', fontSize: fs(16), color: Colors.textPrimary, marginBottom: vs(10) },
  nextStep: { flexDirection: 'row', alignItems: 'center', gap: s(12), paddingVertical: vs(7) },
  nextNum: { width: s(24), height: s(24), borderRadius: s(12), backgroundColor: alpha(Colors.primary, 0.12), alignItems: 'center', justifyContent: 'center' },
  nextNumText: { fontFamily: 'Inter-Bold', fontSize: fs(12), color: Colors.primary },
  nextText: { fontFamily: 'Inter-Regular', fontSize: fs(14), color: Colors.textPrimary, flex: 1 },

  safety: { flexDirection: 'row', alignItems: 'center', gap: s(8), backgroundColor: alpha(Colors.primary, 0.06), borderRadius: s(12), padding: s(12), marginTop: vs(12) },
  safetyText: { fontFamily: 'Inter-Regular', fontSize: fs(12), color: Colors.primary, flex: 1 },

  boardedCard: { backgroundColor: Colors.white, borderRadius: s(14), padding: s(6), marginTop: vs(14), ...Shadow.sm },
  boardedRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: alpha(Colors.textMuted, 0.05), borderRadius: s(10), padding: s(12), margin: s(4) },
  boardedLabel: { fontFamily: 'Inter-Regular', fontSize: fs(13), color: Colors.textSecondary },
  boardedValue: { fontFamily: 'Inter-SemiBold', fontSize: fs(14), color: Colors.textPrimary },

  reminder: { backgroundColor: alpha(Colors.primary, 0.08), borderRadius: s(14), padding: s(14), marginTop: vs(14) },
  reminderText: { fontFamily: 'Inter-Regular', fontSize: fs(13), color: Colors.primary, textAlign: 'center' },

  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: s(8), height: vs(54), borderRadius: s(14), backgroundColor: Colors.primary, marginTop: vs(16) },
  primaryBtnText: { fontFamily: 'Inter-SemiBold', fontSize: fs(16), color: Colors.white },
  outlineBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: s(8), height: vs(52), borderRadius: s(14), borderWidth: 1.5, borderColor: Colors.primary, marginTop: vs(12) },
  outlineBtnText: { fontFamily: 'Inter-SemiBold', fontSize: fs(15), color: Colors.primary },
  textBtn: { height: vs(46), alignItems: 'center', justifyContent: 'center', marginTop: vs(8) },
  textBtnText: { fontFamily: 'Inter-SemiBold', fontSize: fs(14) },
});

export default ScheduledTripHubScreen;
