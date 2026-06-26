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
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  launchCamera,
  launchImageLibrary,
  type ImagePickerResponse,
} from 'react-native-image-picker';
import { Colors, Typography, Spacing, BorderRadius } from '@/theme';
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

  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [avatarUri, setAvatarUri] = useState<string | null>(user?.avatar || null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const launchPicker = async (source: 'camera' | 'gallery') => {
    try {
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
    if (!firstName.trim()) {
      setError('First name is required.');
      return;
    }

    setError(null);
    setSaving(true);

    try {
      // Upload new avatar if changed
      if (avatarUri && avatarUri !== user?.avatar) {
        await dispatch(uploadAvatar(avatarUri)).unwrap();
      }

      await dispatch(updateProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
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

  const initials = `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase() || 'U';

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      <KeyboardAwareScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 16 }]}
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

        {/* First Name */}
        <Text style={styles.inputLabel}>First Name</Text>
        <TextInput
          style={styles.textInput}
          placeholder="Enter first name"
          placeholderTextColor={Colors.termsMuted}
          value={firstName}
          onChangeText={setFirstName}
          autoCapitalize="words"
          selectionColor={Colors.primary}
        />

        {/* Last Name */}
        <Text style={styles.inputLabel}>Last Name</Text>
        <TextInput
          style={styles.textInput}
          placeholder="Enter last name"
          placeholderTextColor={Colors.termsMuted}
          value={lastName}
          onChangeText={setLastName}
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
          style={[styles.ctaButton, (!firstName.trim() || saving) && styles.ctaButtonDisabled]}
          onPress={handleSave}
          disabled={!firstName.trim() || saving}
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
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing['3xl'],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xl,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.black,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: Spacing['2xl'],
  },
  avatarWrapper: {
    width: 110,
    height: 110,
    position: 'relative',
  },
  avatarCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
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
    fontSize: 36,
    fontWeight: '700',
    color: Colors.white,
  },
  cameraButton: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: Colors.backgroundWhite,
  },
  inputLabel: {
    ...Typography.label,
    color: Colors.textSecondaryFigma,
    marginBottom: Spacing.sm,
  },
  textInput: {
    backgroundColor: Colors.backgroundInput,
    borderRadius: BorderRadius.button,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    paddingHorizontal: Spacing.base,
    height: 50,
    ...Typography.bodyLarge,
    color: Colors.textOnLight,
    marginBottom: Spacing.lg,
  },
  inputDisabled: {
    backgroundColor: Colors.background,
    justifyContent: 'center',
  },
  disabledText: {
    ...Typography.bodyLarge,
    color: Colors.termsMuted,
  },
  errorText: {
    ...Typography.caption,
    color: Colors.error,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  ctaButton: {
    width: '100%',
    height: 54,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.button,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.md,
  },
  ctaButtonDisabled: {
    opacity: 0.5,
  },
  ctaText: {
    ...Typography.button,
    fontWeight: '500',
    color: Colors.textOnPrimary,
  },
});
