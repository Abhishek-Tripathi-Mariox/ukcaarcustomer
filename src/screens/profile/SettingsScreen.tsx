import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Switch,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { Colors, Spacing, BorderRadius } from '@/theme';
import { fs, s, vs } from '@/theme/responsive';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  check,
  request,
  PERMISSIONS,
  RESULTS,
} from 'react-native-permissions';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authService } from '@/services/authService';

const hasAndroidNotifPerm = Platform.OS === 'android' && Platform.Version >= 33;
const TERMS_URL = 'https://ukcaar.com/terms';
const PRIVACY_URL = 'https://ukcaar.com/privacy';
const LICENSES_URL = 'https://ukcaar.com/licenses';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { logout, forceLogout } from '@/store/slices/authSlice';

interface SettingsScreenProps {
  navigation: any;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((state) => state.auth);

  const [locationAccess, setLocationAccess] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [language, setLanguage] = useState((user as any)?.language || 'English');
  const [mapType, setMapType] = useState('Standard');

  const locationPerm =
    Platform.OS === 'ios'
      ? PERMISSIONS.IOS.LOCATION_WHEN_IN_USE
      : PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION;

  useEffect(() => {
    if (!hasAndroidNotifPerm) {
      // iOS and pre-Android 13 notifications are granted by default at the OS level.
      setNotificationsEnabled(true);
    } else {
      check(PERMISSIONS.ANDROID.POST_NOTIFICATIONS).then((status) => {
        setNotificationsEnabled(status === RESULTS.GRANTED);
      });
    }
    // Reflect the real OS location permission, not a guess.
    check(locationPerm).then((status) => setLocationAccess(status === RESULTS.GRANTED));
    // Restore the saved map-type preference.
    AsyncStorage.getItem('pref.mapType').then((v) => v && setMapType(v));
  }, []);

