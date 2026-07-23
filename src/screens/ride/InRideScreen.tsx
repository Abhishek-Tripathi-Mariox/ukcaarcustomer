import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import MapView, {
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
  Region,
} from 'react-native-maps';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/theme';
import { fs, s, vs } from '@/theme/responsive';
import { useAppSelector } from '@/store/hooks';
import { rideService } from '@/services/rideService';
import { geoService, GeoDirections } from '@/services/geoService';
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

interface InRideScreenProps {
  navigation: any;
  route: {
    params: {
      rideId?: string;
      pickup?: string;
      dropoff?: string;
      rideType?: any;
      fare?: number;
      distance?: number;
      duration?: number;
      driver?: any;
    };
  };
}

export const InRideScreen: React.FC<InRideScreenProps> = ({
  navigation,
  route,
}) => {
  const insets = useSafeAreaInsets();
  const { rideId, pickup, dropoff, rideType, fare, distance, duration, driver } =
    route.params;

  // Source of truth for the trip's status is the backend (driver presses
  // "Complete" or admin marks complete). We listen for that and only then
  // navigate to the receipt — never auto-complete from the customer app.
  const currentRide = useAppSelector((s) => s.ride.currentRide);
  const pickupSlice = useAppSelector((s) => s.ride.pickup);
  const dropoffSlice = useAppSelector((s) => s.ride.dropoff);

  // Resolve real lat/lng for the endpoints. Prefer the Redux ride slice
  // (set when the customer picked them) and fall back to the persisted
  // currentRide doc for cold-starts that land here mid-trip.
  const pickupCoord: LatLng | null = useMemo(() => {
    if (pickupSlice) return { lat: pickupSlice.lat, lng: pickupSlice.lng };
    if (currentRide?.pickup)
      return { lat: currentRide.pickup.lat, lng: currentRide.pickup.lng };
    return null;
  }, [pickupSlice, currentRide?.pickup]);

  const dropoffCoord: LatLng | null = useMemo(() => {
    if (dropoffSlice) return { lat: dropoffSlice.lat, lng: dropoffSlice.lng };
    if (currentRide?.dropoff)
      return { lat: currentRide.dropoff.lat, lng: currentRide.dropoff.lng };
    return null;
  }, [dropoffSlice, currentRide?.dropoff]);

  const [driverPos, setDriverPos] = useState<LatLng | null>(null);
  const [directions, setDirections] = useState<GeoDirections | null>(null);

  // Join the per-ride socket room so we get the driver's live GPS pings
  // and the server-side `ride:status` transitions (e.g. when the driver
  // taps "End trip"). The room subscription is the only thing that drives
  // navigation off this screen — there is no client-side timer here.
  useEffect(() => {
    if (!rideId) return;
    joinRideRoom(rideId);

    setSocketListeners({
      onDriverLocation: (payload) => {
        if (payload.rideId !== rideId) return;
        setDriverPos({ lat: payload.location.lat, lng: payload.location.lng });
      },
      onRideStatus: (payload) => {
        if (payload.rideId !== rideId) return;
        if (payload.status === 'payment_pending' || payload.status === 'completed') {
          // Trip ended — go to receipt. RideComplete handles the payment
          // flow for `payment_pending` and the "thanks for riding" view
          // for `completed` (it inspects ride.paymentStatus on mount).
          navigation.replace('RideComplete', {
            rideId,
            pickup,
            dropoff,
            rideType,
            fare,
            distance,
            duration,
            driver,
          });
        } else if (payload.status === 'cancelled') {
          // Server-side cancel — go home, not to the cancel CONFIRMATION screen.
          navigation.popToTop();
        }
      },
      onRideCancelled: (payload) => {
        if (payload.rideId !== rideId) return;
        navigation.popToTop();
      },
    });

    return () => {
      leaveRideRoom(rideId);
    };
  }, [rideId, navigation, pickup, dropoff, rideType, fare, distance, duration, driver]);

  // Cold-start guard: if we landed here via deep-resume and Redux already
  // reflects a terminal state, transition immediately rather than waiting
  // for another socket emit.
  useEffect(() => {
    if (!currentRide || String(currentRide._id) !== String(rideId)) return;
    if (
      currentRide.status === 'payment_pending' ||
      currentRide.status === 'completed'
    ) {
      navigation.replace('RideComplete', {
        rideId,
        pickup,
        dropoff,
        rideType,
        fare,
        distance,
        duration,
        driver,
      });
    } else if (currentRide.status === 'cancelled') {
          // Server-side cancel (driver/admin/auto). Do NOT push CancelRide —
          // that is the "are you sure you want to cancel?" CONFIRMATION screen,
          // and confirming there re-cancels an already-cancelled ride, which
          // 400s and leaves the rider stuck with no way out.
      Alert.alert('Ride cancelled', 'Your ride was cancelled.');
      navigation.popToTop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRide?.status, currentRide?._id]);

  // REST fallback poll. The driver's "End trip" / "Cash collected" flips the
  // ride to payment_pending/completed on the server, but the `ride:status`
  // socket push only reaches us when our socket sits on the same backend
  // instance that handled it. In a split/multi-instance deployment it never
  // arrives — which is the "driver marked cash collected but nothing updates
  // on the rider side" bug. Polling the shared ride state guarantees we still
  // move to the receipt once the DB reflects the terminal status.
  const navigatedRef = useRef(false);
  useEffect(() => {
    if (!rideId) return;
    let cancelled = false;
    const poll = async () => {
      if (navigatedRef.current) return;
      try {
        const ride: any = await rideService.getRide(rideId);
        if (cancelled || navigatedRef.current || !ride) return;
        if (ride.status === 'payment_pending' || ride.status === 'completed') {
          navigatedRef.current = true;
          navigation.replace('RideComplete', {
            rideId,
            pickup,
            dropoff,
            rideType,
            fare,
            distance,
            duration,
            driver,
          });
        } else if (ride.status === 'cancelled') {
          navigatedRef.current = true;
          // Server-side cancel (driver/admin/auto). Do NOT push CancelRide —
          // that is the "are you sure you want to cancel?" CONFIRMATION screen,
          // and confirming there re-cancels an already-cancelled ride, which
          // 400s and leaves the rider stuck with no way out.
          Alert.alert('Ride cancelled', 'Your ride was cancelled.');
          navigation.popToTop();
        }
      } catch {
        /* transient network error — the next tick retries */
      }
    };
    const id = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [rideId, navigation, pickup, dropoff, rideType, fare, distance, duration, driver]);

  // Compute the trip polyline (driver → dropoff). Refetch only when the
  // driver moves > ~150 m so we don't hammer the directions proxy.
  const routeOrigin: LatLng | null = driverPos ?? pickupCoord;
  const lastDirOriginRef = useRef<LatLng | null>(null);
  useEffect(() => {
    if (!routeOrigin || !dropoffCoord) return;
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
    if (!movedFarEnough) return;

    let cancelled = false;
    lastDirOriginRef.current = { lat: routeOrigin.lat, lng: routeOrigin.lng };
    geoService.directions(routeOrigin, dropoffCoord).then((d) => {
      if (!cancelled) setDirections(d);
    });
    return () => {
      cancelled = true;
    };
  }, [routeOrigin?.lat, routeOrigin?.lng, dropoffCoord?.lat, dropoffCoord?.lng]);

  const polylineCoords = useMemo(() => {
    if (!directions?.polyline?.length) return [];
    return directions.polyline.map((p) => ({ latitude: p.lat, longitude: p.lng }));
  }, [directions]);

  // ETA derived from the live directions response. Falls back to the
  // route-param `duration` we got from the original estimate so the chip
  // always shows something while the first directions call is in flight.
  const eta = useMemo(() => {
    if (directions?.durationSeconds) {
      return Math.max(1, Math.round(directions.durationSeconds / 60));
    }
    if (duration) return Math.max(1, Math.ceil(duration / 3));
    return 1;
  }, [directions?.durationSeconds, duration]);

  // Initial map region — centre on the driver if we have a fix, otherwise
  // the dropoff so the rider sees their destination.
  const mapRef = useRef<MapView | null>(null);
  const initialRegion: Region | null = useMemo(() => {
    const c = driverPos ?? dropoffCoord ?? pickupCoord;
    if (!c) return null;
    return {
      latitude: c.lat,
      longitude: c.lng,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };
  }, [
    driverPos?.lat,
    driverPos?.lng,
    dropoffCoord?.lat,
    dropoffCoord?.lng,
    pickupCoord?.lat,
    pickupCoord?.lng,
  ]);

  // Re-fit the camera to include the driver + dropoff whenever either moves.
  useEffect(() => {
    if (!mapRef.current) return;
    const coords: { latitude: number; longitude: number }[] = [];
    if (driverPos) coords.push({ latitude: driverPos.lat, longitude: driverPos.lng });
    if (dropoffCoord)
      coords.push({ latitude: dropoffCoord.lat, longitude: dropoffCoord.lng });
    if (coords.length < 2) return;
    const t = setTimeout(() => {
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: 120, right: 80, bottom: 220, left: 80 },
        animated: true,
      });
    }, 250);
    return () => clearTimeout(t);
  }, [
    driverPos?.lat,
    driverPos?.lng,
    dropoffCoord?.lat,
    dropoffCoord?.lng,
  ]);

  const handleSOS = () => {
    Alert.alert('SOS / Emergency', 'Do you want to call emergency services?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Call 112',
        style: 'destructive',
        onPress: () => Linking.openURL('tel:112'),
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      {/* Real Google Map — same provider/configuration as RideTracking and
          SelectRide so the customer gets a consistent map experience. */}
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
          {dropoffCoord && (
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
          {driverPos && (
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

      {/* Info card — destination + live ETA */}
      <View style={[styles.infoCard, { top: insets.top + 12 }]}>
        <View style={styles.locationRow}>
          <Ionicons name="navigate" size={18} color={Colors.primary} />
          <Text style={styles.locationText} numberOfLines={1}>
            {dropoff || currentRide?.dropoff?.address || '—'}
          </Text>
        </View>
        <View style={styles.etaRow}>
          <Text style={styles.etaLabel}>ETA</Text>
          <View style={styles.etaPill}>
            <Text style={styles.etaPillText}>{eta} min</Text>
          </View>
        </View>
      </View>

      {/* In-progress banner so it's clear the trip is live */}
      <View style={[styles.statusBanner, { top: insets.top + 12 }]}>
        <Ionicons name="flash" size={14} color="#333" />
        <Text style={styles.statusBannerText}>On your way to destination</Text>
      </View>

      {/* SOS */}
      <View style={[styles.sosWrap, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={styles.sosButton}
          activeOpacity={0.85}
          onPress={handleSOS}
        >
          <Text style={styles.sosText}>SOS / Emergency</Text>
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

  /* Info card */
  infoCard: {
    position: 'absolute',
    left: s(15),
    minWidth: s(174),
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(8),
    backgroundColor: '#FEFEFE',
    borderTopLeftRadius: s(12),
    borderTopRightRadius: s(12),
    borderBottomRightRadius: s(12),
    paddingHorizontal: s(14),
    paddingVertical: vs(10),
    minHeight: vs(43),
    shadowColor: Colors.black,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  locationText: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(15),
    color: '#545365',
    maxWidth: s(220),
  },
  etaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(12),
    backgroundColor: '#FEFEFE',
    borderBottomLeftRadius: s(12),
    borderBottomRightRadius: s(12),
    paddingHorizontal: s(14),
    paddingVertical: vs(6),
    marginTop: vs(1),
    alignSelf: 'flex-start',
    shadowColor: Colors.black,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  etaLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(15),
    color: '#545365',
  },
  etaPill: {
    backgroundColor: Colors.primary,
    borderRadius: s(10),
    paddingHorizontal: s(12),
    paddingVertical: vs(5),
  },
  etaPillText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(14),
    color: '#FEFEFE',
  },

  statusBanner: {
    position: 'absolute',
    right: s(15),
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(6),
    backgroundColor: '#FFE974',
    paddingHorizontal: s(12),
    paddingVertical: vs(6),
    borderRadius: s(999),
    elevation: 3,
    shadowColor: Colors.black,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  statusBannerText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(12),
    color: '#333',
  },

  dropMarker: {
    width: s(28),
    height: s(28),
    borderRadius: s(14),
    backgroundColor: '#3B5BDB',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.black,
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },

  /* SOS */
  sosWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: s(19),
  },
  sosButton: {
    backgroundColor: Colors.error,
    borderRadius: s(20),
    height: vs(64),
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.black,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  sosText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(18),
    color: Colors.white,
  },
});
