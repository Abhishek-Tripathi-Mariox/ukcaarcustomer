import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import RazorpayCheckout from 'react-native-razorpay';
import { MerchantCarIcon } from '@/components/icons/MerchantCarIcon';
import { PaymentSuccessModal } from '@/components/PaymentSuccessModal';
import { Alert } from 'react-native';
import { paymentService } from '@/services/paymentService';
import { useAppSelector } from '@/store/hooks';

interface UpiPaymentScreenProps {
  navigation: any;
  route: {
    params: {
      amount: number;
      method?: string;
      rideId?: string;
      orderId?: string;
    };
  };
}

export const UpiPaymentScreen: React.FC<UpiPaymentScreenProps> = ({
  navigation,
  route,
}) => {
  const insets = useSafeAreaInsets();
  const { amount, rideId, orderId } = route.params;
  const { user } = useAppSelector((state) => state.auth);
  const [paying, setPaying] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);

  const formattedAmount = amount.toFixed(2);
  const displayOrderId = orderId || `UKCAAR Order ${Date.now().toString().slice(-12)}`;

  // Real charge via Razorpay (its sheet handles the UPI flow natively). No
  // more fake setTimeout success — the backend HMAC-verifies the payment.
  const handlePay = async () => {
    setPaying(true);
    try {
      const orderRes = await paymentService.createOrder({
        amount,
        type: 'ride_payment',
        ...(rideId ? { rideId } : {}),
        methodPreference: 'upi',
      });
      if (!orderRes.success) {
        Alert.alert('Error', 'Failed to create payment order');
        return;
      }
      const { orderId: rzpOrderId, keyId, currency, amount: orderAmount } = orderRes.data;

      const paymentData = await RazorpayCheckout.open({
        description: 'UKCAAR Ride Payment',
        currency,
        key: keyId,
        amount: String(orderAmount),
        name: 'UKCAAR',
        order_id: rzpOrderId,
        prefill: {
          name: user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() : '',
          contact: user?.phone || '',
          email: user?.email || '',
        },
        theme: { color: '#0097B3' },
      } as any);

      const verifyRes = await paymentService.verifyPayment({
        razorpay_order_id: rzpOrderId,
        razorpay_payment_id: paymentData.razorpay_payment_id,
        razorpay_signature: paymentData.razorpay_signature,
      });

      if (verifyRes.success) {
        setSuccessVisible(true);
      } else {
        Alert.alert('Failed', 'Payment could not be verified.');
      }
    } catch (err: any) {
      if (err?.code !== 2 && err?.code !== '2') {
        Alert.alert('Payment Failed', err?.description || err?.message || 'Something went wrong');
      }
    } finally {
      setPaying(false);
    }
  };

  const handleRateDriver = () => {
    setSuccessVisible(false);
    navigation.replace('PaymentSuccess', {
      amount: `\u20B9${amount}`,
      method: 'UPI - Axis Bank',
      transactionId: `UKR${Date.now()}`,
      rideId,
      openRating: true,
    });
  };

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      <View style={[styles.content, { paddingTop: insets.top + 40 }]}>
        {/* Merchant logo — teal circle with car/gear */}
        <View style={styles.merchantCircle}>
          <MerchantCarIcon size={64} />
        </View>

        <Text style={styles.merchantName}>UKCAAR</Text>
        <Text style={styles.merchantHandle}>kebucaar@axisbank</Text>

        <Text style={styles.amount}>
          <Text style={styles.rupee}>{'\u20B9'}</Text>
          {formattedAmount}
        </Text>

        <View style={styles.orderPill}>
          <Text style={styles.orderText}>{displayOrderId}</Text>
        </View>
      </View>

      {/* Bottom account selector + Pay button */}
      <View style={[styles.bottomSection, { paddingBottom: insets.bottom + 16 }]}>
        <Text style={styles.chooseLabel}>CHOOSE ACCOUNT OR CARD TO PAY WITH</Text>

        <TouchableOpacity style={styles.accountRow} activeOpacity={0.7}>
          <View style={styles.bankLogoBox}>
            <Image
              source={require('../../../assets/payment-upi/axis-bank.png')}
              style={styles.bankLogo}
              resizeMode="contain"
            />
          </View>
          <View style={styles.accountInfo}>
            <Text style={styles.accountName}>
              Axis Bank{'  '}
              <Text style={styles.accountMask}>{'\u2022 \u2022 \u2022 \u2022 9999'}</Text>
            </Text>
            <Text style={styles.accountUpi}>9976567788@okaxis</Text>
          </View>
          <Ionicons name="chevron-down" size={22} color="#5D6166" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.payButton}
          onPress={handlePay}
          disabled={paying}
          activeOpacity={0.85}
        >
          {paying ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.payButtonText}>
              Pay {'\u20B9'}
              {amount}
            </Text>
          )}
        </TouchableOpacity>

        <View style={styles.poweredByRow}>
          <Text style={styles.poweredByText}>POWERED BY </Text>
          <Text style={styles.upiText}>UPI</Text>
          <Text style={styles.poweredByText}>{'  |  '}</Text>
          <Text style={styles.bankText}>AXIS BANK</Text>
        </View>
      </View>

      <PaymentSuccessModal
        visible={successVisible}
        amount={amount}
        onRateDriver={handleRateDriver}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  merchantCircle: {
    width: 117,
    height: 117,
    borderRadius: 58.5,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: '#0097B3',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  merchantName: {
    fontFamily: 'Inter-Medium',
    fontSize: 19,
    lineHeight: 24,
    color: '#35393C',
    letterSpacing: -0.25,
  },
  merchantHandle: {
    fontFamily: 'Inter-Medium',
    fontSize: 17,
    lineHeight: 22,
    color: '#35393C',
    opacity: 0.8,
    marginTop: 6,
    letterSpacing: -0.25,
  },
  amount: {
    fontFamily: 'Inter-Medium',
    fontSize: 52,
    lineHeight: 64,
    color: '#35393C',
    marginTop: 30,
    letterSpacing: -1,
  },
  rupee: {
    fontFamily: 'Inter-Medium',
    fontSize: 52,
  },
  orderPill: {
    backgroundColor: '#E8F0FE',
    borderRadius: 8.5,
    paddingHorizontal: 20,
    paddingVertical: 14,
    marginTop: 22,
  },
  orderText: {
    fontFamily: 'Inter-Medium',
    fontSize: 17,
    lineHeight: 21,
    color: '#393D40',
    opacity: 0.8,
    textAlign: 'center',
    letterSpacing: -0.25,
  },
  bottomSection: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    paddingTop: 18,
    paddingHorizontal: 17,
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
  },
  chooseLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    color: '#5D6166',
    letterSpacing: 0.5,
    marginBottom: 12,
    paddingLeft: 4,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  bankLogoBox: {
    width: 53,
    height: 36,
    borderWidth: 0.5,
    borderColor: '#E0E0E0',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  bankLogo: {
    width: 44,
    height: 28,
  },
  accountInfo: {
    flex: 1,
    marginLeft: 14,
  },
  accountName: {
    fontFamily: 'Inter-Medium',
    fontSize: 17,
    color: '#3C4043',
    letterSpacing: -0.25,
  },
  accountMask: {
    fontFamily: 'Inter-Medium',
    fontSize: 17,
    color: '#3C4043',
  },
  accountUpi: {
    fontFamily: 'Inter-Regular',
    fontSize: 12.7,
    color: '#5D6166',
    marginTop: 2,
    letterSpacing: -0.25,
  },
  payButton: {
    height: 48,
    backgroundColor: '#0097B3',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  payButtonText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    lineHeight: 24,
    color: '#FFFFFF',
  },
  poweredByRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  poweredByText: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    color: '#5D6166',
    letterSpacing: 0.5,
  },
  upiText: {
    fontFamily: 'Inter-Bold',
    fontSize: 12,
    color: '#0097B3',
    letterSpacing: 0.5,
  },
  bankText: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    color: '#5D6166',
    letterSpacing: 0.5,
  },
});
