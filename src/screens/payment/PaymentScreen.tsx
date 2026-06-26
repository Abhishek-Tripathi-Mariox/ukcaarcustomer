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
  TextInput,
  Modal,
  KeyboardAvoidingView,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, BorderRadius } from '@/theme';
import { paymentService, SavedMethod } from '@/services/paymentService';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { setWalletBalance as setGlobalWalletBalance } from '@/store/slices/appSlice';

interface PaymentScreenProps {
  navigation: any;
}

type AddModalType = 'card' | 'upi' | 'wallet' | 'topup' | null;

const WALLET_PROVIDERS = [
  { id: 'phonepe', name: 'PhonePe', icon: 'phone-portrait' },
  { id: 'paytm', name: 'Paytm', icon: 'wallet' },
  { id: 'googlepay', name: 'Google Pay', icon: 'logo-google' },
  { id: 'amazonpay', name: 'Amazon Pay', icon: 'cart' },
];

export const PaymentScreen: React.FC<PaymentScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const [walletBalance, setWalletBalance] = useState(0);
  const [savedMethods, setSavedMethods] = useState<SavedMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeModal, setActiveModal] = useState<AddModalType>(null);

  // Card form
  const [cardName, setCardName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [cardType, setCardType] = useState<'credit_card' | 'debit_card'>('credit_card');

  // UPI form
  const [upiId, setUpiId] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [walletRes, methodsRes] = await Promise.all([
        paymentService.getWallet(),
        paymentService.getSavedMethods(),
      ]);
      if (walletRes.success) {
        const bal = walletRes.data.wallet?.balance || 0;
        setWalletBalance(bal);
        dispatch(setGlobalWalletBalance(bal));
      }
      if (methodsRes.success) setSavedMethods(methodsRes.data.methods || []);
    } catch (err) {
      console.error('Failed to fetch payment data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const unsubscribe = navigation.addListener('focus', () => fetchData());
    return unsubscribe;
  }, [fetchData, navigation]);

  // ── Save Card ──
  const handleSaveCard = async () => {
    const cleaned = cardNumber.replace(/\s/g, '');
    if (!cardName.trim() || cleaned.length < 13 || !expiry || !cvc) {
      Alert.alert('Missing Fields', 'Please fill in all card details'); return;
    }
    const parts = expiry.split('/');
    const brand = detectBrand(cleaned);

    try {
      await paymentService.addSavedMethod({
        type: cardType,
        brand,
        last4: cleaned.slice(-4),
        cardHolderName: cardName.trim(),
        expiryMonth: parseInt(parts[0], 10),
        expiryYear: 2000 + parseInt(parts[1] || '0', 10),
        label: `${cardType === 'credit_card' ? 'Credit' : 'Debit'} Card`,
        isDefault: savedMethods.length === 0,
      });
      setCardName(''); setCardNumber(''); setExpiry(''); setCvc('');
      setActiveModal(null);
      Alert.alert('Success', 'Card saved successfully');
      fetchData();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to save card');
    }
  };

  // ── Save UPI ──
  const handleSaveUPI = async () => {
    if (!upiId.trim() || !upiId.includes('@')) {
      Alert.alert('Invalid UPI', 'Please enter a valid UPI ID (e.g. name@upi)'); return;
    }
    try {
      await paymentService.addSavedMethod({
        type: 'upi', upiId: upiId.trim(), label: 'UPI',
      });
      setUpiId(''); setActiveModal(null);
      Alert.alert('Success', 'UPI ID saved successfully');
      fetchData();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to save UPI');
    }
  };

  // ── Save Third-party Wallet ──
  const handleSaveWalletProvider = async (provider: typeof WALLET_PROVIDERS[0]) => {
    try {
      await paymentService.addSavedMethod({
        type: 'wallet', walletProvider: provider.id, label: provider.name,
      });
      setActiveModal(null);
      Alert.alert('Success', `${provider.name} linked successfully`);
      fetchData();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to link wallet');
    }
  };

  // ── Delete Method ──
  const handleDelete = (method: SavedMethod) => {
    Alert.alert('Remove', `Remove ${method.label}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        await paymentService.deleteSavedMethod(method._id);
        fetchData();
      }},
    ]);
  };

  // ── Helpers ──
  const detectBrand = (num: string) => {
    if (num.startsWith('4')) return 'visa';
    if (/^5[1-5]/.test(num)) return 'mastercard';
    if (/^3[47]/.test(num)) return 'amex';
    if (/^6(?:011|5)/.test(num)) return 'discover';
    if (/^(508|606|607|608|353|356)/.test(num)) return 'rupay';
    return 'unknown';
  };

  const formatCardNum = (t: string) => {
    const c = t.replace(/[^\d]/g, '').slice(0, 16);
    return c.match(/.{1,4}/g)?.join(' ') || c;
  };

  const formatExp = (t: string) => {
    const c = t.replace(/[^\d]/g, '').slice(0, 4);
    return c.length > 2 ? c.slice(0, 2) + '/' + c.slice(2) : c;
  };

  const getBrandColor = (b?: string) => {
    if (b === 'visa') return '#1A1F71';
    if (b === 'mastercard') return '#EB001B';
    if (b === 'amex') return '#006FCF';
    if (b === 'rupay') return '#4A90D9';
    return Colors.primary;
  };

  const getTypeIcon = (m: SavedMethod) => {
    if (m.type === 'upi') return 'swap-horizontal';
    if (m.type === 'wallet') return 'wallet';
    return 'card';
  };

  // Filter methods by type
  const cards = savedMethods.filter(m => m.type === 'credit_card' || m.type === 'debit_card');
  const upiMethods = savedMethods.filter(m => m.type === 'upi');
  const walletMethods = savedMethods.filter(m => m.type === 'wallet');

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Manage Payments</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ══════ CARDS SECTION ══════ */}
        <Text style={styles.sectionTitle}>Cards</Text>
        {cards.map((card) => (
          <TouchableOpacity key={card._id} style={styles.methodRow} onLongPress={() => handleDelete(card)}>
            <View style={[styles.methodIcon, { backgroundColor: getBrandColor(card.brand) + '18' }]}>
              <Ionicons name="card" size={22} color={getBrandColor(card.brand)} />
            </View>
            <View style={styles.methodInfo}>
              <Text style={styles.methodLabel}>{card.label}</Text>
              <Text style={styles.methodDetail}>
                {card.brand ? card.brand.charAt(0).toUpperCase() + card.brand.slice(1) : ''} •••• {card.last4}
              </Text>
            </View>
            {card.isDefault && (
              <View style={styles.defaultBadge}><Text style={styles.defaultText}>Default</Text></View>
            )}
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={styles.addRow}
          onPress={() =>
            Alert.alert(
              'Cards are added at checkout',
              'For your security, card details are entered directly in the secure payment sheet when you pay — UKCAAR never stores your card number. UPI and wallets can be linked here.',
            )
          }
        >
          <Ionicons name="add-circle" size={22} color={Colors.primary} />
          <Text style={styles.addRowText}>Add Credit / Debit Card</Text>
        </TouchableOpacity>

        {/* ══════ UPI SECTION ══════ */}
        <Text style={styles.sectionTitle}>UPI</Text>
        {upiMethods.map((upi) => (
          <TouchableOpacity key={upi._id} style={styles.methodRow} onLongPress={() => handleDelete(upi)}>
            <View style={[styles.methodIcon, { backgroundColor: '#4CAF5018' }]}>
              <Ionicons name="swap-horizontal" size={22} color="#4CAF50" />
            </View>
            <View style={styles.methodInfo}>
              <Text style={styles.methodLabel}>UPI</Text>
              <Text style={styles.methodDetail}>{upi.upiId}</Text>
            </View>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={styles.addRow} onPress={() => setActiveModal('upi')}>
          <Ionicons name="add-circle" size={22} color={Colors.primary} />
          <Text style={styles.addRowText}>Add UPI ID</Text>
        </TouchableOpacity>

        {/* ══════ WALLETS SECTION ══════ */}
        <Text style={styles.sectionTitle}>Wallets</Text>

        {/* UKCAAR Wallet */}
        <View style={styles.methodRow}>
          <View style={[styles.methodIcon, { backgroundColor: 'rgba(0,151,179,0.12)' }]}>
            <Ionicons name="wallet" size={22} color={Colors.primary} />
          </View>
          <View style={styles.methodInfo}>
            <Text style={styles.methodLabel}>UKCAAR Wallet</Text>
            <Text style={styles.methodDetail}>Balance: ₹{walletBalance.toFixed(2)}</Text>
          </View>
          <TouchableOpacity style={styles.addTag} onPress={() => navigation.navigate('WalletTopUp')}>
            <Ionicons name="add" size={14} color={Colors.primary} />
            <Text style={styles.addTagText}>Top Up</Text>
          </TouchableOpacity>
        </View>

        {/* Third-party wallets */}
        {walletMethods.map((w) => (
          <TouchableOpacity key={w._id} style={styles.methodRow} onLongPress={() => handleDelete(w)}>
            <View style={[styles.methodIcon, { backgroundColor: '#9C27B018' }]}>
              <Ionicons name="wallet" size={22} color="#9C27B0" />
            </View>
            <View style={styles.methodInfo}>
              <Text style={styles.methodLabel}>{w.label}</Text>
              <Text style={styles.methodDetail}>{w.walletProvider}</Text>
            </View>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={styles.addRow} onPress={() => setActiveModal('wallet')}>
          <Ionicons name="add-circle" size={22} color={Colors.primary} />
          <Text style={styles.addRowText}>Link PhonePe, Paytm, Google Pay...</Text>
        </TouchableOpacity>

        {/* ══════ CASH ══════ */}
        <Text style={styles.sectionTitle}>Other</Text>
        <View style={styles.methodRow}>
          <View style={[styles.methodIcon, { backgroundColor: '#FF980018' }]}>
            <Ionicons name="cash" size={22} color="#FF9800" />
          </View>
          <View style={styles.methodInfo}>
            <Text style={styles.methodLabel}>Cash</Text>
            <Text style={styles.methodDetail}>Pay driver directly</Text>
          </View>
        </View>

        {/* Done */}
        <TouchableOpacity style={styles.doneBtn} onPress={() => navigation.goBack()} activeOpacity={0.85}>
          <Text style={styles.doneBtnText}>Done</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ══════ ADD CARD MODAL ══════ */}
      <Modal visible={activeModal === 'card'} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior="padding" style={styles.modalSheet}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Add New Card</Text>

              {/* Card type toggle */}
              <View style={styles.toggleRow}>
                <TouchableOpacity
                  style={[styles.toggleBtn, cardType === 'credit_card' && styles.toggleActive]}
                  onPress={() => setCardType('credit_card')}
                >
                  <Text style={[styles.toggleText, cardType === 'credit_card' && styles.toggleTextActive]}>Credit Card</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.toggleBtn, cardType === 'debit_card' && styles.toggleActive]}
                  onPress={() => setCardType('debit_card')}
                >
                  <Text style={[styles.toggleText, cardType === 'debit_card' && styles.toggleTextActive]}>Debit Card</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.fieldLabel}>Card holder name</Text>
              <TextInput style={styles.fieldInput} placeholder="Full name on card" placeholderTextColor="#B0B0B0" value={cardName} onChangeText={setCardName} autoCapitalize="words" />

              <Text style={styles.fieldLabel}>Card number</Text>
              <TextInput style={styles.fieldInput} placeholder="#### #### #### ####" placeholderTextColor="#B0B0B0" value={cardNumber} onChangeText={(t) => setCardNumber(formatCardNum(t))} keyboardType="number-pad" maxLength={19} />

              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Expiration</Text>
                  <TextInput style={styles.fieldInput} placeholder="MM/YY" placeholderTextColor="#B0B0B0" value={expiry} onChangeText={(t) => setExpiry(formatExp(t))} keyboardType="number-pad" maxLength={5} />
                </View>
                <View style={{ width: 16 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>CVC</Text>
                  <TextInput style={styles.fieldInput} placeholder="CVC" placeholderTextColor="#B0B0B0" value={cvc} onChangeText={setCvc} keyboardType="number-pad" maxLength={4} secureTextEntry />
                </View>
              </View>

              <TouchableOpacity style={styles.primaryBtn} onPress={handleSaveCard} activeOpacity={0.85}>
                <Text style={styles.primaryBtnText}>Add Card</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setActiveModal(null)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ══════ ADD UPI MODAL ══════ */}
      <Modal visible={activeModal === 'upi'} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add UPI ID</Text>
            <Text style={styles.modalSubtitle}>Enter your UPI ID to make quick payments</Text>

            <Text style={styles.fieldLabel}>UPI ID</Text>
            <TextInput style={styles.fieldInput} placeholder="yourname@upi" placeholderTextColor="#B0B0B0" value={upiId} onChangeText={setUpiId} autoCapitalize="none" keyboardType="email-address" />

            <TouchableOpacity style={styles.primaryBtn} onPress={handleSaveUPI} activeOpacity={0.85}>
              <Text style={styles.primaryBtnText}>Save UPI ID</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelBtn} onPress={() => setActiveModal(null)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ══════ LINK WALLET MODAL ══════ */}
      <Modal visible={activeModal === 'wallet'} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Link Wallet</Text>
            <Text style={styles.modalSubtitle}>Select a wallet to link for quick payments</Text>

            {WALLET_PROVIDERS.map((provider) => (
              <TouchableOpacity key={provider.id} style={styles.walletOption} onPress={() => handleSaveWalletProvider(provider)}>
                <View style={[styles.methodIcon, { backgroundColor: '#9C27B012' }]}>
                  <Ionicons name={provider.icon as any} size={22} color="#9C27B0" />
                </View>
                <Text style={styles.walletOptionText}>{provider.name}</Text>
                <Ionicons name="chevron-forward" size={20} color="#B0B0B0" />
              </TouchableOpacity>
            ))}

            <TouchableOpacity style={styles.cancelBtn} onPress={() => setActiveModal(null)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundWhite },
  header: {
    backgroundColor: Colors.primary,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingBottom: 16,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '600', color: '#fff' },
  content: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, paddingBottom: Spacing['3xl'] },

  // Section
  sectionTitle: { fontSize: 20, fontWeight: '700', color: Colors.black, marginTop: Spacing.xl, marginBottom: Spacing.md },

  // Method row
  methodRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingVertical: 14, paddingHorizontal: Spacing.base,
    borderWidth: 1, borderColor: Colors.primary, borderRadius: BorderRadius.base,
    marginBottom: Spacing.sm,
  },
  methodIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  methodInfo: { flex: 1 },
  methodLabel: { fontSize: 18, fontWeight: '600', color: Colors.black },
  methodDetail: { fontSize: 15, fontWeight: '400', color: '#7D8A95', marginTop: 2 },
  defaultBadge: { backgroundColor: 'rgba(0,151,179,0.12)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  defaultText: { fontSize: 12, fontWeight: '600', color: Colors.primary },

  // Add row
  addRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingVertical: 12, paddingHorizontal: Spacing.base,
  },
  addRowText: { fontSize: 16, fontWeight: '500', color: Colors.primary },

  // Add tag
  addTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: Colors.primary, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 6,
  },
  addTagText: { fontSize: 14, fontWeight: '600', color: Colors.primary },

  // Done
  doneBtn: {
    height: 58, backgroundColor: Colors.primary, borderRadius: BorderRadius.button,
    alignItems: 'center', justifyContent: 'center', marginTop: Spacing['2xl'],
  },
  doneBtnText: { fontSize: 18, fontWeight: '600', color: '#fff' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: Colors.backgroundWhite, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: Spacing.xl, paddingBottom: Spacing['3xl'],
  },
  modalTitle: { fontSize: 22, fontWeight: '700', color: Colors.black, textAlign: 'center', marginBottom: Spacing.sm },
  modalSubtitle: { fontSize: 16, fontWeight: '400', color: '#7D8A95', textAlign: 'center', lineHeight: 24, marginBottom: Spacing.xl },

  // Toggle
  toggleRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.xl },
  toggleBtn: {
    flex: 1, height: 44, borderRadius: BorderRadius.button, borderWidth: 1.5, borderColor: '#E0E0E0',
    alignItems: 'center', justifyContent: 'center',
  },
  toggleActive: { borderColor: Colors.primary, backgroundColor: 'rgba(0,151,179,0.08)' },
  toggleText: { fontSize: 15, fontWeight: '500', color: '#7D8A95' },
  toggleTextActive: { color: Colors.primary, fontWeight: '600' },

  // Fields
  fieldLabel: { fontSize: 16, fontWeight: '600', color: Colors.black, marginBottom: 6, marginTop: Spacing.md },
  fieldInput: {
    height: 56, borderWidth: 1, borderColor: '#E0E0E0', borderRadius: BorderRadius.base,
    paddingHorizontal: Spacing.base, fontSize: 17, fontWeight: '400', color: Colors.black,
  },
  row: { flexDirection: 'row' },

  // Buttons
  primaryBtn: {
    height: 58, backgroundColor: Colors.primary, borderRadius: BorderRadius.button,
    alignItems: 'center', justifyContent: 'center', marginTop: Spacing.xl,
  },
  primaryBtnText: { fontSize: 18, fontWeight: '600', color: '#fff' },
  cancelBtn: { height: 48, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.sm },
  cancelBtnText: { fontSize: 16, fontWeight: '500', color: '#7D8A95' },

  // Wallet providers
  walletOption: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  walletOptionText: { flex: 1, fontSize: 17, fontWeight: '500', color: Colors.black },
});
