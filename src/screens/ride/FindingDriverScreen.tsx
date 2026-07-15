import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Animated,
  Easing,
  Image,
  Alert,
  Platform,
} from 'react-native';
import MapView, {
  Marker,
  PROVIDER_GOOGLE,
  Region,
} from 'react-native-maps';
import { useDispatch, useSelector } from 'react-redux';
import { Colors, Shadow } from '@/theme';
import { fs, s, vs } from '@/theme/responsive';
import { CabIcon } from '@/components/icons/HomeIcons';
import { AppDispatch, RootState } from '@/store';
import {
  createRide as createRideThunk,
  cancelRide as cancelRideThunk,
  setCurrentRide,
} from '@/store/slices/rideSlice';
import { connectSocket, setSocketListeners } from '@/services/socketService';
import { driverService, NearbyDriver } from '@/services/driverService';
import { rideService } from '@/services/rideService';

const pinGif = require('../../../assets/select-ride/pin.gif');

interface FindingDriverScreenProps {
  navigation: any;
  route: {
    params: {
      pickup: string;
      dropoff: string;
      rideType: any;
      /** Set only when RESUMING an existing searching ride on app relaunch —
       *  the screen then waits for that ride instead of creating a new one. */
      rideId?: string;
    };
  };
}

// Customer's `rideType.id` is now the admin-defined VehicleType.code, so
// we send it through to the backend as-is. The backend resolves it
// against the live catalogue and falls back to 'economy' fares for any
// unknown code, so booking can never hard-fail because of a stale slug.

