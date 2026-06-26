import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { requestAllPermissions, checkAllPermissions, allPermissionsGranted } from '@/utils/permissions';

/**
 * Hook to request all permissions when the app opens.
 * Also re-checks when app comes back to foreground,
 * so if the user denied and later grants from settings it picks up.
 */
export const usePermissions = () => {
  const hasRequested = useRef(false);

  useEffect(() => {
    const requestOnce = async () => {
      if (hasRequested.current) return;
      hasRequested.current = true;

      const current = await checkAllPermissions();
      if (!allPermissionsGranted(current)) {
        await requestAllPermissions();
      }
    };

    requestOnce();

    // Re-check when app comes back to foreground
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        // Reset so it can re-request any missing permissions
        hasRequested.current = false;
        requestOnce();
      }
    });

    return () => subscription.remove();
  }, []);
};
