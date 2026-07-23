import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  Image,
  Share,
  Linking,
  Alert,
  Modal,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, {
  Path,
  Circle,
  Rect,
  Defs,
  LinearGradient,
  Stop,
  Ellipse,
  G,
} from 'react-native-svg';
import { BackArrowIcon } from '@/components/icons/ProfileIcons';
import { authService } from '@/services/authService';
import { appSettingsService } from '@/services/appSettingsService';

const whatsappIcon = require('../../../assets/refer-earn/whatsapp.png');
const facebookIcon = require('../../../assets/refer-earn/facebook.png');
const telegramIcon = require('../../../assets/refer-earn/telegram.png');
const shareIcon = require('../../../assets/refer-earn/share.png');

interface ReferEarnScreenProps {
  navigation: any;
}

// The bonus is admin-configured. It used to be hardcoded "₹400" here while the
// Account row promised "₹10" — two invented numbers, neither matching the
// referralBonus the admin actually set.
const buildReferralMessage = (code: string, bonus: number) =>
  bonus > 0
    ? `Hey! Book your rides with UKCAAR and get ₹${bonus} bonus. Use my referral code: ${code}`
    : `Hey! Book your rides with UKCAAR. Use my referral code: ${code}`;

// Three-step illustration: person meditating → phone (recharge) → wallet with coins
const ReferIllustration: React.FC = () => (
  <Svg width="100%" height={136} viewBox="0 0 370 136" fill="none">
    <Defs>
      <LinearGradient id="bg" x1="0" y1="0" x2="370" y2="0" gradientUnits="userSpaceOnUse">
        <Stop offset="0" stopColor="#FFB547" />
        <Stop offset="0.5" stopColor="#FEFEF9" />
        <Stop offset="1" stopColor="#FFB547" />
      </LinearGradient>
    </Defs>
    <Rect x="0" y="0" width="370" height="136" rx="15" fill="url(#bg)" />

    {/* Dotted connector lines */}
    <G opacity={0.7}>
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <Circle key={`d1-${i}`} cx={88 + i * 10} cy={50} r={1.4} fill="#FFFFFF" />
      ))}
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <Circle key={`d2-${i}`} cx={198 + i * 10} cy={50} r={1.4} fill="#FFFFFF" />
      ))}
    </G>

    {/* Person (meditating) — simplified silhouette */}
    <G transform="translate(30, 18)">
      {/* Head */}
      <Circle cx={28} cy={14} r={11} fill="#2B2B2B" />
      <Path d="M17 16 Q17 28 28 28 Q39 28 39 16 L39 10 Q28 4 17 10 Z" fill="#2B2B2B" />
      {/* Face */}
      <Circle cx={28} cy={17} r={8} fill="#F4C9A8" />
      {/* Shirt */}
      <Path
        d="M12 50 Q12 34 28 32 Q44 34 44 50 L44 58 Q28 62 12 58 Z"
        fill="#FFFFFF"
      />
      {/* Arms resting on knees */}
      <Circle cx={12} cy={56} r={5} fill="#F4C9A8" />
      <Circle cx={44} cy={56} r={5} fill="#F4C9A8" />
      {/* Legs crossed */}
      <Path
        d="M6 62 Q28 56 50 62 Q52 72 50 78 L6 78 Q4 72 6 62 Z"
        fill="#7FC8E0"
      />
      {/* Shadow */}
      <Ellipse cx={28} cy={82} rx={24} ry={3} fill="#00000020" />
    </G>

    {/* Phone with "Recharge" screen */}
    <G transform="translate(160, 12)">
      {/* Phone body */}
      <Rect x={0} y={0} width={50} height={88} rx={8} fill="#FFFFFF" stroke="#E0E0E0" strokeWidth={1} />
      <Rect x={3} y={10} width={44} height={72} rx={3} fill="#FAFAFA" />
      {/* Notch */}
      <Rect x={18} y={3} width={14} height={3} rx={1.5} fill="#E0E0E0" />
      {/* "Recharge" label */}
      <Rect x={8} y={18} width={34} height={10} rx={2} fill="#FFFFFF" stroke="#CCCCCC" strokeWidth={0.5} />
      <Rect x={11} y={22} width={18} height={2} rx={1} fill="#1B1D21" />
      {/* Success check */}
      <Circle cx={25} cy={48} r={8} fill="#00BF00" />
      <Path
        d="M21 48 L24 51 L29 45"
        stroke="#FFFFFF"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Home bar */}
      <Rect x={17} y={78} width={16} height={1.5} rx={0.75} fill="#CCCCCC" />
      {/* Shadow */}
      <Ellipse cx={25} cy={96} rx={22} ry={3} fill="#00000020" />
    </G>

    {/* Wallet with coins */}
    <G transform="translate(275, 22)">
      {/* Wallet body */}
      <Path
        d="M6 20 Q6 14 12 14 L58 14 Q64 14 64 20 L64 56 Q64 62 58 62 L12 62 Q6 62 6 56 Z"
        fill="#8B4BCA"
      />
      {/* Wallet flap highlight */}
      <Path
        d="M6 20 Q6 14 12 14 L58 14 Q64 14 64 20 L64 30 L6 30 Z"
        fill="#A566DD"
      />
      {/* Clasp circle */}
      <Circle cx={52} cy={40} r={5} fill="#FFD84D" />
      <Circle cx={52} cy={40} r={2.5} fill="#8B4BCA" />

      {/* Coin stack */}
      <G>
        <Ellipse cx={22} cy={10} rx={10} ry={3} fill="#FFC93C" />
        <Rect x={12} y={7} width={20} height={6} fill="#FFD84D" />
        <Ellipse cx={22} cy={7} rx={10} ry={3} fill="#FFD84D" />
        <Ellipse cx={22} cy={7} rx={7} ry={2} fill="#FFE680" />
      </G>
      <G>
        <Ellipse cx={38} cy={4} rx={8} ry={2.5} fill="#FFC93C" />
        <Rect x={30} y={1} width={16} height={5} fill="#FFD84D" />
        <Ellipse cx={38} cy={1} rx={8} ry={2.5} fill="#FFD84D" />
      </G>
      {/* Falling coins */}
      <Circle cx={18} cy={-2} r={3.5} fill="#FFD84D" stroke="#E0A020" strokeWidth={0.5} />
      <Circle cx={48} cy={-6} r={3} fill="#FFD84D" stroke="#E0A020" strokeWidth={0.5} />

      {/* Shadow */}
      <Ellipse cx={35} cy={70} rx={30} ry={3} fill="#00000020" />
    </G>
  </Svg>
);

