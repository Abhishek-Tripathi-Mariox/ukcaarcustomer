import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  StatusBar,
  ScrollView,
  Alert,
  ActivityIndicator,
  BackHandler,
} from 'react-native';
import RazorpayCheckout from 'react-native-razorpay';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {
  SuccessTickIcon,
  DistanceIcon,
  DurationIcon,
  GiftIcon,
} from '@/components/icons/RideCompleteIcons';
import { PaymentOptionSheet } from '@/components/PaymentOptionSheet';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { setCurrentRide } from '@/store/slices/rideSlice';
import { setWalletBalance } from '@/store/slices/appSlice';
import { rideService } from '@/services/rideService';
import { paymentService } from '@/services/paymentService';
import { fs, s, vs } from '@/theme/responsive';
import { Colors } from '@/theme';

interface RideCompleteScreenProps {
  navigation: any;
  route: {
    params: {
      rideId?: string;
      pickup: string;
      dropoff: string;
      rideType: any;
      fare?: number;
      distance?: number;
      duration?: number;
      driver: any;
    };
  };
}

export const RideCompleteScreen: React.FC<RideCompleteScreenProps> = ({
  navigation,
  route,
}) => {
  const insets = useSafeAreaInsets();
  const { fare, distance, duration, rideType, rideId } = route.params;
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [sheetOpen, setSheetOpen] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  const user = useAppSelector((s) => s.auth.user);
  const walletBalance = useAppSelector((s) => s.app.walletBalance);

  // Real fare breakdown from the persisted Ride doc (kept fresh by the
  // App-level SocketBridge). Replaces the previous hardcoded placeholders
  // so the receipt shows what the customer was actually charged.
  const currentRide = useAppSelector(s => s.ride.currentRide);
  const ride =
    currentRide && String(currentRide._id) === String(rideId) ? currentRide : null;

  // Refetch the ride doc on mount so we always render with the freshest
  // post-completion values — startedAt, completedAt, actualDuration —
  // even if the socket payload that triggered this screen was missing
  // one of them or was emitted from a path that hadn't finished saving.
  //
  // We keep polling (not a one-shot fetch) so the receipt reacts when the
  // driver swipes "Cash collected": that flips the ride's paymentStatus to
  // 'completed' on the server, but the socket push only reaches us when our
  // socket sits on the same backend instance that handled it. In a split /
  // multi-instance deployment it never arrives — which is the "driver marked
  // cash collected but nothing updates on the rider side" bug. Once the DB
  // shows the ride paid, we forward to the success screen automatically.
  const dispatch = useAppDispatch();
  const paidNavRef = useRef(false);
  useEffect(() => {
    if (!rideId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const fresh: any = await rideService.getRide(rideId);
        if (cancelled || !fresh) return;
        dispatch(setCurrentRide(fresh));
        // Payment settled server-side (cash-collected by the driver, or an
        // online payment verified elsewhere). Only auto-advance if the rider
        // isn't mid-checkout of their own — otherwise let their flow finish.
        if (
          fresh.paymentStatus === 'completed' &&
          !paidNavRef.current &&
          !processingPayment &&
          !sheetOpen
        ) {
          paidNavRef.current = true;
          navigation.replace('PaymentSuccess', {
            amount: n(fresh.actualFare ?? fresh.estimatedFare ?? fare, 0),
            method: fresh.paymentMethod ?? 'cash',
            rideId,
          });
        }
      } catch {
        /* keep whatever Redux already has; next tick retries */
      }
    };
    tick();
    const id = setInterval(tick, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [rideId, dispatch, navigation, fare, processingPayment, sheetOpen]);

  // Prefer the backend's actual values (set on completion). Fall back to
  // estimate fields, then to route params, then to defaults. Every numeric
  // field is coerced to a real number so the |0 fallback below doesn't
  // round string concatenations like "49.00".
  const n = (v: any, fallback = 0): number => {
    const x = typeof v === 'number' ? v : parseFloat(v);
    return Number.isFinite(x) ? x : fallback;
  };
  const baseFare = n(ride?.baseFare, 0);
  const distanceCharge = n(ride?.distanceFare, 0);
  const timeCharge = n(ride?.timeFare, 0);
  const surgeCharge = n((ride as any)?.surgeFare, 0);
  const discount = n(ride?.discount, 0);
  const tip = n((ride as any)?.tip, 0);
  const totalFare = n(
    ride?.actualFare ?? ride?.estimatedFare ?? fare,
    baseFare + distanceCharge + timeCharge + surgeCharge - discount + tip,
  );
  const tripDistance = n(ride?.actualDistance ?? ride?.estimatedDistance ?? distance, 0);

  // Pickup / drop-off timestamps from the backend. startedAt is set when
  // the driver verifies the pickup OTP; completedAt when the driver ends
  // the trip. Both are strings on the slice (Redux serializes Dates to
  // ISO) so we parse them once here.
  const startedAt = (ride as any)?.startedAt
    ? new Date((ride as any).startedAt)
    : null;
  const completedAt = (ride as any)?.completedAt
    ? new Date((ride as any).completedAt)
    : null;

  // Prefer real elapsed time between OTP-verify and ride-end so the
  // duration line matches the start/end timestamps shown next to it.
  // Falls back to actualDuration (backend-computed) → estimate → param.
  const elapsedMinutesFromTimestamps =
    startedAt && completedAt
      ? Math.max(1, Math.round((completedAt.getTime() - startedAt.getTime()) / 60000))
      : null;
  const tripDuration = n(
    elapsedMinutesFromTimestamps ??
      (ride as any)?.actualDuration ??
      ride?.estimatedDuration ??
      duration,
    0,
  );

  const formatTime = (d: Date | null): string => {
    if (!d) return '—';
    try {
      return d.toLocaleTimeString('en-IN', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return '—';
    }
  };

  // While a Razorpay flow is in-flight we don't want a back press to drop
  // the rider on a stale in-trip screen — but we DO want a back press to
  // be able to dismiss our own processing overlay if the SDK is being slow
  // to surface the cancel event (a known issue when GPay is launched from
  // inside the Razorpay sheet and the user presses back).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (processingPayment) {
        setProcessingPayment(false);
        return true;
      }
      if (sheetOpen) {
        setSheetOpen(false);
        return true;
      }
      // Block back navigation entirely — RideComplete is terminal; the
      // user should explicitly tap Pay / Cash / a navigation action to
      // leave it. Returning true swallows the back press.
      return true;
    });
    return () => sub.remove();
  }, [processingPayment, sheetOpen]);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleProceedToPayment = () => {
    setSheetOpen(true);
  };

  // Razorpay checkout for a ride bill. Creates the order on the backend,
  // pops the SDK, and on success the verify endpoint marks the ride
  // paymentStatus=completed (see paymentController.verifyPayment).
  const payWithRazorpay = async () => {
    if (!rideId) return;
    setProcessingPayment(true);
    try {
      const orderRes = await paymentService.createOrder({
        amount: totalFare,
        type: 'ride_payment',
        rideId,
      });
      if (!orderRes.success) {
        Alert.alert('Error', 'Failed to create payment order');
        return;
      }
      const { orderId, keyId, currency } = orderRes.data;
      const options = {
        description: `UKCAAR ride payment`,
        image: 'https://ukcar.s3.ap-south-1.amazonaws.com/logo.png',
        currency,
        key: keyId,
        amount: Math.round(totalFare * 100).toString(),
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
      const verifyRes = await paymentService.verifyPayment({
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentData.razorpay_payment_id,
        razorpay_signature: paymentData.razorpay_signature,
      });
      if (verifyRes.success) {
        navigation.replace('PaymentSuccess', {
          amount: totalFare,
          method: 'razorpay',
          rideId,
        });
      } else {
        Alert.alert('Payment failed', 'Could not verify the payment.');
      }
    } catch (err: any) {
      // Razorpay returns code 2 when the user dismisses the sheet —
      // suppress the error toast for that path.
      if (err?.code !== 2) {
        Alert.alert(
          'Payment failed',
          err?.description || err?.message || 'Something went wrong',
        );
      }
    } finally {
      setProcessingPayment(false);
    }
  };

  // Debit the rider's wallet for the ride. Backend rejects with 400 if
  // the balance is short — fall through to Razorpay in that case so the
  // user isn't dead-ended.
  const payWithWallet = async () => {
    if (!rideId) return;
    setProcessingPayment(true);
    try {
      const res: any = await paymentService.payRideFromWallet(rideId);
      if (res?.success) {
        const newBalance = Number(res.data?.wallet?.balance);
        if (Number.isFinite(newBalance)) dispatch(setWalletBalance(newBalance));
        navigation.replace('PaymentSuccess', {
          amount: totalFare,
          method: 'wallet',
          rideId,
        });
      } else {
        Alert.alert('Payment failed', res?.message || 'Could not debit wallet');
      }
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Could not debit wallet';
      const insufficient = /insufficient/i.test(msg);
      if (insufficient) {
        Alert.alert(
          'Insufficient wallet balance',
          'We will switch to online payment for the remaining amount.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Pay online', onPress: payWithRazorpay },
          ],
        );
      } else {
        Alert.alert('Payment failed', msg);
      }
    } finally {
      setProcessingPayment(false);
    }
  };

  const handleConfirmPayment = (methodId: string) => {
    setSheetOpen(false);
    if (methodId === 'wallet') {
      payWithWallet();
      return;
    }
    if (methodId === 'cash') {
      // Cash to driver — backend already records the ride as paymentMethod
      // 'cash' at creation if the customer picked it; here we just close
      // the screen with an acknowledgement.
      navigation.replace('PaymentSuccess', {
        amount: totalFare,
        method: 'cash',
        rideId,
      });
      return;
    }
    // Everything else — razorpay, gpay, paytm, mastercard, phonepe,
    // mobikwik, cred — funnels through the same Razorpay checkout. The
    // user can pick the actual instrument inside the Razorpay sheet.
    payWithRazorpay();
  };

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header — Success Icon + Text */}
        <Animated.View
          style={[
            styles.header,
            { transform: [{ scale: scaleAnim }], opacity: fadeAnim },
          ]}
        >
          <SuccessTickIcon size={89} />
          <View style={styles.headerText}>
            <Text style={styles.title}>Ride Complete!</Text>
            <Text style={styles.subtitle}>Hope you had a great ride</Text>
          </View>
        </Animated.View>

        {/* Fare Summary Card */}
        <View style={styles.fareCard}>
          <Text style={styles.fareTitle}>Fare Summary</Text>

          {/* Distance row */}
          <View style={styles.metricRow}>
            <DistanceIcon size={20} color="#45474A" />
            <View style={styles.metricText}>
              <Text style={styles.metricLabel}>Distance</Text>
              <Text style={styles.metricValue}>{tripDistance.toFixed(1)} Km</Text>
            </View>
          </View>

          {/* Duration row */}
          <View style={[styles.metricRow, { marginTop: 14 }]}>
            <DurationIcon size={21} color="#45474A" />
            <View style={styles.metricText}>
              <Text style={styles.metricLabel}>Duration</Text>
              <Text style={styles.metricValue}>
                {Math.round(tripDuration)} minutes
              </Text>
            </View>
          </View>

          {/* Ride start / end timestamps — only shown when the backend has
              real values (so we don't render '—' rows for legacy rides). */}
          {(startedAt || completedAt) && (
            <View style={styles.timesRow}>
              {startedAt && (
                <View style={styles.timeCell}>
                  <View style={styles.timeHeader}>
                    <Ionicons name="play-circle-outline" size={14} color="#0097B3" />
                    <Text style={styles.timeLabel}>Ride started</Text>
                  </View>
                  <Text style={styles.timeValue}>{formatTime(startedAt)}</Text>
                </View>
              )}
              {startedAt && completedAt && <View style={styles.timeDivider} />}
              {completedAt && (
                <View style={styles.timeCell}>
                  <View style={styles.timeHeader}>
                    <Ionicons name="flag-outline" size={14} color="#15803D" />
                    <Text style={styles.timeLabel}>Ride ended</Text>
                  </View>
                  <Text style={styles.timeValue}>{formatTime(completedAt)}</Text>
                </View>
              )}
            </View>
          )}

          {!!rideType?.name && (
            <Text style={styles.vehicleLabel}>{rideType.name}</Text>
          )}

          <View style={styles.divider} />

          {/* Fare breakdown \u2014 only render rows that have a non-zero value
              so admins who configure only some fields (e.g. perKm only)
              don't see \u20B90.00 lines on the receipt. Base fare and time
              charge follow the same rule as the rest of the breakdown. */}
          {baseFare > 0 && (
            <View style={styles.chargeRow}>
              <Text style={styles.chargeLabel}>Base Fare</Text>
              <Text style={styles.chargeValue}>
                {'\u20B9'}
                {baseFare.toFixed(2)}
              </Text>
            </View>
          )}

          {distanceCharge > 0 && (
            <View style={[styles.chargeRow, { marginTop: baseFare > 0 ? 8 : 0 }]}>
              <Text style={styles.chargeLabel}>Distance Charge</Text>
              <Text style={styles.chargeValue}>
                {'\u20B9'}
                {distanceCharge.toFixed(2)}
              </Text>
            </View>
          )}

          {timeCharge > 0 && (
            <View style={[styles.chargeRow, { marginTop: 8 }]}>
              <Text style={styles.chargeLabel}>Time Charge</Text>
              <Text style={styles.chargeValue}>
                {'\u20B9'}
                {timeCharge.toFixed(2)}
              </Text>
            </View>
          )}

          {surgeCharge > 0 && (
            <View style={[styles.chargeRow, { marginTop: 8 }]}>
              <Text style={[styles.chargeLabel, { color: '#FF6B00' }]}>Surge</Text>
              <Text style={[styles.chargeValue, { color: '#FF6B00' }]}>
                {'\u20B9'}
                {surgeCharge.toFixed(2)}
              </Text>
            </View>
          )}

          {tip > 0 && (
            <View style={[styles.chargeRow, { marginTop: 8 }]}>
              <Text style={styles.chargeLabel}>Tip</Text>
              <Text style={styles.chargeValue}>
                {'\u20B9'}
                {tip.toFixed(2)}
              </Text>
            </View>
          )}

          {discount > 0 && (
            <View style={[styles.chargeRow, { marginTop: 8 }]}>
              <Text style={[styles.chargeLabel, { color: '#15803D' }]}>Discount</Text>
              <Text style={[styles.chargeValue, { color: '#15803D' }]}>
                -{'\u20B9'}
                {discount.toFixed(2)}
              </Text>
            </View>
          )}

          <View style={styles.totalDivider} />

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>
              {'\u20B9'}
              {totalFare.toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Proceed to Payment */}
        <TouchableOpacity
          style={styles.payButton}
          onPress={handleProceedToPayment}
          activeOpacity={0.85}
        >
          <Text style={styles.payButtonText}>Proceed to Payment</Text>
        </TouchableOpacity>

        {/* MetroPoints card */}
        <View style={styles.metroCard}>
          <View style={styles.metroRow}>
            <GiftIcon size={21} color="#212020" />
            <Text style={styles.metroText}>You earned +20 MetroPoints </Text>
          </View>
          <Text style={styles.metroTotal}>
            Total : <Text style={styles.metroLink}>120 MetroPoints</Text>
          </Text>
        </View>
      </ScrollView>

      <PaymentOptionSheet
        visible={sheetOpen}
        amount={totalFare}
        onClose={() => setSheetOpen(false)}
        onConfirm={handleConfirmPayment}
      />

      {processingPayment && (
        <View style={styles.processingOverlay} pointerEvents="auto">
          <View style={styles.processingCard}>
            <ActivityIndicator size="large" color="#0097B3" />
            <Text style={styles.processingText}>Processing payment…</Text>
            <Text style={styles.processingHint}>
              Complete the payment in the Razorpay window. If you backed out
              of the payment screen, tap below.
            </Text>
            <TouchableOpacity
              style={styles.processingCancel}
              onPress={() => setProcessingPayment(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.processingCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  content: {
    paddingHorizontal: s(16),
    paddingBottom: vs(40),
    alignItems: 'center',
  },
  header: {
    width: s(345),
    alignItems: 'center',
    marginBottom: vs(34),
  },
  headerText: {
    marginTop: vs(16),
    alignItems: 'center',
  },
  title: {
    fontFamily: 'Inter-Bold',
    fontSize: fs(20),
    lineHeight: fs(28),
    color: '#1E293B',
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(14),
    lineHeight: fs(22),
    color: '#2A2A2A',
    textAlign: 'center',
    marginTop: vs(6),
  },
  fareCard: {
    width: s(347),
    backgroundColor: Colors.white,
    borderRadius: s(19),
    paddingHorizontal: s(22),
    paddingTop: vs(22),
    paddingBottom: vs(24),
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
    marginBottom: vs(34),
  },
  fareTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(22),
    color: '#45474A',
    marginBottom: vs(24),
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metricText: {
    marginLeft: s(14),
  },
  metricLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(14),
    color: '#45474A',
    opacity: 0.5,
    lineHeight: fs(20),
  },
  metricValue: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(18),
    color: '#45474A',
    lineHeight: fs(24),
    marginTop: vs(2),
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E5E5',
    marginTop: vs(18),
    marginBottom: vs(18),
  },
  timesRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: '#F8F9FB',
    borderRadius: s(12),
    paddingVertical: vs(12),
    paddingHorizontal: s(14),
    marginTop: vs(16),
  },
  timeCell: {
    flex: 1,
  },
  timeDivider: {
    width: 1,
    backgroundColor: '#E5E7EB',
    marginHorizontal: s(12),
  },
  timeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(6),
    marginBottom: vs(4),
  },
  timeLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(12),
    color: '#6A7282',
  },
  timeValue: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(15),
    color: '#101828',
  },
  vehicleLabel: {
    marginTop: vs(14),
    fontFamily: 'Inter-Medium',
    fontSize: fs(13),
    color: '#7D8A95',
  },
  chargeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chargeLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: fs(16),
    color: '#45474A',
  },
  chargeValue: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(16),
    color: '#45474A',
  },
  totalDivider: {
    height: 1,
    backgroundColor: '#E5E5E5',
    marginTop: vs(18),
    marginBottom: vs(14),
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(24),
    color: '#45474A',
  },
  totalValue: {
    fontFamily: 'Inter-Bold',
    fontSize: fs(24),
    color: '#45474A',
  },
  payButton: {
    width: s(348),
    height: vs(62),
    backgroundColor: Colors.primary,
    borderRadius: s(13),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: vs(34),
  },
  payButtonText: {
    fontFamily: 'Inter-Bold',
    fontSize: fs(16),
    color: Colors.white,
  },
  metroCard: {
    width: s(356),
    backgroundColor: Colors.white,
    borderRadius: s(8),
    paddingHorizontal: s(24),
    paddingVertical: vs(14),
    alignItems: 'center',
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  metroRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metroText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(18),
    color: '#212020',
    marginLeft: s(10),
  },
  metroTotal: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(14),
    color: '#212020',
    marginTop: vs(4),
  },
  metroLink: {
    color: '#015EA3',
    fontFamily: 'Inter-Regular',
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: s(32),
  },
  processingCard: {
    width: '100%',
    backgroundColor: Colors.white,
    borderRadius: s(16),
    paddingVertical: vs(28),
    paddingHorizontal: s(22),
    alignItems: 'center',
    shadowColor: Colors.black,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  processingText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(17),
    color: '#101828',
    marginTop: vs(14),
  },
  processingHint: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(13),
    color: '#6A7282',
    textAlign: 'center',
    marginTop: vs(8),
    lineHeight: fs(18),
  },
  processingCancel: {
    marginTop: vs(16),
    paddingHorizontal: s(28),
    paddingVertical: vs(10),
    borderRadius: s(10),
    borderWidth: 1.4,
    borderColor: Colors.error,
  },
  processingCancelText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(14),
    color: Colors.error,
  },
});
