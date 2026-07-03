import React, { useEffect, useMemo, useState } from 'react';
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
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Stop, Rect, Path, Polygon, Circle } from 'react-native-svg';
import RazorpayCheckout from 'react-native-razorpay';
import { Colors } from '@/theme';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { setWalletBalance as setGlobalWalletBalance } from '@/store/slices/appSlice';
import { paymentService, RechargeOffer } from '@/services/paymentService';
import { PaymentSuccessModal } from '@/components/PaymentSuccessModal';

interface WalletTopUpScreenProps {
  navigation: any;
}

const GST_RATE = 0.18;

interface Quote {
  denomination: number;
  bonus: number;
  discount: number;
  gst: number;
  total: number;
  walletCredit: number;
}

/**
 * Client mirror of the server's recharge math (see paymentController
 * `computeRechargeQuote`). Used for custom amounts and the offline fallback
 * offers; the server stays authoritative for what's actually charged.
 */
function computeQuote(amount: number, bonusAmount = 0, discountPercent = 0): Quote {
  const denomination = Math.max(0, Math.round(amount));
  const bonus = Math.max(0, Math.round(bonusAmount));
  const dp = Math.min(Math.max(discountPercent, 0), 100);
  const discount = Math.round((denomination * dp) / 100);
  const payableBeforeGst = Math.max(0, denomination - discount);
  const gst = Math.round(payableBeforeGst * GST_RATE);
  const total = payableBeforeGst + gst;
  const walletCredit = denomination + bonus;
  return { denomination, bonus, discount, gst, total, walletCredit };
}

// Plain denomination tiles shown until admin-defined offers load. No bonus or
// discount — those only come from real offers so we never promise credit the
// server won't grant.
const DEFAULT_OFFERS: RechargeOffer[] = [
  { amount: 100, isPopular: false },
  { amount: 200, isPopular: false },
  { amount: 500, isPopular: true },
  { amount: 1000, isPopular: false },
  { amount: 2000, isPopular: false },
  { amount: 5000, isPopular: false },
].map((o) => ({
  _id: `default-${o.amount}`,
  amount: o.amount,
  bonusAmount: 0,
  discountPercent: 0,
  label: '',
  isPopular: o.isPopular,
  ...computeQuote(o.amount),
}));

const MIN_CUSTOM = 10;
const MAX_CUSTOM = 100000;

const GoldGradientStrip: React.FC = () => (
  <Svg width="100%" height={20} viewBox="0 0 113 20" preserveAspectRatio="none">
    <Defs>
      <LinearGradient id="goldStrip" x1="0" y1="0" x2="1" y2="0">
        <Stop offset="0" stopColor="#EBC654" />
        <Stop offset="0.5" stopColor="#FEF18B" />
        <Stop offset="1" stopColor="#E9C555" />
      </LinearGradient>
    </Defs>
    <Rect x="0" y="0" width="113" height="20" fill="url(#goldStrip)" />
  </Svg>
);

const MostPopularBadge: React.FC = () => (
  <View style={styles.popularBadgeWrap}>
    <Svg width={96} height={16} viewBox="0 0 96 16">
      <Defs>
        <LinearGradient id="popBadge" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#0097B3" />
          <Stop offset="1" stopColor="#00B8D4" />
        </LinearGradient>
      </Defs>
      <Polygon points="0,0 96,0 90,8 96,16 0,16 6,8" fill="url(#popBadge)" />
    </Svg>
    <View style={styles.popularBadgeContent}>
      {/* Crown */}
      <Svg width={11} height={10} viewBox="0 0 11 10">
        <Path
          d="M1 8 L1.5 3 L3.5 5 L5.5 1 L7.5 5 L9.5 3 L10 8 Z"
          fill="#FFD54A"
          stroke="#FFD54A"
          strokeWidth={0.5}
          strokeLinejoin="round"
        />
        <Circle cx="1" cy="2.5" r="0.6" fill="#FFD54A" />
        <Circle cx="5.5" cy="0.5" r="0.6" fill="#FFD54A" />
        <Circle cx="10" cy="2.5" r="0.6" fill="#FFD54A" />
      </Svg>
      <Text style={styles.popularBadgeText}>Most Popular</Text>
    </View>
  </View>
);

