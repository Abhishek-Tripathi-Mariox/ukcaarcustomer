import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RazorpayCheckout from 'react-native-razorpay';
import { Colors, Shadow, alpha } from '@/theme';
import { fs, s, vs } from '@/theme/responsive';
import type { ScheduledRoute } from './ScheduledRouteScreen';
import type { Passenger } from './ScheduledPassengerDetailsScreen';
import { routeService, type RouteVehicle } from '@/services/routeService';
import { paymentService } from '@/services/paymentService';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { setWalletBalance as setGlobalWalletBalance } from '@/store/slices/appSlice';

interface Stop { id: string; name: string; time: string; sequence?: number }

/**
 * Mirrors the server's default bookingCutoffMinutes — seat booking closes
 * this many minutes before departure. Only a fallback: when the route carries
 * an admin override (route.bookingCutoffMinutes, threaded from routeToUi) that
 * wins, otherwise a route with a higher cutoff sails through this gate and the
 * rider is charged for a booking the backend then rejects.
 */
const BOOKING_CUTOFF_MIN = 10;

// Stop times arrive as the 12-hour picker label ("5:30 PM"); tolerate a raw
// 24h "HH:mm" too. Returns null when unparseable.
const parseTimeLabel = (label?: string): { h: number; m: number } | null => {
  const t = (label ?? '').trim();
  const ampm = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(t);
  if (ampm) {
    let h = Number(ampm[1]) % 12;
    if (/pm/i.test(ampm[3])) h += 12;
    return { h, m: Number(ampm[2]) };
  }
  const raw = /^(\d{1,2}):(\d{2})$/.exec(t);
  return raw ? { h: Number(raw[1]), m: Number(raw[2]) } : null;
};

interface Props {
  navigation: any;
  route: {
    params: {
      route: ScheduledRoute;
      boarding: Stop;
      dropping: Stop;
      seats: number[];
      passengers: Passenger[];
      total: number;
      departureDate: string;
      departureIndex: number;
      driverId: string;
      vehicle: RouteVehicle;
      returnDeparture?: { time: string };
    };
  };
}