export const ReferEarnScreen: React.FC<ReferEarnScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [copied, setCopied] = useState(false);
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [enteredCode, setEnteredCode] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [referralCount, setReferralCount] = useState(0);
  const [referrerReward, setReferrerReward] = useState(
    appSettingsService.peek().referrerRewardCustomer,
  );
  const [joinerBonus, setJoinerBonus] = useState(
    appSettingsService.peek().referralBonus,
  );
  useEffect(() => {
    // force=true: always show the CURRENT admin-configured amounts when the
    // rider opens this screen, never a session-stale value.
    appSettingsService
      .get(true)
      .then((cfg) => {
        setReferrerReward(cfg.referrerRewardCustomer);
        setJoinerBonus(cfg.referralBonus);
      })
      .catch(() => {});
  }, []);

  // Pull the real referral code + count from /auth/me. The backend
  // auto-generates a unique referralCode per user and reports how many
  // signups used it (data.referrals.count).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await authService.getMe();
        if (!alive) return;
        const code = res?.data?.user?.referralCode;
        const count = res?.data?.referrals?.count;
        if (code) setReferralCode(code);
        if (typeof count === 'number') setReferralCount(count);
      } catch {
        // Leave the placeholder if the fetch fails (offline, etc.).
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const referralMessage = buildReferralMessage(referralCode, referrerReward);

  const openCodeModal = () => {
    setEnteredCode('');
    setShowCodeModal(true);
  };

  const [applying, setApplying] = useState(false);

  const submitCode = async () => {
    const code = enteredCode.trim();
    if (!code) {
      Alert.alert('Enter a code', 'Please enter a referral code.');
      return;
    }
    setApplying(true);
    try {
      const res = await authService.applyReferral(code);
      setShowCodeModal(false);
      if (res.success) {
        const credited = res.data?.bonusCredited ?? 0;
        if (credited > 0) {
          Alert.alert('Referral applied', `₹${credited} has been added to your wallet.`);
        }
        setShowSuccessModal(true);
      } else {
        Alert.alert('Could not apply', res.message || 'Invalid referral code.');
      }
    } catch (err: any) {
      Alert.alert('Could not apply', err?.response?.data?.message || 'Invalid or already-used referral code.');
    } finally {
      setApplying(false);
    }
  };

  const copyCode = async () => {
    if (!referralCode) return;
    try {
      await Share.share({ message: referralCode });
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // user cancelled
    }
  };

  const shareWhatsApp = async () => {
    if (!referralCode) return;
    const url = `whatsapp://send?text=${encodeURIComponent(referralMessage)}`;
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      Linking.openURL(url);
    } else {
      Alert.alert('WhatsApp not installed', 'Please install WhatsApp to share.');
    }
  };

  const shareGeneric = async (scheme?: string) => {
    if (!referralCode) return;
    try {
      if (scheme) {
        const url = `${scheme}${encodeURIComponent(referralMessage)}`;
        const ok = await Linking.canOpenURL(url);
        if (ok) {
          Linking.openURL(url);
          return;
        }
      }
      await Share.share({ message: referralMessage });
    } catch {
      // user cancelled
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      {/* Teal header */}
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <TouchableOpacity
          style={styles.headerBack}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <BackArrowIcon size={18} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Refer & Earn</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>
          {referrerReward > 0 ? (
            <>
              Invite your Friend and Earn{' '}
              <Text style={styles.titleBold}>₹{referrerReward}</Text>
            </>
          ) : (
            'Invite your Friend and Earn Rewards'
          )}
        </Text>
        <Text style={styles.subtitle}>
          {referralCount > 0
            ? `${referralCount} friend${referralCount === 1 ? '' : 's'} joined so far`
            : 'For every new user refer'}
        </Text>

        {/* Illustration card */}
        <View style={styles.illustrationWrap}>
          <ReferIllustration />
          <View style={styles.illustrationLabels}>
            <Text style={styles.stepLabel}>{'Invite your\nFriend'}</Text>
            <Text style={styles.stepLabel}>{'Friend takes\ntheir first ride'}</Text>
            <Text style={styles.stepLabel}>
              {referrerReward > 0 ? 'You get\n₹' + String(referrerReward) : 'You earn\nrewards'}
            </Text>
          </View>
        </View>

        {/* Referral code box */}
        <View style={styles.codeBox}>
          <Text style={styles.codeLabel}>Your Referral Code : </Text>
          <Text style={styles.codeValue}>{referralCode || 'Loading…'}</Text>
          <TouchableOpacity style={styles.copyBtn} onPress={copyCode}>
            <Svg width={19} height={22} viewBox="0 0 19 22" fill="none">
              <Path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M14 0H2C0.9 0 0 0.9 0 2V16H2V2H14V0ZM17 4H6C4.9 4 4 4.9 4 6V20C4 21.1 4.9 22 6 22H17C18.1 22 19 21.1 19 20V6C19 4.9 18.1 4 17 4ZM17 20H6V6H17V20Z"
                fill="#000000"
              />
            </Svg>
          </TouchableOpacity>
        </View>
        {copied && <Text style={styles.copiedHint}>Copied!</Text>}

        {/* Share prompt */}
        <Text style={styles.sharePrompt}>
          {referrerReward > 0
            ? 'Share your referral code and earn ₹' + String(referrerReward) + ' when your friend takes their first ride'
            : 'Share your referral code and earn rewards when your friend takes their first ride'}
        </Text>

        {/* Social icons row */}
        <View style={styles.socialRow}>
          <TouchableOpacity onPress={() => shareGeneric('fb://')} activeOpacity={0.8}>
            <Image source={facebookIcon} style={styles.socialIcon} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => shareGeneric('tg://msg?text=')} activeOpacity={0.8}>
            <Image source={telegramIcon} style={styles.socialIcon} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => shareGeneric()} activeOpacity={0.8}>
            <Image source={shareIcon} style={styles.socialIcon} />
          </TouchableOpacity>
        </View>

        {/* WhatsApp CTA */}
        <TouchableOpacity
          style={styles.whatsappBtn}
          onPress={shareWhatsApp}
          activeOpacity={0.85}
        >
          <Image source={whatsappIcon} style={styles.whatsappIcon} />
          <Text style={styles.whatsappText}>Refer Via Whatsapp</Text>
        </TouchableOpacity>

        {/* Have a referral code? */}
        <TouchableOpacity onPress={openCodeModal} activeOpacity={0.7}>
          <Text style={styles.haveCode}>Have a referral code?</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Have A Referral Code? — input modal */}
      <Modal
        visible={showCodeModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCodeModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
        <Pressable style={styles.backdrop} onPress={() => setShowCodeModal(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Have A Referral Code?</Text>
              <TouchableOpacity
                onPress={() => setShowCodeModal(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
                  <Path
                    d="M2 2 L14 14 M14 2 L2 14"
                    stroke="#000000"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                  />
                </Svg>
              </TouchableOpacity>
            </View>
            <View style={styles.modalDivider} />

            <View style={styles.codeInputWrap}>
              <TextInput
                value={enteredCode}
                onChangeText={setEnteredCode}
                placeholder="Enter Code"
                placeholderTextColor="rgba(0,0,0,0.2)"
                style={styles.codeInput}
                autoCapitalize="characters"
                autoCorrect={false}
              />
            </View>

            <Text style={styles.modalDesc}>
              {joinerBonus > 0 ? (
                <>
                  Enter the referral code received and{'\n'}
                  instantly get{' '}
                  <Text style={styles.modalDescBold}>₹{joinerBonus}</Text> in
                  your UKCAAR Wallet.
                </>
              ) : (
                'Enter the referral code you received to link your account.'
              )}
            </Text>

            <TouchableOpacity
              style={[styles.modalCta, applying && { opacity: 0.6 }]}
              onPress={submitCode}
              activeOpacity={0.85}
              disabled={applying}
            >
              <Text style={styles.modalCtaText}>{applying ? 'Submitting…' : 'Submit'}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Referral Code Applied — success modal */}
      <Modal
        visible={showSuccessModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSuccessModal(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setShowSuccessModal(false)}
        >
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.successIconWrap}>
              <Svg width={112} height={112} viewBox="0 0 112 112" fill="none">
                <Circle
                  cx={56}
                  cy={56}
                  r={54}
                  stroke="#00BF00"
                  strokeWidth={3}
                  fill="#FFFFFF"
                />
                <Circle cx={56} cy={56} r={41} fill="#B8F0B8" />
                <Circle cx={56} cy={56} r={30} fill="#0097B3" />
                <Path
                  d="M43 57 L52 66 L70 47"
                  stroke="#FFFFFF"
                  strokeWidth={4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </Svg>
            </View>

            <Text style={styles.successTitle}>Referral Code Applied</Text>
            <Text style={styles.successDesc}>
              We will credit your Referral once{'\n'}
              you've created an account
            </Text>

            <TouchableOpacity
              style={styles.modalCta}
              onPress={() => setShowSuccessModal(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.modalCtaText}>Done</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    backgroundColor: '#0097B3',
    paddingBottom: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  headerBack: {
    position: 'absolute',
    left: 16,
    bottom: 14,
    padding: 4,
  },
  headerTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    lineHeight: 24,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  scroll: { flex: 1 },
  content: {
    paddingTop: 26,
    paddingHorizontal: 16,
    paddingBottom: 40,
    alignItems: 'center',
  },
  title: {
    fontFamily: 'Inter-Regular',
    fontSize: 16,
    color: '#000000',
    textAlign: 'center',
  },
  titleBold: {
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
  },
  subtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 16,
    color: '#000000',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 20,
  },
  illustrationWrap: {
    width: '100%',
    marginTop: 4,
  },
  illustrationLabels: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 10,
  },
  stepLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    lineHeight: 16,
    color: '#000000',
    textAlign: 'center',
    letterSpacing: 0.36,
    width: 90,
  },
  codeBox: {
    width: '100%',
    height: 46,
    borderRadius: 71,
    borderWidth: 1,
    borderColor: '#C4C4C4',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    marginTop: 22,
    shadowColor: '#D3C000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.52,
    shadowRadius: 4,
    elevation: 2,
  },
  codeLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: '#000000',
    opacity: 0.5,
    letterSpacing: 0.42,
  },
  codeValue: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    color: '#000000',
    letterSpacing: 0.42,
  },
  copyBtn: {
    position: 'absolute',
    right: 16,
    padding: 4,
    opacity: 0.3,
  },
  copiedHint: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    color: '#00BF00',
    marginTop: 6,
  },
  sharePrompt: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: '#000000',
    textAlign: 'center',
    marginTop: 20,
    letterSpacing: 0.42,
    lineHeight: 20,
  },
  socialRow: {
    flexDirection: 'row',
    gap: 18,
    marginTop: 16,
  },
  socialIcon: {
    width: 30,
    height: 30,
    resizeMode: 'contain',
  },
  whatsappBtn: {
    marginTop: 24,
    height: 46,
    width: 248,
    borderRadius: 71,
    backgroundColor: '#00BF00',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#D3C000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.52,
    shadowRadius: 4,
    elevation: 3,
  },
  whatsappIcon: {
    width: 21,
    height: 24,
    resizeMode: 'contain',
  },
  whatsappText: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: '#FFFFFF',
    letterSpacing: 0.42,
  },
  haveCode: {
    marginTop: 24,
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: '#FF7811',
    textDecorationLine: 'underline',
    letterSpacing: 0.42,
  },
  flex: { flex: 1 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 370,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingTop: 20,
    paddingBottom: 28,
    paddingHorizontal: 22,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  modalHeaderRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
  },
  modalTitle: {
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    fontSize: 16,
    color: '#000000',
  },
  modalDivider: {
    width: '100%',
    height: 1,
    backgroundColor: '#EAEAEA',
    marginBottom: 24,
  },
  codeInputWrap: {
    width: '100%',
    height: 46,
    borderRadius: 71,
    borderWidth: 1,
    borderColor: '#C4C4C4',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    paddingHorizontal: 22,
    shadowColor: '#D3C000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.52,
    shadowRadius: 6,
    elevation: 2,
  },
  codeInput: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: '#000000',
    padding: 0,
    letterSpacing: 0.42,
  },
  modalDesc: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    lineHeight: 20,
    color: '#000000',
    opacity: 0.7,
    textAlign: 'center',
    marginTop: 22,
    marginBottom: 26,
    letterSpacing: 0.3,
  },
  modalDescBold: {
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#000000',
    opacity: 1,
  },
  modalCta: {
    width: 235,
    height: 46,
    borderRadius: 8,
    backgroundColor: '#0097B3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCtaText: {
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    fontSize: 14,
    color: '#FFFFFF',
    letterSpacing: 0.42,
  },
  successIconWrap: {
    marginTop: 10,
    marginBottom: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    fontSize: 16,
    color: '#000000',
    textAlign: 'center',
  },
  successDesc: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    lineHeight: 20,
    color: '#000000',
    opacity: 0.7,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 24,
    letterSpacing: 0.3,
  },
});
