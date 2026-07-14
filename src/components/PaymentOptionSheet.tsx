import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Pressable,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, alpha, Shadow } from '@/theme';
import { fs, s, vs } from '@/theme/responsive';
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

type MethodId = 'razorpay' | 'wallet' | 'cash';

export const PaymentOptionSheet: React.FC<PaymentOptionSheetProps> = ({
  visible,
  amount,
  onClose,
  onConfirm,
}) => {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const walletBalance = useAppSelector((s) => s.app.walletBalance);
  const walletCovers = walletBalance >= amount;

  const [selected, setSelected] = useState<MethodId>('razorpay');

  useEffect(() => {
    if (!visible) return;
    paymentService
      .getWallet()
      .then((res: any) => {
        const bal = Number(res?.data?.wallet?.balance ?? 0);
        if (Number.isFinite(bal)) dispatch(setWalletBalance(bal));
      })
      .catch(() => {});
  }, [visible, dispatch]);

  useEffect(() => {
    if (!visible) return;
    setSelected(walletCovers ? 'wallet' : 'razorpay');
  }, [visible, walletCovers]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />

      <View style={styles.sheet}>
        <View style={styles.headerRow}>
          <Text style={styles.heading}>Choose Payment Method</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={s(22)} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + vs(100) }]}
        >
          {/* Razorpay Online Checkout (Primary / Secured) */}
          <Pressable
            style={[
              styles.card,
              selected === 'razorpay' && styles.cardActive,
            ]}
            onPress={() => setSelected('razorpay')}
          >
            <View style={[styles.iconBox, { backgroundColor: alpha('#0097B3', 0.12) }]}>
              <Ionicons name="shield-checkmark" size={s(24)} color="#0097B3" />
            </View>
            <View style={styles.methodInfo}>
              <View style={styles.labelRow}>
                <Text style={styles.methodLabel}>Razorpay Online Gateway</Text>
                <View style={styles.securedPill}>
                  <SecuredShieldIcon size={10} />
                  <Text style={styles.securedText}>SECURED</Text>
                </View>
              </View>
              <Text style={styles.subtitle}>
                UPI (GPay, PhonePe, Paytm), Credit & Debit Cards, NetBanking
              </Text>
            </View>
            <View style={styles.rightCol}>
              <Text style={styles.amount}>₹{amount}</Text>
              {selected === 'razorpay' ? (
                <CheckCircleIcon size={22} />
              ) : (
                <EmptyCircleIcon size={22} />
              )}
            </View>
          </Pressable>

          {/* UKCAAR Wallet */}
          <Pressable
            style={[
              styles.card,
              selected === 'wallet' && styles.cardActive,
              !walletCovers && { opacity: 0.6 },
            ]}
            onPress={() => walletCovers && setSelected('wallet')}
            disabled={!walletCovers}
          >
            <View style={[styles.iconBox, { backgroundColor: alpha('#10B981', 0.12) }]}>
              <Ionicons name="wallet-outline" size={s(24)} color="#10B981" />
            </View>
            <View style={styles.methodInfo}>
              <View style={styles.labelRow}>
                <Text style={styles.methodLabel}>UKCAAR Wallet</Text>
                {walletCovers ? (
                  <View style={[styles.securedPill, { backgroundColor: alpha('#10B981', 0.15) }]}>
                    <Text style={[styles.securedText, { color: '#10B981' }]}>READY</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.subtitle}>
                Available Balance: ₹{walletBalance.toFixed(2)}
                {!walletCovers ? ' • Insufficient balance' : ''}
              </Text>
            </View>
            <View style={styles.rightCol}>
              <Text style={styles.amount}>₹{amount}</Text>
              {selected === 'wallet' ? (
                <CheckCircleIcon size={22} />
              ) : (
                <EmptyCircleIcon size={22} />
              )}
            </View>
          </Pressable>

          {/* Cash Payment */}
          <Pressable
            style={[
              styles.card,
              selected === 'cash' && styles.cardActive,
            ]}
            onPress={() => setSelected('cash')}
          >
            <View style={[styles.iconBox, { backgroundColor: alpha('#F59E0B', 0.12) }]}>
              <Ionicons name="cash-outline" size={s(24)} color="#F59E0B" />
            </View>
            <View style={styles.methodInfo}>
              <Text style={styles.methodLabel}>Cash Payment</Text>
              <Text style={styles.subtitle}>
                Pay ₹{amount} in cash directly to your driver
              </Text>
            </View>
            <View style={styles.rightCol}>
              <Text style={styles.amount}>₹{amount}</Text>
              {selected === 'cash' ? (
                <CheckCircleIcon size={22} />
              ) : (
                <EmptyCircleIcon size={22} />
              )}
            </View>
          </Pressable>
        </ScrollView>

        {/* Bottom Confirm button */}
        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <TouchableOpacity
            style={styles.confirmBtn}
            onPress={() => onConfirm(selected)}
            activeOpacity={0.88}
          >
            <Text style={styles.confirmBtnText}>
              {selected === 'razorpay'
                ? `Pay \u20B9${amount} via Razorpay`
                : selected === 'wallet'
                ? `Pay \u20B9${amount} from Wallet`
                : `Confirm Cash Payment (\u20B9${amount})`}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
    opacity: 0.5,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '85%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: s(24),
    borderTopRightRadius: s(24),
    ...Shadow.lg,
    paddingTop: vs(20),
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: s(20),
    marginBottom: vs(16),
  },
  heading: {
    fontFamily: 'Inter-Bold',
    fontSize: fs(19),
    color: Colors.textPrimary,
  },
  closeBtn: {
    padding: s(4),
  },
  scrollContent: {
    paddingHorizontal: s(16),
    paddingTop: vs(6),
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: s(16),
    padding: s(16),
    marginBottom: vs(14),
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
    ...Shadow.sm,
  },
  cardActive: {
    borderColor: Colors.primary,
    backgroundColor: alpha(Colors.primary, 0.03),
  },
  iconBox: {
    width: s(46),
    height: s(46),
    borderRadius: s(12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodInfo: {
    flex: 1,
    marginLeft: s(14),
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: s(6),
  },
  methodLabel: {
    fontFamily: 'Inter-Bold',
    fontSize: fs(16),
    color: Colors.textPrimary,
  },
  subtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(12),
    color: Colors.textMuted,
    marginTop: vs(3),
  },
  securedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: alpha(Colors.primary, 0.12),
    borderRadius: s(4),
    paddingHorizontal: s(6),
    paddingVertical: vs(2),
    gap: s(3),
  },
  securedText: {
    fontFamily: 'Inter-Bold',
    fontSize: fs(9),
    color: Colors.primary,
  },
  rightCol: {
    alignItems: 'flex-end',
    gap: vs(4),
  },
  amount: {
    fontFamily: 'Inter-Bold',
    fontSize: fs(15),
    color: Colors.textPrimary,
  },
  bottomBar: {
    backgroundColor: Colors.white,
    paddingHorizontal: s(20),
    paddingTop: vs(14),
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  confirmBtn: {
    height: vs(54),
    backgroundColor: Colors.primary,
    borderRadius: s(14),
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.sm,
  },
  confirmBtnText: {
    fontFamily: 'Inter-Bold',
    fontSize: fs(16),
    color: Colors.white,
  },
});
