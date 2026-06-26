import 'react-native-get-random-values'; // Must be first – polyfills crypto for axios
import './src/polyfills'; // TextEncoder polyfill (Hermes lacks it; QR code needs it)
import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppNavigator, navigationRef } from './src/navigation';
import { store, RootState, AppDispatch } from './src/store';
import { initFcm, resyncFcmTokenIfPending } from './src/services/fcmService';
import {
  connectSocket,
  disconnectSocket,
  setSocketListeners,
} from './src/services/socketService';
import { setCurrentRide, setPickup, setDropoff } from './src/store/slices/rideSlice';
import { refreshNotificationCount } from './src/store/slices/appSlice';
import { rideService, Ride } from './src/services/rideService';

function FcmBridge() {
  // FCM token registration requires a logged-in user (auth header). We:
  //  1) Request OS-level permission + grab the FCM token immediately on mount.
  //     The first sync attempt may fail silently if the user is not yet logged in.
  //  2) Re-sync whenever auth flips to authenticated, so the token reaches the
  //     /notifications/fcm-token endpoint with a valid Bearer token.
  const isAuthenticated = useSelector((s: RootState) => s.auth.isAuthenticated);
  const dispatch = useDispatch<AppDispatch>();

  useEffect(() => {
    // A foreground push means a new notification just landed — refresh the
    // unread badge so Home reflects it in real time without a manual reload.
    initFcm(() => {
      dispatch(refreshNotificationCount());
    }).catch(() => {});
  }, [dispatch]);

  useEffect(() => {
    if (isAuthenticated) {
      resyncFcmTokenIfPending().catch(() => {});
      dispatch(refreshNotificationCount());
    }
  }, [isAuthenticated, dispatch]);

  return null;
}

/**
 * Keeps the customer's Socket.IO connection alive while authenticated.
 * Pipes server-pushed ride lifecycle events back into the Redux store so
 * any screen reading `state.ride.currentRide` reacts in real time:
 *  - driver assigned → swap the searching sheet for the live tracking card
 *  - status changes  → update the same record so the tracking card keeps
 *                      pace with arrived / in-progress / completed.
 */
function SocketBridge() {
  const isAuthenticated = useSelector((s: RootState) => s.auth.isAuthenticated);
  const dispatch = useDispatch<AppDispatch>();

  useEffect(() => {
    if (!isAuthenticated) {
      disconnectSocket();
      return;
    }
    connectSocket().catch(err =>
      console.warn('[customer-socket] connect failed:', err),
    );
    setSocketListeners({
      onDriverAssigned: ({ ride }) => {
        if (ride) dispatch(setCurrentRide(ride));
      },
      onRideStatus: ({ ride }) => {
        if (ride) dispatch(setCurrentRide(ride));
      },
    });
    return () => {
      // Don't tear down on unmount — the bridge is mounted at app root and
      // only ever unmounts on full app close. The disconnect above handles
      // logout.
    };
  }, [isAuthenticated, dispatch]);

  return null;
}

/**
 * Resume an in-flight ride on app launch. If the customer has a ride that
 * is searching / driver_assigned / driver_arriving / driver_arrived /
 * in_progress, we drop them straight onto the correct screen instead of
 * the home dashboard — same behaviour Uber/Ola use so a user who killed
 * the app mid-ride doesn't lose visibility of their driver.
 *
 * The resume runs once when auth flips to authenticated. It does NOT keep
 * polling — subsequent state changes are pushed via socket as usual.
 */
function ResumeRideBridge() {
  const isAuthenticated = useSelector((s: RootState) => s.auth.isAuthenticated);
  const dispatch = useDispatch<AppDispatch>();

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;

    const resume = async () => {
      const ride = await rideService.getActive();
      if (cancelled || !ride) return;

      // Mirror into Redux so the screens we route to (which read coords
      // from state.ride) have the values they need.
      dispatch(setCurrentRide(ride));
      if (ride.pickup) {
        dispatch(setPickup({
          address: ride.pickup.address,
          lat: ride.pickup.lat,
          lng: ride.pickup.lng,
        }));
      }
      if (ride.dropoff) {
        dispatch(setDropoff({
          address: ride.dropoff.address,
          lat: ride.dropoff.lat,
          lng: ride.dropoff.lng,
        }));
      }

      // The NavigationContainer may not be ready yet on cold start. Wait
      // for it before attempting navigation — short retry loop is cleaner
      // than depending on a layout effect.
      const waitForNav = async () => {
        for (let i = 0; i < 50; i += 1) {
          if (navigationRef.isReady()) return true;
          await new Promise(r => setTimeout(r, 100));
        }
        return navigationRef.isReady();
      };
      const ready = await waitForNav();
      if (cancelled || !ready) return;

      const driverInfo: any = ride.driver ?? {};
      const dp = driverInfo.driverProfile ?? {};
      const driverParam = {
        id: String(driverInfo._id ?? ''),
        name:
          [driverInfo.firstName, driverInfo.lastName].filter(Boolean).join(' ') ||
          'Driver',
        phone: driverInfo.phone ?? '',
        rating: dp.rating ?? 5.0,
        car:
          [dp.vehicleColor, dp.vehicleMake, dp.vehicleModel]
            .filter(Boolean)
            .join(' ') || 'Vehicle',
        plate: dp.plateNumber ?? '',
        trips: dp.totalTrips ?? 0,
        avatar: driverInfo.avatar ?? null,
      };

      const target = (() => {
        switch (ride.status) {
          case 'searching':
            return {
              screen: 'FindingDriver',
              params: {
                pickup: ride.pickup.address,
                dropoff: ride.dropoff.address,
                rideType: { id: ride.rideType, name: ride.rideType },
              },
            };
          case 'driver_assigned':
          case 'driver_arriving':
          case 'driver_arrived':
            return {
              screen: 'RideTracking',
              params: {
                rideId: String(ride._id),
                pickup: ride.pickup.address,
                dropoff: ride.dropoff.address,
                rideType: ride.rideType,
                fare: ride.estimatedFare,
                distance: ride.estimatedDistance,
                duration: ride.estimatedDuration,
                otp: (ride as any).pickupOtp,
                driver: driverParam,
              },
            };
          case 'in_progress':
            return {
              screen: 'RideTracking',
              params: {
                rideId: String(ride._id),
                pickup: ride.pickup.address,
                dropoff: ride.dropoff.address,
                rideType: ride.rideType,
                fare: ride.estimatedFare,
                distance: ride.estimatedDistance,
                duration: ride.estimatedDuration,
                driver: driverParam,
              },
            };
          default:
            return null;
        }
      })();

      if (!target) return;
      navigationRef.navigate('MainApp', {
        screen: target.screen,
        params: target.params,
      } as any);
    };

    resume().catch(err => console.warn('[resume] failed:', err));
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, dispatch]);

  return null;
}

export default function App() {
  return (
    <Provider store={store}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <StatusBar barStyle="dark-content" />
          <FcmBridge />
          <SocketBridge />
          <ResumeRideBridge />
          <AppNavigator />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </Provider>
  );
}
