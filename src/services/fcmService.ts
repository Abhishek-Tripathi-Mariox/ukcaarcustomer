import { Platform, PermissionsAndroid } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import messaging, {
  FirebaseMessagingTypes,
} from '@react-native-firebase/messaging';
import notifee, { AndroidImportance, AndroidStyle } from '@notifee/react-native';
import api from './api';

const FCM_TOKEN_KEY = 'fcmToken';
const FCM_TOKEN_SYNCED_KEY = 'fcmTokenSynced';

// Must match the value declared in AndroidManifest.xml meta-data
// `com.google.firebase.messaging.default_notification_channel_id`
const DEFAULT_CHANNEL_ID = 'ukcaar_default';
let channelEnsured = false;

async function ensureNotificationChannel(): Promise<void> {
  if (channelEnsured || Platform.OS !== 'android') return;
  await notifee.createChannel({
    id: DEFAULT_CHANNEL_ID,
    name: 'General notifications',
    importance: AndroidImportance.HIGH,
    sound: 'default',
    vibration: true,
  });
  channelEnsured = true;
}

/**
 * Display an FCM message as a system notification using Notifee.
 * Required for:
 *   • foreground messages (FCM never auto-displays these),
 *   • data-only payloads (no `notification` block),
 *   • Android 8+ devices where the OS-level channel must exist before display.
 */
export async function displayRemoteMessage(
  remoteMessage: FirebaseMessagingTypes.RemoteMessage,
): Promise<void> {
  await ensureNotificationChannel();

  const title =
    remoteMessage.notification?.title ??
    (remoteMessage.data?.title as string | undefined) ??
    'UKCAAR';
  const body =
    remoteMessage.notification?.body ??
    (remoteMessage.data?.body as string | undefined) ??
    (remoteMessage.data?.message as string | undefined) ??
    '';

  await notifee.displayNotification({
    title,
    body,
    data: (remoteMessage.data as Record<string, string>) ?? {},
    android: {
      channelId: DEFAULT_CHANNEL_ID,
      // smallIcon defaults to the app's launcher icon when omitted.
      pressAction: { id: 'default' },
      // Without BIGTEXT Android clamps the banner to a single line with no
      // way to expand it, so anything longer than ~40 characters was simply
      // unreadable from the notification shade. The in-app list has always
      // had the full text on tap; this makes the banner itself expandable.
      style: { type: AndroidStyle.BIGTEXT, text: body },
    },
  });
}

async function requestAndroidNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android' || Platform.Version < 33) return true;
  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
  );
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

async function requestIosPermission(): Promise<boolean> {
  const status = await messaging().requestPermission();
  return (
    status === messaging.AuthorizationStatus.AUTHORIZED ||
    status === messaging.AuthorizationStatus.PROVISIONAL
  );
}

async function syncTokenToBackend(token: string): Promise<void> {
  try {
    await api.post('/notifications/fcm-token', { token, platform: Platform.OS });
    await AsyncStorage.multiSet([
      [FCM_TOKEN_KEY, token],
      [FCM_TOKEN_SYNCED_KEY, '1'],
    ]);
  } catch (err) {
    await AsyncStorage.setItem(FCM_TOKEN_KEY, token);
    await AsyncStorage.removeItem(FCM_TOKEN_SYNCED_KEY);
  }
}

export async function initFcm(
  onMessage?: (msg: FirebaseMessagingTypes.RemoteMessage) => void,
): Promise<string | null> {
  const granted =
    Platform.OS === 'ios'
      ? await requestIosPermission()
      : await requestAndroidNotificationPermission();
  if (!granted) return null;

  // Create the notification channel up-front so FCM-delivered notifications
  // (whose channel_id meta-data points at "ukcaar_default") have somewhere to land.
  await ensureNotificationChannel();

  const token = await messaging().getToken();
  if (token) await syncTokenToBackend(token);

  messaging().onTokenRefresh(syncTokenToBackend);

  // Foreground messages: FCM never auto-displays these. Show via Notifee so the
  // user actually sees the heads-up while the app is open.
  messaging().onMessage(async (remoteMessage) => {
    await displayRemoteMessage(remoteMessage);
    if (onMessage) onMessage(remoteMessage);
  });

  return token;
}

/**
 * Always re-POST after login. Backend wipes `fcmTokens` on every OTP
 * verify (single-device login policy), so even a returning user on the
 * same install needs to re-register or pushes go nowhere.
 */
export async function resyncFcmTokenIfPending(): Promise<void> {
  await AsyncStorage.removeItem(FCM_TOKEN_SYNCED_KEY);
  const cached = await AsyncStorage.getItem(FCM_TOKEN_KEY);
  if (cached) {
    await syncTokenToBackend(cached);
    return;
  }
  // No cached token — fetch one. getToken returns null only if the
  // device hasn't registered with FCM yet (first launch, no permission).
  try {
    const fresh = await messaging().getToken();
    if (fresh) await syncTokenToBackend(fresh);
  } catch (err) {
    console.warn('[fcm] resync getToken failed:', err);
  }
}

/**
 * Logout cleanup. Removes this device's token from the user's `fcmTokens`
 * array server-side, then invalidates the local Firebase token so a
 * re-login mints a fresh one and re-registers cleanly.
 *
 * MUST run before clearTokens() — the axios interceptor can only attach the
 * Authorization header while the access token is still in storage. Called
 * afterwards, the DELETE goes out unauthenticated, 401s, and the token stays
 * on the user record, so pushes keep landing on a logged-out phone.
 *
 * `serverSide=false` (post account-deletion) skips the network call: the
 * account and its token are already gone, so only local state needs clearing.
 */
export async function clearFcmToken(serverSide = true): Promise<void> {
  try {
    if (serverSide) {
      const token = await AsyncStorage.getItem(FCM_TOKEN_KEY);
      if (token) {
        try {
          await api.delete('/notifications/fcm-token', { data: { token } });
        } catch (err) {
          console.warn('[fcm] server unregister failed (continuing):', err);
        }
      }
    }
    await messaging().deleteToken();
  } finally {
    await AsyncStorage.multiRemove([FCM_TOKEN_KEY, FCM_TOKEN_SYNCED_KEY]);
  }
}
