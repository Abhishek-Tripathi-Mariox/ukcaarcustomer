import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RazorpayCheckout from 'react-native-razorpay';
import { Colors, Shadow } from '@/theme';
import type { ScheduledRoute } from './ScheduledRouteScreen';
import type { Passenger } from './ScheduledPassengerDetailsScreen';
import { routeService, type RouteVehicle } from '@/services/routeService';
import { paymentService } from '@/services/paymentService';
import { useAppSelector } from '@/store/hooks';

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
      total: number;
      departureDate: string;
      departureIndex: number;
      driverId: string;
      vehicle: RouteVehicle;
      returnDeparture?: { time: string };
    };
  };
}

const gpay = require('../../../assets/payment-option/gpay.png');
const paytm = require('../../../assets/payment-option/paytm.png');
const mastercard = require('../../../assets/payment-option/mastercard.png');
const phonepe = require('../../../assets/payment-option/phonepe.png');
const mobikwik = require('../../../assets/payment-option/mobikwik.png');
const cred = require('../../../assets/payment-option/cred.png');

interface PaymentOption {
  id: string;
  label: string;
  icon: any;
  amount: number;
  meta?: string;
  secured?: boolean;
}

export const ScheduledPaymentScreen: React.FC<Props> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
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
  const [selected, setSelected] = useState<string>('gpay');
  const [paying, setPaying] = useState(false);
  const user = useAppSelector((s) => s.auth.user);

  const preferredOptions: PaymentOption[] = [
    { id: 'gpay', label: 'Google Pay', icon: gpay, amount: total },
    { id: 'paytm', label: 'Paytm', icon: paytm, amount: 145 },
    { id: 'mastercard', label: '· · · ·  9999', icon: mastercard, amount: 145, secured: true },
  ];

  const upiOptions: PaymentOption[] = [
    { id: 'phonepe', label: 'PhonePe UPI', icon: phonepe, amount: 0, meta: 'Low success rate currently' },
    { id: 'mobikwik', label: 'Mobikwik', icon: mobikwik, amount: 0 },
    { id: 'cred', label: 'CRED pay', icon: cred, amount: 0 },
  ];

  // Razorpay checkout for the scheduled seat reservation. Mirrors the
  // instant ride-payment flow exactly (see RideCompleteScreen.payWithRazorpay):
  //   1. createOrder({ type:'scheduled_booking', amount, scheduledRouteId })
  //   2. RazorpayCheckout.open(...)
  //   3. verifyPayment({ order_id, payment_id, signature })
  //   4. Only after the payment is verified, atomically reserve the seats
  //      via routeService.bookSeats. If seats are 409'd at that point,
  //      surface the conflict so the rider can pick again — the rider's
  //      payment is already on record under their Payment row and can be
  //      refunded out-of-band by admin (rare race, sub-second window).
  const handlePay = async () => {
    if (paying) return;
    setPaying(true);
    try {
      const orderRes = await paymentService.createOrder({
        amount: total,
        type: 'scheduled_booking',
        // Tag the order with the route so admins can reconcile in the
        // Razorpay dashboard if anything ever lands without a booking.
        scheduledRouteId: scheduledRoute.id,
      });
      if (!orderRes.success) {
        Alert.alert('Error', 'Failed to create payment order');
        return;
      }
      const { orderId, keyId, currency } = orderRes.data;

      const options = {
        description: `${scheduledRoute.name} • ${seats.length} seat${seats.length > 1 ? 's' : ''}`,
        image: 'https://ukcaar.s3.amazonaws.com/logo.png',
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

      const verifyRes = await paymentService.verifyPayment({
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentData.razorpay_payment_id,
        razorpay_signature: paymentData.razorpay_signature,
      });

      if (!verifyRes.success) {
        Alert.alert('Payment failed', 'Could not verify the payment.');
        return;
      }

      // Payment captured & verified — atomically reserve seats now.
      try {
        const booked = await routeService.bookSeats(scheduledRoute.id, {
          departureDate,
          departureIndex,
          driverId,
          seats,
          totalAmount: total,
          passengers,
        });
        const bookingId = booked?.booking?._id ?? booked?.booking?.id;
        // Move straight to the Booking Confirmed screen — same pattern as the
        // instant ride flow (RideComplete → PaymentSuccess). No success modal
        // to dismiss, so the flow can't dead-end on the payment screen.
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
            'Seats just got taken',
            conflicts.length
              ? `Seat${conflicts.length > 1 ? 's' : ''} ${conflicts.join(', ')} ${
                  conflicts.length > 1 ? 'were' : 'was'
                } reserved by another rider in the last moment. Your payment is on file — contact support for a refund or pick different seats.`
              : 'Some of your seats were just reserved by another rider. Contact support to refund or pick again.',
            [{ text: 'Pick again', onPress: () => navigation.goBack() }],
          );
        } else {
          Alert.alert(
            'Booking failed',
            bd?.message ||
              bookErr?.message ||
              'Payment went through but we couldn\'t reserve the seats. Please contact support.',
          );
        }
      }
    } catch (err: any) {
      // Razorpay returns code 2 when the user dismisses the sheet —
      // suppress the error toast for that path (same as instant flow).
      if (err?.code !== 2) {
        Alert.alert(
          'Payment failed',
          err?.description || err?.message || 'Something went wrong',
        );
      }
    } finally {
      setPaying(false);
    }
  };

  const renderOption = (opt: PaymentOption) => {
    const isSelected = opt.id === selected;
    return (
      <TouchableOpacity
        key={opt.id}
        activeOpacity={0.85}
        onPress={() => setSelected(opt.id)}
        style={styles.optionRow}
      >
        <View style={styles.optionLeft}>
          <Image source={opt.icon} style={styles.optionIcon} resizeMode="contain" />
          <View style={{ flex: 1 }}>
            <Text style={styles.optionLabel}>{opt.label}</Text>
            {opt.meta && <Text style={styles.optionMeta}>{opt.meta}</Text>}
          </View>
        </View>
        {opt.amount > 0 && (
          <Text style={styles.optionAmount}>{'\u20B9'}{opt.amount}</Text>
        )}
        {opt.secured && (
          <View style={styles.securedBadge}>
            <Ionicons name="shield-checkmark" size={10} color={Colors.primary} />
            <Text style={styles.securedText}>Secured</Text>
          </View>
        )}
        <View style={[styles.radio, isSelected && styles.radioActive]}>
          {isSelected && <Ionicons name="checkmark" size={12} color={Colors.white} />}
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
        <Text style={styles.headerTitle}>Fare Summary</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionHead}>Preferred Mode</Text>
        <View style={styles.card}>
          {preferredOptions.map((o, i) => (
            <View key={o.id}>
              {renderOption(o)}
              {o.id === 'gpay' && selected === 'gpay' && (
                <TouchableOpacity style={styles.payViaBtn} onPress={handlePay} activeOpacity={0.85}>
                  <Text style={styles.payViaText}>Pay using Google Pay</Text>
                </TouchableOpacity>
              )}
              {i < preferredOptions.length - 1 && <View style={styles.optionDivider} />}
            </View>
          ))}
        </View>

        <Text style={styles.sectionHead}>UPI</Text>
        <View style={styles.card}>
          {upiOptions.map((o, i) => (
            <View key={o.id}>
              {renderOption(o)}
              {i < upiOptions.length - 1 && <View style={styles.optionDivider} />}
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.cta, paying && { opacity: 0.6 }]}
          onPress={handlePay}
          activeOpacity={0.85}
          disabled={paying}
        >
          {paying ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.ctaText}>Confirm & Pay</Text>
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
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: 'Inter-SemiBold', fontSize: 18, color: Colors.white, flex: 1, textAlign: 'center' },

  content: { padding: 16, paddingBottom: 120 },
  sectionHead: {
    fontFamily: 'Inter-Bold',
    fontSize: 16,
    color: Colors.textPrimary,
    marginBottom: 10,
    marginTop: 6,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    paddingHorizontal: 14,
    marginBottom: 18,
    ...Shadow.sm,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 10,
  },
  optionLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  optionIcon: { width: 32, height: 32 },
  optionLabel: { fontFamily: 'Inter-SemiBold', fontSize: 15, color: Colors.textPrimary },
  optionMeta: { fontFamily: 'Inter-Regular', fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  optionAmount: { fontFamily: 'Inter-SemiBold', fontSize: 14, color: Colors.textPrimary },
  securedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0, 151, 179, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  securedText: { fontFamily: 'Inter-Medium', fontSize: 10, color: Colors.primary },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  optionDivider: { height: 1, backgroundColor: Colors.borderLight },

  payViaBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
    marginHorizontal: 32,
  },
  payViaText: { fontFamily: 'Inter-SemiBold', fontSize: 14, color: Colors.white },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
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

  /* ── Success Modal ── */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  successCard: {
    width: '100%',
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 28,
    alignItems: 'center',
  },
  closeBtn: { position: 'absolute', top: 14, right: 14, padding: 4 },
  successIconOuter: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(0, 151, 179, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  successIconInner: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: 20,
    color: Colors.primary,
    marginTop: 18,
  },
  successAmount: {
    fontFamily: 'Inter-Bold',
    fontSize: 24,
    color: Colors.textPrimary,
    marginTop: 8,
  },
  successDate: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: Colors.textPrimary,
    marginTop: 12,
  },
  successTax: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 4,
  },
  viewTicketBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 50,
    marginTop: 18,
  },
  viewTicketText: { fontFamily: 'Inter-SemiBold', fontSize: 15, color: Colors.white },
});