  const handleToggleLocation = async () => {
    if (locationAccess) {
      Alert.alert(
        'Location Access',
        'To turn off location, use your device settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ],
      );
      return;
    }
    const status = await request(locationPerm);
    if (status === RESULTS.GRANTED) {
      setLocationAccess(true);
    } else if (status === RESULTS.BLOCKED) {
      Alert.alert('Permission blocked', 'Enable location from your device settings.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ]);
    }
  };

  const openLink = (url: string) => {
    Linking.openURL(url).catch(() => Alert.alert('Unable to open', url));
  };

  const handleToggleNotifications = async () => {
    if (notificationsEnabled) {
      // Can't revoke programmatically — open device settings
      Alert.alert(
        'Disable Notifications',
        'To disable notifications, go to your device settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ],
      );
      return;
    }

    if (!hasAndroidNotifPerm) {
      Alert.alert(
        'Enable Notifications',
        'Notifications are controlled by your device settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ],
      );
      return;
    }

    const status = await request(PERMISSIONS.ANDROID.POST_NOTIFICATIONS);
    if (status === RESULTS.GRANTED) {
      setNotificationsEnabled(true);
    } else {
      Alert.alert(
        'Permission Denied',
        'Enable notifications from your device settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ],
      );
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This action is permanent and cannot be undone. Your account will be deactivated and you will be logged out.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: async () => {
            try {
              await authService.deleteAccount();
            } catch (err: any) {
              Alert.alert('Error', err?.response?.data?.message || 'Failed to delete account. Please try again.');
              return;
            }
            Alert.alert(
              'Account deleted',
              'Your account has been deleted. You can sign up again with the same number any time.',
              [
                {
                  text: 'OK',
                  onPress: () => {
                    // forceLogout ends the session; AppNavigator's centralized
                    // ejection effect resets to the Auth stack.
                    dispatch(forceLogout());
                    // Local-only cleanup (tokens + FCM). Skip the server logout
                    // — the account is already deleted, so POST /auth/logout
                    // would 401 and needlessly trip the refresh interceptor.
                    authService.logout(false).catch(() => {});
                  },
                },
              ],
            );
          },
        },
      ],
    );
  };

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: () => dispatch(logout()),
      },
    ]);
  };

  const pickLanguage = (lang: string) => {
    setLanguage(lang);
    // Persist to the user's profile so it survives reinstall + drives
    // notification locale server-side.
    authService.updateProfile({ language: lang }).catch(() => {});
  };

  const handleLanguageChange = () => {
    Alert.alert('Select Language', '', [
      { text: 'English', onPress: () => pickLanguage('English') },
      { text: 'Hindi', onPress: () => pickLanguage('Hindi') },
      { text: 'Tamil', onPress: () => pickLanguage('Tamil') },
      { text: 'Telugu', onPress: () => pickLanguage('Telugu') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const pickMapType = (t: string) => {
    setMapType(t);
    AsyncStorage.setItem('pref.mapType', t).catch(() => {});
  };

  const handleMapTypeChange = () => {
    Alert.alert('Map Type', '', [
      { text: 'Standard', onPress: () => pickMapType('Standard') },
      { text: 'Satellite', onPress: () => pickMapType('Satellite') },
      { text: 'Terrain', onPress: () => pickMapType('Terrain') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.black} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + vs(Spacing['3xl']) }]}
        showsVerticalScrollIndicator={false}
      >

        {/* Account */}
        <Text style={styles.sectionTitle}>Account</Text>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Phone Number</Text>
          <Text style={styles.infoValue}>{user?.phone || '-'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Email</Text>
          <Text style={styles.infoValue}>{user?.email || 'Not set'}</Text>
        </View>

        {/* App Preferences */}
        <Text style={styles.sectionTitle}>App Preferences</Text>

        <TouchableOpacity style={styles.settingRow} onPress={handleLanguageChange}>
          <View style={[styles.settingIcon, { backgroundColor: '#2196F318' }]}>
            <Ionicons name="language" size={20} color="#2196F3" />
          </View>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Language</Text>
            <Text style={styles.settingDesc}>{language}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#B0B0B0" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.settingRow} onPress={handleMapTypeChange}>
          <View style={[styles.settingIcon, { backgroundColor: '#4CAF5018' }]}>
            <Ionicons name="map" size={20} color="#4CAF50" />
          </View>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Map Type</Text>
            <Text style={styles.settingDesc}>{mapType}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#B0B0B0" />
        </TouchableOpacity>

        {/* Privacy & Security */}
        <Text style={styles.sectionTitle}>Privacy & Security</Text>

        <View style={styles.settingRow}>
          <View style={[styles.settingIcon, { backgroundColor: 'rgba(0,151,179,0.12)' }]}>
            <Ionicons name="location" size={20} color={Colors.primary} />
          </View>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Location Access</Text>
            <Text style={styles.settingDesc}>Allow app to access your location</Text>
          </View>
          <Switch
            value={locationAccess}
            onValueChange={handleToggleLocation}
            trackColor={{ false: '#E0E0E0', true: Colors.primary + '60' }}
            thumbColor={locationAccess ? Colors.primary : '#BDBDBD'}
          />
        </View>

        <TouchableOpacity style={styles.settingRow} onPress={handleToggleNotifications}>
          <View style={[styles.settingIcon, { backgroundColor: '#FF980018' }]}>
            <Ionicons name="notifications" size={20} color="#FF9800" />
          </View>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Notifications</Text>
            <Text style={styles.settingDesc}>{notificationsEnabled ? 'Enabled' : 'Disabled'}</Text>
          </View>
          <Switch
            value={notificationsEnabled}
            onValueChange={handleToggleNotifications}
            trackColor={{ false: '#E0E0E0', true: Colors.primary + '60' }}
            thumbColor={notificationsEnabled ? Colors.primary : '#BDBDBD'}
          />
        </TouchableOpacity>

        {/* About */}
        <Text style={styles.sectionTitle}>About</Text>

        <View style={styles.settingRow}>
          <View style={[styles.settingIcon, { backgroundColor: '#F5F5F5' }]}>
            <Ionicons name="information-circle" size={20} color="#7D8A95" />
          </View>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>App Version</Text>
            <Text style={styles.settingDesc}>1.0.0</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.settingRow} onPress={() => openLink(TERMS_URL)}>
          <View style={[styles.settingIcon, { backgroundColor: '#F5F5F5' }]}>
            <Ionicons name="document-text" size={20} color="#7D8A95" />
          </View>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Terms of Service</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#B0B0B0" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.settingRow} onPress={() => openLink(PRIVACY_URL)}>
          <View style={[styles.settingIcon, { backgroundColor: '#F5F5F5' }]}>
            <Ionicons name="lock-closed" size={20} color="#7D8A95" />
          </View>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Privacy Policy</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#B0B0B0" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.settingRow} onPress={() => openLink(LICENSES_URL)}>
          <View style={[styles.settingIcon, { backgroundColor: '#F5F5F5' }]}>
            <Ionicons name="shield" size={20} color="#7D8A95" />
          </View>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Open Source Licenses</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#B0B0B0" />
        </TouchableOpacity>

        {/* Danger Zone */}
        <Text style={[styles.sectionTitle, { color: '#F44336' }]}>Danger Zone</Text>

        <TouchableOpacity style={styles.logoutRow} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={22} color="#F44336" />
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.deleteRow} onPress={handleDeleteAccount}>
          <Ionicons name="trash-outline" size={22} color="#F44336" />
          <Text style={styles.deleteText}>Delete Account</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: s(Spacing.base), paddingVertical: vs(Spacing.md),
  },
  backBtn: { width: s(36), height: s(36), alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: 'Inter-Bold', fontSize: fs(20), color: '#1E293B' },
  content: { paddingHorizontal: s(Spacing.xl), paddingBottom: vs(Spacing['3xl']) },

  sectionTitle: { fontFamily: 'Inter-Bold', fontSize: fs(18), color: '#1E293B', marginTop: vs(Spacing.xl), marginBottom: vs(Spacing.md) },

  // Info row
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: vs(14), borderBottomWidth: 1, borderBottomColor: '#F5F5F5',
  },
  infoLabel: { fontFamily: 'Inter-Regular', fontSize: fs(15), color: '#7D8A95' },
  infoValue: { fontFamily: 'Inter-SemiBold', fontSize: fs(15), color: Colors.black },

  // Setting row
  settingRow: {
    flexDirection: 'row', alignItems: 'center', gap: s(Spacing.md),
    paddingVertical: vs(16), borderBottomWidth: 1, borderBottomColor: '#F5F5F5',
  },
  settingIcon: {
    width: s(44), height: s(44), borderRadius: s(22),
    alignItems: 'center', justifyContent: 'center',
  },
  settingInfo: { flex: 1 },
  settingLabel: { fontFamily: 'Inter-SemiBold', fontSize: fs(16), color: Colors.black },
  settingDesc: { fontFamily: 'Inter-Regular', fontSize: fs(13), color: '#7D8A95', marginTop: vs(2) },

  // Logout & Delete
  logoutRow: {
    flexDirection: 'row', alignItems: 'center', gap: s(Spacing.md),
    paddingVertical: vs(16), borderBottomWidth: 1, borderBottomColor: '#F5F5F5',
  },
  logoutText: { fontFamily: 'Inter-SemiBold', fontSize: fs(16), color: '#F44336' },
  deleteRow: {
    flexDirection: 'row', alignItems: 'center', gap: s(Spacing.md),
    paddingVertical: vs(16),
    marginBottom: vs(Spacing.xl),
  },
  deleteText: { fontFamily: 'Inter-SemiBold', fontSize: fs(16), color: '#F44336' },
});
