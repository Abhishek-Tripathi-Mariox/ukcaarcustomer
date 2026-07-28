import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  Image,
  TextInput,
  Linking,
} from 'react-native';
import { CallerIcon } from '@/components/icons/CallerIcon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius, s, vs, ms, fs } from '@/theme';
import { useAppDispatch } from '@/store/hooks';
import { sendOtp } from '@/store/slices/authSlice';

interface LoginScreenProps {
  navigation: any;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const dispatch = useAppDispatch();
  const countryCode = '+91';

  const handleGetOTP = async () => {
    setError(null);

    // Backend validator doesn't allow spaces; keep digits only.
    const cleanedPhone = phone.replace(/[^\d]/g, '');

    if (cleanedPhone.length !== 10) return;

    try {
      await dispatch(sendOtp({ phone: cleanedPhone, countryCode })).unwrap();
      navigation.navigate('OTPVerification', {
        phone: cleanedPhone,
        countryCode,
      });
    } catch (e: any) {
      // rejectWithValue() throws the message as a plain STRING, so `e.message`
      // is undefined and the real reason (e.g. "This number is registered as a
      // driver — use the Driver app") was being swallowed by the generic text.
      const msg = typeof e === 'string' ? e : e?.message;
      setError(msg || 'Failed to send OTP. Please try again.');
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
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: insets.top + Spacing['2xl'],
              paddingBottom: insets.bottom + vs(Spacing['3xl']),
            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo */}
          <View style={styles.logoSection}>
            <Image
              source={require('../../../assets/images/ukcaar-logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>

          {/* Title */}
          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.subtitle}>
            Enter your mobile number to continue
          </Text>

          {/* Phone Input — Figma: 362x60 rounded rect, icon 29x29 at left */}
          <View style={styles.phoneInputContainer}>
            <View style={styles.phoneInputRow}>
              <View style={styles.phoneIcon}>
                <CallerIcon size={s(29)} color={Colors.textSecondaryFigma} />
              </View>
              <TextInput
                style={styles.phoneTextInput}
                placeholder="Enter Phone Number"
                placeholderTextColor={Colors.termsMuted}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                maxLength={10}
                selectionColor={Colors.primary}
              />
            </View>
          </View>

          {/* Get OTP Button - Teal */}
          <TouchableOpacity
            style={[styles.ctaButton, phone.replace(/[^\d]/g, '').length !== 10 && styles.ctaButtonDisabled]}
            onPress={handleGetOTP}
            disabled={phone.replace(/[^\d]/g, '').length !== 10}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaText}>Get OTP</Text>
          </TouchableOpacity>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {/* Terms */}
          <Text style={styles.terms}>
            By continuing you agree to our{' '}
            <Text style={styles.termsLink} onPress={() => Linking.openURL('https://ukcaar.com/terms')}>Terms of Services</Text> and{'\n'}
            <Text style={styles.termsLink} onPress={() => Linking.openURL('https://ukcaar.com/privacy')}>Privacy Policy</Text>
          </Text>
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
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: s(Spacing.xl),
    paddingBottom: vs(Spacing['3xl']),
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: vs(Spacing['3xl']),
    marginTop: vs(32),
  },
  logo: {
    width: s(160),
    height: s(160),
    borderRadius: s(80),
  },
  title: {
    fontFamily: 'Inter-ExtraBold', // figma design looks very bold here
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
    textAlign: 'center',
    lineHeight: fs(24),
    letterSpacing: 0,
    marginBottom: vs(Spacing['3xl'] + 8),
  },
  phoneInputContainer: {
    marginBottom: vs(Spacing['2xl']),
  },
  phoneInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.backgroundWhite,
    borderRadius: BorderRadius.base,
    borderWidth: 1,
    borderColor: Colors.border,
    height: ms(64),
    paddingHorizontal: s(Spacing.base),
  },
  phoneIcon: {
    marginRight: s(Spacing.md),
  },
  phoneTextInput: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: fs(18),
    lineHeight: fs(26),
    color: Colors.textPrimary,
    height: '100%',
  },
  ctaButton: {
    width: '100%',
    height: ms(58),
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
    fontSize: fs(14),
    color: Colors.error,
    textAlign: 'center',
    marginBottom: vs(Spacing.md),
  },
});