export const WalletTopUpScreen: React.FC<WalletTopUpScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const walletBalance = useAppSelector((state) => state.app.walletBalance);
  const { user } = useAppSelector((state) => state.auth);

  const [offers, setOffers] = useState<RechargeOffer[]>(DEFAULT_OFFERS);
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [processing, setProcessing] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);
  const [successAmount, setSuccessAmount] = useState<number>(0);
  const [taxId, setTaxId] = useState<string>('');

  // Pull the live balance + the admin-defined offers on mount. The balance
  // lives in Redux but isn't guaranteed to be hydrated when the user lands
  // here directly, which is why it used to show ₹0.
  useEffect(() => {
    paymentService
      .getWallet()
      .then((res) => {
        if (res.success) dispatch(setGlobalWalletBalance(res.data.wallet?.balance || 0));
      })
      .catch(() => {});

    paymentService
      .getRechargeOffers()
      .then((res) => {
        if (res.success && res.data.offers?.length) {
          setOffers(res.data.offers);
          const popular = res.data.offers.find((o) => o.isPopular);
          setSelectedOfferId((popular ?? res.data.offers[0])._id);
        } else {
          const popular = DEFAULT_OFFERS.find((o) => o.isPopular);
          setSelectedOfferId((popular ?? DEFAULT_OFFERS[0])._id);
        }
      })
      .catch(() => {
        const popular = DEFAULT_OFFERS.find((o) => o.isPopular);
        setSelectedOfferId((popular ?? DEFAULT_OFFERS[0])._id);
      });
  }, [dispatch]);

  const customNum = parseInt(customAmount, 10);
  const hasCustom = customAmount.trim().length > 0 && customNum > 0;

  const selectedOffer = useMemo(
    () => offers.find((o) => o._id === selectedOfferId) ?? null,
    [offers, selectedOfferId]
  );

  // Custom amount takes precedence over a tapped offer when present.
  const quote: Quote | null = hasCustom
    ? computeQuote(customNum)
    : selectedOffer
    ? {
        denomination: selectedOffer.denomination,
        bonus: selectedOffer.bonus,
        discount: selectedOffer.discount,
        gst: selectedOffer.gst,
        total: selectedOffer.total,
        walletCredit: selectedOffer.walletCredit,
      }
    : null;

  const bonus = quote?.bonus ?? 0;
  const bonusPercent =
    bonus > 0 && quote ? Math.round((bonus / quote.denomination) * 100) : 0;

  const customError =
    hasCustom && (customNum < MIN_CUSTOM || customNum > MAX_CUSTOM)
      ? `Enter an amount between ₹${MIN_CUSTOM} and ₹${MAX_CUSTOM.toLocaleString()}`
      : '';

  const canPay = !!quote && quote.total > 0 && !customError && !processing;

  const handleSelectOffer = (id: string) => {
    setSelectedOfferId(id);
    setCustomAmount('');
  };

  const handlePayNow = async () => {
    if (!quote || quote.total <= 0 || customError) return;
    setProcessing(true);
    try {
      const useOffer = !hasCustom && selectedOffer && !selectedOffer._id.startsWith('default-');
      const orderRes = await paymentService.createOrder({
        type: 'wallet_topup',
        amount: quote.denomination,
        ...(useOffer ? { offerId: selectedOffer!._id } : {}),
      });
      if (!orderRes.success) {
        Alert.alert('Error', 'Failed to create order');
        return;
      }
      const { orderId, keyId, currency, amount: orderAmount, walletCredit, chargeAmount } =
        orderRes.data;

      const options = {
        description: 'UKCAAR Wallet Top-up',
        image: 'https://ukcar.s3.ap-south-1.amazonaws.com/logo.png',
        currency,
        key: keyId,
        // Server-computed amount in paise — keeps the charge in sync with the
        // Razorpay order so the gateway never rejects a mismatched amount.
        amount: String(orderAmount),
        name: 'UKCAAR',
        order_id: orderId,
        prefill: {
          name: user ? `${user.firstName} ${user.lastName}`.trim() : '',
          contact: user?.phone || '',
          email: user?.email || '',
        },
        theme: { color: '#0097B3' },
      };

      const paymentData = await RazorpayCheckout.open(options);

      const verifyRes = await paymentService.verifyPayment({
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentData.razorpay_payment_id,
        razorpay_signature: paymentData.razorpay_signature,
      });

      if (verifyRes.success) {
        const credited = walletCredit ?? quote.walletCredit;
        const newBalance = verifyRes.data.wallet?.balance ?? walletBalance + credited;
        dispatch(setGlobalWalletBalance(newBalance));
        setSuccessAmount(chargeAmount ?? quote.total);
        setTaxId(`WAVE${Date.now().toString().slice(-10)}`);
        setSuccessVisible(true);
      } else {
        Alert.alert('Failed', 'Payment could not be verified.');
      }
    } catch (err: any) {
      if (err?.code !== 2) {
        Alert.alert('Payment Failed', err?.description || err?.message || 'Something went wrong');
      }
    } finally {
      setProcessing(false);
    }
  };

  const handleBookRide = () => {
    setSuccessVisible(false);
    navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.black} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Recharge Wallet</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Available Balance */}
        <Text style={styles.balanceLabel}>Available Balance</Text>
        <Text style={styles.balanceAmount}>₹ {walletBalance.toFixed(0)}</Text>

        {/* Recharge Amount */}
        <Text style={styles.sectionTitle}>Recharge Amount</Text>

        <View style={styles.amountGrid}>
          {offers.map((opt) => {
            const isSelected = !hasCustom && opt._id === selectedOfferId;
            const isPopular = opt.isPopular;
            const stripText =
              opt.label ||
              (opt.bonusAmount > 0
                ? `Get ₹ ${opt.bonusAmount} Extra`
                : opt.discountPercent > 0
                ? `${opt.discountPercent}% OFF`
                : '');
            return (
              <TouchableOpacity
                key={opt._id}
                style={[
                  styles.amountChip,
                  isPopular && styles.amountChipPopular,
                  isSelected && !isPopular && styles.amountChipSelected,
                ]}
                onPress={() => handleSelectOffer(opt._id)}
                activeOpacity={0.85}
              >
                <Text style={styles.amountChipText}>₹ {opt.amount.toLocaleString()}</Text>
                {!!stripText && (
                  <View style={styles.goldStripWrap}>
                    <GoldGradientStrip />
                    <Text style={styles.goldStripText}>{stripText}</Text>
                  </View>
                )}
                {isPopular && <MostPopularBadge />}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Custom amount */}
        <Text style={styles.customLabel}>Or enter a custom amount</Text>
        <View
          style={[
            styles.customInputWrap,
            hasCustom && styles.customInputWrapActive,
            !!customError && styles.customInputWrapError,
          ]}
        >
          <Text style={styles.customCurrency}>₹</Text>
          <TextInput
            style={styles.customInput}
            value={customAmount}
            onChangeText={(t) => setCustomAmount(t.replace(/[^0-9]/g, ''))}
            onFocus={() => setSelectedOfferId(null)}
            keyboardType="number-pad"
            placeholder="Enter amount"
            placeholderTextColor="#9CA3AF"
            maxLength={6}
            returnKeyType="done"
          />
          {hasCustom && (
            <TouchableOpacity onPress={() => setCustomAmount('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>
        {!!customError && <Text style={styles.customErrorText}>{customError}</Text>}

        {/* Divider */}
        <View style={styles.sectionDivider} />

        {/* Payment Details */}
        <Text style={styles.sectionTitle}>Payment Details</Text>

        <View style={styles.detailsCard}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Recharge Amount</Text>
            <Text style={styles.detailValue}>₹ {quote?.denomination ?? 0}</Text>
          </View>
          {!!quote && quote.discount > 0 && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Discount</Text>
              <Text style={[styles.detailValue, styles.detailValueDiscount]}>
                − ₹ {quote.discount}
              </Text>
            </View>
          )}
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>GST (18%)</Text>
            <Text style={styles.detailValue}>₹ {quote?.gst ?? 0}</Text>
          </View>
          <View style={styles.dashedDivider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabelTotal}>Total Amount</Text>
            <Text style={styles.detailValueTotal}>₹ {quote?.total ?? 0}</Text>
          </View>
        </View>

        {/* Bonus Banner */}
        {bonus > 0 && (
          <View style={styles.bonusBanner}>
            <View style={styles.bonusBadge}>
              <Text style={styles.bonusBadgePercent}>{bonusPercent}%</Text>
              <Text style={styles.bonusBadgeSub}>EXTRA</Text>
            </View>
            <View style={styles.bonusSeparator} />
            <Text style={styles.bonusBannerText}>
              <Text style={styles.bonusBannerAmount}>Rs {bonus}</Text>
              {' Will be credited to your wallet after the recharge'}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Pay Button */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={[styles.payBtn, !canPay && styles.payBtnDisabled]}
          onPress={handlePayNow}
          disabled={!canPay}
          activeOpacity={0.85}
        >
          {processing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.payBtnText}>
              {quote && quote.total > 0 ? `Pay ₹ ${quote.total}` : 'Pay Now'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Payment Success Modal */}
      <PaymentSuccessModal
        visible={successVisible}
        amount={successAmount}
        taxId={taxId}
        ctaLabel="Book Ride"
        onCtaPress={handleBookRide}
        closeLabel="Done"
        onClose={() => {
          // Neutral dismiss: close the popup and return to the previous screen
          // (wallet/home) instead of being forced into the booking flow.
          setSuccessVisible(false);
          navigation.goBack();
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 18,
    color: '#1D262D',
  },
  content: { paddingHorizontal: 20, paddingBottom: 140 },

  // Balance
  balanceLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 16,
    color: '#0097B3',
    textAlign: 'center',
    marginTop: 8,
  },
  balanceAmount: {
    fontFamily: 'Inter-Bold',
    fontSize: 28,
    color: '#0097B3',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 28,
    letterSpacing: -0.25,
  },

  sectionTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    color: '#1D262D',
    marginBottom: 16,
  },

  // Amount grid
  amountGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 22,
  },
  amountChip: {
    width: '31.5%',
    height: 63,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D9D9D9',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    alignItems: 'center',
    paddingTop: 12,
    position: 'relative',
  },
  amountChipSelected: {
    borderColor: '#0097B3',
    borderWidth: 1.5,
  },
  amountChipPopular: {
    borderColor: '#FBE825',
    borderWidth: 1.5,
    backgroundColor: '#FFFCDA',
  },
  amountChipText: {
    fontFamily: 'Inter-Bold',
    fontSize: 16,
    color: '#1D262D',
    letterSpacing: -0.25,
  },
  goldStripWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goldStripText: {
    position: 'absolute',
    fontFamily: 'Inter-Regular',
    fontSize: 10,
    color: '#1D262D',
    letterSpacing: -0.2,
  },
  popularBadgeWrap: {
    position: 'absolute',
    top: -8,
    alignSelf: 'center',
    width: 96,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  popularBadgeContent: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  popularBadgeText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 9,
    color: '#FDEF89',
  },

  // Custom amount
  customLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: '#6B7280',
    marginTop: 22,
    marginBottom: 10,
  },
  customInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D9D9D9',
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 52,
  },
  customInputWrapActive: {
    borderColor: '#0097B3',
    borderWidth: 1.5,
  },
  customInputWrapError: {
    borderColor: '#E53935',
  },
  customCurrency: {
    fontFamily: 'Inter-Bold',
    fontSize: 18,
    color: '#1D262D',
    marginRight: 8,
  },
  customInput: {
    flex: 1,
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    color: '#1D262D',
    padding: 0,
  },
  customErrorText: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: '#E53935',
    marginTop: 6,
  },

  sectionDivider: {
    height: 1,
    backgroundColor: '#E5E5E5',
    marginTop: 28,
    marginBottom: 24,
  },

  // Details card (dashed border)
  detailsCard: {
    borderWidth: 1.2,
    borderColor: '#FBE825',
    borderStyle: 'dashed',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: '#FFFEF5',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  detailLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: '#1D262D',
  },
  detailValue: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: '#1D262D',
  },
  detailValueDiscount: {
    color: '#34C759',
  },
  detailLabelTotal: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: '#1D262D',
  },
  detailValueTotal: {
    fontFamily: 'Inter-Bold',
    fontSize: 16,
    color: '#1D262D',
  },
  dashedDivider: {
    borderTopWidth: 1,
    borderTopColor: '#D9D9D9',
    borderStyle: 'dashed',
    marginVertical: 8,
  },

  // Bonus banner
  bonusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFEFEF',
    borderRadius: 6,
    marginTop: 18,
    overflow: 'hidden',
    height: 62,
  },
  bonusBadge: {
    backgroundColor: '#34C759',
    borderRadius: 6,
    width: 76,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bonusBadgePercent: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 18,
    color: '#FFFFFF',
    lineHeight: 22,
  },
  bonusBadgeSub: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  bonusSeparator: {
    width: 1,
    height: 36,
    borderLeftWidth: 1,
    borderLeftColor: '#D0D0D0',
    borderStyle: 'dashed',
    marginLeft: 8,
  },
  bonusBannerText: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: '#1D262D',
    lineHeight: 18,
    paddingHorizontal: 12,
  },
  bonusBannerAmount: {
    fontFamily: 'Inter-SemiBold',
  },

  // Bottom
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 17,
    paddingTop: 12,
  },
  payBtn: {
    height: 52,
    backgroundColor: '#0097B3',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  payBtnDisabled: { opacity: 0.5 },
  payBtnText: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    color: '#FFFFFF',
    textTransform: 'capitalize',
  },
});
