import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Animated,
  Keyboard,
  ScrollView,
  Linking,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius, s, vs, ms, fs } from '@/theme';
import { useAppDispatch } from '@/store/hooks';
import { store } from '@/store';
import { sendOtp, verifyOtp } from '@/store/slices/authSlice';

interface OTPScreenProps {
  navigation: any;
  route: { params: { phone: string; countryCode?: string } };
}

const OTP_LENGTH = 6;
const RESEND_TIMER = 30;

export const OTPVerificationScreen: React.FC<OTPScreenProps> = ({
  navigation,
  route,
}) => {
  const dispatch = useAppDispatch();
  const { phone, countryCode = '+91' } = route.params;
  const insets = useSafeAreaInsets();
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [timer, setTimer] = useState(RESEND_TIMER);
  const [canResend, setCanResend] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRefs = useRef<TextInput[]>([]);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setTimeout(() => inputRefs.current[0]?.focus(), 500);

    const interval = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          setCanResend(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Auto-verify once all 6 digits are in. Runs AFTER React commits the state,
  // so onChangeText has returned and Android's IME has finished its commit —
  // Keyboard.dismiss() then sticks reliably.
  useEffect(() => {
    const fullOtp = otp.join('');
    if (fullOtp.length === OTP_LENGTH && !fullOtp.includes('') && !verifying) {
      inputRefs.current.forEach((ref) => ref?.blur());
      Keyboard.dismiss();
      handleVerify(fullOtp);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp]);

  const handleOtpChange = (text: string, index: number) => {
    // Only accept digits
    const digits = text.replace(/[^\d]/g, '');

    // Empty change = user hit backspace on a filled box. Clear it and step back
    // so the next backspace immediately clears the previous box (smooth delete).
    if (digits.length === 0) {
      const newOtp = [...otp];
      newOtp[index] = '';
      setOtp(newOtp);
      if (index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
      return;
    }

    if (digits.length > 1) {
      // Paste / multi-digit input — fill from current index
      const newOtp = [...otp];
      const pastedDigits = digits.slice(0, OTP_LENGTH - index).split('');
      pastedDigits.forEach((digit, i) => {
        newOtp[i + index] = digit;
      });
      setOtp(newOtp);

      const fullOtp = newOtp.join('');
      const isComplete = fullOtp.length === OTP_LENGTH && !fullOtp.includes('');

      if (isComplete) {
        } else {
        const nextIndex = Math.min(index + pastedDigits.length, OTP_LENGTH - 1);
        inputRefs.current[nextIndex]?.focus();
      }
      return;
    }

    // Single digit typed. If this slot already had a digit (user is mid-edit after
    // clearing a different slot), route the new digit to the first empty slot
    // instead of overwriting.
    const newOtp = [...otp];
    let writeIndex = index;
    if (otp[index]) {
      const firstEmpty = newOtp.findIndex((d) => d === '');
      if (firstEmpty !== -1) {
        writeIndex = firstEmpty;
      }
    }
    newOtp[writeIndex] = digits;
    setOtp(newOtp);

    const fullOtp = newOtp.join('');
    const isComplete = fullOtp.length === OTP_LENGTH && !fullOtp.includes('');

    if (isComplete) {
      // All digits in — lock keyboard. The useEffect on `otp` handles dismiss + verify.
      return;
    }

    // Move focus to the next empty slot.
    const nextEmpty = newOtp.findIndex((d) => d === '');
    if (nextEmpty !== -1) {
      inputRefs.current[nextEmpty]?.focus();
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    // Handle backspace on an already-empty box: jump back and clear the previous one.
    // (When the box has a digit, Android fires onChangeText('') instead — handled above.)
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      const newOtp = [...otp];
      newOtp[index - 1] = '';
      setOtp(newOtp);
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async (code?: string) => {
    if (verifying) return;
    const otpCode = code || otp.join('');
    if (otpCode.length === OTP_LENGTH) {
      Keyboard.dismiss();
      setError(null);
      setVerifying(true);
      try {
        await dispatch(verifyOtp({ phone, countryCode, otp: otpCode })).unwrap();
        const { isProfileSetup } = store.getState().auth;
        if (!isProfileSetup) {
          // New user — complete profile first
          navigation.navigate('CompleteProfile');
        } else {
          navigation.getParent()?.reset({ index: 0, routes: [{ name: 'MainApp' }] });
        }
      } catch (e: any) {
        // unwrap() rethrows rejectWithValue's plain STRING — read it directly,
        // else the server's real reason (suspended account, wrong app) is lost.
        const msg = typeof e === 'string' ? e : e?.message;
        setError(msg || 'Invalid OTP. Please try again.');
        Animated.sequence([
          Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
          Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
          Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
          Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
        ]).start();
      } finally {
        setVerifying(false);
      }
    } else {
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
      ]).start();
    }
  };

  const handleResend = async () => {
    if (canResend) {
      if (verifying) return;
      setError(null);
      setTimer(RESEND_TIMER);
      setCanResend(false);
      setOtp(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();

      try {
        await dispatch(sendOtp({ phone, countryCode })).unwrap();
      } catch (e: any) {
        const msg = typeof e === 'string' ? e : e?.message;
        setError(msg || 'Failed to resend OTP. Please try again.');
        setCanResend(true);
      }
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.lg }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Back arrow */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="chevron-back" size={s(28)} color={Colors.textOnLight} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>

          {/* Top section — title, subtitle, OTP inputs */}
          <View style={styles.topSection}>
            <Text style={styles.title}>Phone verification</Text>
            <Text style={styles.subtitle}>
              We've sent a {OTP_LENGTH}-digit verification code to your mobile number or email. Please enter the code below to verify your identity.
            </Text>

            {/* OTP Inputs */}
            <Animated.View
              style={[styles.otpRow, { transform: [{ translateX: shakeAnim }] }]}
            >
              {otp.map((digit, index) => (
                <TextInput
                  key={index}
                  ref={(ref) => {
                    if (ref) inputRefs.current[index] = ref;
                  }}
                  style={[
                    styles.otpInput,
                    !!digit && styles.otpInputFilled,
                  ]}
                  value={digit}
                  onChangeText={(text) => handleOtpChange(text, index)}
                  onKeyPress={(e) => handleKeyPress(e, index)}
                  keyboardType="number-pad"
                  maxLength={1}
                  selectionColor={Colors.primary}
                  caretHidden
                  blurOnSubmit={false}
                  textContentType={index === 0 ? 'oneTimeCode' : 'none'}
                  autoComplete={index === 0 ? 'sms-otp' : 'off'}
                  importantForAutofill={index === 0 ? 'yes' : 'no'}
                />
              ))}
            </Animated.View>

            {/* Timer / Resend */}
            <View style={styles.resendContainer}>
              {canResend ? (
                <TouchableOpacity onPress={handleResend}>
                  <Text style={styles.resendLabel}>
                    Didn't receive code?{' '}
                    <Text style={styles.resendActive}>Resend again</Text>
                  </Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.timerText}>
                  Didn't receive code?{' '}
                  <Text style={styles.timerCount}>
                    {`0:${timer.toString().padStart(2, '0')}`}
                  </Text>
                </Text>
              )}
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            {/* Verify button — sits directly below OTP so it rides above the keyboard */}
            <TouchableOpacity
              style={[
                styles.ctaButton,
                (otp.join('').length !== OTP_LENGTH || verifying) && styles.ctaButtonDisabled,
              ]}
              onPress={() => handleVerify()}
              disabled={otp.join('').length !== OTP_LENGTH || verifying}
              activeOpacity={0.85}
            >
              <Text style={styles.ctaText}>Verify</Text>
            </TouchableOpacity>

            <Text style={styles.terms}>
              By continuing you agree to our{' '}
              <Text style={styles.termsLink} onPress={() => Linking.openURL('https://ukcaar.com/terms')}>Terms of Services</Text> and{'\n'}
              <Text style={styles.termsLink} onPress={() => Linking.openURL('https://ukcaar.com/privacy')}>Privacy Policy</Text>
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.backgroundWhite,
  },
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: s(Spacing.xl),
    paddingBottom: vs(Spacing['2xl']),
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: -Spacing.sm,
    marginBottom: vs(Spacing['3xl']),
  },
  backText: {
    fontFamily: 'Inter-Medium',
    fontSize: fs(17),
    color: Colors.textPrimary,
    marginLeft: s(4),
  },
  topSection: {
    // No flex: 1 — let ScrollView handle sizing so the Verify button rides up
    // naturally when the keyboard opens.
  },
  title: {
    fontFamily: 'Inter-Bold',
    fontSize: fs(30),
    lineHeight: fs(40),
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: vs(Spacing.md),
  },
  subtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(16),
    color: Colors.textPrimary,
    lineHeight: fs(24),
    textAlign: 'center',
    letterSpacing: 0,
    marginBottom: vs(Spacing['3xl'] + 8),
  },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: vs(Spacing.xl),
    gap: s(Spacing.md),
  },
  otpInput: {
    width: s(52),
    height: ms(56),
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.backgroundInput,
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
    textAlign: 'center',
    fontFamily: 'Inter-Bold',
    fontSize: fs(22),
    color: Colors.textPrimary,
    padding: 0,
  },
  otpInputFilled: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryMuted,
  },
  resendContainer: {
    alignItems: 'center',
    marginBottom: vs(Spacing.lg),
  },
  timerText: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(16),
    color: Colors.textSecondary,
  },
  timerCount: {
    fontFamily: 'Inter-SemiBold',
    color: Colors.primary,
  },
  resendLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(16),
    color: Colors.textSecondary,
  },
  resendActive: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(16),
    color: Colors.error,
  },
  bottomSection: {
    paddingBottom: vs(Spacing['2xl']),
    alignItems: 'center',
  },
  ctaButton: {
    width: '100%',
    height: ms(58),
    marginTop: vs(Spacing.lg),
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.button,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: vs(Spacing.xl),
  },
  ctaButtonDisabled: {
    opacity: 0.5,
  },
  ctaText: {
    fontFamily: 'Inter-Medium',
    fontSize: fs(18),
    lineHeight: fs(24),
    color: Colors.textOnPrimary,
  },
  terms: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(14),
    color: Colors.termsMuted,
    textAlign: 'center',
    lineHeight: fs(22),
  },
  termsLink: {
    color: Colors.link,
  },
  errorText: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(16),
    color: Colors.error,
    textAlign: 'center',
    marginBottom: vs(Spacing.md),
  },
});
