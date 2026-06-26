import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RazorpayCheckout from 'react-native-razorpay';
import { Colors, Spacing, BorderRadius } from '@/theme';
import { paymentService, SavedMethod } from '@/services/paymentService';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { setWalletBalance as setGlobalWalletBalance } from '@/store/slices/appSlice';

interface PaymentOptionScreenProps {
  navigation: any;
  route: {
    params: {
      amount: number;
      gst: number;
      total: number;
      bonus: number;
      credited: number;
      type: 'wallet_topup' | 'ride_payment';
      /** Required for ride_payment so the charge/wallet-debit settles the ride. */
      rideId?: string;
    };
  };
}

const WALLET_ICONS: Record<string, string> = {
  phonepe: 'phone-portrait',
  paytm: 'wallet',
  googlepay: 'logo-google',
  amazonpay: 'cart',
};

const WALLET_COLORS: Record<string, string> = {
  phonepe: '#5B2D8E',
  paytm: '#002970',
  googlepay: '#4285F4',
  amazonpay: '#FF9900',
};

export const PaymentOptionScreen: React.FC<PaymentOptionScreenProps> = ({ navigation, route }) => {
  const { amount, gst, total, bonus, credited, type, rideId } = route.params;
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((state) => state.auth);
  const walletBalance = useAppSelector((state) => state.app.walletBalance);

  const [savedMethods, setSavedMethods] = useState<SavedMethod[]>([]);
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string>(''); // 'wallet_balance' | method._id
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [txnId, setTxnId] = useState('');

  const fetchMethods = useCallback(async () => {
    try {
      const res = await paymentService.getSavedMethods();
      if (res.success) {
        setSavedMethods(res.data.methods || []);
        // Auto-select default method
        const def = (res.data.methods || []).find((m: SavedMethod) => m.isDefault);
        if (def) {
          setSelectedMethodId(def._id);
          setSelectedType(def._id);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMethods(); }, [fetchMethods]);

  // Group methods
  const cards = savedMethods.filter(m => m.type === 'credit_card' || m.type === 'debit_card');
  const upiMethods = savedMethods.filter(m => m.type === 'upi');
  const walletMethods = savedMethods.filter(m => m.type === 'wallet');

  const handlePay = async () => {
    if (!selectedType) {
      Alert.alert('Select Method', 'Please select a payment method');
      return;
    }

    setProcessing(true);
    try {
      // ── Pay from UKCAAR wallet balance (ride payments only) ──
      if (selectedType === 'wallet_balance') {
        if (!rideId) {
          Alert.alert('Unavailable', 'Wallet payment is only available for a ride.');
          return;
        }
        if (walletBalance < total) {
          Alert.alert('Insufficient Balance', 'Your wallet balance is not enough for this payment.');
          return;
        }
        const res: any = await paymentService.payRideFromWallet(rideId);
        if (res?.success) {
          const newBalance = res.data?.wallet?.balance ?? walletBalance - total;
          dispatch(setGlobalWalletBalance(newBalance));
          setTxnId(rideId);
          setShowSuccess(true);
        } else {
          Alert.alert('Failed', res?.message || 'Wallet payment failed.');
        }
        return;
      }

      // ── Pay via Razorpay (real native checkout — card / UPI / wallet) ──
      const selectedMethod = savedMethods.find(m => m._id === selectedType);
      const methodPref = selectedMethod?.type === 'upi' ? 'upi'
        : selectedMethod?.type === 'wallet' ? 'wallet' : 'card';

      const orderRes = await paymentService.createOrder({
        amount,
        type,
        ...(rideId ? { rideId } : {}),
        methodPreference: methodPref as any,
      });

      if (!orderRes.success) {
        Alert.alert('Error', 'Failed to create payment order');
        return;
      }

      const { orderId, keyId, currency, amount: orderAmount } = orderRes.data;

      // Open the real Razorpay sheet. It returns a genuine payment_id +
      // signature that the backend HMAC-verifies — no mock signatures.
      const options = {
        description: type === 'ride_payment' ? 'UKCAAR Ride Payment' : 'UKCAAR Wallet Top-up',
        currency,
        key: keyId,
        amount: String(orderAmount),
        name: 'UKCAAR',
        order_id: orderId,
        prefill: {
          name: user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() : '',
          contact: user?.phone || '',
          email: user?.email || '',
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
        const newBalance = verifyRes.data.wallet?.balance ?? walletBalance;
        dispatch(setGlobalWalletBalance(newBalance));
        setTxnId(orderId);
        setShowSuccess(true);
      } else {
        Alert.alert('Failed', 'Payment could not be verified.');
      }
    } catch (err: any) {
      // Razorpay RN SDK signals user-cancellation with code 2 — don't show a
      // scary error for an intentional dismiss.
      if (err?.code !== 2 && err?.code !== '2') {
        Alert.alert('Payment Failed', err?.description || err?.message || 'Something went wrong');
      }
    } finally {
      setProcessing(false);
    }
  };

  const handleSuccessDone = () => {
    setShowSuccess(false);
    navigation.navigate('PaymentSuccess', {
      amount: `₹${amount}`,
      method: selectedType === 'wallet_balance'
        ? 'UKCAAR Wallet'
        : savedMethods.find(m => m._id === selectedType)?.label || 'Card',
      transactionId: txnId,
    });
  };

  const isSelected = (id: string) => selectedType === id;

  const RadioCircle = ({ selected }: { selected: boolean }) => (
    <View style={[styles.radio, selected && styles.radioSelected]}>
      {selected && <View style={styles.radioDot} />}
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.black} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Payment option</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ── Preferred / Saved Cards ── */}
        {cards.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Preferred Mode</Text>
            {cards.map((card) => (
              <TouchableOpacity
                key={card._id}
                style={[styles.methodRow, isSelected(card._id) && styles.methodRowSelected]}
                onPress={() => setSelectedType(card._id)}
              >
                <View style={[styles.methodIcon, { backgroundColor: getCardColor(card.brand) + '18' }]}>
                  <Ionicons name="card" size={20} color={getCardColor(card.brand)} />
                </View>
                <View style={styles.methodInfo}>
                  <Text style={styles.methodName}>
                    {card.brand ? card.brand.charAt(0).toUpperCase() + card.brand.slice(1) : 'Card'}
                  </Text>
                  <Text style={styles.methodSub}>•••• {card.last4}</Text>
                </View>
                <Text style={styles.methodAmount}>₹{total}</Text>
                <RadioCircle selected={isSelected(card._id)} />
              </TouchableOpacity>
            ))}

            {/* Quick pay button for selected card */}
            {cards.some(c => isSelected(c._id)) && (
              <TouchableOpacity
                style={styles.quickPayBtn}
                onPress={handlePay}
                disabled={processing}
                activeOpacity={0.85}
              >
                {processing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.quickPayText}>
                    Pay using {savedMethods.find(m => m._id === selectedType)?.label || 'Card'}
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </>
        )}

        {/* ── Wallets (Third-party) ── */}
        {walletMethods.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Wallets</Text>
            {walletMethods.map((w) => (
              <TouchableOpacity
                key={w._id}
                style={[styles.methodRow, isSelected(w._id) && styles.methodRowSelected]}
                onPress={() => setSelectedType(w._id)}
              >
                <View style={[styles.methodIcon, {
                  backgroundColor: (WALLET_COLORS[w.walletProvider || ''] || '#9C27B0') + '18'
                }]}>
                  <Ionicons
                    name={(WALLET_ICONS[w.walletProvider || ''] || 'wallet') as any}
                    size={20}
                    color={WALLET_COLORS[w.walletProvider || ''] || '#9C27B0'}
                  />
                </View>
                <View style={styles.methodInfo}>
                  <Text style={styles.methodName}>{w.label}</Text>
                </View>
                <Text style={styles.methodAmount}>₹{total}</Text>
                <RadioCircle selected={isSelected(w._id)} />
              </TouchableOpacity>
            ))}
          </>
        )}

        {/* ── UKCAAR Wallet Balance ── */}
        {type === 'ride_payment' && walletBalance > 0 && (
          <>
            <Text style={styles.sectionTitle}>UKCAAR Wallet</Text>
            <TouchableOpacity
              style={[styles.methodRow, isSelected('wallet_balance') && styles.methodRowSelected]}
              onPress={() => setSelectedType('wallet_balance')}
            >
              <View style={[styles.methodIcon, { backgroundColor: 'rgba(0,151,179,0.12)' }]}>
                <Ionicons name="wallet" size={20} color={Colors.primary} />
              </View>
              <View style={styles.methodInfo}>
                <Text style={styles.methodName}>UKCAAR Wallet</Text>
                <Text style={styles.methodSub}>Balance: ₹{walletBalance.toFixed(0)}</Text>
              </View>
              <RadioCircle selected={isSelected('wallet_balance')} />
            </TouchableOpacity>
          </>
        )}

        {/* ── UPI ── */}
        <Text style={styles.sectionTitle}>UPI</Text>
        {upiMethods.length > 0 ? (
          upiMethods.map((upi) => (
            <TouchableOpacity
              key={upi._id}
              style={[styles.methodRow, isSelected(upi._id) && styles.methodRowSelected]}
              onPress={() => setSelectedType(upi._id)}
            >
              <View style={[styles.methodIcon, { backgroundColor: '#4CAF5018' }]}>
                <Ionicons name="swap-horizontal" size={20} color="#4CAF50" />
              </View>
              <View style={styles.methodInfo}>
                <Text style={styles.methodName}>{upi.upiId || 'UPI'}</Text>
              </View>
              <Text style={styles.methodAmount}>₹{total}</Text>
              <RadioCircle selected={isSelected(upi._id)} />
            </TouchableOpacity>
          ))
        ) : (
          <Text style={styles.emptyText}>No UPI methods saved</Text>
        )}

        {/* No methods message */}
        {savedMethods.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="card-outline" size={48} color="#B0B0B0" />
            <Text style={styles.emptyTitle}>No payment methods</Text>
            <Text style={styles.emptyDesc}>Add a payment method in Manage Payments</Text>
            <TouchableOpacity
              style={styles.addMethodBtn}
              onPress={() => navigation.navigate('Payment')}
            >
              <Text style={styles.addMethodText}>Add Payment Method</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Bottom Confirm Button */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={[styles.confirmBtn, (!selectedType || processing) && styles.confirmBtnDisabled]}
          onPress={handlePay}
          disabled={!selectedType || processing}
          activeOpacity={0.85}
        >
          {processing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.confirmBtnText}>Confirm & Pay  ₹{total}</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Success Modal (matching Figma) ── */}
      <Modal visible={showSuccess} transparent animationType="fade">
        <View style={styles.successOverlay}>
          <View style={styles.successCard}>
            {/* Decorative dots */}
            <View style={styles.successDots}>
              <View style={[styles.dot, { top: 20, left: 30 }]} />
              <View style={[styles.dot, { top: 40, right: 40 }]} />
              <View style={[styles.dot, { top: 80, left: 60 }]} />
              <View style={[styles.dot, { top: 10, right: 80 }]} />
            </View>

            <View style={styles.successCheckCircle}>
              <Ionicons name="checkmark" size={40} color="#fff" />
            </View>

            <Text style={styles.successTitle}>Payment Successfull</Text>
            <Text style={styles.successAmount}>₹ {amount}</Text>

            <Text style={styles.successDate}>
              {new Date().toLocaleDateString('en-US', {
                month: 'long', day: 'numeric', year: 'numeric',
              })}{'  '}
              {new Date().toLocaleTimeString('en-US', {
                hour: 'numeric', minute: '2-digit', hour12: true,
              })}
            </Text>
            <Text style={styles.successTxn}>Tax ID: {txnId || 'WAVE' + Date.now()}</Text>

            <TouchableOpacity style={styles.successBtn} onPress={handleSuccessDone} activeOpacity={0.85}>
              <Text style={styles.successBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

function getCardColor(brand?: string): string {
  if (brand === 'visa') return '#1A1F71';
  if (brand === 'mastercard') return '#EB001B';
  if (brand === 'amex') return '#006FCF';
  if (brand === 'rupay') return '#4A90D9';
  return '#333';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: Colors.black },
  content: { paddingHorizontal: Spacing.xl, paddingBottom: 120 },

  sectionTitle: {
    fontSize: 17, fontWeight: '700', color: Colors.black,
    marginTop: Spacing.xl, marginBottom: Spacing.md,
  },

  // Method row
  methodRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingVertical: 16, paddingHorizontal: Spacing.base,
    borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  methodRowSelected: {
    backgroundColor: 'rgba(0,151,179,0.04)',
    borderRadius: BorderRadius.base,
  },
  methodIcon: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  methodInfo: { flex: 1 },
  methodName: { fontSize: 16, fontWeight: '600', color: Colors.black },
  methodSub: { fontSize: 13, color: '#7D8A95', marginTop: 2 },
  methodAmount: { fontSize: 15, fontWeight: '600', color: Colors.black, marginRight: 8 },

  // Radio
  radio: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: '#D0D0D0',
    alignItems: 'center', justifyContent: 'center',
  },
  radioSelected: { borderColor: Colors.primary },
  radioDot: {
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: Colors.primary,
  },

  // Quick pay
  quickPayBtn: {
    height: 48, backgroundColor: Colors.primary, borderRadius: BorderRadius.button,
    alignItems: 'center', justifyContent: 'center', marginTop: Spacing.md,
  },
  quickPayText: { fontSize: 16, fontWeight: '600', color: '#fff' },

  // Empty
  emptyText: { fontSize: 14, color: '#B0B0B0', paddingLeft: Spacing.base },
  emptyState: { alignItems: 'center', paddingTop: 40, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#7D8A95' },
  emptyDesc: { fontSize: 14, color: '#B0B0B0' },
  addMethodBtn: { marginTop: 12 },
  addMethodText: { fontSize: 16, fontWeight: '600', color: Colors.primary },

  // Bottom
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff', paddingHorizontal: Spacing.xl, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: '#F0F0F0',
  },
  confirmBtn: {
    height: 56, backgroundColor: Colors.primary, borderRadius: BorderRadius.button,
    alignItems: 'center', justifyContent: 'center',
  },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmBtnText: { fontSize: 18, fontWeight: '700', color: '#fff' },

  // Success modal
  successOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center',
  },
  successCard: {
    backgroundColor: '#fff', borderRadius: 24, padding: 32,
    alignItems: 'center', width: '85%', position: 'relative', overflow: 'hidden',
  },
  successDots: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  dot: {
    position: 'absolute', width: 8, height: 8, borderRadius: 4,
    backgroundColor: Colors.primary, opacity: 0.15,
  },
  successCheckCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  successTitle: { fontSize: 20, fontWeight: '700', color: Colors.primary, marginBottom: 4 },
  successAmount: { fontSize: 32, fontWeight: '800', color: Colors.black, marginBottom: 12 },
  successDate: { fontSize: 14, color: '#7D8A95' },
  successTxn: { fontSize: 12, color: '#B0B0B0', marginTop: 4, marginBottom: 20 },
  successBtn: {
    height: 48, backgroundColor: Colors.primary, borderRadius: BorderRadius.button,
    alignItems: 'center', justifyContent: 'center', width: '100%',
  },
  successBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
