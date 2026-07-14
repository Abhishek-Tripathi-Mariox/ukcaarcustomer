import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  StatusBar,
  Modal,
  Dimensions,
  Image,
  Alert,
  ActivityIndicator,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  launchCamera,
  launchImageLibrary,
  type ImagePickerResponse,
} from 'react-native-image-picker';
import { Colors, Typography, Spacing, BorderRadius, FontFamily } from '@/theme';
import { fs, s, vs } from '@/theme/responsive';
import { KeyboardAwareScrollView } from '@/components/common';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { updateProfile, uploadAvatar } from '@/store/slices/authSlice';

const { width } = Dimensions.get('window');

interface CompleteProfileScreenProps {
  navigation: any;
}

type RidePreference = 'Comfort' | 'Economy' | 'Premium';

export const CompleteProfileScreen: React.FC<CompleteProfileScreenProps> = ({
  navigation,
}) => {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const { loading } = useAppSelector((state) => state.auth);
  
  const [fullName, setFullName] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [selectedPreference, setSelectedPreference] = useState<RidePreference>('Comfort');
  const [showWelcome, setShowWelcome] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preferences: RidePreference[] = ['Comfort', 'Economy', 'Premium'];

  const requestCameraPermission = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.CAMERA,
        {
          title: 'Camera Permission',
          message: 'This app needs access to your camera to take a profile picture.',
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'OK',
        }
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (err) {
      console.warn('[CameraPermission] error:', err);
      return false;
    }
  };

  const launchPicker = async (source: 'camera' | 'gallery') => {
    try {
      if (source === 'camera') {
        const hasPermission = await requestCameraPermission();
        if (!hasPermission) {
          Alert.alert(
            'Permission Denied',
            'Camera permission is required to take a photo.'
          );
          return;
        }
      }

      const launch = source === 'camera' ? launchCamera : launchImageLibrary;

      const result: ImagePickerResponse = await launch({
        mediaType: 'photo',
        quality: 0.8,
        includeBase64: false,
        maxWidth: 1024,
        maxHeight: 1024,
      });

      if (result.didCancel) return;
      if (result.errorCode) {
        if (result.errorCode === 'permission') {
          Alert.alert(
            'Permission Required',
            source === 'camera'
              ? 'Please allow camera access to take a profile picture.'
              : 'Please allow access to your photo library to upload a profile picture.'
          );
          return;
        }
        Alert.alert('Error', result.errorMessage || 'Failed to pick image.');
        return;
      }

      const asset = result.assets?.[0];
      if (asset?.uri) {
        setAvatarUri(asset.uri);
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    }
  };

  const handlePickImage = () => {
    Alert.alert('Profile Photo', 'Choose an option', [
      { text: 'Take Photo', onPress: () => launchPicker('camera') },
      { text: 'Choose from Gallery', onPress: () => launchPicker('gallery') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleSave = async () => {
    const trimmedName = fullName.trim();
    if (trimmedName.length === 0) return;

    setError(null);
    setSaving(true);

    try {
      // Upload avatar if selected
      if (avatarUri) {
        await dispatch(uploadAvatar(avatarUri)).unwrap();
      }

      // Split at the first space
      const spaceIndex = trimmedName.indexOf(' ');
      let parsedFirstName = '';
      let parsedLastName = '';
      if (spaceIndex === -1) {
        parsedFirstName = trimmedName;
      } else {
        parsedFirstName = trimmedName.slice(0, spaceIndex).trim();
        parsedLastName = trimmedName.slice(spaceIndex + 1).trim();
      }

      // Update profile
      await dispatch(updateProfile({
        firstName: parsedFirstName,
        lastName: parsedLastName,
      })).unwrap();

      // Ride preference has no backend field yet — persist it locally so the
      // choice isn't silently discarded (and can drive default ride-type later).
      await AsyncStorage.setItem('pref.ridePreference', selectedPreference);

      setShowWelcome(true);
    } catch (err: any) {
      console.error('Profile save error:', JSON.stringify(err, null, 2));
      setError(typeof err === 'string' ? err : err?.message || 'Failed to save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleWelcomeContinue = () => {
    setShowWelcome(false);
    navigation.navigate('EnableLocation');
  };

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      <KeyboardAwareScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 16 }]}
      >
        {/* Title */}
        <Text style={styles.title}>Complete Your Profile</Text>
        <Text style={styles.subtitle}>Just a few more details to get started</Text>

        {/* Avatar */}
        <TouchableOpacity style={styles.avatarSection} onPress={handlePickImage}>
          <View style={styles.avatarWrapper}>
            <View style={styles.avatarCircle}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
              ) : (
                <Ionicons name="person-outline" size={s(40)} color={Colors.primary} />
              )}
            </View>
            <View style={styles.cameraButton}>
              <Ionicons name="camera" size={s(18)} color={Colors.textOnPrimary} />
            </View>
          </View>
          <Text style={styles.avatarHint}>Tap to add photo</Text>
        </TouchableOpacity>

        {/* Full Name */}
        <Text style={styles.inputLabel}>Full Name</Text>
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            placeholder="Enter your full name"
            placeholderTextColor={Colors.termsMuted}
            value={fullName}
            onChangeText={setFullName}
            selectionColor={Colors.primary}
            autoCapitalize="words"
          />
        </View>

        {/* Ride Preference */}
        <Text style={[styles.inputLabel, { fontFamily: FontFamily.bold, fontWeight: '700' }]}>Ride Preference</Text>
        <View style={styles.preferenceRow}>
          {preferences.map((pref) => (
            <TouchableOpacity
              key={pref}
              style={[
                styles.preferenceChip,
                selectedPreference === pref && styles.preferenceChipActive,
              ]}
              onPress={() => setSelectedPreference(pref)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.preferenceText,
                  selectedPreference === pref && styles.preferenceTextActive,
                ]}
              >
                {pref}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}

        {/* Save & Continue */}
        <TouchableOpacity
          style={[styles.ctaButton, (!fullName.trim() || saving) && styles.ctaButtonDisabled]}
          onPress={handleSave}
          disabled={!fullName.trim() || saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color={Colors.textOnPrimary} />
          ) : (
            <Text style={styles.ctaText}>Save & Continue</Text>
          )}
        </TouchableOpacity>
      </KeyboardAwareScrollView>

      {/* Welcome Modal */}
      <Modal
        visible={showWelcome}
        transparent
        animationType="fade"
        onRequestClose={handleWelcomeContinue}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Checkmark */}
            <View style={styles.checkCircle}>
              <Ionicons name="checkmark" size={s(40)} color={Colors.primary} />
            </View>

            <Text style={styles.welcomeTitle}>
              Welcome, {fullName.trim().split(' ')[0]}
            </Text>
            <Text style={styles.welcomeSubtitle}>Your profile is all set.</Text>

            <TouchableOpacity
              style={styles.modalButton}
              onPress={handleWelcomeContinue}
              activeOpacity={0.85}
            >
              <Text style={styles.modalButtonText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.backgroundWhite,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing['3xl'],
  },
  title: {
    fontFamily: 'Inter-Bold',
    fontSize: fs(30),
    lineHeight: fs(40),
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  subtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(16),
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: fs(24),
    letterSpacing: 0,
    marginBottom: Spacing['2xl'],
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: Spacing['2xl'],
  },
  avatarWrapper: {
    width: s(131),
    height: s(131),
    position: 'relative',
  },
  avatarCircle: {
    width: s(131),
    height: s(131),
    borderRadius: s(66),
    backgroundColor: Colors.primaryMuted,
    borderWidth: 2,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: s(66),
  },
  avatarHint: {
    ...Typography.caption,
    fontFamily: 'Inter-Regular',
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
  },
  cameraButton: {
    position: 'absolute',
    bottom: vs(5),
    right: s(5),
    width: s(42),
    height: s(42),
    borderRadius: s(21),
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: Colors.backgroundWhite,
  },
  inputLabel: {
    ...Typography.label,
    fontFamily: 'Inter-Medium',
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  inputContainer: {
    marginBottom: Spacing.xl,
  },
  textInput: {
    backgroundColor: Colors.backgroundInput,
    borderRadius: BorderRadius.button,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    paddingHorizontal: Spacing.base,
    height: vs(50),
    ...Typography.bodyLarge,
    fontFamily: 'Inter-Regular',
    color: Colors.textPrimary,
  },
  preferenceRow: {
    flexDirection: 'row',
    gap: Spacing.base,
    marginBottom: Spacing['3xl'],
  },
  preferenceChip: {
    flex: 1,
    height: vs(60),
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.base,
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.backgroundWhite,
  },
  preferenceChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryMuted,
  },
  preferenceText: {
    ...Typography.label,
    fontFamily: 'Inter-Medium',
    color: Colors.textSecondary,
  },
  preferenceTextActive: {
    color: Colors.primary,
  },
  errorText: {
    ...Typography.caption,
    fontFamily: 'Inter-Regular',
    color: Colors.error,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  ctaButton: {
    width: '100%',
    height: vs(58),
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaButtonDisabled: {
    opacity: 0.5,
  },
  ctaText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(18),
    lineHeight: fs(24),
    color: Colors.textOnPrimary,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.backgroundOverlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalContent: {
    width: width - s(64),
    backgroundColor: Colors.backgroundWhite,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing['3xl'],
    paddingHorizontal: Spacing['2xl'],
    alignItems: 'center',
  },
  checkCircle: {
    width: s(80),
    height: s(80),
    borderRadius: s(40),
    borderWidth: 3,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  welcomeTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: fs(26),
    lineHeight: fs(34),
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  welcomeSubtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(16),
    color: Colors.textSecondary,
    lineHeight: fs(24),
    marginBottom: Spacing['2xl'] - 4,
  },
  modalButton: {
    width: '100%',
    height: vs(48),
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonText: {
    ...Typography.button,
    fontFamily: 'Inter-Medium',
    color: Colors.textOnPrimary,
  },
});
