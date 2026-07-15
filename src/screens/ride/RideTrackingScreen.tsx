import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  ScrollView,
  Platform,
  Linking,
  Alert,
  Image,
} from 'react-native';
import MapView, {
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
  Region,
} from 'react-native-maps';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius, Shadow } from '@/theme';
import { Avatar } from '@/components/common';
import { useAppSelector } from '@/store/hooks';
import { useDispatch } from 'react-redux';
import { AppDispatch } from '@/store';
import { setCurrentRide } from '@/store/slices/rideSlice';
import { geoService, GeoDirections } from '@/services/geoService';
import { fs, s, vs } from '@/theme/responsive';
import { rideService } from '@/services/rideService';
import { CabIcon } from '@/components/icons/HomeIcons';
import {
  joinRideRoom,
  leaveRideRoom,
  setSocketListeners,
} from '@/services/socketService';

interface LatLng {
  lat: number;
  lng: number;
}

const { width, height } = Dimensions.get('window');

interface RideTrackingScreenProps {
  navigation: any;
  route: {
    params: {
      rideId?: string;
      pickup: string;
      dropoff: string;
      rideType: any;
      fare?: number;
      distance?: number;
      duration?: number;
      /** Optional 4-digit OTP shown to the driver to confirm pickup. */
      otp?: string;
      driver: {
        id?: string;
        name: string;
        phone?: string;
        rating: number;
        car: string;
        plate: string;
        trips: number;
        avatar: string | null;
      };
    };
  };
}

type RideStatus =
  | 'driver_assigned'
  | 'driver_arriving'
  | 'driver_arrived'
  | 'in_progress'
  | 'payment_pending'
  | 'completed'
  | 'cancelled';

const STATUS_BANNER: Record<RideStatus, string> = {
  driver_assigned: 'Driver is on the way',
  driver_arriving: 'Driver is approaching',
  driver_arrived: 'Driver has arrived — share your OTP',
  in_progress: 'On your way to destination',
  payment_pending: 'Ride ended — please pay your fare',
  completed: 'Ride completed',
  cancelled: 'Ride cancelled',
};

