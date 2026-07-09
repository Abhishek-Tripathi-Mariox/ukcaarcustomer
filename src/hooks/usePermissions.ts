import { useEffect, useRef } from 'react';
import { requestAllPermissions, checkAllPermissions, allPermissionsGranted } from '@/utils/permissions';

/**
 * Request the app's runtime permissions ONCE per app launch.
 *
 * WARNING — do NOT re-request permissions on every foreground.
 * Opening a system permission dialog sends the app background→active. A
 * listener that re-requests whenever AppState becomes 'active' therefore
 * re-opens the dialog the instant it closes, producing an infinite
 * permission-prompt loop. That loop keeps stealing window focus from whatever
 * screen is showing — most visibly the login screen, whose phone-number field
 * loses focus so the keyboard flickers open/closed and accepts no typing.
 *
 * It only triggers on devices/OS versions where at least one requested
 * permission stays ungranted (denied, "ask every time", or not applicable),
 * so `allPermissionsGranted()` is never true — which is exactly why it
 * reproduced on some phones and not others. (Verified: revoking a permission
 * on a test device made GrantPermissionsActivity re-open ~10x/second.)
 *
 * Permissions the user leaves ungranted are re-surfaced later at the point of
 * use (map / camera / photo picker) or via a settings deep-link — never by
 * auto-looping here.
 */
export const usePermissions = () => {
  const hasRequested = useRef(false);

  useEffect(() => {
    if (hasRequested.current) return;
    hasRequested.current = true;

    (async () => {
      try {
        const current = await checkAllPermissions();
        if (!allPermissionsGranted(current)) {
          await requestAllPermissions();
        }
      } catch {
        // Never let permission prompting crash or block app start.
      }
    })();
  }, []);
};
