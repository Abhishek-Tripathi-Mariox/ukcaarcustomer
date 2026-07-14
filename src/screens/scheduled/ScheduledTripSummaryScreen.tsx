import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  Modal,
  Share,
  Platform,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { WebView } from 'react-native-webview';
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
      status?: string;
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

  const [ride, setRide] = useState<Ride | null>(null);

  const isFinished =
    params.status === 'completed' ||
    params.status === 'cancelled' ||
    ride?.status === 'completed' ||
    ride?.status === 'cancelled';

  // Booking-flow entry carries the full route object and is active (`!isFinished`).
  const isBookingMode = !!scheduledRoute && !isFinished;

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

  const [loading, setLoading] = useState(!isBookingMode && canFetchRide);
  const [invoiceOpen, setInvoiceOpen] = useState(false);

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

  const invoiceHtml = useMemo(() => {
    const inv = ticketRef || (bookingId ? `UKC-${bookingId.slice(-8).toUpperCase()}` : '3UKCAAR1234');
    const paymentMethod = (ride?.paymentMethod || 'UPI').toString().toUpperCase();
    const rows: string[] = [];
    if (isBookingMode && pricePerSeat > 0) {
      rows.push(`<tr><td>Ticket Price (${seats.length} × ₹${pricePerSeat})</td><td class="r">₹${seats.length * pricePerSeat}</td></tr>`);
      if (returnDeparture) {
        rows.push(`<tr><td>Return leg (${seats.length} × ₹${pricePerSeat})</td><td class="r">₹${seats.length * pricePerSeat}</td></tr>`);
      }
    } else {
      rows.push(`<tr><td>Base Fare</td><td class="r">₹${scheduledRoute?.price ?? total}</td></tr>`);
      if (total > (scheduledRoute?.price ?? total)) {
        rows.push(`<tr><td>Distance Charge</td><td class="r">₹${total - (scheduledRoute?.price ?? total)}</td></tr>`);
      }
    }

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Invoice ${inv}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, system-ui, Roboto, Arial, sans-serif; margin: 0; padding: 20px; color: #101828; background: #fff; }
  .wrap { max-width: 720px; margin: 0 auto; }
  .brand { display:flex; align-items:center; justify-content:space-between; border-bottom: 2px solid #0097B3; padding-bottom: 12px; margin-bottom: 18px; }
  .brand h1 { font-size: 22px; margin: 0; color: #0097B3; letter-spacing: 0.5px; }
  .brand .sub { font-size: 12px; color: #6A7282; margin-top: 4px; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; font-size: 13px; }
  .meta .label { color: #6A7282; }
  .meta .val { color: #101828; font-weight: 600; }
  h2 { font-size: 14px; color: #45474A; margin: 18px 0 8px; text-transform: uppercase; letter-spacing: 0.6px; }
  .loc { background: #F8F9FB; border-radius: 10px; padding: 12px 14px; font-size: 13px; }
  .loc .row { display:flex; gap:10px; align-items:flex-start; }
  .loc .row + .row { margin-top: 10px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; margin-top:4px; flex-shrink: 0; }
  .dot.pick { background: #219EBC; }
  .dot.drop { background: #EF4444; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  td { padding: 8px 0; border-bottom: 1px solid #F1F3F5; }
  td.r { text-align: right; font-weight: 600; }
  tr.total td { border-top: 2px solid #101828; border-bottom: none; padding-top: 12px; font-size: 16px; font-weight: 700; color: #0097B3; }
  .foot { margin-top: 24px; font-size: 11px; color: #6A7282; text-align: center; line-height: 1.5; }
  .pill { display: inline-block; background: #EFF6FF; color: #155DFC; font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 999px; }
</style></head>
<body><div class="wrap">
  <div class="brand">
    <div>
      <h1>UKCAAR</h1>
      <div class="sub">Tax Invoice / Scheduled Trip Ticket</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:13px;font-weight:700">${inv}</div>
      <div style="font-size:12px;color:#6A7282;margin-top:4px">${dateLabel}</div>
    </div>
  </div>

  <div class="meta">
    <div><div class="label">Trip Status</div><div class="val"><span class="pill">${statusLabel}</span></div></div>
    <div><div class="label">Payment Method</div><div class="val">${paymentMethod}</div></div>
    <div><div class="label">Departure Time</div><div class="val">${depTime}</div></div>
    <div><div class="label">Duration • Distance</div><div class="val">${durationMin > 0 ? durationMin + ' min' : '50 min'} • ${distanceKm > 0 ? distanceKm.toFixed(1) + ' km' : '4.3 km'}</div></div>
  </div>

  <h2>Route Details</h2>
  <div class="loc">
    <div class="row"><div class="dot pick"></div><div><div style="color:#6A7282;font-size:11px">Boarding</div><div>${fromName}</div></div></div>
    <div class="row"><div class="dot drop"></div><div><div style="color:#6A7282;font-size:11px">Dropping</div><div>${toName}</div></div></div>
  </div>

  ${seats.length > 0 ? `
  <h2>Seats & Passengers</h2>
  <div class="loc">
    <div style="font-weight:600;margin-bottom:6px">Seats: ${seats.join(', ')}</div>
    ${passengers.map((p) => `<div style="font-size:12px;color:#4A5568">Seat ${p.seat} — ${p.name || 'Passenger'}</div>`).join('')}
  </div>` : ''}

  <h2>Fare Breakdown</h2>
  <table>
    ${rows.join('')}
    <tr class="total"><td>Total Amount</td><td class="r">₹${total}</td></tr>
  </table>

  <div class="foot">
    Thank you for riding with UKCAAR.<br/>
    This is a system-generated invoice and does not require a signature.
  </div>
</div></body></html>`;
  }, [ticketRef, bookingId, ride, isBookingMode, pricePerSeat, seats, returnDeparture, scheduledRoute, total, dateLabel, statusLabel, depTime, durationMin, distanceKm, fromName, toName, passengers]);

  const handleShareInvoice = () => {
    const inv = ticketRef || (bookingId ? `UKC-${bookingId.slice(-8).toUpperCase()}` : '3UKCAAR1234');
    const lines = [
      `UKCAAR — Scheduled Trip Invoice ${inv}`,
      `Date: ${dateLabel} (${depTime})`,
      `Route: ${fromName} → ${toName}`,
      `Status: ${statusLabel}`,
      `Total: ₹${total}`,
      '',
      `Thank you for riding with UKCAAR!`,
    ];
    try {
      Share.share({ message: lines.join('\n'), title: `Invoice ${inv}` });
    } catch (_) {}
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={isFinished ? () => navigation.goBack() : handleGoHome}
          style={styles.backBoxBtn}
          activeOpacity={0.8}
        >
          <Ionicons name="chevron-back" size={20} color={Colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trip Summary</Text>
        <View style={{ width: s(34) }} />
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
          <Text style={styles.topSubheading}>
            {isFinished
              ? 'Thanks for riding with  UKCAAR!'
              : isBookingMode
              ? `Your trip starts at ${depTime} on ${dateLabel}.`
              : `Departure ${depTime} • ${dateLabel}`}
          </Text>

          {/* Ticket Receipt Card */}
          <View style={styles.receiptCard}>
            {/* Trip ID Header */}
            <Text style={styles.tripIdLabel}>Trip ID</Text>
            <Text style={styles.tripIdValue}>
              {ticketRef || (bookingId ? `UKC-${bookingId.slice(-8).toUpperCase()}` : '3UKCAAR1234')}
            </Text>

            <View style={styles.divider} />

            {/* Date & Time */}
            <View style={styles.fieldSection}>
              <View style={styles.fieldHeader}>
                <Ionicons name="calendar-outline" size={16} color="#718096" />
                <Text style={styles.fieldLabel}>Date & Time</Text>
              </View>
              <Text style={styles.fieldValueBold}>{depTime}   {dateLabel}</Text>
            </View>

            {/* Route */}
            <View style={styles.fieldSection}>
              <View style={styles.fieldHeader}>
                <Ionicons name="git-commit-outline" size={16} color="#0097B3" />
                <Text style={styles.fieldLabel}>Route</Text>
              </View>
              <Text style={styles.fieldValueBold}>{fromName}</Text>
              <View style={styles.routeConnectorLine} />
              <View style={styles.stopRow}>
                <Ionicons name="location-outline" size={16} color="#718096" style={{ marginRight: 6 }} />
                <Text style={styles.fieldValueBold}>{toName}</Text>
              </View>
            </View>

            {/* Duration Distance */}
            <View style={styles.fieldSection}>
              <View style={styles.fieldHeader}>
                <Ionicons name="time-outline" size={16} color="#718096" />
                <Text style={styles.fieldLabel}>Duration Distance</Text>
              </View>
              <Text style={styles.fieldValueBold}>
                {durationMin > 0 ? `${durationMin}min` : '50min'}  |  {distanceKm > 0 ? `${distanceKm.toFixed(1)} km` : '4.3 km'}
              </Text>
            </View>

            <View style={styles.divider} />

            {/* Fare Breakdown */}
            <View style={styles.fieldSection}>
              <View style={styles.fieldHeader}>
                <Ionicons name="receipt-outline" size={18} color="#4A5568" />
                <Text style={styles.fareTitle}>Fare Breakdown</Text>
              </View>

              {isBookingMode && pricePerSeat > 0 ? (
                <>
                  <View style={styles.fareRow}>
                    <Text style={styles.fareItemLabel}>
                      Ticket Price ({seats.length} × ₹{pricePerSeat})
                    </Text>
                    <Text style={styles.fareItemValue}>₹{seats.length * pricePerSeat}</Text>
                  </View>
                  {returnDeparture && (
                    <View style={styles.fareRow}>
                      <Text style={styles.fareItemLabel}>
                        Return leg ({seats.length} × ₹{pricePerSeat})
                      </Text>
                      <Text style={styles.fareItemValue}>₹{seats.length * pricePerSeat}</Text>
                    </View>
                  )}
                </>
              ) : (
                <>
                  <View style={styles.fareRow}>
                    <Text style={styles.fareItemLabel}>Base Fare</Text>
                    <Text style={styles.fareItemValue}>₹{scheduledRoute?.price ?? total}</Text>
                  </View>
                  {total > (scheduledRoute?.price ?? total) && (
                    <View style={styles.fareRow}>
                      <Text style={styles.fareItemLabel}>Distance Charge</Text>
                      <Text style={styles.fareItemValue}>₹{total - (scheduledRoute?.price ?? total)}</Text>
                    </View>
                  )}
                </>
              )}
            </View>

            <View style={styles.divider} />

            {/* Total Amount & Payment Method */}
            <View style={styles.totalBlock}>
              <View style={styles.totalRow}>
                <Text style={styles.totalTitle}>Total Amount</Text>
                <Text style={styles.totalValueBold}>₹{total}</Text>
              </View>
              <Text style={styles.paymentMethodLabel}>
                Payment Method : {(ride?.paymentMethod || 'UPI').toString().toUpperCase()}
              </Text>
            </View>

            {/* Boarding QR — only if trip is active / upcoming */}
            {!isFinished && (
              <>
                <View style={styles.divider} />
                <View style={styles.qrSection}>
                  <View style={styles.qrCard}>
                    <SafeQR value={qrData} size={150} />
                  </View>
                  <Text style={styles.qrRef}>{ticketRef}</Text>
                  <Text style={styles.qrHint}>Show this QR code at boarding</Text>
                </View>
              </>
            )}

            {/* Decorative tear edge */}
            <View style={styles.tearRow}>
              {Array.from({ length: 18 }).map((_, i) => (
                <View key={i} style={styles.tearDot} />
              ))}
            </View>
          </View>

          {/* Get PDF Receipt Button right below ticket */}
          <TouchableOpacity
            style={styles.pdfButton}
            activeOpacity={0.75}
            onPress={() => setInvoiceOpen(true)}
          >
            <Ionicons name="download-outline" size={20} color="#4A5568" />
            <Text style={styles.pdfText}>Get PDF Receipt</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Bottom Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={styles.cta}
          onPress={isFinished ? () => navigation.navigate('SelectRide') : handleGoHome}
          activeOpacity={0.85}
        >
          <Text style={styles.ctaText}>{isFinished ? 'Book Again' : 'Go to Home'}</Text>
        </TouchableOpacity>
      </View>

      {/* Invoice preview modal */}
      <Modal
        visible={invoiceOpen}
        animationType="slide"
        onRequestClose={() => setInvoiceOpen(false)}
      >
        <View style={styles.modalContainer}>
          <StatusBar translucent backgroundColor="#0097B3" barStyle="light-content" />
          <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
            <TouchableOpacity
              onPress={() => setInvoiceOpen(false)}
              style={styles.backBoxBtn}
              activeOpacity={0.8}
            >
              <Ionicons name="close" size={20} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Invoice</Text>
            <TouchableOpacity
              onPress={handleShareInvoice}
              style={styles.backBoxBtn}
              activeOpacity={0.8}
            >
              <Ionicons name="share-social-outline" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          <WebView
            originWhitelist={['*']}
            source={{ html: invoiceHtml }}
            style={{ flex: 1, backgroundColor: '#FFFFFF' }}
            javaScriptEnabled={false}
            scalesPageToFit={Platform.OS === 'android'}
          />
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  modalContainer: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.primary,
    paddingHorizontal: s(16),
    paddingVertical: vs(14),
  },
  backBoxBtn: {
    width: s(34),
    height: s(34),
    borderRadius: s(8),
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(18),
    color: Colors.white,
    flex: 1,
    textAlign: 'center',
  },

  content: { paddingHorizontal: s(20), paddingBottom: vs(120) },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  topSubheading: {
    fontFamily: 'Inter-Medium',
    fontSize: fs(15),
    color: '#4A5568',
    textAlign: 'center',
    marginTop: vs(16),
    marginBottom: vs(18),
  },

  receiptCard: {
    backgroundColor: Colors.white,
    borderRadius: s(24),
    paddingTop: vs(24),
    paddingHorizontal: s(22),
    paddingBottom: vs(20),
    ...Shadow.md,
    overflow: 'hidden',
  },

  tripIdLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(12),
    color: '#718096',
    textAlign: 'center',
  },
  tripIdValue: {
    fontFamily: 'Inter-Bold',
    fontSize: fs(22),
    color: '#2D3748',
    textAlign: 'center',
    marginTop: vs(4),
    letterSpacing: 0.5,
  },

  divider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: vs(16),
  },

  fieldSection: {
    marginBottom: vs(16),
  },
  fieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(6),
  },
  fieldLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(13),
    color: '#718096',
  },
  fieldValueBold: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(15),
    color: '#2D3748',
    marginTop: vs(4),
    marginLeft: s(22),
  },
  routeConnectorLine: {
    width: 2,
    height: vs(16),
    backgroundColor: '#CBD5E0',
    marginLeft: s(28),
    marginVertical: vs(4),
  },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: s(22),
    marginTop: vs(2),
  },

  fareTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: fs(15),
    color: '#2D3748',
  },
  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: vs(10),
    paddingLeft: s(2),
  },
  fareItemLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(13),
    color: '#4A5568',
  },
  fareItemValue: {
    fontFamily: 'Inter-Medium',
    fontSize: fs(14),
    color: '#2D3748',
  },

  totalBlock: {
    marginTop: vs(2),
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: fs(16),
    color: '#2D3748',
  },
  totalValueBold: {
    fontFamily: 'Inter-Bold',
    fontSize: fs(18),
    color: '#2D3748',
  },
  paymentMethodLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(12),
    color: '#718096',
    marginTop: vs(6),
  },

  qrSection: { alignItems: 'center', marginTop: vs(8) },
  qrCard: {
    padding: s(12),
    backgroundColor: Colors.white,
    borderRadius: s(12),
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  qrRef: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(14),
    letterSpacing: 1,
    color: '#2D3748',
    marginTop: vs(12),
  },
  qrHint: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(12),
    color: '#718096',
    marginTop: vs(2),
  },

  tearRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: vs(20),
    marginHorizontal: -s(22),
    marginBottom: -vs(25),
    paddingHorizontal: s(6),
  },
  tearDot: {
    width: s(12),
    height: s(12),
    borderRadius: s(6),
    backgroundColor: '#F8FAFC',
  },

  pdfButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: s(8),
    marginTop: vs(32),
    paddingVertical: vs(12),
  },
  pdfText: {
    fontFamily: 'Inter-Medium',
    fontSize: fs(14),
    color: '#4A5568',
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
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: s(10),
    height: vs(52),
  },
  ctaText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(16),
    color: Colors.white,
  },
});