export const RideTrackingScreen: React.FC<RideTrackingScreenProps> = ({
  navigation,
  route,
}) => {
  const insets = useSafeAreaInsets();
  const {
    rideId,
    pickup,
    dropoff,
    rideType,
    otp: routeOtp,
    driver: paramDriver,
    fare: fareParam,
    distance: distanceParam,
    duration: durationParam,
  } = route.params;

  // `driver` can arrive via nav params (from the Finding-Driver flow) OR be
  // absent when we land here straight from Ride History with only a rideId.
  // Default to a safe object so the render never touches `undefined.car`, and
  // hydrate the real driver/vehicle from the ride below.
  type DriverInfo = NonNullable<RideTrackingScreenProps['route']['params']['driver']>;
  const EMPTY_DRIVER = {
    id: undefined, name: 'Driver', phone: '', rating: 5,
    car: 'Vehicle', plate: '', trips: 0, avatar: null,
  } as DriverInfo;
  const [driver, setDriver] = useState<DriverInfo>(paramDriver ?? EMPTY_DRIVER);
  // The full ride fetched when we land here with only a rideId (from Ride
  // History) — used to backfill fare, OTP and map coordinates that the nav
  // params don't carry on that path.
  const [fetchedRide, setFetchedRide] = useState<any>(null);

  // When we arrived with just a rideId (no driver param), fetch the ride and
  // fill in the real driver + vehicle + trip details.
  useEffect(() => {
    if (paramDriver?.name || !rideId) return;
    let cancelled = false;
    (async () => {
      try {
        const ride: any = await rideService.getRide(rideId);
        if (cancelled) return;
        setFetchedRide(ride);
        const d = ride?.driver;
        if (!d) return;
        const dp = d.driverProfile ?? {};
        const carBits = [dp.vehicleColor, dp.vehicleMake, dp.vehicleModel].filter(Boolean).join(' ');
        setDriver({
          id: String(d._id ?? ''),
          name: [d.firstName, d.lastName].filter(Boolean).join(' ') || 'Driver',
          phone: d.phone ?? '',
          rating: dp.rating ?? 5,
          car: carBits || 'Vehicle',
          plate: dp.plateNumber ?? '',
          trips: dp.totalTrips ?? 0,
          avatar: d.avatar ?? null,
        });
      } catch {
        /* keep the safe placeholder */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [paramDriver, rideId]);

  // Fare/distance/duration come from nav params (Finding-Driver flow) or are
  // backfilled from the fetched ride (Ride-History flow, rideId-only).
  const fare = fareParam ?? fetchedRide?.actualFare ?? fetchedRide?.estimatedFare;
  const distance = distanceParam ?? fetchedRide?.actualDistance ?? fetchedRide?.estimatedDistance;
  const duration = durationParam ?? fetchedRide?.actualDuration ?? fetchedRide?.estimatedDuration;

  // The OTP comes from route params (set when the driver accepted), the fetched
  // ride's pickup PIN, or a fallback derived from the rideId so we render
  // *something*.
  const otp =
    routeOtp ??
    fetchedRide?.pickupOtp ??
    (rideId ? rideId.slice(-4).toUpperCase() : '----');

  // Local fallback while we wait for the first socket-driven status push.
  // The real source of truth is currentRide.status from Redux (the App-level
  // SocketBridge keeps that in sync) — we only fall back to this when the
  // store hasn't been hydrated yet (e.g. cold start before the bridge fires).
  const [localStatus, setLocalStatus] = useState<RideStatus>('driver_assigned');
  const [driverPos, setDriverPos] = useState<LatLng | null>(null);

  // Coordinates of pickup/drop. Route params only carry the address
  // strings, but the redux ride slice was populated when the customer
  // selected them, so we read the lat/lng from there. Falls back to the
  // currentRide store entry for cold reloads where the slice has been
  // rebuilt from the backend.
  const pickupLoc = useAppSelector(s => s.ride.pickup);
  const dropoffLoc = useAppSelector(s => s.ride.dropoff);
  const currentRide = useAppSelector(s => s.ride.currentRide);

  // Derived status: prefer Redux's currentRide (kept fresh by the App-level
  // SocketBridge across every screen) so an admin verify-OTP push that
  // lands between mount cycles is never missed. Falls back to the local
  // socket-listener state for the cold-start window where Redux is empty.
  const status: RideStatus =
    ((currentRide?.status as RideStatus | undefined) &&
    String(currentRide?._id) === String(rideId)
      ? currentRide!.status
      : localStatus) as RideStatus;

  // Auto-navigate on status transitions even when the status flips via
  // Redux (App-level SocketBridge) rather than the screen-local listener.
  // Covers cold-start mid-ride where currentRide is rehydrated from the
  // backend with status already past 'driver_arrived'.
  useEffect(() => {
    if (status === 'in_progress' && rideId) {
      navigation.replace('InRide', { rideId });
    } else if ((status === 'payment_pending' || status === 'completed') && rideId) {
      // payment_pending is the new intermediate state where the trip has
      // ended but the rider hasn't paid yet — the receipt screen
      // (RideComplete) is exactly the place to collect payment, so we
      // route there for both states. RideComplete also handles the
      // already-paid case by hiding the "Proceed to Payment" button.
      navigation.replace('RideComplete', {
        rideId,
        pickup,
        dropoff,
        rideType,
        fare,
        driver,
      });
    } else if (status === 'cancelled' && rideId) {
      navigation.replace('CancelRide', { rideId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // REST fallback poll. Status transitions while the rider waits here
  // (driver_arriving → driver_arrived → in_progress, or a cancel) come over
  // the `ride:status` socket, which only reaches us when our socket sits on
  // the same backend instance that handled the update. In a split /
  // multi-instance deployment those pushes silently never arrive and the
  // screen freezes on "driver assigned". Polling the shared ride state keeps
  // `currentRide` fresh so the status-transition effect above still fires.
  const dispatch = useDispatch<AppDispatch>();
  useEffect(() => {
    if (!rideId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const fresh: any = await rideService.getRide(rideId);
        if (!cancelled && fresh) dispatch(setCurrentRide(fresh));
      } catch {
        /* transient network error — the next tick retries */
      }
    };
    const id = setInterval(tick, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [rideId, dispatch]);
  const pickupCoord: LatLng | null = useMemo(() => {
    if (pickupLoc) return { lat: pickupLoc.lat, lng: pickupLoc.lng };
    if (currentRide?.pickup) return { lat: currentRide.pickup.lat, lng: currentRide.pickup.lng };
    if (fetchedRide?.pickup) return { lat: fetchedRide.pickup.lat, lng: fetchedRide.pickup.lng };
    return null;
  }, [pickupLoc, currentRide?.pickup, fetchedRide?.pickup]);
  const dropoffCoord: LatLng | null = useMemo(() => {
    if (dropoffLoc) return { lat: dropoffLoc.lat, lng: dropoffLoc.lng };
    if (currentRide?.dropoff) return { lat: currentRide.dropoff.lat, lng: currentRide.dropoff.lng };
    if (fetchedRide?.dropoff) return { lat: fetchedRide.dropoff.lat, lng: fetchedRide.dropoff.lng };
    return null;
  }, [dropoffLoc, currentRide?.dropoff, fetchedRide?.dropoff]);

  // Driving route polyline. The endpoints change with ride phase:
  //  - Pre-pickup (driver_assigned/arriving/arrived): driver → pickup, so
  //    the rider sees where the driver currently is and the path they're
  //    taking to reach them.
  //  - In progress: driver → dropoff, so the rider follows their own ETA.
  //
  // Falls back to pickup→dropoff when we don't yet have a driver fix
  // (cold-start before the first driver:location:update arrives).
  const [directions, setDirections] = useState<GeoDirections | null>(null);
  const routeOrigin: LatLng | null = useMemo(() => {
    // While the trip is in progress, always start the route from the
    // driver's live position (or pickup as a placeholder until the first
    // GPS push lands). Pre-trip, we'd rather show driver → pickup but
    // fall back to pickup → drop so the customer always sees something.
    if (status === 'in_progress') return driverPos ?? pickupCoord;
    return driverPos ?? pickupCoord;
  }, [status, driverPos?.lat, driverPos?.lng, pickupCoord?.lat, pickupCoord?.lng]);
  const routeDest: LatLng | null = useMemo(() => {
    if (status === 'in_progress') return dropoffCoord;
    // Pre-trip: if we have a driver fix, route to pickup. If not, route
    // straight to the dropoff so the customer at least sees the trip
    // path on the map instead of an empty line at the pickup pin.
    return driverPos ? pickupCoord : dropoffCoord;
  }, [status, driverPos?.lat, driverPos?.lng, pickupCoord?.lat, pickupCoord?.lng, dropoffCoord?.lat, dropoffCoord?.lng]);

  // Refetch the route when the driver moves "enough" or the phase flips.
  // Caching the last-resolved origin keeps us from spamming the directions
  // proxy on every single GPS ping — only re-query if the driver has
  // moved > ~150 m since the last fetch. The phase change (status) is
  // detected separately and forces a refetch regardless of distance —
  // otherwise the polyline keeps pointing at the pickup after pickup-OTP.
  const lastDirOriginRef = useRef<LatLng | null>(null);
  const lastDirPhaseRef = useRef<RideStatus | null>(null);
  useEffect(() => {
    if (!routeOrigin || !routeDest) return;
    const phaseChanged = lastDirPhaseRef.current !== status;
    const last = lastDirOriginRef.current;
    const movedFarEnough = (() => {
      if (!last) return true;
      const R = 6371000;
      const dLat = ((routeOrigin.lat - last.lat) * Math.PI) / 180;
      const dLng = ((routeOrigin.lng - last.lng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((last.lat * Math.PI) / 180) *
          Math.cos((routeOrigin.lat * Math.PI) / 180) *
          Math.sin(dLng / 2) ** 2;
      const d = 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return d > 150;
    })();
    if (!phaseChanged && !movedFarEnough) return;

    let cancelled = false;
    lastDirOriginRef.current = { lat: routeOrigin.lat, lng: routeOrigin.lng };
    lastDirPhaseRef.current = status;
    geoService.directions(routeOrigin, routeDest).then(d => {
      if (!cancelled) setDirections(d);
    });
    return () => {
      cancelled = true;
    };
  }, [routeOrigin?.lat, routeOrigin?.lng, routeDest?.lat, routeDest?.lng, status]);

  const polylineCoords = useMemo(() => {
    if (!directions?.polyline?.length) return [];
    return directions.polyline.map(p => ({ latitude: p.lat, longitude: p.lng }));
  }, [directions]);

  // Map viewport — fit pickup + dropoff (and the driver pin once we have
  // one). Initial region centers on the pickup so the rider sees their
  // pickup pin immediately while the fit-to-coords animation runs.
  const mapRef = useRef<MapView | null>(null);
  const initialRegion: Region | null = useMemo(() => {
    const c = pickupCoord ?? dropoffCoord;
    if (!c) return null;
    return {
      latitude: c.lat,
      longitude: c.lng,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };
  }, [pickupCoord?.lat, pickupCoord?.lng, dropoffCoord?.lat, dropoffCoord?.lng]);

  // Fit the map to the points that matter for the current phase:
  //   pre-pickup → driver + pickup (so the rider sees the cab approaching)
  //   in-progress → driver + dropoff (so the rider sees their ETA)
  // We don't include the OTHER endpoint in either phase because zooming
  // out to include both pickup AND dropoff while the driver is metres
  // from pickup makes the cab marker invisible.
  useEffect(() => {
    if (!mapRef.current) return;
    const coords: { latitude: number; longitude: number }[] = [];
    if (driverPos) coords.push({ latitude: driverPos.lat, longitude: driverPos.lng });
    if (status === 'in_progress' && dropoffCoord) {
      coords.push({ latitude: dropoffCoord.lat, longitude: dropoffCoord.lng });
    } else if (pickupCoord) {
      coords.push({ latitude: pickupCoord.lat, longitude: pickupCoord.lng });
    }
    if (coords.length < 2) return;
    const t = setTimeout(() => {
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: 80, right: 60, bottom: 60, left: 60 },
        animated: true,
      });
    }, 400);
    return () => clearTimeout(t);
  }, [pickupCoord?.lat, pickupCoord?.lng, dropoffCoord?.lat, dropoffCoord?.lng, driverPos?.lat, driverPos?.lng, status]);

  // Subscribe to the per-ride room as soon as we land here. The driver-side
  // `driver:location` emits get fanned out as `driver:location:update` to
  // anyone in this room; we treat that as the source of truth for the cab
  // marker on the map. Status transitions arrive on the global `ride:status`
  // event the App-level SocketBridge already listens to — but we register a
  // screen-local listener too so we react synchronously.
  useEffect(() => {
    if (!rideId) return;
    joinRideRoom(rideId);

    setSocketListeners({
      onDriverLocation: payload => {
        if (payload.rideId !== rideId) return;
        setDriverPos({ lat: payload.location.lat, lng: payload.location.lng });
      },
      onRideStatus: payload => {
        if (payload.rideId !== rideId) return;
        const next = payload.status as RideStatus;
        setLocalStatus(next);
        if (next === 'in_progress') {
          // Driver verified the pickup OTP — trip is officially under way.
          // Replace so back-press doesn't return the user to the pre-ride
          // tracking screen mid-trip.
          navigation.replace('InRide', { rideId });
        }
        if (next === 'payment_pending' || next === 'completed') {
          // Driver ended the trip. Take the rider to the receipt — they
          // pay there if they haven't already.
          navigation.replace('RideComplete', {
            rideId,
            pickup,
            dropoff,
            rideType,
            fare,
            driver,
          });
        }
        if (next === 'cancelled') {
          // The ride was cancelled server-side (driver/admin/auto). Do NOT go
          // to CancelRide — that's the "are you sure you want to cancel?"
          // CONFIRMATION screen, which told a customer whose driver just bailed
          // that the driver was "almost there". Show what happened and go home.
          dispatch(setCurrentRide(null));
          Alert.alert('Ride cancelled', 'Your ride was cancelled.');
          navigation.popToTop();
        }
      },
      // Server-side cancel mid-ride (admin or driver). The dedicated event
      // carries a `reason`/`message` we can surface to the user.
      onRideCancelled: payload => {
        if (payload.rideId !== rideId) return;
        dispatch(setCurrentRide(null));
        Alert.alert(
          'Ride cancelled',
          payload.message ||
            (payload.cancelledBy === 'driver'
              ? 'Your driver cancelled this ride. Please book again.'
              : payload.reason || 'Your ride was cancelled.'),
        );
        navigation.popToTop();
      },
    });

    return () => {
      leaveRideRoom(rideId);
    };
  }, [rideId, navigation, pickup, dropoff, rideType, fare, driver]);

  // Derived UI bits.
  const banner = STATUS_BANNER[status];
  // The OTP is only useful before the ride starts; the moment the trip
  // begins (or anything terminal happens), it's stale and shouldn't show.
  // We also hide it if the driver-app/admin cleared the OTP — verifyRideOtp
  // sets pickupOtp = undefined on success.
  const otpStillValid = !!routeOtp || (currentRide && (currentRide as any).pickupOtp);
  const showOtp =
    otpStillValid &&
    (status === 'driver_assigned' ||
      status === 'driver_arriving' ||
      status === 'driver_arrived');
  // Show the live driver pin only while they're heading toward pickup.
  const showDriverOnMap =
    status === 'driver_assigned' ||
    status === 'driver_arriving' ||
    status === 'driver_arrived' ||
    status === 'in_progress';

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      {/* Map area — real Google Maps with pickup, drop, driver pin, and
          the driving polyline. Replaces the old WebView/OSM placeholder
          that needed to geocode the address strings at runtime. */}
      <View style={styles.mapArea}>
        {initialRegion && (
          <MapView
            ref={(r) => {
              mapRef.current = r;
            }}
            provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
            style={StyleSheet.absoluteFill}
            initialRegion={initialRegion}
            showsUserLocation={false}
            showsMyLocationButton={false}
            showsCompass={false}
            toolbarEnabled={false}
          >
            {pickupCoord && status !== 'in_progress' && (
              <Marker
                key="pickup"
                coordinate={{ latitude: pickupCoord.lat, longitude: pickupCoord.lng }}
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={false}
              >
                <View style={styles.pickupMarker}>
                  <View style={styles.pickupMarkerDot} />
                </View>
              </Marker>
            )}
            {/* Pre-pickup we don't show the dropoff marker — the focus is
                getting the driver to the rider, not the destination. Once
                the trip starts, we swap the pickup marker for the dropoff
                so the rider sees where they're heading. */}
            {dropoffCoord && status === 'in_progress' && (
              <Marker
                key="drop"
                coordinate={{ latitude: dropoffCoord.lat, longitude: dropoffCoord.lng }}
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={false}
              >
                <View style={styles.dropMarker}>
                  <Ionicons name="location" size={18} color={Colors.white} />
                </View>
              </Marker>
            )}
            {polylineCoords.length > 0 && (
              <Polyline
                coordinates={polylineCoords}
                strokeColor={Colors.primary}
                strokeWidth={5}
              />
            )}
            {showDriverOnMap && driverPos && (
              <Marker
                key="driver"
                coordinate={{ latitude: driverPos.lat, longitude: driverPos.lng }}
                anchor={{ x: 0.5, y: 0.5 }}
                flat
                tracksViewChanges={false}
              >
                <CabIcon size={36} rotation={0} />
              </Marker>
            )}
          </MapView>
        )}

        {/* Top controls */}
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          {/* OTP Badge */}
          {showOtp ? (
            <View style={styles.otpBadge}>
              <Text style={styles.otpText}>OTP-{otp}</Text>
            </View>
          ) : (
            <View />
          )}

          {/* Cancel Ride — only while pre-ride; once we're in_progress the
              driver flow handles cancellation differently. */}
          {(status === 'driver_assigned' || status === 'driver_arriving') && (
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => navigation.navigate('CancelReason', { rideId })}
            >
              <Ionicons name="close" size={16} color="#FF3D57" />
              <Text style={styles.cancelText}>Cancel Ride</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Yellow ETA Banner */}
      <View style={styles.etaBanner}>
        <Ionicons name="flash" size={16} color="#333" />
        <Text style={styles.etaText}>{banner}</Text>
      </View>

      {/* Driver Info Card */}
      <ScrollView style={styles.bottomSection} contentContainerStyle={styles.bottomContent}>
        {/* To Pay + Vehicle Info */}
        <View style={styles.driverCard}>
          {/* To Pay */}
          <View style={styles.toPayRow}>
            <Text style={styles.toPayLabel}>To Pay</Text>
            <Text style={styles.toPayAmount}>
              {'₹'}
              {fare ?? '—'}
            </Text>
          </View>

          {/* Vehicle Info */}
          <View style={styles.vehicleRow}>
            <View style={styles.vehicleInfo}>
              <Text style={styles.vehicleName}>{driver.car || 'Vehicle'}</Text>
              <Text style={styles.vehiclePlate}>{driver.plate || ''}</Text>
            </View>
            <Text style={styles.vehicleEmoji}>{'🚙'}</Text>
          </View>
        </View>

        {/* Driver Details */}
        <View style={styles.driverRow}>
          {driver.avatar ? (
            <Image source={{ uri: driver.avatar }} style={styles.driverAvatarImg} />
          ) : (
            <Avatar name={driver.name} size={48} />
          )}
          <View style={styles.driverInfo}>
            <Text style={styles.driverName}>{driver.name || 'Driver'}</Text>
            <Text style={styles.driverMeta}>
              {(driver.rating ?? 5).toFixed(1)} {'⭐'} {'  |  '}{' '}
              {driver.trips ?? 0}+ Rides
            </Text>
            {!!driver.phone && (
              <Text style={styles.driverPhone}>{driver.phone}</Text>
            )}
          </View>
        </View>

        {/* Dashed divider */}
        <View style={styles.dashedDivider} />

        {/* Action Buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={async () => {
              // Real dialer via the system's tel: scheme. Falls back to a
              // helpful alert if we don't have a phone number (older rides
              // booked before the driver-param shape was extended).
              const phone = (driver.phone || '').replace(/\s+/g, '');
              if (!phone) {
                Alert.alert('Phone not available', "We don't have this driver's number yet.");
                return;
              }
              const url = `tel:${phone}`;
              const can = await Linking.canOpenURL(url);
              if (!can) {
                Alert.alert('Cannot place call', 'This device cannot make phone calls.');
                return;
              }
              Linking.openURL(url);
            }}
          >
            <Ionicons name="call-outline" size={18} color={Colors.textPrimary} />
            <Text style={styles.actionLabel}>Call</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => navigation.navigate('Chat', { driver, rideId })}
          >
            <Ionicons name="chatbubble-outline" size={18} color={Colors.textPrimary} />
            <Text style={styles.actionLabel}>Chat</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => navigation.navigate('ShareRide')}
          >
            <Ionicons name="share-social-outline" size={18} color={Colors.textPrimary} />
            <Text style={styles.actionLabel}>Share</Text>
          </TouchableOpacity>
        </View>

        {/* Footer text */}
        <Text style={styles.footerText}>Use Electric, Save Nature</Text>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  mapArea: {
    height: '45%',
    position: 'relative',
  },
  mapPlaceholder: {
    flex: 1,
  },
  pickupMarker: {
    width: s(22),
    height: s(22),
    borderRadius: s(11),
    backgroundColor: Colors.white,
    borderWidth: 3,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickupMarkerDot: {
    width: s(8),
    height: s(8),
    borderRadius: s(4),
    backgroundColor: Colors.primary,
  },
  dropMarker: {
    width: s(28),
    height: s(28),
    borderRadius: s(14),
    backgroundColor: '#3B5BDB',
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.sm,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: s(16),
  },
  otpBadge: {
    backgroundColor: Colors.white,
    borderRadius: s(8),
    paddingHorizontal: s(12),
    paddingVertical: vs(8),
    borderWidth: 1.5,
    borderColor: '#EDAE10',
  },
  otpText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(14),
    color: '#333333',
  },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: s(8),
    paddingHorizontal: s(12),
    paddingVertical: vs(8),
    gap: s(4),
  },
  cancelText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(14),
    color: '#FF3D57',
  },
  etaBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFE066',
    paddingVertical: vs(12),
    gap: s(6),
  },
  etaText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(16),
    color: '#333333',
  },
  bottomSection: {
    flex: 1,
  },
  bottomContent: {
    paddingHorizontal: s(20),
    paddingTop: vs(16),
    paddingBottom: vs(24),
  },
  driverCard: {
    backgroundColor: Colors.primary,
    borderRadius: s(16),
    padding: s(16),
    marginBottom: vs(16),
  },
  toPayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: vs(12),
  },
  toPayLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(14),
    color: 'rgba(255,255,255,0.8)',
  },
  toPayAmount: {
    fontFamily: 'Inter-Bold',
    fontSize: fs(28),
    color: Colors.white,
  },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: s(12),
    padding: s(12),
  },
  vehicleInfo: {
    flex: 1,
  },
  vehicleName: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(14),
    color: 'rgba(255,255,255,0.8)',
  },
  vehiclePlate: {
    fontFamily: 'Inter-Bold',
    fontSize: fs(18),
    color: Colors.white,
    marginTop: vs(2),
  },
  vehicleEmoji: {
    fontSize: fs(40),
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(12),
    marginBottom: vs(16),
  },
  driverInfo: {
    flex: 1,
  },
  driverName: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(16),
    color: Colors.textPrimary,
  },
  driverMeta: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(13),
    color: '#7D8A95',
    marginTop: vs(2),
  },
  driverAvatarImg: {
    width: s(48),
    height: s(48),
    borderRadius: s(24),
    backgroundColor: '#E0E0E0',
  },
  driverPhone: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(12),
    color: '#9AA3AC',
    marginTop: vs(2),
  },
  dashedDivider: {
    height: 1,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderStyle: 'dashed',
    marginBottom: vs(16),
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: s(16),
    marginBottom: vs(20),
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: s(25),
    paddingHorizontal: s(20),
    paddingVertical: vs(10),
    gap: s(6),
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  actionLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: fs(14),
    color: Colors.textPrimary,
  },
  footerText: {
    fontFamily: 'Inter-Medium',
    fontSize: fs(13),
    color: Colors.primary,
    textAlign: 'center',
  },
});