export const FindingDriverScreen: React.FC<FindingDriverScreenProps> = ({
  navigation,
  route,
}) => {
  const { pickup, dropoff, rideType } = route.params;
  const dispatch = useDispatch<AppDispatch>();
  const pickupLoc = useSelector((s: RootState) => s.ride.pickup);
  const dropoffLoc = useSelector((s: RootState) => s.ride.dropoff);
  const currentRide = useSelector((s: RootState) => s.ride.currentRide);
  // Routed distance/duration the rider was quoted on SelectRide (top-level
  // fields on the estimate). Forwarded to createRide so the booked ride keeps
  // the same road distance rather than the backend's straight-line fallback.
  const estimateData = useSelector((s: RootState) => s.ride.estimateData);

  const pulse1 = useRef(new Animated.Value(0)).current;
  const pulse2 = useRef(new Animated.Value(0)).current;

  const [statusText, setStatusText] = useState('Finding nearby drivers...');
  const [createdRideId, setCreatedRideId] = useState<string | null>(null);
  // Latches once we've navigated forward so the socket listener doesn't fire
  // a second navigation if a re-emit lands during the transition.
  const navigatedRef = useRef(false);

  // Live nearby drivers, same source the home map uses. We poll every 10s so
  // the markers move as the dispatch fan-out spreads — a long-search session
  // should feel alive, not frozen.
  const [nearbyDrivers, setNearbyDrivers] = useState<NearbyDriver[]>([]);

  // Map viewport — starts tight (~2 km diameter) so the rider sees their
  // immediate surroundings, but pinch-zoom can pan out to a 5 km cap. The
  // 5 km ceiling matches the Home screen so the rider never sees a wildly
  // different scale than the one they booked from.
  const INITIAL_RADIUS_KM = 2;
  const MAX_RADIUS_KM = 5;
  const initialRegion: Region | null = useMemo(() => {
    if (!pickupLoc) return null;
    const latDelta = (INITIAL_RADIUS_KM * 2) / 111;
    const lngDelta =
      (INITIAL_RADIUS_KM * 2) /
      (111 * Math.cos((pickupLoc.lat * Math.PI) / 180) || 111);
    return {
      latitude: pickupLoc.lat,
      longitude: pickupLoc.lng,
      latitudeDelta: latDelta,
      longitudeDelta: lngDelta,
    };
  }, [pickupLoc?.lat, pickupLoc?.lng]);

  // Clamp the camera when the rider pinches out past the 5 km cap. Same
  // approach the Home map uses — minZoomLevel handles the gesture-time
  // hard stop on Android, and onRegionChangeComplete is a belt-and-braces
  // fallback for providers that don't honour minZoomLevel.
  const mapRef = useRef<MapView | null>(null);
  const maxLatDelta = useMemo(() => (MAX_RADIUS_KM * 2) / 111, []);
  const maxLngDelta = useMemo(() => {
    if (!pickupLoc) return (MAX_RADIUS_KM * 2) / 111;
    return (
      (MAX_RADIUS_KM * 2) /
      (111 * Math.cos((pickupLoc.lat * Math.PI) / 180) || 111)
    );
  }, [pickupLoc?.lat]);
  const isSnappingRef = useRef(false);
  const handleRegionChangeComplete = (region: Region) => {
    if (isSnappingRef.current) {
      isSnappingRef.current = false;
      return;
    }
    if (
      region.latitudeDelta <= maxLatDelta &&
      region.longitudeDelta <= maxLngDelta
    ) {
      return;
    }
    isSnappingRef.current = true;
    mapRef.current?.animateToRegion(
      {
        latitude: region.latitude,
        longitude: region.longitude,
        latitudeDelta: Math.min(region.latitudeDelta, maxLatDelta),
        longitudeDelta: Math.min(region.longitudeDelta, maxLngDelta),
      },
      300,
    );
  };

  useEffect(() => {
    if (!pickupLoc) return;
    let cancelled = false;
    const fetchDrivers = async () => {
      try {
        // Ask for a wider radius than the viewport so cabs just outside the
        // 5 km window still appear in the dispatch fan and feel "almost here".
        const list = await driverService.getNearby(pickupLoc.lat, pickupLoc.lng, 8);
        if (!cancelled) setNearbyDrivers(list);
      } catch {
        /* keep last list */
      }
    };
    fetchDrivers();
    const t = setInterval(fetchDrivers, 10000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [pickupLoc?.lat, pickupLoc?.lng]);

  // Pulsing pickup pin animation.
  useEffect(() => {
    const loop = (val: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, {
            toValue: 1,
            duration: 1800,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
    loop(pulse1, 0).start();
    loop(pulse2, 900).start();
  }, []);

  // 1) Create the ride on mount, 2) wire the socket listener for the
  // driver-assigned event, 3) keep the user here until a driver accepts (or
  // they cancel). The SocketBridge in App.tsx already keeps `currentRide`
  // fresh, but we register a screen-local listener so we know the moment
  // the assignment lands and can navigate forward.
  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      // Belt-and-braces: SocketBridge connects on auth, but if this screen
      // is the first thing reached after login we may have raced the
      // bridge. Idempotent connect — no-op if already connected.
      connectSocket().catch(() => {});

      // RESUME path: the app was killed while a ride was still 'searching' and
      // App.tsx re-routed us here with the existing rideId. Do NOT create a
      // second ride — the backend one-active-ride guard would 409 and the user
      // would be bounced off this screen while the real ride kept searching
      // invisibly. Just adopt the existing ride and wait for its assignment.
      if (route.params.rideId) {
        if (cancelled) return;
        setCreatedRideId(route.params.rideId);
        setStatusText('We are connecting you with the nearest driver');
        return;
      }

      if (!pickupLoc || !dropoffLoc) {
        Alert.alert(
          'Missing pickup',
          'We lost your pickup or drop-off location. Please try again.',
        );
        navigation.goBack();
        return;
      }

      try {
        const action = await dispatch(
          createRideThunk({
            pickup: pickupLoc,
            dropoff: dropoffLoc,
            // Admin-defined VehicleType.code passed through unchanged.
            rideType: (rideType?.id ?? 'economy') as any,
            // Tier flag — backend uses this to filter dispatch to the
            // right fleet (private vs. instant) when the type itself
            // can't be resolved.
            isPrivate: rideType?.tier === 'private' || rideType?.isPrivate === true,
            paymentMethod: 'cash',
            // Persist the road distance/duration already quoted to the rider
            // (undefined if the estimate never resolved → backend Haversine).
            distance: estimateData?.distance,
            duration: estimateData?.duration,
          }),
        );

        // Redux thunk returns a typed action — fulfilled means the backend
        // has the ride; rejected means we never got a server-side record
        // and there's nothing to wait for.
        if (createRideThunk.fulfilled.match(action)) {
          const newRideId = action.payload._id;
          if (cancelled) {
            // The user backed out of this screen while the create was still
            // in flight. Cancel the ride we just created — otherwise it lingers
            // as a ghost: it blocks the next booking (409 "already have an
            // active ride") until the 5-min auto-cancel, and a driver can be
            // paged to a pickup with nobody there.
            dispatch(cancelRideThunk({ id: newRideId, reason: 'Cancelled while searching' }));
            return;
          }
          setCreatedRideId(newRideId);
          setStatusText('We are connecting you with the nearest driver');
        } else {
          if (cancelled) return;
          Alert.alert(
            'Could not request ride',
            (action.payload as string) ?? 'Please try again.',
          );
          navigation.goBack();
        }
      } catch (err: any) {
        if (!cancelled) {
          Alert.alert('Could not request ride', err?.message ?? 'Please try again.');
          navigation.goBack();
        }
      }
    };

    start();

    return () => {
      cancelled = true;
    };
  }, []);

  // Navigate to live tracking for an assigned ride. Shared by the socket
  // `onDriverAssigned` push and the REST poll below, so an assignment is
  // picked up even when the socket event never reaches this client (e.g. our
  // socket is on a different backend instance than the one that handled the
  // accept). Guarded by navigatedRef so whichever path wins fires exactly once.
  const navigateToTracking = useCallback(
    (ride: any) => {
      if (navigatedRef.current || !ride) return;
      if (createdRideId && String(ride._id) !== createdRideId) return;
      navigatedRef.current = true;
      dispatch(setCurrentRide(ride));
      const driverInfo = ride.driver || {};
      const dp = driverInfo.driverProfile || {};
      const carBits = [dp.vehicleColor, dp.vehicleMake, dp.vehicleModel]
        .filter(Boolean)
        .join(' ');
      navigation.replace('RideTracking', {
        rideId: String(ride._id),
        pickup: ride.pickup?.address ?? pickup,
        dropoff: ride.dropoff?.address ?? dropoff,
        rideType,
        fare: ride.estimatedFare,
        distance: ride.estimatedDistance,
        duration: ride.estimatedDuration,
        // Real backend-issued 4-digit PIN that the passenger reads to
        // the driver. Falls back to undefined; RideTracking shows '----'.
        otp: ride.pickupOtp,
        driver: {
          id: String(driverInfo._id ?? ''),
          name:
            [driverInfo.firstName, driverInfo.lastName]
              .filter(Boolean)
              .join(' ') || 'Driver',
          phone: driverInfo.phone ?? '',
          rating: dp.rating ?? 5.0,
          car: carBits || 'Vehicle',
          plate: dp.plateNumber ?? '',
          trips: dp.totalTrips ?? 0,
          avatar: driverInfo.avatar ?? null,
        },
      });
    },
    [createdRideId, navigation, pickup, dropoff, rideType, dispatch],
  );

  // Forward-navigate as soon as a driver is assigned (socket push path). We
  // also poll REST below as a fallback, and watch the Redux store (populated
  // by the App-level SocketBridge) — whichever wins first.
  useEffect(() => {
    setSocketListeners({
      // Server-side cancel (admin / driver / 5-minute auto-cancel). We pop
      // back to the home screen so the customer can start a new booking,
      // and surface the reason inline so they know what happened.
      onRideCancelled: payload => {
        if (navigatedRef.current) return;
        if (createdRideId && payload.rideId !== createdRideId) return;
        navigatedRef.current = true;
        Alert.alert(
          'Ride cancelled',
          payload.message ||
            payload.reason ||
            "We couldn't find a driver in time. Please try booking again.",
          [{ text: 'OK', onPress: () => navigation.popToTop() }],
          { cancelable: false },
        );
      },
      onDriverAssigned: ({ ride }) => navigateToTracking(ride),
    });
  }, [createdRideId, navigation, navigateToTracking]);

  // REST fallback poll. The socket `ride:assigned` push only reaches us when
  // our socket lives on the same backend instance that handled the driver's
  // accept — in a multi-instance / split deployment it silently never arrives,
  // which is exactly the "it says no driver, then a driver shows up" bug and
  // the "driver came online mid-search but the app doesn't update" bug. Polling
  // the shared ride state closes both: once the DB shows an assignment, we
  // forward to tracking regardless of which instance handled it.
  useEffect(() => {
    if (!createdRideId) return;
    const ASSIGNED = [
      'driver_assigned',
      'driver_arriving',
      'driver_arrived',
      'in_progress',
    ];
    let cancelled = false;
    const poll = async () => {
      if (navigatedRef.current) return;
      try {
        const ride: any = await rideService.getRide(createdRideId);
        if (cancelled || navigatedRef.current || !ride) return;
        if (ASSIGNED.includes(ride.status) && ride.driver) {
          navigateToTracking(ride);
        } else if (ride.status === 'cancelled' || ride.status === 'no_drivers') {
          navigatedRef.current = true;
          Alert.alert(
            'Ride cancelled',
            "We couldn't find a driver in time. Please try booking again.",
            [{ text: 'OK', onPress: () => navigation.popToTop() }],
            { cancelable: false },
          );
        }
      } catch {
        /* transient network error — the next tick retries */
      }
    };
    const id = setInterval(poll, 4000);
    poll();
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [createdRideId, navigateToTracking, navigation]);

  // Backup hand-off: if SocketBridge updates currentRide before our
  // screen-local listener fires (cold-start race), still navigate forward.
  useEffect(() => {
    if (navigatedRef.current) return;
    if (!currentRide) return;
    if (createdRideId && String(currentRide._id) !== createdRideId) return;
    if (currentRide.status === 'driver_assigned' && currentRide.driver) {
      navigatedRef.current = true;
      const driverInfo: any = currentRide.driver;
      const dp = driverInfo.driverProfile || {};
      const carBits = [dp.vehicleColor, dp.vehicleMake, dp.vehicleModel]
        .filter(Boolean)
        .join(' ');
      navigation.replace('RideTracking', {
        rideId: String(currentRide._id),
        pickup: currentRide.pickup?.address ?? pickup,
        dropoff: currentRide.dropoff?.address ?? dropoff,
        rideType,
        fare: currentRide.estimatedFare,
        distance: currentRide.estimatedDistance,
        duration: currentRide.estimatedDuration,
        otp: (currentRide as any).pickupOtp,
        driver: {
          name:
            [driverInfo.firstName, driverInfo.lastName].filter(Boolean).join(' ') ||
            'Driver',
          rating: dp.rating ?? 5.0,
          car: carBits || 'Vehicle',
          plate: dp.plateNumber ?? '',
          trips: dp.totalTrips ?? 0,
          avatar: driverInfo.avatar ?? null,
        },
      });
    }
  }, [currentRide, createdRideId, navigation, pickup, dropoff, rideType]);

  const handleCancel = async () => {
    if (createdRideId) {
      // Best-effort cancel — even if it fails, take the user out so they
      // aren't stuck on this screen.
      try {
        await dispatch(
          cancelRideThunk({ id: createdRideId, reason: 'Cancelled while searching' }),
        );
      } catch {}
    }
    navigation.goBack();
  };

  const ringStyle = (val: Animated.Value) => ({
    transform: [
      {
        scale: val.interpolate({ inputRange: [0, 1], outputRange: [0.6, 2.2] }),
      },
    ],
    opacity: val.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
  });

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      {/* ── Real Google Map — pickup pulse + live driver markers ── */}
      <View style={styles.mapSection}>
        {initialRegion && (
          <MapView
            ref={(r) => {
              mapRef.current = r;
            }}
            provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
            style={StyleSheet.absoluteFill}
            initialRegion={initialRegion}
            showsUserLocation
            showsMyLocationButton={false}
            showsCompass={false}
            toolbarEnabled={false}
            // Pinch-zoom and pan are enabled, but capped. minZoomLevel=14 is
            // roughly the ~5 km diameter ceiling on a typical phone — the
            // gesture is blocked mid-pinch instead of snapping back. The
            // onRegionChangeComplete clamp below is a fallback for providers
            // that ignore minZoomLevel.
            minZoomLevel={14}
            onRegionChangeComplete={handleRegionChangeComplete}
          >
            {/* Pickup marker — pulsing dot replaced by a real coordinate
                marker so the pin sits on the actual lat/lng, not on the
                center of the unmapped grid. */}
            {pickupLoc && (
              <Marker
                coordinate={{ latitude: pickupLoc.lat, longitude: pickupLoc.lng }}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View style={styles.centerCircle}>
                  <Image source={pinGif} style={styles.pinImage} resizeMode="contain" />
                </View>
              </Marker>
            )}

            {/* Live nearby drivers — same source the home map uses. */}
            {nearbyDrivers
              .filter(
                (d) =>
                  d.location &&
                  typeof d.location.lat === 'number' &&
                  typeof d.location.lng === 'number',
              )
              .map((d) => (
                <Marker
                  key={d.id}
                  coordinate={{
                    latitude: d.location.lat,
                    longitude: d.location.lng,
                  }}
                  anchor={{ x: 0.5, y: 0.5 }}
                  flat
                  tracksViewChanges={false}
                >
                  <CabIcon size={30} rotation={0} />
                </Marker>
              ))}
          </MapView>
        )}

        {/* Pulsing ring overlay — drawn in pixel-space on top of the map
            because Polyline rings on lat/lng would need real geodesic
            circles. Pure visual feedback that the search is live. */}
        <View style={styles.pulseOverlay} pointerEvents="none">
          <Animated.View style={[styles.pulseRing, ringStyle(pulse1)]} />
          <Animated.View style={[styles.pulseRing, ringStyle(pulse2)]} />
        </View>
      </View>

      {/* ── Status section ── */}
      <View style={styles.statusSection}>
        <Text style={styles.statusTitle}>{statusText}</Text>
        <Text style={styles.statusSubtitle}>This usually takes under a minute</Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.connectingSection}>
        <Text style={styles.connectingText}>
          Hold tight — we're alerting drivers near you{' '}
          <Text style={styles.carEmoji}>🚗</Text>
        </Text>
      </View>

      {/* ── Cancel Button ── */}
      <View style={styles.cancelSection}>
        <TouchableOpacity
          style={styles.cancelButton}
          activeOpacity={0.85}
          onPress={handleCancel}
        >
          <Text style={styles.cancelText}>Cancel Booking</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },

  /* ── Map ── */
  mapSection: {
    flex: 1,
    backgroundColor: Colors.mapBackground,
    overflow: 'hidden',
    position: 'relative',
  },
  mapPatch: {
    position: 'absolute',
  },
  gridLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(191, 224, 144, 0.22)',
  },
  gridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(191, 224, 144, 0.22)',
  },
  centerWrap: {
    position: 'absolute',
    top: '40%',
    left: '50%',
    marginLeft: s(-32),
    marginTop: vs(-32),
    width: s(64),
    height: s(64),
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Centered overlay inside the map section, positioned where the pickup
  // marker renders (map is locked + non-interactive so the pickup always
  // sits at the visual center). Hosts the pulse rings.
  pulseOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: s(-32),
    marginTop: vs(-32),
    width: s(64),
    height: s(64),
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: s(64),
    height: s(64),
    borderRadius: s(32),
    borderWidth: 2,
    borderColor: 'rgba(0, 151, 179, 0.45)',
    backgroundColor: 'rgba(0, 151, 179, 0.08)',
  },
  centerCircle: {
    width: s(56),
    height: s(56),
    borderRadius: s(28),
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.md,
  },
  pinImage: {
    width: s(36),
    height: s(36),
  },
  cabMarker: {
    position: 'absolute',
  },

  /* ── Status ── */
  statusSection: {
    paddingVertical: vs(24),
    alignItems: 'center',
    backgroundColor: Colors.white,
  },
  statusTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(18),
    lineHeight: fs(24),
    color: Colors.textPrimary,
    marginBottom: vs(6),
  },
  statusSubtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(14),
    lineHeight: fs(20),
    color: Colors.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.divider,
  },

  /* ── Connecting ── */
  connectingSection: {
    paddingVertical: vs(22),
    paddingHorizontal: s(32),
    alignItems: 'center',
    backgroundColor: Colors.white,
  },
  connectingText: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(14),
    lineHeight: fs(20),
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  carEmoji: {
    fontSize: fs(16),
  },

  /* ── Cancel ── */
  cancelSection: {
    paddingHorizontal: s(20),
    paddingBottom: vs(32),
    paddingTop: vs(8),
  },
  cancelButton: {
    height: vs(56),
    borderRadius: s(12),
    borderWidth: 1.5,
    borderColor: Colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
  },
  cancelText: {
    fontFamily: 'Inter-Medium',
    fontSize: fs(16),
    lineHeight: fs(22),
    color: Colors.error,
  },
});
