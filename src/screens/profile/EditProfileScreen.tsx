import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  StatusBar,
  Image,
  Alert,
  ActivityIndicator,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  launchCamera,
  launchImageLibrary,
  type ImagePickerResponse,
} from 'react-native-image-picker';
import { Typography, Colors, Spacing, BorderRadius } from '@/theme';
import { fs, s, vs } from '@/theme/responsive';
import { KeyboardAwareScrollView } from '@/components/common';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { updateProfile, uploadAvatar } from '@/store/slices/authSlice';

interface EditProfileScreenProps {
  navigation: any;
}

export const EditProfileScreen: React.FC<EditProfileScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((state) => state.auth);

  const [fullName, setFullName] = useState([user?.firstName, user?.lastName].filter(Boolean).join(' '));
  const [email, setEmail] = useState(user?.email || '');
  const [avatarUri, setAvatarUri] = useState<string | null>(user?.avatar || null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
              ? 'Please allow camera access.'
              : 'Please allow photo library access.'
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
    } catch {
      Alert.alert('Error', 'Failed to pick image.');
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
    if (!trimmedName) {
      setError('Full name is required.');
      return;
    }

    setError(null);
    setSaving(true);

    try {
      // Upload new avatar if changed
      if (avatarUri && avatarUri !== user?.avatar) {
        await dispatch(uploadAvatar(avatarUri)).unwrap();
      }

      const spaceIndex = trimmedName.indexOf(' ');
      let parsedFirstName = '';
      let parsedLastName = '';
      if (spaceIndex === -1) {
        parsedFirstName = trimmedName;
      } else {
        parsedFirstName = trimmedName.slice(0, spaceIndex).trim();
        parsedLastName = trimmedName.slice(spaceIndex + 1).trim();
      }

      await dispatch(updateProfile({
        firstName: parsedFirstName,
        lastName: parsedLastName,
        email: email.trim() || undefined,
      })).unwrap();

      Alert.alert('Success', 'Profile updated successfully.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      setError(typeof err === 'string' ? err : err?.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  const nameParts = fullName.trim().split(/\s+/);
  const initials = `${nameParts[0]?.[0] || ''}${nameParts[1]?.[0] || ''}`.toUpperCase() || 'U';

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      <KeyboardAwareScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + 16,
            paddingBottom: insets.bottom + vs(Spacing['3xl']),
          },
        ]}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={Colors.black} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Profile</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Avatar */}
        <TouchableOpacity style={styles.avatarSection} onPress={handlePickImage}>
          <View style={styles.avatarWrapper}>
            <View style={styles.avatarCircle}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarInitials}>{initials}</Text>
              )}
            </View>
            <View style={styles.cameraButton}>
              <Ionicons name="camera" size={18} color={Colors.textOnPrimary} />
            </View>
          </View>
        </TouchableOpacity>

        {/* Full Name */}
        <Text style={styles.inputLabel}>Full Name</Text>
        <TextInput
          style={styles.textInput}
          placeholder="Enter full name"
          placeholderTextColor={Colors.termsMuted}
          value={fullName}
          onChangeText={setFullName}
          autoCapitalize="words"
          selectionColor={Colors.primary}
        />

        {/* Email */}
        <Text style={styles.inputLabel}>Email</Text>
        <TextInput
          style={styles.textInput}
          placeholder="Enter email address"
          placeholderTextColor={Colors.termsMuted}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          selectionColor={Colors.primary}
        />

        {/* Phone (read-only) */}
        <Text style={styles.inputLabel}>Phone</Text>
        <View style={[styles.textInput, styles.inputDisabled]}>
          <Text style={styles.disabledText}>{user?.phone || ''}</Text>
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.ctaButton, (!fullName.trim() || saving) && styles.ctaButtonDisabled]}
          onPress={handleSave}
          disabled={!fullName.trim() || saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color={Colors.textOnPrimary} />
          ) : (
            <Text style={styles.ctaText}>Save Changes</Text>
          )}
        </TouchableOpacity>
      </KeyboardAwareScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.backgroundWhite,
  },
  scrollContent: {
    paddingHorizontal: s(Spacing.xl),
    paddingBottom: vs(Spacing['3xl']),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: vs(Spacing.xl),
  },
  backButton: {
    width: s(40),
    height: s(40),
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: fs(20),
    color: '#1E293B',
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: vs(Spacing['2xl']),
  },
  avatarWrapper: {
    width: s(110),
    height: s(110),
    position: 'relative',
  },
  avatarCircle: {
    width: s(110),
    height: s(110),
    borderRadius: s(55),
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarInitials: {
    fontFamily: 'Inter-Bold',
    fontSize: fs(36),
    color: Colors.white,
  },
  cameraButton: {
    position: 'absolute',
    bottom: vs(2),
    right: s(2),
    width: s(36),
    height: s(36),
    borderRadius: s(18),
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: Colors.backgroundWhite,
  },
  inputLabel: {
    ...Typography.label,
    fontFamily: 'Inter-Medium',
    fontSize: fs(14),
    color: Colors.textSecondaryFigma,
    marginBottom: vs(Spacing.sm),
  },
  textInput: {
    backgroundColor: Colors.backgroundInput,
    borderRadius: s(BorderRadius.button),
    borderWidth: 1,
    borderColor: Colors.borderLight,
    paddingHorizontal: s(Spacing.base),
    height: vs(50),
    ...Typography.bodyLarge,
    fontFamily: 'Inter-Regular',
    fontSize: fs(16),
    color: Colors.textOnLight,
    marginBottom: vs(Spacing.lg),
  },
  inputDisabled: {
    backgroundColor: Colors.background,
    justifyContent: 'center',
  },
  disabledText: {
    ...Typography.bodyLarge,
    fontFamily: 'Inter-Regular',
    fontSize: fs(16),
    color: Colors.termsMuted,
  },
  errorText: {
    ...Typography.caption,
    fontFamily: 'Inter-Regular',
    fontSize: fs(12),
    color: Colors.error,
    textAlign: 'center',
    marginBottom: vs(Spacing.md),
  },
  ctaButton: {
    width: '100%',
    height: vs(54),
    backgroundColor: Colors.primary,
    borderRadius: s(BorderRadius.button),
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: vs(Spacing.md),
  },
  ctaButtonDisabled: {
    opacity: 0.5,
  },
  ctaText: {
    ...Typography.button,
    fontFamily: 'Inter-Medium',
    fontSize: fs(16),
    color: Colors.textOnPrimary,
  },
});
