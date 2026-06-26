import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Image,
  Pressable,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CheckCircleIcon,
  EmptyCircleIcon,
  SecuredShieldIcon,
} from './icons/PaymentOptionIcons';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { setWalletBalance } from '@/store/slices/appSlice';
import { paymentService } from '@/services/paymentService';

interface PaymentOptionSheetProps {
  visible: boolean;
  amount: number;
  onClose: () => void;
  onConfirm: (methodId: string) => void;
}

type MethodId =
  | 'wallet'
  | 'razorpay'
  | 'gpay'
  | 'paytm'
  | 'mastercard'
  | 'phonepe'
  | 'mobikwik'
  | 'cred'
  | 'cash';

interface MethodMeta {
  id: MethodId;
  label: string;
  source: any;
  subtitle?: string;
  badge?: 'secured' | null;
}

const PREFERRED: MethodMeta[] = [
  { id: 'gpay', label: 'Google Pay', source: require('../../assets/payment-option/gpay.png') },
  { id: 'paytm', label: 'Paytm', source: require('../../assets/payment-option/paytm.png') },
  {
    id: 'mastercard',
    label: '\u2022 \u2022 \u2022 \u2022  9999',
    source: require('../../assets/payment-option/mastercard.png'),
    badge: 'secured',
  },
];

const UPI: MethodMeta[] = [
  {
    id: 'phonepe',
    label: 'PhonePe UPI',
    source: require('../../assets/payment-option/phonepe.png'),
    subtitle: 'Low success rate currently',
  },
  { id: 'mobikwik', label: 'Mobikwik', source: require('../../assets/payment-option/mobikwik.png') },
  { id: 'cred', label: 'CRED pay', source: require('../../assets/payment-option/cred.png') },
];

