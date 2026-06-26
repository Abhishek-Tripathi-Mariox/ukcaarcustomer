import { AppRegistry, Platform } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance, EventType } from '@notifee/react-native';
import App from './App';
import { name as appName } from './app.json';

const DEFAULT_CHANNEL_ID = 'ukcaar_default';

// Notifee requires a background event handler to be registered at the JS
// entry point (alongside the FCM background handler). Without this the lib
// logs "no background event handler has been set" every time a headless
// notification event fires. We don't need to *do* much here — the FCM
// handler below already displays notifications; this is just so taps on a
// killed-state notification route the user back into the app cleanly.
notifee.onBackgroundEvent(async ({ type, detail }) => {
  if (type === EventType.DISMISSED || type === EventType.PRESS) {
    // No-op: cold-launching the app via the notification is already
    // handled by Android's launchActivity intent on the pressAction.
    // Returning a resolved promise so the headless task can exit.
    return;
  }
});

// FCM background handler must be registered at the JS entry point, before AppRegistry.
//
// Backend sends Android pushes as data-only — notification-payload pushes get
// dropped on aggressive OEM ROMs (MIUI, FunTouch, ColorOS) once the app has
// been killed by their battery optimizer. Data-only with priority:'high'
// reliably wakes this headless handler, which then renders via Notifee.
messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  if (Platform.OS !== 'android') return;

  await notifee.createChannel({
    id: DEFAULT_CHANNEL_ID,
    name: 'General notifications',
    importance: AndroidImportance.HIGH,
    sound: 'default',
    vibration: true,
  });

  const title =
    remoteMessage.data?.title ||
    remoteMessage.notification?.title ||
    'UKCAAR';
  const body =
    remoteMessage.data?.body ||
    remoteMessage.data?.message ||
    remoteMessage.notification?.body ||
    '';
  if (!title && !body) return;

  await notifee.displayNotification({
    title,
    body,
    data: remoteMessage.data || {},
    android: {
      channelId: DEFAULT_CHANNEL_ID,
      pressAction: { id: 'default', launchActivity: 'default' },
    },
  });
});

AppRegistry.registerComponent(appName, () => App);
