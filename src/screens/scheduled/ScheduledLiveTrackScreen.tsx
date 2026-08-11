import React, { useEffect, useMemo, useRef, useState } from 'react';
import { driverRatingText } from '@/utils/driverRating';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Platform,
  ActivityIndicator,
  Modal,
  ScrollView,
  Linking,
  Alert,
} from 'react-native';
import MapView, {
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
  Region,
} from 'react-native-maps';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Shadow, alpha } from '@/theme';
import { fs, s, vs } from '@/theme/responsive';
import { CabIcon } from '@/components/icons/HomeIcons';
import {
  joinRouteRoom,
  leaveRouteRoom,
  setSocketListeners,
} from '@/services/socketService';
import { routeService, type ScheduledRouteApi } from '@/services/routeService';
import { rideService } from '@/services/rideService';

interface LatLng {
  lat: number;
  lng: number;
}

/** The scheduled-ride row (projected from the backend) the Activity list passes
 *  through. Loosely typed — we read a known subset. */
interface ActiveScheduledRide {
  _id: string;
  pickup?: { address?: string };
  dropoff?: { address?: string };
  driver?: {
    _id?: string;
    firstName?: string;
    lastName?: string;
    driverProfile?: { rating?: number | null };
  } | null;
  booking?: {
    id: string;
    route?: string | null;
    routeName?: string | null;
    departureTime?: string | null;
    seats?: number[];
    driverName?: string | null;
    driverPhone?: string | null;
    driverRating?: number | null;
    vehicle?: { make?: string; model?: string; color?: string; plateNumber?: string } | null;
    earlyDrop?: { status?: string } | null;
  };
}

interface Props {
  navigation: any;
  route: { params: { ride: ActiveScheduledRide } };
}

/** Which overlay of the emergency flow is showing. */
type Flow = 'none' | 'sos' | 'options' | 'confirm' | 'waiting' | 'approved';

/**
 * Live tracking for an ACTIVE scheduled shuttle the rider is on — the
 * "Trip in Progress" screen from the Figma onboarding flow. Shows the bus on a
 * live map plus a trip card, and hosts the customer-initiated early-drop
 * request flow: Emergency → Options → "Request Early Drop?" → "Waiting for
 * Driver Approval" → (driver approves) → safety checklist → refund summary.
 */