export const PaymentOptionSheet: React.FC<PaymentOptionSheetProps> = ({
  visible,
  amount,
  onClose,
  onConfirm,
}) => {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const walletBalance = useAppSelector((s) => s.app.walletBalance);
  // Wallet is the preferred option whenever the rider has enough to cover
  // the ride; otherwise fall back to Razorpay (online checkout). The "gpay
  // quick-pay" button above also routes through Razorpay so we don't need a
  // separate code path for it.
  const walletCovers = walletBalance >= amount;
  const [selected, setSelected] = useState<MethodId>(walletCovers ? 'wallet' : 'razorpay');

  // Refresh wallet balance every time the sheet becomes visible so a
  // top-up done minutes ago is reflected here without remounting the app.
  useEffect(() => {
    if (!visible) return;
    paymentService
      .getWallet()
      .then((res: any) => {
        const bal = Number(res?.data?.wallet?.balance ?? 0);
        if (Number.isFinite(bal)) dispatch(setWalletBalance(bal));
      })
      .catch(() => {
        /* keep whatever Redux has */
      });
  }, [visible, dispatch]);

  // Re-pick a sensible default whenever the amount or balance shifts and
  // changes which option is viable — but only if the user hasn't already
  // picked something else manually for this sheet session.
  useEffect(() => {
    if (!visible) return;
    setSelected((prev) => {
      if (prev === 'wallet' && !walletCovers) return 'razorpay';
      if (prev === 'razorpay' && walletCovers) return 'wallet';
      return prev;
    });
  }, [visible, walletCovers]);

  const renderMethod = (m: MethodMeta) => {
    const isSelected = selected === m.id;
    return (
      <Pressable
        key={m.id}
        style={styles.methodRow}
        onPress={() => setSelected(m.id)}
      >
        <View style={styles.logoBox}>
          <Image source={m.source} style={styles.logoImage} resizeMode="contain" />
        </View>

        <View style={styles.methodInfo}>
          <View style={styles.labelRow}>
            <Text style={styles.methodLabel}>{m.label}</Text>
            {m.badge === 'secured' && (
              <View style={styles.securedPill}>
                <SecuredShieldIcon size={8} />
                <Text style={styles.securedText}>Secured</Text>
              </View>
            )}
          </View>
          {m.subtitle ? <Text style={styles.subtitle}>{m.subtitle}</Text> : null}
        </View>

        <Text style={styles.amount}>₹{amount}</Text>
        {isSelected ? <CheckCircleIcon size={21} /> : <EmptyCircleIcon size={21} />}
      </Pressable>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />

      <View style={styles.sheet}>
        <Text style={styles.heading}>Pay for your ride</Text>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        >
          {/* Wallet — primary option whenever it covers the ride.
              Displays the rider's real available balance. Tapping the
              row selects it; the Confirm button at the bottom triggers
              the wallet debit on the server. */}
          <View style={styles.card}>
            <Pressable
              style={styles.methodRow}
              onPress={() => walletCovers && setSelected('wallet')}
              disabled={!walletCovers}
            >
              <View style={[styles.logoBox, styles.walletLogoBox]}>
                <Ionicons name="wallet-outline" size={22} color="#0097B3" />
              </View>
              <View style={styles.methodInfo}>
                <View style={styles.labelRow}>
                  <Text style={styles.methodLabel}>UKCAAR Wallet</Text>
                </View>
                <Text style={styles.subtitle}>
                  Balance ₹{walletBalance.toFixed(2)}
                  {!walletCovers ? '  •  insufficient' : ''}
                </Text>
              </View>
              <Text style={styles.amount}>₹{amount}</Text>
              {selected === 'wallet' ? (
                <CheckCircleIcon size={21} />
              ) : (
                <EmptyCircleIcon size={21} />
              )}
            </Pressable>
          </View>

          {/* Pay Online — Razorpay checkout. Shown as the obvious fallback
              when the wallet is short, but also picks up anyone who would
              rather pay by card/UPI/netbanking directly. */}
          <View style={[styles.card, { marginTop: 14 }]}>
            <Pressable
              style={styles.methodRow}
              onPress={() => setSelected('razorpay')}
            >
              <View style={[styles.logoBox, styles.razorpayLogoBox]}>
                <Ionicons name="card-outline" size={22} color="#3399CC" />
              </View>
              <View style={styles.methodInfo}>
                <View style={styles.labelRow}>
                  <Text style={styles.methodLabel}>Pay Online</Text>
                  <View style={styles.securedPill}>
                    <SecuredShieldIcon size={8} />
                    <Text style={styles.securedText}>Razorpay</Text>
                  </View>
                </View>
                <Text style={styles.subtitle}>UPI, Cards, NetBanking</Text>
              </View>
              <Text style={styles.amount}>₹{amount}</Text>
              {selected === 'razorpay' ? (
                <CheckCircleIcon size={21} />
              ) : (
                <EmptyCircleIcon size={21} />
              )}
            </Pressable>
          </View>

          {/* Preferred Mode card */}
          <View style={styles.card}>
            {/* Google Pay row with quick-pay button */}
            <Pressable
              style={[styles.methodRow, { paddingBottom: 0 }]}
              onPress={() => setSelected('gpay')}
            >
              <View style={styles.logoBox}>
                <Image
                  source={PREFERRED[0].source}
                  style={styles.logoImage}
                  resizeMode="contain"
                />
              </View>
              <View style={styles.methodInfo}>
                <Text style={styles.methodLabel}>Google Pay</Text>
              </View>
              <Text style={styles.amount}>₹{amount}</Text>
              {selected === 'gpay' ? (
                <CheckCircleIcon size={21} />
              ) : (
                <EmptyCircleIcon size={21} />
              )}
            </Pressable>

            <View style={styles.gpayBtnRow}>
              <TouchableOpacity
                style={styles.gpayBtn}
                onPress={() => onConfirm('gpay')}
                activeOpacity={0.85}
              >
                <Text style={styles.gpayBtnText}>Pay using Google Pay</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.divider} />

            {renderMethod(PREFERRED[1])}

            <View style={styles.divider} />

            {renderMethod(PREFERRED[2])}
          </View>

          {/* UPI section */}
          <Text style={styles.sectionLabel}>UPI</Text>
          <View style={styles.card}>
            {renderMethod(UPI[0])}
            <View style={styles.divider} />
            {renderMethod(UPI[1])}
            <View style={styles.divider} />
            {renderMethod(UPI[2])}
          </View>

          {/* Cash card */}
          <View style={[styles.card, styles.cashCard]}>
            <Pressable
              style={styles.methodRow}
              onPress={() => setSelected('cash')}
            >
              <View style={styles.cashIconBox}>
                <Text style={styles.cashEmoji}>💵</Text>
              </View>
              <View style={styles.methodInfo}>
                <Text style={styles.methodLabel}>Cash Payment</Text>
                <Text style={styles.subtitle}>
                  Pay directly to the driver after completing your ride. (Estimated Fare ({amount})
                </Text>
              </View>
              {selected === 'cash' ? (
                <CheckCircleIcon size={21} />
              ) : (
                <EmptyCircleIcon size={21} />
              )}
            </Pressable>
          </View>
        </ScrollView>

        {/* Bottom Confirm button */}
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity
            style={styles.confirmBtn}
            onPress={() => onConfirm(selected)}
            activeOpacity={0.85}
          >
            <Text style={styles.confirmBtnText}>Confirm & Pay</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#414141',
    opacity: 0.5,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '92%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 12,
    paddingTop: 24,
  },
  heading: {
    fontFamily: 'Inter-Medium',
    fontSize: 17,
    lineHeight: 21,
    color: '#000000',
    textAlign: 'center',
    letterSpacing: -0.25,
    marginBottom: 16,
  },
  scrollContent: {
    paddingHorizontal: 19,
  },
  sectionLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 17,
    color: '#000000',
    letterSpacing: -0.25,
    marginTop: 24,
    marginBottom: 12,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8.513,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 9.6,
    elevation: 3,
  },
  cashCard: {
    marginTop: 18,
  },
  methodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  logoBox: {
    width: 42.567,
    height: 42.567,
    borderWidth: 0.426,
    borderColor: '#CAC7C7',
    borderRadius: 4.257,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImage: {
    width: 28,
    height: 28,
  },
  walletLogoBox: {
    backgroundColor: 'rgba(0, 151, 179, 0.08)',
    borderColor: 'rgba(0, 151, 179, 0.25)',
  },
  razorpayLogoBox: {
    backgroundColor: 'rgba(51, 153, 204, 0.08)',
    borderColor: 'rgba(51, 153, 204, 0.25)',
  },
  cashIconBox: {
    width: 42.567,
    height: 42.567,
    borderWidth: 0.426,
    borderColor: '#CAC7C7',
    borderRadius: 4.257,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cashEmoji: {
    fontSize: 22,
  },
  methodInfo: {
    flex: 1,
    marginLeft: 14,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  methodLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 17,
    lineHeight: 21,
    color: '#000000',
    letterSpacing: -0.25,
  },
  subtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    lineHeight: 18,
    color: '#000000',
    marginTop: 2,
    letterSpacing: -0.25,
  },
  securedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,151,179,0.10)',
    borderRadius: 2.128,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 8,
    gap: 3,
  },
  securedText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 8.5,
    color: '#0097B3',
    letterSpacing: -0.25,
  },
  amount: {
    fontFamily: 'Inter-Regular',
    fontSize: 14.9,
    lineHeight: 21,
    color: '#8F8F8F',
    marginRight: 10,
    letterSpacing: -0.25,
  },
  gpayBtnRow: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 12,
  },
  gpayBtn: {
    width: 222,
    height: 47,
    backgroundColor: '#0097B3',
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gpayBtnText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    color: '#FFFFFF',
    letterSpacing: -0.25,
  },
  divider: {
    height: 1,
    backgroundColor: '#F0F0F0',
    marginHorizontal: 16,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 24,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  confirmBtn: {
    height: 58,
    backgroundColor: '#0097B3',
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnText: {
    fontFamily: 'Inter-Regular',
    fontSize: 16,
    color: '#FFFFFF',
    letterSpacing: -0.4,
  },
});
