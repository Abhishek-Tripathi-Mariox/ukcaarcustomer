import { Platform } from 'react-native';
import {
  check,
  request,
  PERMISSIONS,
  RESULTS,
  Permission,
} from 'react-native-permissions';

export interface PermissionStatus {
  location: boolean;
  notifications: boolean;
  camera: boolean;
  mediaLibrary: boolean;
}

const locationPerm: Permission =
  Platform.OS === 'ios'
    ? PERMISSIONS.IOS.LOCATION_WHEN_IN_USE
    : PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION;

const cameraPerm: Permission =
  Platform.OS === 'ios' ? PERMISSIONS.IOS.CAMERA : PERMISSIONS.ANDROID.CAMERA;

const mediaPerm: Permission =
  Platform.OS === 'ios'
    ? PERMISSIONS.IOS.PHOTO_LIBRARY
    : Platform.Version >= 33
      ? PERMISSIONS.ANDROID.READ_MEDIA_IMAGES
      : PERMISSIONS.ANDROID.READ_EXTERNAL_STORAGE;

const notificationPerm: Permission | null =
  Platform.OS === 'android' && Platform.Version >= 33
    ? PERMISSIONS.ANDROID.POST_NOTIFICATIONS
    : null; // iOS notifications go through @react-native-firebase/messaging

const isGranted = (result: string) =>
  result === RESULTS.GRANTED || result === RESULTS.LIMITED;

const ensure = async (perm: Permission): Promise<boolean> => {
  try {
    const current = await check(perm);
    if (isGranted(current)) return true;
    const next = await request(perm);
    return isGranted(next);
  } catch {
    return false;
  }
};

const checkOnly = async (perm: Permission): Promise<boolean> => {
  try {
    const current = await check(perm);
    return isGranted(current);
  } catch {
    return false;
  }
};

/**
 * Request all app permissions at once.
 * Skips permissions that are already granted.
 */
export const requestAllPermissions = async (): Promise<PermissionStatus> => {
  const [location, camera, mediaLibrary, notifications] = await Promise.all([
    ensure(locationPerm),
    ensure(cameraPerm),
    ensure(mediaPerm),
    notificationPerm ? ensure(notificationPerm) : Promise.resolve(true),
  ]);

  return { location, camera, mediaLibrary, notifications };
};

/**
 * Check if all permissions are already granted (without requesting).
 */
export const checkAllPermissions = async (): Promise<PermissionStatus> => {
  const [location, camera, mediaLibrary, notifications] = await Promise.all([
    checkOnly(locationPerm),
    checkOnly(cameraPerm),
    checkOnly(mediaPerm),
    notificationPerm ? checkOnly(notificationPerm) : Promise.resolve(true),
  ]);

  return { location, camera, mediaLibrary, notifications };
};

export const allPermissionsGranted = (status: PermissionStatus): boolean => {
  return (
    status.location &&
    status.notifications &&
    status.camera &&
    status.mediaLibrary
  );
};