export const ScheduledLiveTrackScreen: React.FC<Props> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const ride = route.params.ride;
  const booking = ride.booking ?? ({} as NonNullable<ActiveScheduledRide['booking']>);
  const bookingId = booking.id ?? ride._id?.replace(/^sched_/, '');
  const routeId = booking.route ?? null;
  // The specific bus (driver) this rider booked. A route can have several
  // approved drivers running it at once, so we filter live GPS to this one.
  const bookedDriverId = (booking as any).driver ?? ride.driver?._id ?? null;

  const driverName =
    booking.driverName ||
    [ride.driver?.firstName, ride.driver?.lastName].filter(Boolean).join(' ').trim() ||
    'Your driver';
  const driverPhone = booking.driverPhone ?? null;
  const rating = booking.driverRating ?? ride.driver?.driverProfile?.rating ?? null;
  const vehicle = booking.vehicle ?? null;
  const plate = vehicle?.plateNumber || '';
  const vehicleDesc = [vehicle?.color, vehicle?.make, vehicle?.model]
    .filter(Boolean)
    .join(' ');
  const fromName = booking.routeName ?? ride.pickup?.address ?? 'Boarding point';
  const toName = ride.dropoff?.address ?? 'Destination';
  const seats = booking.seats ?? [];

  const [routeDoc, setRouteDoc] = useState<ScheduledRouteApi | null>(null);
  const [driverPos, setDriverPos] = useState<LatLng | null>(null);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);

  // Emergency flow state.
  const [flow, setFlow] = useState<Flow>(
    booking.earlyDrop?.status === 'requested' ? 'waiting' : 'none',
  );
  const [submitting, setSubmitting] = useState(false);
  const [approved, setApproved] = useState<{
    originalFare: number;
    partialFare: number;
    refund: number;
    refundMethod?: string;
    dropStopName?: string;
    droppedAt?: string;
  } | null>(null);
  const [checklist, setChecklist] = useState<[boolean, boolean, boolean]>([
    false,
    false,
    false,
  ]);

  // Route doc → stop coords for the polyline.
  useEffect(() => {
    if (!routeId) return;
    let cancelled = false;
    routeService
      .getById(routeId)
      .then((r) => !cancelled && setRouteDoc(r))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [routeId]);

  // Live GPS from the route room + early-drop decision events.
  useEffect(() => {
    if (routeId) joinRouteRoom(routeId);
    setSocketListeners({
      onDriverLocation: (payload) => {
        if (!routeId || payload.routeId !== routeId) return;
        // Ignore other buses on the same route — only track the one booked.
        if (bookedDriverId && payload.driverId && String(payload.driverId) !== String(bookedDriverId)) {
          return;
        }
        setDriverPos({ lat: payload.location.lat, lng: payload.location.lng });
        setLastUpdate(payload.timestamp ?? Date.now());
      },
      onEarlyDropApproved: (payload) => {
        if (payload.bookingId !== bookingId) return;
        setApproved(payload);
        setFlow('approved');
      },
      onEarlyDropDeclined: (payload) => {
        if (payload.bookingId !== bookingId) return;
        setFlow('none');
        Alert.alert(
          'Early drop not possible',
          payload.reason ||
            'The driver can’t safely stop right now. You’ll continue to your booked stop.',
        );
      },
    });
    return () => {
      if (routeId) leaveRouteRoom(routeId);
    };
  }, [routeId, bookingId, bookedDriverId]);

  // Safety net for the "Waiting for Driver Approval" state: the socket push
  // (scheduled:early-drop-approved) can be missed on a reconnect, which left the
  // rider stuck on the waiting screen even after the driver approved the drop.
  // While waiting we ALSO poll the booking's early-drop status and advance the
  // same way, so approval is never lost.
  useEffect(() => {
    if (flow !== 'waiting' || !bookingId) return;
    let cancelled = false;
    const check = async () => {
      try {
        const data = await rideService.getRides(1, 50);
        const rows: any[] = (data as any)?.rides || (data as any)?.items || [];
        const row = rows.find(
          (r) =>
            r?.booking?.id === bookingId ||
            String(r?._id ?? '').replace(/^sched_/, '') === bookingId,
        );
        const ed = row?.booking?.earlyDrop;
        if (cancelled || !ed) return;
        if (ed.status === 'approved') {
          setApproved({
            originalFare: ed.originalFare ?? 0,
            partialFare: ed.partialFare ?? 0,
            refund: ed.refund ?? Math.max(0, (ed.originalFare ?? 0) - (ed.partialFare ?? 0)),
            refundMethod: ed.refundMethod,
            dropStopName: ed.dropStopName,
          });
          setFlow('approved');
        } else if (ed.status === 'declined') {
          setFlow('none');
          Alert.alert(
            'Early drop not possible',
            'The driver can’t safely stop right now. You’ll continue to your booked stop.',
          );
        } else if (ed.status === 'cancelled') {
          setFlow('none');
        }
      } catch {
        /* keep waiting; next tick retries */
      }
    };
    const iv = setInterval(check, 4000);
    check();
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [flow, bookingId]);

  const stopCoords: LatLng[] = useMemo(() => {
    const stops = routeDoc?.stops ?? [];
    return [...stops]
      .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
      .map((st) => ({ lat: st.lat, lng: st.lng }));
  }, [routeDoc]);

  const mapRef = useRef<MapView | null>(null);
  const initialRegion: Region | null = useMemo(() => {
    const c = driverPos ?? stopCoords[0] ?? null;
    if (!c) return null;
    return { latitude: c.lat, longitude: c.lng, latitudeDelta: 0.1, longitudeDelta: 0.1 };
  }, [driverPos?.lat, driverPos?.lng, stopCoords]);

  useEffect(() => {
    if (!mapRef.current || !stopCoords.length) return;
    const coords = stopCoords.map((c) => ({ latitude: c.lat, longitude: c.lng }));
    if (driverPos) coords.push({ latitude: driverPos.lat, longitude: driverPos.lng });
    const t = setTimeout(() => {
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: 140, right: 70, bottom: 320, left: 70 },
        animated: true,
      });
    }, 250);
    return () => clearTimeout(t);
  }, [driverPos?.lat, driverPos?.lng, stopCoords]);

  const lastUpdateLabel = useMemo(() => {
    if (!lastUpdate) return null;
    const secs = Math.max(0, Math.round((Date.now() - lastUpdate) / 1000));
    if (secs < 5) return 'just now';
    if (secs < 60) return `${secs}s ago`;
    return `${Math.round(secs / 60)} min ago`;
  }, [lastUpdate]);

  const call = (phone?: string | null) => {
    if (!phone) {
      Alert.alert('Number unavailable', 'We don’t have a phone number to call right now.');
      return;
    }
    Linking.openURL(`tel:${phone}`).catch(() => {});
  };

  const submitRequest = async () => {
    if (!bookingId) return;
    setSubmitting(true);
    try {
      await routeService.requestEarlyDrop(bookingId);
      setFlow('waiting');
    } catch (err: any) {
      Alert.alert(
        'Could not send request',
        err?.response?.data?.message ?? 'Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const cancelRequest = async () => {
    if (!bookingId) {
      setFlow('none');
      return;
    }
    setSubmitting(true);
    try {
      await routeService.cancelEarlyDrop(bookingId);
    } catch {
      /* fall through — closing the sheet is the important part */
    } finally {
      setSubmitting(false);
      setFlow('none');
    }
  };

  const goToSummary = () => {
    setFlow('none');
    navigation.replace('ScheduledEarlyDropSummary', {
      bookingId,
      routeName: booking.routeName ?? fromName,
      fromName,
      toName,
      dropStopName: approved?.dropStopName,
      originalFare: approved?.originalFare,
      partialFare: approved?.partialFare,
      refund: approved?.refund,
      refundMethod: approved?.refundMethod,
      droppedAt: approved?.droppedAt,
    });
  };

  const allChecked = checklist.every(Boolean);

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      {initialRegion ? (
        <MapView
          ref={(r) => {
            mapRef.current = r;
          }}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          style={StyleSheet.absoluteFill}
          initialRegion={initialRegion}
          showsUserLocation
          showsMyLocationButton={false}
          showsCompass={false}
          toolbarEnabled={false}
        >
          {stopCoords.map((c, idx) => (
            <Marker
              key={`stop-${idx}`}
              coordinate={{ latitude: c.lat, longitude: c.lng }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
            >
              <View
                style={[
                  styles.stopPin,
                  idx === 0 && styles.stopPinFirst,
                  idx === stopCoords.length - 1 && styles.stopPinLast,
                ]}
              />
            </Marker>
          ))}
          {stopCoords.length > 1 && (
            <Polyline
              coordinates={stopCoords.map((c) => ({ latitude: c.lat, longitude: c.lng }))}
              strokeColor={Colors.primary}
              strokeWidth={4}
            />
          )}
          {driverPos && (
            <Marker
              key="bus"
              coordinate={{ latitude: driverPos.lat, longitude: driverPos.lng }}
              anchor={{ x: 0.5, y: 0.5 }}
              flat
              tracksViewChanges={false}
            >
              <CabIcon size={38} rotation={0} />
            </Marker>
          )}
        </MapView>
      ) : (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading live map…</Text>
        </View>
      )}

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + vs(10) }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.iconBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={s(22)} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>Live Route Tracking</Text>
        </View>
        <TouchableOpacity
          onPress={() => setFlow('sos')}
          style={styles.sosBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="alert" size={s(22)} color={Colors.white} />
        </TouchableOpacity>
      </View>

      {/* Trip card */}
      <View style={[styles.card, { paddingBottom: insets.bottom + vs(14) }]}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>Trip in Progress</Text>
          <View style={styles.activePill}>
            <View style={styles.activeDot} />
            <Text style={styles.activePillText}>Active</Text>
          </View>
        </View>

        <View style={styles.rowLine}>
          <Ionicons name="person-circle-outline" size={s(20)} color={Colors.textSecondary} />
          <Text style={styles.rowLabel}>Driver</Text>
          <Text style={styles.rowValue} numberOfLines={1}>
            {driverName}
            {`  ★ ${driverRatingText(rating)}`}
          </Text>
        </View>
        {!!plate && (
          <View style={styles.rowLine}>
            <Ionicons name="bus-outline" size={s(20)} color={Colors.textSecondary} />
            <Text style={styles.rowLabel}>Vehicle</Text>
            <Text style={styles.rowValue} numberOfLines={1}>
              {plate}
              {vehicleDesc ? `  ·  ${vehicleDesc}` : ''}
            </Text>
          </View>
        )}
        <View style={styles.rowLine}>
          <Ionicons name="navigate-outline" size={s(20)} color={Colors.textSecondary} />
          <Text style={styles.rowLabel}>Route</Text>
          <Text style={styles.rowValue} numberOfLines={1}>
            {fromName} → {toName}
          </Text>
        </View>

        <View style={styles.etaBand}>
          <Ionicons name="ellipse" size={s(9)} color={driverPos ? Colors.success : Colors.textMuted} />
          <Text style={styles.etaText}>
            {driverPos
              ? `Live tracking active${lastUpdateLabel ? ` · updated ${lastUpdateLabel}` : ''}`
              : 'Waiting for the vehicle to come online…'}
          </Text>
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.callBtn}
            activeOpacity={0.85}
            onPress={() => call(driverPhone)}
          >
            <Ionicons name="call" size={s(18)} color={Colors.white} />
            <Text style={styles.callBtnText}>Call Driver</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.messageBtn}
            activeOpacity={0.85}
            onPress={() =>
              // Scheduled trips have no Ride doc — the chat thread is keyed
              // by the ScheduledBooking id (driver app + backend match).
              navigation.navigate('Chat', {
                rideId: bookingId,
                driver: { id: bookedDriverId, name: driverName, phone: driverPhone },
              })
            }
          >
            <Ionicons name="chatbubble-outline" size={s(20)} color={Colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.emergencyBtn}
            activeOpacity={0.85}
            onPress={() => setFlow('options')}
          >
            <Ionicons name="warning-outline" size={s(18)} color={EMERGENCY} />
            <Text style={styles.emergencyBtnText}>Emergency</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.statusBanner}>
          <Ionicons name="shield-checkmark-outline" size={s(16)} color={Colors.primary} />
          <Text style={styles.statusBannerText}>
            Ride status: In Progress — we’re tracking your journey for your safety.
          </Text>
        </View>
      </View>

      {/* ── Emergency SOS modal ── */}
      <Modal visible={flow === 'sos'} transparent animationType="fade" onRequestClose={() => setFlow('none')}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={[styles.sheetIcon, { backgroundColor: alpha('#EF4444', 0.12) }]}>
              <Ionicons name="alert-circle" size={s(30)} color="#EF4444" />
            </View>
            <Text style={styles.sheetTitle}>Emergency SOS</Text>
            <Text style={styles.sheetBody}>
              Need immediate help? Contact emergency services or UKCAAR support.
            </Text>
            <TouchableOpacity style={styles.dangerBtn} onPress={() => call('100')}>
              <Ionicons name="call" size={s(18)} color={Colors.white} />
              <Text style={styles.dangerBtnText}>Call Emergency (100)</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.outlineBtn}
              onPress={() => {
                setFlow('none');
                navigation.navigate('HelpSupport');
              }}
            >
              <Ionicons name="headset-outline" size={s(18)} color={Colors.primary} />
              <Text style={styles.outlineBtnText}>Call UKCAAR Support</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.textBtn} onPress={() => setFlow('none')}>
              <Text style={styles.textBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Emergency Options sheet ── */}
      <Modal visible={flow === 'options'} transparent animationType="fade" onRequestClose={() => setFlow('none')}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeadRow}>
              <Text style={[styles.sheetTitle, { color: '#EF4444', marginTop: 0 }]}>Emergency Options</Text>
              <TouchableOpacity onPress={() => setFlow('none')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={s(22)} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.sheetBody, { textAlign: 'left' }]}>Please select the type of emergency:</Text>

            <TouchableOpacity style={styles.optionCard} onPress={() => setFlow('sos')}>
              <View style={[styles.optionIcon, { backgroundColor: alpha('#EF4444', 0.12) }]}>
                <Ionicons name="medkit" size={s(20)} color="#EF4444" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.optionTitle}>Medical Emergency</Text>
                <Text style={styles.optionSub}>Immediate medical assistance needed</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.optionCard} onPress={() => setFlow('sos')}>
              <View style={[styles.optionIcon, { backgroundColor: alpha('#F59E0B', 0.14) }]}>
                <Ionicons name="people" size={s(20)} color="#EA580C" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.optionTitle}>Family Emergency</Text>
                <Text style={styles.optionSub}>Urgent family matter requires attention</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.optionCard} onPress={() => setFlow('confirm')}>
              <View style={[styles.optionIcon, { backgroundColor: alpha(Colors.primary, 0.12) }]}>
                <Ionicons name="exit-outline" size={s(20)} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.optionTitle}>Need to Stop Mid-Route</Text>
                <Text style={styles.optionSub}>Request an early drop-off</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.textBtn} onPress={() => setFlow('none')}>
              <Text style={styles.textBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Request Early Drop? confirmation ── */}
      <Modal visible={flow === 'confirm'} transparent animationType="fade" onRequestClose={() => setFlow('options')}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={[styles.sheetIcon, { backgroundColor: alpha('#F59E0B', 0.14) }]}>
              <Ionicons name="warning" size={s(30)} color="#EA580C" />
            </View>
            <Text style={styles.sheetTitle}>Request Early Drop?</Text>
            <Text style={styles.sheetBody}>
              Are you sure you want to request an early drop-off? The driver will need to approve
              this request.
            </Text>
            <View style={styles.notesBox}>
              <Text style={styles.notesTitle}>⚠  Important Notes:</Text>
              <Text style={styles.noteLine}>•  Your fare will be adjusted based on distance covered</Text>
              <Text style={styles.noteLine}>•  You must wait for driver approval before exiting</Text>
              <Text style={styles.noteLine}>•  Refund will be processed within 24 hours</Text>
            </View>
            <View style={styles.rowButtons}>
              <TouchableOpacity style={styles.outlineBtnFlex} onPress={() => setFlow('options')}>
                <Text style={styles.outlineBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.warnBtnFlex, submitting && { opacity: 0.6 }]}
                onPress={submitRequest}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={styles.warnBtnText}>Request Drop</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Waiting for Driver Approval ── */}
      <Modal visible={flow === 'waiting'} transparent animationType="fade">
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={[styles.sheetIcon, { borderWidth: 3, borderColor: Colors.primary }]}>
              <Ionicons name="hourglass-outline" size={s(28)} color={Colors.primary} />
            </View>
            <Text style={styles.sheetTitle}>Waiting for Driver Approval</Text>
            <Text style={styles.sheetBody}>
              Your request has been sent to the driver. Please wait for approval before preparing
              to exit.
            </Text>
            <View style={styles.infoBox}>
              <Text style={styles.infoBoxTitle}>🛑  Please remain seated until approved</Text>
              <Text style={styles.infoBoxSub}>The driver is checking for a safe location to stop.</Text>
            </View>
            <TouchableOpacity
              style={[styles.outlineBtn, submitting && { opacity: 0.6 }]}
              onPress={cancelRequest}
              disabled={submitting}
            >
              <Text style={styles.outlineBtnText}>Cancel Request</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Drop Request Approved + safety checklist ── */}
      <Modal visible={flow === 'approved'} transparent animationType="fade">
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={[styles.sheetIcon, { backgroundColor: alpha(Colors.success, 0.14) }]}>
              <Ionicons name="checkmark-circle" size={s(32)} color={Colors.success} />
            </View>
            <Text style={styles.sheetTitle}>Drop Request Approved</Text>
            <Text style={styles.sheetBody}>
              The driver has approved your early drop request. Please prepare to exit safely.
            </Text>
            <View style={[styles.notesBox, { backgroundColor: alpha('#F59E0B', 0.1) }]}>
              <Text style={[styles.notesTitle, { color: '#B45309' }]}>Safety First</Text>
              <Text style={[styles.noteLine, { color: '#92400E' }]}>
                The vehicle will stop at the next safe location. Please follow the checklist below.
              </Text>
            </View>

            {[
              'Collect all your belongings',
              'Exit from the left door only',
              'Wait for the vehicle to completely stop',
            ].map((label, i) => {
              const checked = checklist[i];
              return (
                <TouchableOpacity
                  key={label}
                  style={styles.checkRow}
                  activeOpacity={0.8}
                  onPress={() =>
                    setChecklist((prev) => {
                      const next = [...prev] as [boolean, boolean, boolean];
                      next[i] = !next[i];
                      return next;
                    })
                  }
                >
                  <View style={[styles.checkbox, checked && styles.checkboxOn]}>
                    {checked && <Ionicons name="checkmark" size={s(14)} color={Colors.white} />}
                  </View>
                  <Text style={styles.checkLabel}>{label}</Text>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={[styles.primaryBtn, !allChecked && { opacity: 0.5 }]}
              disabled={!allChecked}
              onPress={goToSummary}
            >
              <Text style={styles.primaryBtnText}>I’ve Exited Safely</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const EMERGENCY = '#EA580C';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundCard },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: vs(10) },
  loadingText: { fontFamily: 'Inter-Regular', fontSize: fs(13), color: Colors.textSecondary },

  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: s(14),
    paddingBottom: vs(10),
  },
  iconBtn: {
    width: s(40),
    height: s(40),
    borderRadius: s(20),
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.sm,
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(16),
    color: Colors.textPrimary,
    backgroundColor: alpha(Colors.white, 0.9),
    paddingHorizontal: s(12),
    paddingVertical: vs(5),
    borderRadius: s(999),
    overflow: 'hidden',
  },
  sosBtn: {
    width: s(40),
    height: s(40),
    borderRadius: s(20),
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.md,
  },

  stopPin: {
    width: s(12),
    height: s(12),
    borderRadius: s(6),
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  stopPinFirst: {
    backgroundColor: Colors.primary,
    borderColor: Colors.white,
    width: s(16),
    height: s(16),
    borderRadius: s(8),
  },
  stopPinLast: {
    backgroundColor: Colors.error,
    borderColor: Colors.white,
    width: s(16),
    height: s(16),
    borderRadius: s(8),
  },

  card: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.white,
    borderTopLeftRadius: s(22),
    borderTopRightRadius: s(22),
    paddingHorizontal: s(18),
    paddingTop: vs(16),
    ...Shadow.lg,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: vs(12),
  },
  cardTitle: { fontFamily: 'Inter-Bold', fontSize: fs(18), color: Colors.textPrimary },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(6),
    backgroundColor: alpha(Colors.success, 0.12),
    paddingHorizontal: s(10),
    paddingVertical: vs(4),
    borderRadius: s(999),
  },
  activeDot: { width: s(7), height: s(7), borderRadius: s(4), backgroundColor: Colors.success },
  activePillText: { fontFamily: 'Inter-SemiBold', fontSize: fs(12), color: Colors.success },

  rowLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(8),
    paddingVertical: vs(6),
  },
  rowLabel: { fontFamily: 'Inter-Regular', fontSize: fs(13), color: Colors.textSecondary, width: s(58) },
  rowValue: { flex: 1, fontFamily: 'Inter-SemiBold', fontSize: fs(14), color: Colors.textPrimary, textAlign: 'right' },

  etaBand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(8),
    backgroundColor: alpha(Colors.primary, 0.08),
    borderRadius: s(10),
    paddingHorizontal: s(12),
    paddingVertical: vs(10),
    marginTop: vs(8),
  },
  etaText: { fontFamily: 'Inter-Medium', fontSize: fs(13), color: Colors.primary, flex: 1 },

  actionsRow: { flexDirection: 'row', gap: s(12), marginTop: vs(14) },
  callBtn: {
    flex: 1,
    height: vs(50),
    borderRadius: s(12),
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: s(8),
  },
  callBtnText: { fontFamily: 'Inter-SemiBold', fontSize: fs(15), color: Colors.white },
  messageBtn: {
    width: vs(50),
    height: vs(50),
    borderRadius: s(12),
    borderWidth: 1.5,
    borderColor: Colors.primary,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emergencyBtn: {
    flex: 1,
    height: vs(50),
    borderRadius: s(12),
    borderWidth: 1.5,
    borderColor: EMERGENCY,
    backgroundColor: Colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: s(8),
  },
  emergencyBtnText: { fontFamily: 'Inter-SemiBold', fontSize: fs(15), color: EMERGENCY },

  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(8),
    backgroundColor: alpha(Colors.primary, 0.06),
    borderRadius: s(10),
    paddingHorizontal: s(12),
    paddingVertical: vs(10),
    marginTop: vs(12),
  },
  statusBannerText: { fontFamily: 'Inter-Regular', fontSize: fs(12), color: Colors.primary, flex: 1 },

  // ── Modals ──
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: s(24),
  },
  sheet: {
    width: '100%',
    backgroundColor: Colors.white,
    borderRadius: s(24),
    padding: s(22),
  },
  sheetHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: vs(6),
  },
  sheetIcon: {
    width: s(60),
    height: s(60),
    borderRadius: s(30),
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: vs(12),
  },
  sheetTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: fs(20),
    color: Colors.textPrimary,
    textAlign: 'center',
    marginTop: vs(2),
  },
  sheetBody: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(14),
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: fs(21),
    marginTop: vs(8),
  },

  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(12),
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: s(16),
    padding: s(14),
    marginTop: vs(12),
  },
  optionIcon: {
    width: s(42),
    height: s(42),
    borderRadius: s(10),
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTitle: { fontFamily: 'Inter-SemiBold', fontSize: fs(16), color: Colors.textPrimary },
  optionSub: { fontFamily: 'Inter-Regular', fontSize: fs(12), color: Colors.textSecondary, marginTop: vs(2) },

  notesBox: {
    backgroundColor: '#F59E0B',
    borderRadius: s(14),
    padding: s(14),
    marginTop: vs(16),
  },
  notesTitle: { fontFamily: 'Inter-SemiBold', fontSize: fs(14), color: Colors.white, marginBottom: vs(6), textAlign: 'center' },
  noteLine: { fontFamily: 'Inter-Regular', fontSize: fs(13), color: Colors.white, lineHeight: fs(20) },

  infoBox: {
    backgroundColor: '#0EA5E9',
    borderRadius: s(14),
    padding: s(14),
    marginTop: vs(16),
  },
  infoBoxTitle: { fontFamily: 'Inter-SemiBold', fontSize: fs(14), color: Colors.white, textAlign: 'center' },
  infoBoxSub: { fontFamily: 'Inter-Regular', fontSize: fs(12), color: Colors.white, textAlign: 'center', marginTop: vs(4) },

  rowButtons: { flexDirection: 'row', gap: s(12), marginTop: vs(18) },
  rowButtonsSpacer: {},

  checkRow: { flexDirection: 'row', alignItems: 'center', gap: s(12), paddingVertical: vs(10) },
  checkbox: {
    width: s(22),
    height: s(22),
    borderRadius: s(6),
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: Colors.success, borderColor: Colors.success },
  checkLabel: { flex: 1, fontFamily: 'Inter-Medium', fontSize: fs(14), color: Colors.textPrimary },

  // Buttons
  dangerBtn: {
    height: vs(52),
    borderRadius: s(14),
    backgroundColor: '#EF4444',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: s(8),
    marginTop: vs(18),
  },
  dangerBtnText: { fontFamily: 'Inter-SemiBold', fontSize: fs(15), color: Colors.white },
  outlineBtn: {
    height: vs(52),
    borderRadius: s(14),
    borderWidth: 1.5,
    borderColor: Colors.primary,
    backgroundColor: Colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: s(8),
    marginTop: vs(12),
  },
  outlineBtnFlex: {
    flex: 1,
    height: vs(52),
    borderRadius: s(14),
    borderWidth: 1.5,
    borderColor: Colors.primary,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineBtnText: { fontFamily: 'Inter-SemiBold', fontSize: fs(15), color: Colors.primary },
  warnBtnFlex: {
    flex: 1,
    height: vs(52),
    borderRadius: s(14),
    backgroundColor: EMERGENCY,
    alignItems: 'center',
    justifyContent: 'center',
  },
  warnBtnText: { fontFamily: 'Inter-SemiBold', fontSize: fs(15), color: Colors.white },
  primaryBtn: {
    height: vs(52),
    borderRadius: s(14),
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: vs(18),
  },
  primaryBtnText: { fontFamily: 'Inter-SemiBold', fontSize: fs(15), color: Colors.white },
  textBtn: { height: vs(48), alignItems: 'center', justifyContent: 'center', marginTop: vs(8) },
  textBtnText: { fontFamily: 'Inter-SemiBold', fontSize: fs(15), color: Colors.primary },
});

export default ScheduledLiveTrackScreen;