export const ScheduledPaymentScreen: React.FC<Props> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const {
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
    returnDeparture,
  } = route.params;

  const [paymentMode, setPaymentMode] = useState<'razorpay' | 'wallet'>('razorpay');
  const [paying, setPaying] = useState(false);
  const user = useAppSelector((s) => s.auth.user);
  const walletBalance = useAppSelector((s) => s.app.walletBalance);

  // The route's real cutoff (admin override) when it made it through the nav
  // params; the platform default otherwise. The server recheck below covers
  // the cases where even this is stale.
  const bookingCutoffMin = scheduledRoute.bookingCutoffMinutes ?? BOOKING_CUTOFF_MIN;

  // The rider can sit on this screen while the departure closes underneath
  // them. Recompute bookability at the moment they tap Pay — the departure
  // instant is anchored to IST (+05:30) exactly like the backend — and bail
  // out before any money moves once inside the booking cutoff.
  const isDepartureStillBookable = (): boolean => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(departureDate ?? '')) return true;
    const t = parseTimeLabel(boarding?.time);
    if (!t) return true; // unparseable time — let the server enforce the cutoff
    const departMs = Date.parse(
      `${departureDate}T${String(t.h).padStart(2, '0')}:${String(t.m).padStart(2, '0')}:00+05:30`,
    );
    if (Number.isNaN(departMs)) return true;
    return departMs - Date.now() > bookingCutoffMin * 60 * 1000;
  };

  const handlePay = async () => {
    if (paying) return;
    if (!isDepartureStillBookable()) {
      Alert.alert(
        'Departure Closed',
        'This departure has closed. Please pick a later slot.',
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
      return;
    }
    setPaying(true);
    // True once Razorpay has actually taken the money, so the catch can tell
    // "never charged" apart from "charged but the booking didn't complete".
    let checkoutSucceeded = false;

    try {
      // ── 0. Authoritative server-side recheck BEFORE any money moves ──
      // The clock math above only knows what this device knows. The seats
      // endpoint re-runs the backend's own past/closed/non-operating/cutoff
      // checks (including admin overrides applied after this flow started)
      // and returns a human `message` when the slot is no longer bookable.
      // It also returns the live booked list, so a seat grabbed since the
      // seat screen is caught here rather than after the charge.
      try {
        const check = await routeService.getSeats(scheduledRoute.id, {
          date: departureDate,
          departureIndex,
          driverId,
        });
        if (check.message) {
          Alert.alert('Departure Unavailable', check.message, [
            { text: 'OK', onPress: () => navigation.goBack() },
          ]);
          return;
        }
        const taken = seats.filter((n) => (check.booked ?? []).includes(n));
        if (taken.length > 0) {
          Alert.alert(
            'Seats Unavailable',
            `Seat(s) ${taken.join(', ')} were just reserved by another rider. Please pick different seats.`,
            [{ text: 'Pick again', onPress: () => navigation.goBack() }],
          );
          return;
        }
      } catch {
        // Couldn't reach the availability endpoint — proceed and let the
        // booking endpoint enforce (it always does); don't block a
        // legitimate payment on a failed pre-check.
      }
      // ── 1. Pay via UKCAAR Wallet Balance ──
      if (paymentMode === 'wallet') {
        if (walletBalance < total) {
          Alert.alert(
            'Insufficient Wallet Balance',
            `Your wallet balance is ₹${walletBalance}. Please select Razorpay Online Payment to proceed.`,
            [{ text: 'Switch to Razorpay', onPress: () => setPaymentMode('razorpay') }],
          );
          setPaying(false);
          return;
        }

        try {
          const booked = await routeService.bookSeats(scheduledRoute.id, {
            departureDate,
            departureIndex,
            driverId,
            seats,
            totalAmount: total,
            passengers,
            boardingStopSequence: boarding.sequence,
            droppingStopSequence: dropping.sequence,
            // Server-side debit. Without this flag the backend reserved the
            // seats without touching the wallet, and our local subtraction
            // below "snapped back" on the next wallet fetch — riders were
            // effectively booking for free.
            paymentMethod: 'wallet',
          });
          const bookingId = booked?.booking?._id ?? booked?.booking?.id;
          // Prefer the authoritative post-debit balance from the server.
          dispatch(
            setGlobalWalletBalance(
              typeof booked?.walletBalance === 'number'
                ? booked.walletBalance
                : Math.max(0, walletBalance - total),
            ),
          );

          navigation.replace('ScheduledBookingDetails', {
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
            bookingId,
            returnDeparture,
          });
        } catch (bookErr: any) {
          const bs = bookErr?.response?.status;
          const bd = bookErr?.response?.data;
          if (bs === 409) {
            const conflicts: number[] = bd?.data?.conflicts ?? [];
            Alert.alert(
              'Seats Unavailable',
              conflicts.length
                ? `Seat(s) ${conflicts.join(', ')} were reserved by another rider.`
                : 'Some of your selected seats were just taken. Please pick another seat.',
              [{ text: 'Pick again', onPress: () => navigation.goBack() }],
            );
          } else {
            Alert.alert(
              'Booking Failed',
              bd?.message || bookErr?.message || 'Could not complete wallet reservation.',
            );
          }
        }
        return;
      }

      // ── 2. Pay via Razorpay Gateway (UPI, Cards, Google Pay, PhonePe, NetBanking) ──
      const orderRes = await paymentService.createOrder({
        amount: total,
        type: 'ride_payment',
      });

      if (!orderRes.success) {
        Alert.alert('Error', 'Failed to initialize payment order with Razorpay.');
        return;
      }

      const { orderId, keyId, currency } = orderRes.data;

      const options = {
        description: `${scheduledRoute.name} • ${seats.length} seat${seats.length > 1 ? 's' : ''}`,
        image: 'https://ukcar.s3.ap-south-1.amazonaws.com/logo.png',
        currency,
        key: keyId,
        amount: Math.round(total * 100).toString(),
        name: 'UKCAAR',
        order_id: orderId,
        prefill: {
          name: user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() : '',
          contact: user?.phone ?? '',
          email: user?.email ?? '',
        },
        theme: { color: '#0097B3' },
      };

      const paymentData = await RazorpayCheckout.open(options as any);
      checkoutSucceeded = true;

      const verifyRes = await paymentService.verifyPayment({
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentData.razorpay_payment_id,
        razorpay_signature: paymentData.razorpay_signature,
      });

      if (!verifyRes.success) {
        // The checkout sheet reported success, so money may genuinely have
        // left the rider's account — never imply they weren't charged.
        Alert.alert(
          'Payment Received',
          'Your payment was received but we could not verify it yet, so the booking was not completed. If the amount was debited, our support team will complete the booking or process your refund.',
        );
        return;
      }

      // Atomically reserve seats after verified payment
      try {
        const booked = await routeService.bookSeats(scheduledRoute.id, {
          departureDate,
          departureIndex,
          driverId,
          seats,
          totalAmount: total,
          passengers,
          boardingStopSequence: boarding.sequence,
          droppingStopSequence: dropping.sequence,
        });
        const bookingId = booked?.booking?._id ?? booked?.booking?.id;

        navigation.replace('ScheduledBookingDetails', {
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
          bookingId,
          returnDeparture,
        });
      } catch (bookErr: any) {
        const bs = bookErr?.response?.status;
        const bd = bookErr?.response?.data;
        if (bs === 409) {
          const conflicts: number[] = bd?.data?.conflicts ?? [];
          Alert.alert(
            'Seats Unavailable',
            conflicts.length
              ? `Seat(s) ${conflicts.join(', ')} were reserved by another rider.`
              : 'Some of your selected seats were just taken. Your payment has been received and support will assist with a refund or alternate seat.',
            [{ text: 'Pick again', onPress: () => navigation.goBack() }],
          );
        } else {
          // The rider HAS paid — the alert must say so before anything else,
          // with the server's business message when there is one (never a raw
          // transport error).
          const serverMsg =
            typeof bd?.message === 'string' && bd.message
              ? bd.message
              : 'the reservation could not be confirmed';
          Alert.alert(
            'Payment Received',
            `Your payment was received but the booking could not be completed: ${serverMsg}. Our support team will process your refund.`,
          );
        }
      }
    } catch (err: any) {
      if (err?.code === 2 || err?.code === '2') {
        // Rider closed the Razorpay sheet on purpose — stay silent.
      } else if (checkoutSucceeded) {
        // Charged, then something after the checkout failed (verify call
        // threw, network dropped). Money may have left their account —
        // don't claim the payment was "cancelled".
        Alert.alert(
          'Payment Received',
          'Your payment was received but the booking could not be completed. Our support team will complete the booking or process your refund.',
        );
      } else {
        Alert.alert(
          'Payment Cancelled',
          err?.description || err?.message || 'Payment flow was stopped.',
        );
      }
    } finally {
      setPaying(false);
    }
  };

  const bottomPadding = Math.max(insets.bottom, 14);

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + vs(10) }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={s(24)} color={Colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Review & Pay</Text>
        <View style={{ width: s(32) }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Trip Summary Card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryTop}>
            <View style={styles.badge}>
              <Ionicons name="bus-outline" size={s(16)} color={Colors.primary} />
              <Text style={styles.badgeText}>SCHEDULED SHUTTLE</Text>
            </View>
            <Text style={styles.routeDate}>{departureDate}</Text>
          </View>

          <Text style={styles.routeName} numberOfLines={2}>{scheduledRoute.name}</Text>

          {/* Boarding / Dropping */}
          <View style={styles.stopTimeline}>
            <View style={styles.stopRow}>
              <View style={[styles.dot, { backgroundColor: '#10B981' }]} />
              <View style={styles.stopTextCol}>
                <Text style={styles.stopLabel}>Boarding Point</Text>
                <Text style={styles.stopName} numberOfLines={2}>{boarding.name} ({boarding.time})</Text>
              </View>
            </View>

            <View style={styles.timelineLine} />

            <View style={styles.stopRow}>
              <View style={[styles.dot, { backgroundColor: Colors.primary }]} />
              <View style={styles.stopTextCol}>
                <Text style={styles.stopLabel}>Dropping Point</Text>
                <Text style={styles.stopName} numberOfLines={2}>{dropping.name} ({dropping.time})</Text>
              </View>
            </View>
          </View>

          {/* Seat details */}
          <View style={styles.seatRow}>
            <Text style={styles.seatLabel}>
              Selected Seat{seats.length > 1 ? 's' : ''}:{' '}
              <Text style={styles.seatNumbers}>{seats.join(', ')}</Text>
            </Text>
            <Text style={styles.seatCount}>{seats.length} Passenger{seats.length > 1 ? 's' : ''}</Text>
          </View>
        </View>

        {/* Payment Options Section */}
        <Text style={styles.sectionHead}>Select Payment Method</Text>

        <TouchableOpacity
          activeOpacity={0.9}
          style={[
            styles.paymentCard,
            paymentMode === 'razorpay' && styles.paymentCardActive,
          ]}
          onPress={() => setPaymentMode('razorpay')}
        >
          <View style={styles.paymentCardLeft}>
            <View style={styles.iconBox}>
              <Ionicons name="shield-checkmark" size={s(22)} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.titleRow}>
                <Text style={styles.paymentTitle}>Razorpay Online Gateway</Text>
                <View style={styles.secBadge}>
                  <Text style={styles.secBadgeText}>INSTANT</Text>
                </View>
              </View>
              <Text style={styles.paymentSub}>
                UPI (GPay, PhonePe, Paytm), Credit/Debit Cards, NetBanking
              </Text>
            </View>
          </View>
          <View style={[styles.radio, paymentMode === 'razorpay' && styles.radioActive]}>
            {paymentMode === 'razorpay' && (
              <Ionicons name="checkmark" size={s(13)} color={Colors.white} />
            )}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.9}
          style={[
            styles.paymentCard,
            paymentMode === 'wallet' && styles.paymentCardActive,
          ]}
          onPress={() => setPaymentMode('wallet')}
        >
          <View style={styles.paymentCardLeft}>
            <View style={[styles.iconBox, { backgroundColor: alpha('#10B981', 0.12) }]}>
              <Ionicons name="wallet-outline" size={s(22)} color="#10B981" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.paymentTitle}>UKCAAR Wallet</Text>
              <Text style={styles.paymentSub}>
                Available Balance: {'\u20B9'}{walletBalance}
              </Text>
            </View>
          </View>
          <View style={[styles.radio, paymentMode === 'wallet' && styles.radioActive]}>
            {paymentMode === 'wallet' && (
              <Ionicons name="checkmark" size={s(13)} color={Colors.white} />
            )}
          </View>
        </TouchableOpacity>

        {/* Fare Summary Box */}
        <View style={styles.fareBox}>
          <Text style={styles.fareTitle}>Payment Breakdown</Text>
          <View style={styles.fareRow}>
            <Text style={styles.fareText}>Fare ({seats.length} seat{seats.length > 1 ? 's' : ''})</Text>
            <Text style={styles.fareAmount}>{'\u20B9'}{total}</Text>
          </View>
          <View style={styles.fareRow}>
            <Text style={styles.fareText}>Taxes & Fees</Text>
            <Text style={[styles.fareAmount, { color: '#10B981' }]}>Included</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.fareRow}>
            <Text style={styles.totalText}>Total Payable</Text>
            <Text style={styles.totalAmount}>{'\u20B9'}{total}</Text>
          </View>
        </View>
      </ScrollView>

      {/* Footer CTA */}
      <View style={[styles.footer, { paddingBottom: bottomPadding }]}>
        <TouchableOpacity
          style={[styles.cta, paying && { opacity: 0.6 }]}
          onPress={handlePay}
          activeOpacity={0.88}
          disabled={paying}
        >
          {paying ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <View style={styles.ctaRow}>
              <Text style={styles.ctaText}>
                {paymentMode === 'razorpay'
                  ? `Pay \u20B9${total} via Razorpay`
                  : `Pay \u20B9${total} from Wallet`}
              </Text>
              <Ionicons name="arrow-forward" size={s(18)} color={Colors.white} />
            </View>
          )}
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
    paddingBottom: vs(14),
  },
  backBtn: { width: s(32), height: s(32), alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: 'Inter-SemiBold', fontSize: fs(18), color: Colors.white, flex: 1, textAlign: 'center' },

  content: { padding: s(16), paddingBottom: vs(140) },

  summaryCard: {
    backgroundColor: Colors.white,
    borderRadius: s(16),
    padding: s(16),
    marginBottom: vs(18),
    ...Shadow.sm,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: vs(8),
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(5),
    backgroundColor: alpha(Colors.primary, 0.12),
    paddingHorizontal: s(8),
    paddingVertical: vs(4),
    borderRadius: s(6),
  },
  badgeText: { fontFamily: 'Inter-Bold', fontSize: fs(11), color: Colors.primary },
  routeDate: { fontFamily: 'Inter-Medium', fontSize: fs(13), color: Colors.textMuted },
  routeName: {
    fontFamily: 'Inter-Bold',
    fontSize: fs(18),
    color: Colors.textPrimary,
    marginBottom: vs(14),
  },

  stopTimeline: {
    backgroundColor: '#F8FAFC',
    borderRadius: s(12),
    padding: s(12),
    marginBottom: vs(12),
  },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: s(10),
  },
  dot: {
    width: s(10),
    height: s(10),
    borderRadius: s(5),
    marginTop: vs(4),
  },
  timelineLine: {
    width: 2,
    height: vs(14),
    backgroundColor: Colors.border,
    marginLeft: s(4),
    marginVertical: vs(2),
  },
  stopTextCol: { flex: 1 },
  stopLabel: { fontFamily: 'Inter-Regular', fontSize: fs(11), color: Colors.textMuted },
  stopName: { fontFamily: 'Inter-SemiBold', fontSize: fs(14), color: Colors.textPrimary, flexShrink: 1 },

  seatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    paddingTop: vs(12),
  },
  seatLabel: { fontFamily: 'Inter-Medium', fontSize: fs(13), color: Colors.textMuted },
  seatNumbers: { fontFamily: 'Inter-Bold', color: Colors.textPrimary },
  seatCount: { fontFamily: 'Inter-SemiBold', fontSize: fs(13), color: Colors.primary },

  sectionHead: {
    fontFamily: 'Inter-Bold',
    fontSize: fs(16),
    color: Colors.textPrimary,
    marginBottom: vs(12),
  },

  paymentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.white,
    borderRadius: s(14),
    padding: s(14),
    marginBottom: vs(12),
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
    ...Shadow.sm,
  },
  paymentCardActive: {
    borderColor: Colors.primary,
    backgroundColor: alpha(Colors.primary, 0.03),
  },
  paymentCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(12),
    flex: 1,
  },
  iconBox: {
    width: s(42),
    height: s(42),
    borderRadius: s(12),
    backgroundColor: alpha(Colors.primary, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: s(8) },
  paymentTitle: { fontFamily: 'Inter-Bold', fontSize: fs(15), color: Colors.textPrimary },
  secBadge: {
    backgroundColor: alpha(Colors.primary, 0.15),
    paddingHorizontal: s(6),
    paddingVertical: vs(2),
    borderRadius: s(4),
  },
  secBadgeText: { fontFamily: 'Inter-Bold', fontSize: fs(9), color: Colors.primary },
  paymentSub: { fontFamily: 'Inter-Regular', fontSize: fs(12), color: Colors.textMuted, marginTop: vs(2) },

  radio: {
    width: s(22),
    height: s(22),
    borderRadius: s(11),
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: s(10),
  },
  radioActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },

  fareBox: {
    backgroundColor: Colors.white,
    borderRadius: s(14),
    padding: s(16),
    marginTop: vs(8),
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  fareTitle: { fontFamily: 'Inter-Bold', fontSize: fs(15), color: Colors.textPrimary, marginBottom: vs(10) },
  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: vs(8),
  },
  fareText: { fontFamily: 'Inter-Regular', fontSize: fs(13), color: Colors.textMuted },
  fareAmount: { fontFamily: 'Inter-SemiBold', fontSize: fs(13), color: Colors.textPrimary },
  divider: {
    height: 1,
    backgroundColor: Colors.borderLight,
    marginVertical: vs(8),
  },
  totalText: { fontFamily: 'Inter-Bold', fontSize: fs(15), color: Colors.textPrimary },
  totalAmount: { fontFamily: 'Inter-Bold', fontSize: fs(16), color: Colors.primary },

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
    borderRadius: s(12),
    height: vs(54),
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(8),
  },
  ctaText: { fontFamily: 'Inter-Bold', fontSize: fs(16), color: Colors.white },
});
