import React, { useCallback, useEffect, useState } from 'react';
import {
  AppState,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { check, request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import { Colors } from '@/theme';

const LOCATION_PERM =
  Platform.OS === 'ios'
    ? PERMISSIONS.IOS.LOCATION_WHEN_IN_USE
    : PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION;

/**
 * Home-screen banner shown only when location permission is missing.
 *
 * Location is required to find nearby rides, but a user can decline the
 * startup prompt (or deny it at point-of-use). Without a visible affordance
 * they'd be left with a silently broken map. This banner gives them a clear
 * one-tap way back:
 *   - DENIED (not blocked) → `request()` re-opens the system prompt.
 *   - BLOCKED ("Don't ask again") → Android won't show the prompt anymore, so
 *     we deep-link to the app's settings page instead.
 *
 * IMPORTANT: we only ever call `request()` from an explicit button press.
 * The passive `check()` on foreground never opens a dialog, so this cannot
 * reproduce the permission-prompt loop that the old usePermissions had — it
 * just lets the banner disappear once the user grants from Settings.
 */
export const LocationRequiredBanner: React.FC = () => {
  // Assume granted until the first check resolves, so we never flash the
  // banner for users who already allowed location.
  const [granted, setGranted] = useState(true);
  const [blocked, setBlocked] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const status = await check(LOCATION_PERM);
      setGranted(status === RESULTS.GRANTED || status === RESULTS.LIMITED);
      setBlocked(status === RESULTS.BLOCKED);
    } catch {
      // If the check itself fails, don't nag — leave the banner hidden.
      setGranted(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    // Passive re-check when the app returns to foreground (e.g. the user came
    // back from system Settings after enabling location). check() shows NO
    // dialog, so this is safe and cannot loop.
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const onEnable = useCallback(async () => {
    if (blocked) {
      Linking.openSettings().catch(() => {});
      return;
    }
    try {
      const status = await request(LOCATION_PERM);
      if (status === RESULTS.GRANTED || status === RESULTS.LIMITED) {
        setGranted(true);
        setBlocked(false);
      } else if (status === RESULTS.BLOCKED) {
        // Just got permanently blocked — send them to Settings.
        setBlocked(true);
        Linking.openSettings().catch(() => {});
      }
    } catch {
      // Fall back to Settings if the request path throws.
      Linking.openSettings().catch(() => {});
    }
  }, [blocked]);

  if (granted) return null;

  return (
    <View style={styles.banner}>
      <Ionicons name="location-outline" size={20} color={Colors.white} />
      <Text style={styles.text} numberOfLines={2}>
        Location is required to find rides near you.
      </Text>
      <TouchableOpacity
        style={styles.button}
        onPress={onEnable}
        activeOpacity={0.85}
      >
        <Text style={styles.buttonText}>{blocked ? 'Open Settings' : 'Allow'}</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.error ?? '#D64545',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    marginTop: 10,
    borderRadius: 10,
  },
  text: {
    flex: 1,
    color: Colors.white ?? '#FFFFFF',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '500',
  },
  button: {
    backgroundColor: Colors.white ?? '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  buttonText: {
    color: Colors.error ?? '#D64545',
    fontSize: 13,
    fontWeight: '700',
  },
});

export default LocationRequiredBanner;
