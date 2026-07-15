import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  Image,
  Platform,
  ScrollView,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import Ionicons from 'react-native-vector-icons/Ionicons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useLiveLocation } from '@/hooks/useLiveLocation';
import { useDefaultPickup } from '@/hooks/useDefaultPickup';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '@/theme';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { setWalletBalance, refreshNotificationCount } from '@/store/slices/appSlice';
import { setRideType, setPickup, setDropoff } from '@/store/slices/rideSlice';
import { paymentService } from '@/services/paymentService';
import { driverService, NearbyDriver } from '@/services/driverService';
import { rideService } from '@/services/rideService';
import { routeService } from '@/services/routeService';
import { geoService } from '@/services/geoService';
import {
  routeToUi,
  type ScheduledRoute,
} from '@/screens/scheduled/ScheduledRouteScreen';
import {
  SunriseIcon,
  TargetIcon,
  FlashIcon,
  CarIcon,
  CalendarClockIcon,
  CabIcon,
  MenuIcon,
} from '@/components/icons/HomeIcons';
import { BookingRideForSheet } from './BookingRideForSheet';
import { PickupPickerSheet } from './PickupPickerSheet';
import { LocationRequiredBanner } from '@/components/LocationRequiredBanner';

const pickupGif = require('../../../assets/home-screen/gifs/charging-station.gif');
const dropGif = require('../../../assets/home-screen/gifs/location.gif');

const { height } = Dimensions.get('window');

type RideTab = 'instant' | 'private' | 'scheduled';

interface HomeScreenProps {
  navigation: any;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + 70;
  const [activeTab, setActiveTab] = useState<RideTab>('instant');
  const [showRiderSheet, setShowRiderSheet] = useState(false);
  // Inline pickup picker — replaces the old SelectLocation full-screen
  // navigation so the rider stays on Home throughout the booking flow.
  const [showPickupPicker, setShowPickupPicker] = useState(false);
  // Scheduled tab uses the same picker sheet for its drop field so the
  // user gets live autocomplete (geo/autocomplete proxy) and saved
  // addresses — same wiring as Instant/Private. Without this the field
  // was a bare TextInput and the rider had to type the full address by
  // hand, then ScheduledRouteScreen geocoded the raw string.
  const [showDropPicker, setShowDropPicker] = useState(false);
  // Scheduled routes resolved against the chosen pickup/drop — shown
  // inline on the Scheduled tab so the rider never has to bounce to a
  // separate ScheduledRoute screen just to pick one. Tapping "Schedule
  // Ride" jumps straight to ScheduledBoardingDrop with the selected row.
  const [scheduledRoutes, setScheduledRoutes] = useState<ScheduledRoute[] | null>(null);
  const [scheduledRoutesError, setScheduledRoutesError] = useState<string | null>(null);
  const [selectedScheduledRouteId, setSelectedScheduledRouteId] = useState<string | null>(null);
  // Pincodes captured from the picker sheet. These drive the primary
  // matching path on the scheduled-routes endpoint — pure lat/lng rarely
  // hits a route stop exactly (the rider may be a few km from the
  // departure point), but a matching PIN reliably says "this route serves
  // your town/area".
  const [scheduledPickupPincode, setScheduledPickupPincode] = useState<string | undefined>();
  const [scheduledDropPincode, setScheduledDropPincode] = useState<string | undefined>();
  // Pincode of the rider's *current* GPS location. Used as the default
  // proximity filter on the Scheduled tab so the rider only sees routes
  // serving their area, even before they set a pickup. The picker-supplied
  // scheduledPickupPincode overrides this once they explicitly pick a pickup.
  const [currentPincode, setCurrentPincode] = useState<string | undefined>();
  const [scheduledPickup, setScheduledPickup] = useState('');
  const [scheduledDrop, setScheduledDrop] = useState('');
  const { user } = useAppSelector((state) => state.auth);
  const reduxPickup = useAppSelector((state) => state.ride.pickup);
  const reduxDropoff = useAppSelector((state) => state.ride.dropoff);
  const walletBalance = useAppSelector((state) => state.app.walletBalance);
  const notificationCount = useAppSelector((state) => state.app.notificationCount);
  const dispatch = useAppDispatch();

  // Refresh the wallet balance whenever Home regains focus — not just on first
  // mount. Home is a persistent tab, so a mount-only fetch showed a STALE
  // balance after a wallet-paid booking (the debit happened server-side but the
  // chip never re-read it), which read as "my wallet didn't go down".
  useFocusEffect(
    useCallback(() => {
      paymentService.getWallet().then((res) => {
        if (res.success) dispatch(setWalletBalance(res.data.wallet?.balance || 0));
      }).catch(() => {});
      dispatch(refreshNotificationCount());
    }, [dispatch]),
  );

  useEffect(() => {
    dispatch(setRideType(activeTab));
  }, [activeTab, dispatch]);

  // ── Live nearby drivers for the map ─────────────────────────────
  // Center coords come from the geolocation slice (resolved on the splash
  // screen via `useResolveLocation`). `hasRealFix` gates the network calls
  // and map render so we never ping the backend with a placeholder center.
  // The placeholder coords (Dehradun-ish) exist purely as a typed default
  // for the geometry math below — they are NEVER sent to the server while
  // `hasRealFix` is false.
  const splashCoords = useAppSelector((s) => s.geolocation.coords);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number }>(
    splashCoords
      ? { lat: splashCoords.lat, lng: splashCoords.lng }
      : { lat: 30.3165, lng: 78.0322 },
  );
  const [hasRealFix, setHasRealFix] = useState<boolean>(!!splashCoords);
  useEffect(() => {
    if (splashCoords) {
      setUserCoords({ lat: splashCoords.lat, lng: splashCoords.lng });
      setHasRealFix(true);
    }
  }, [splashCoords?.lat, splashCoords?.lng]);
  const [nearbyDrivers, setNearbyDrivers] = useState<NearbyDriver[]>([]);
  const [instantCount, setInstantCount] = useState<number | null>(null);
  const [privateCount, setPrivateCount] = useState<number | null>(null);
  const [scheduledCount, setScheduledCount] = useState<number | null>(null);
  // Home-map viewport radius. We keep the home map tight on purpose: the
  // customer is browsing nearby cabs, not exploring a region. The dispatch
  // search itself is capped to MAX_HOME_RADIUS_KM via onRegionChangeComplete
  // below — if the user pinch-zooms out, we snap them back in.
  const radiusKm = 5;
  const MAX_HOME_RADIUS_KM = 5;
  // Driver-search radius is intentionally wider than the map viewport: while
  // the driver pool is small / spread out, asking for cabs within only 5 km
  // shows an empty map for most users. We let getNearby return everything
  // within 50 km — markers outside the 5 km map view simply aren't drawn,
  // and ones inside it light up the map.
  const driverSearchRadiusKm = 50;
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Real-time device location. The hook keeps a watchPosition subscription
  // alive, so userCoords updates as the rider moves and the nearby-driver
  // poll re-runs against the fresh point. Reverse-geocoding is enabled so
  // the pickup label has a human-readable address; this is the ONE GPS
  // subscription on the home screen — useDefaultPickup consumes the result
  // rather than spinning up its own (two concurrent watches race the
  // Android permission prompt and one of them ends up never resolving).
  const live = useLiveLocation({ watch: true, reverseGeocode: true });
  useEffect(() => {
    if (!live.coords) return;
    setUserCoords({ lat: live.coords.lat, lng: live.coords.lng });
    setHasRealFix(true);
  }, [live.coords?.lat, live.coords?.lng]);

  // Effective center used by network calls — null until a real fix lands.
  const effectiveCenter: { lat: number; lng: number } | null = hasRealFix
    ? userCoords
    : null;

  // Resolve the current location's pincode so the Scheduled tab can filter
  // routes to the rider's area. useLiveLocation only keeps the address
  // string, so we reverse-geocode the coords ourselves for the parts.
  // Resolved once per fix (we early-return once we have one) to avoid
  // hammering the geocoder as watchPosition streams tiny coordinate deltas.
  useEffect(() => {
    if (!effectiveCenter || currentPincode) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await geoService.reverse(effectiveCenter.lat, effectiveCenter.lng);
        if (!cancelled && res?.parts?.pincode) setCurrentPincode(res.parts.pincode);
      } catch {
        /* leave currentPincode unset — fetch falls back to coords ranking */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [effectiveCenter?.lat, effectiveCenter?.lng, currentPincode]);

  // Default-pickup resolver. Reads from the single `live` instance above
  // plus the user's saved addresses.
  const defaultPickup = useDefaultPickup({
    coords: live.coords ? { lat: live.coords.lat, lng: live.coords.lng } : null,
    address: live.address,
  });

  // Default the Scheduled-tab pickup field to the resolved default location
  // (live GPS → primary saved → first saved) — only while the field is empty
  // so we never clobber what the user typed.
  useEffect(() => {
    if (scheduledPickup) return;
    const addr = defaultPickup.location?.address;
    if (addr) setScheduledPickup(addr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultPickup.location?.address]);

  // Fetch scheduled routes for the current pickup/drop pair whenever the
  // user is actively on the Scheduled tab. We resolve each address to
  // coords via the autocomplete proxy first, exactly the way the old
  // ScheduledRouteScreen used to do — so the backend can rank routes by
  // proximity to the chosen stops.
  useEffect(() => {
    if (activeTab !== 'scheduled') return;
    let cancelled = false;

    const resolveCoords = async (text: string) => {
      const trimmed = text?.trim();
      if (!trimmed) return undefined;
      try {
        const results = await geoService.autocomplete(trimmed, 1);
        if (results.length === 0) return undefined;
        return { lat: results[0].lat, lng: results[0].lng };
      } catch {
        return undefined;
      }
    };

    setScheduledRoutesError(null);
    setScheduledRoutes(null); // show loading while we refetch

    (async () => {
      const pickupCoords = await resolveCoords(scheduledPickup);
      const dropCoords = await resolveCoords(scheduledDrop);
      if (cancelled) return;
      try {
        const apiRoutes = await routeService.listScheduled({
          // Show every active scheduled route the admin has defined,
          // regardless of whether a driver has been approved yet. The
          // approved-driver gate used to live here but it hid freshly-
          // created routes during testing and confused the rider — the
          // booking step itself enforces driver availability at the
          // departure time, so discovery shouldn't pre-filter on it.
          hasApprovedDriver: false,
          pickup: pickupCoords,
          drop: dropCoords,
          // Prefer pincode matching — the picker captured it from the
          // autocomplete result. Without it the backend would only match
          // on raw coords and miss routes the rider could obviously board
          // (e.g. anywhere in Kasganj on the Kasganj→Aligarh route).
          // Falls back to the rider's *current* GPS pincode so the list is
          // scoped to their area before they pick a pickup — if nothing in
          // that pincode matches, the empty state shows (strict nearby-only).
          pickupPincode: scheduledPickupPincode ?? currentPincode,
          dropPincode: scheduledDropPincode,
        });
        if (cancelled) return;
        const ui = apiRoutes.map(routeToUi);
        setScheduledRoutes(ui);
        if (ui.length > 0) setSelectedScheduledRouteId(ui[0].id);
        else setSelectedScheduledRouteId(null);
      } catch (err: any) {
        if (cancelled) return;
        setScheduledRoutesError(err?.message ?? 'Could not load routes');
        setScheduledRoutes([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    activeTab,
    scheduledPickup,
    scheduledDrop,
    scheduledPickupPincode,
    scheduledDropPincode,
    currentPincode,
  ]);

  // Poll nearby drivers every 15s so the map stays alive. We deliberately
  // gate on `effectiveCenter` being non-null — until the device returns a
  // real fix we don't want to ping the backend with a fake center.
  useEffect(() => {
    if (!effectiveCenter) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const fetchDrivers = async () => {
      if (activeTab === 'scheduled') {
        setNearbyDrivers([]);
        return;
      }
      try {
        const drivers = await driverService.getNearby(
          effectiveCenter.lat,
          effectiveCenter.lng,
          driverSearchRadiusKm,
        );
        if (isMounted.current) setNearbyDrivers(drivers);
      } catch {
        /* ignore — leave the previous list shown */
      }
    };
    fetchDrivers();
    timer = setInterval(fetchDrivers, 15000);
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [effectiveCenter?.lat, effectiveCenter?.lng, activeTab]);

  // Tab-aware driver counts. Single source of truth for the Home badge:
  //   - instant/private: /vehicle-types/nearby (7 km, tier-filtered)
  //   - scheduled: distinct approved drivers across active routes
  // Polled on coord change so the number updates as the rider moves.
  useEffect(() => {
    if (!effectiveCenter) return;
    let cancelled = false;
    const fetchCounts = async () => {
      try {
        const [tiers, scheduled] = await Promise.all([
          rideService.getNearbyVehicleTypes(effectiveCenter.lat, effectiveCenter.lng),
          driverService.getScheduledNearbyCount(effectiveCenter.lat, effectiveCenter.lng),
        ]);
        if (cancelled) return;
        const sum = (list: { availableCount: number }[]) =>
          list.reduce((acc, t) => acc + (t.availableCount ?? 0), 0);
        setInstantCount(sum(tiers.instant));
        setPrivateCount(sum(tiers.private));
        setScheduledCount(scheduled);
      } catch {
        if (cancelled) return;
        // Leave whatever counts we had; the badge degrades to "Looking for…"
      }
    };
    fetchCounts();
    const t = setInterval(fetchCounts, 15000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [effectiveCenter?.lat, effectiveCenter?.lng]);

  const isPrivate = activeTab === 'private';
  const isScheduled = activeTab === 'scheduled';

  // Drop-off label for the "Where to?" field. Scheduled keeps its own local
  // input (drives the route lookup); Instant/Private read the drop straight
  // from Redux, which the inline drop picker and saved-address rows populate.
  const dropLabel = isScheduled ? scheduledDrop : reduxDropoff?.address;

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const firstName = user?.firstName || 'User';
  const initials = useMemo(() => {
    const f = (user?.firstName ?? '').trim();
    const l = (user?.lastName ?? '').trim();
    const a = f ? f[0] : '';
    const b = l ? l[0] : '';
    return (a + b).toUpperCase() || 'U';
  }, [user?.firstName, user?.lastName]);

  const tabs: { key: RideTab; label: string; Icon: React.FC<{ size?: number; color?: string }> }[] = [
    { key: 'instant', label: 'Instant', Icon: FlashIcon },
    { key: 'private', label: 'Private', Icon: CarIcon },
    { key: 'scheduled', label: 'Scheduled', Icon: CalendarClockIcon },
  ];

  // Stable hash so a driver's heading/icon size doesn't reshuffle on every poll.
  const stableHash = (s: string): number => {
    let h = 0;
    for (let i = 0; i < s.length; i += 1) {
      h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
  };

  // Map a registered vehicle colour string to a soft halo color used under
  // the top-down cab icon so cars on the map look visually different.
  const haloFor = (color?: string): string => {
    const c = (color ?? '').toLowerCase();
    if (c.includes('white') || c.includes('silver') || c.includes('grey') || c.includes('gray'))
      return 'rgba(255,255,255,0.7)';
    if (c.includes('black')) return 'rgba(40,40,40,0.35)';
    if (c.includes('red') || c.includes('maroon')) return 'rgba(243,72,42,0.35)';
    if (c.includes('blue') || c.includes('navy')) return 'rgba(59,101,219,0.35)';
    if (c.includes('green')) return 'rgba(38,166,91,0.35)';
    if (c.includes('yellow') || c.includes('gold')) return 'rgba(255,196,0,0.45)';
    if (c.includes('orange')) return 'rgba(255,140,0,0.4)';
    return 'rgba(255,255,255,0.55)';
  };

  // Top-3 saved addresses to suggest for the booking flow. We rank by:
  //   1. Geographic distance from the user's current GPS fix (closest first).
  //   2. Primary address gets a small constant boost so it surfaces when the
  //      user is roughly anywhere in the same city.
  //   3. Addresses with no coordinates fall to the bottom (legacy entries).
  const PROXIMITY_RADIUS_KM = 8;
  const nearbySavedAddresses = useMemo(() => {
    const list = user?.savedAddresses ?? [];
    if (list.length === 0) return [];

    const KM_PER_DEG_LAT = 111;
    const kmPerDegLng = 111 * Math.cos((userCoords.lat * Math.PI) / 180) || 111;

    const scored = list.map((a, idx) => {
      const hasCoords = a.lat !== 0 || a.lng !== 0;
      let distanceKm = Number.POSITIVE_INFINITY;
      if (hasCoords) {
        const dLat = (a.lat - userCoords.lat) * KM_PER_DEG_LAT;
        const dLng = (a.lng - userCoords.lng) * kmPerDegLng;
        distanceKm = Math.sqrt(dLat * dLat + dLng * dLng);
      }
      // Primary boost: subtract 0.5km from its score so a primary tied with
      // another address always wins, but a far-away primary still doesn't
      // beat a much closer non-primary.
      const score = distanceKm - (a.isPrimary ? 0.5 : 0);
      return { addr: a, idx, distanceKm, score };
    });

    scored.sort((a, b) => a.score - b.score);
    return scored.slice(0, 3);
  }, [user?.savedAddresses, userCoords.lat, userCoords.lng]);

  // Whether at least one saved address is "near" the user. Used to decide
  // whether to surface the suggestion card on the Scheduled tab.
  const hasNearbySaved =
    nearbySavedAddresses.length > 0 &&
    nearbySavedAddresses[0].distanceKm <= PROXIMITY_RADIUS_KM;

  // Drivers ready to render as map markers. Each gets a stable rotation/size
  // so the icon doesn't reshuffle on every poll; the position comes straight
  // from the driver's reported lat/lng so no projection math is needed.
  const driverMarkers = useMemo(() => {
    return nearbyDrivers
      .filter(
        (d) =>
          d.location &&
          typeof d.location.lat === 'number' &&
          typeof d.location.lng === 'number',
      )
      .map((d) => {
        const h = stableHash(String(d.id));
        return {
          id: String(d.id),
          lat: d.location.lat,
          lng: d.location.lng,
          rotation: h % 360,
          size: 30 + (h % 8),
          haloColor: haloFor(d.vehicle?.color),
        };
      });
  }, [nearbyDrivers]);

  // Map viewport — centered on the rider; deltas roughly correspond to
  // ~radiusKm*2 so cabs within the search radius are usually in frame.
  const mapRegion: Region = useMemo(() => {
    const latDelta = (radiusKm * 2) / 111;
    const lngDelta =
      (radiusKm * 2) / (111 * Math.cos((userCoords.lat * Math.PI) / 180) || 111);
    return {
      latitude: userCoords.lat,
      longitude: userCoords.lng,
      latitudeDelta: latDelta,
      longitudeDelta: lngDelta,
    };
  }, [userCoords.lat, userCoords.lng]);

  // Recenter the map when the rider's GPS moves enough to matter (~50m).
  const mapRef = useRef<MapView | null>(null);
  const lastCenteredRef = useRef<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    const last = lastCenteredRef.current;
    const moved =
      !last ||
      Math.abs(last.lat - userCoords.lat) > 0.0005 ||
      Math.abs(last.lng - userCoords.lng) > 0.0005;
    if (moved && mapRef.current) {
      mapRef.current.animateToRegion(mapRegion, 600);
      lastCenteredRef.current = { lat: userCoords.lat, lng: userCoords.lng };
    }
  }, [mapRegion, userCoords.lat, userCoords.lng]);

  // Max allowable region deltas. The "delta" in MapView region is the visible
  // span in degrees; we convert MAX_HOME_RADIUS_KM*2 (the diameter we want
  // visible) into degrees of lat and lng. Used by onRegionChangeComplete to
  // snap the user back if they pinch-zoom past the cap.
  const maxLatDelta = useMemo(() => (MAX_HOME_RADIUS_KM * 2) / 111, []);
  const maxLngDelta = useMemo(
    () =>
      (MAX_HOME_RADIUS_KM * 2) /
      (111 * Math.cos((userCoords.lat * Math.PI) / 180) || 111),
    [userCoords.lat],
  );

  // Guard against re-entrant snap-backs: when we programmatically call
  // animateToRegion, onRegionChangeComplete will fire again with the clamped
  // region. Without this flag we'd recursively snap.
  const isSnappingRef = useRef(false);

  // Pickup-pin drag support. The map carries a fixed centre pin; when the
  // rider physically pans the map (onPanDrag) we flag it so the *next*
  // onRegionChangeComplete reverse-geocodes the resting centre into the
  // pickup location. Programmatic recenters (GPS move / snap-back) never set
  // this flag, so auto-recentering never clobbers a manually chosen pickup.
  const userPannedRef = useRef(false);
  const geocodeSeqRef = useRef(0);
  const [pickupGeocoding, setPickupGeocoding] = useState(false);

  const reverseGeocodePickup = async (lat: number, lng: number) => {
    const seq = ++geocodeSeqRef.current;
    setPickupGeocoding(true);
    try {
      const res = await geoService.reverse(lat, lng);
      if (seq !== geocodeSeqRef.current) return;
      dispatch(
        setPickup({
          address: res?.address || res?.displayName || 'Pinned location',
          lat,
          lng,
          ...(res?.parts?.pincode ? { pincode: res.parts.pincode } : {}),
        }),
      );
    } finally {
      if (seq === geocodeSeqRef.current) setPickupGeocoding(false);
    }
  };

  const handleRegionChangeComplete = (region: Region) => {
    if (isSnappingRef.current) {
      isSnappingRef.current = false;
      return;
    }

    // 1. Clamp the visible span — never wider than the 5 km cap.
    const clampedLatDelta = Math.min(region.latitudeDelta, maxLatDelta);
    const clampedLngDelta = Math.min(region.longitudeDelta, maxLngDelta);

    // 2. Clamp the center — the camera center must stay within
    //    MAX_HOME_RADIUS_KM of the user's GPS position. If the user pans
    //    beyond that, project the panned center back onto the boundary of
    //    the allowed circle, scaled in lat/lng-degrees space.
    const dLatDeg = region.latitude - userCoords.lat;
    const dLngDeg = region.longitude - userCoords.lng;
    const lngScale = Math.cos((userCoords.lat * Math.PI) / 180) || 1;
    // Distance from user, expressed in km using degrees-to-km conversion.
    const offsetKm = Math.sqrt(
      (dLatDeg * 111) ** 2 + (dLngDeg * 111 * lngScale) ** 2,
    );

    let clampedLat = region.latitude;
    let clampedLng = region.longitude;
    if (offsetKm > MAX_HOME_RADIUS_KM) {
      const ratio = MAX_HOME_RADIUS_KM / offsetKm;
      clampedLat = userCoords.lat + dLatDeg * ratio;
      clampedLng = userCoords.lng + dLngDeg * ratio;
    }

    const needsSnap =
      clampedLat !== region.latitude ||
      clampedLng !== region.longitude ||
      clampedLatDelta !== region.latitudeDelta ||
      clampedLngDelta !== region.longitudeDelta;

    if (needsSnap) {
      isSnappingRef.current = true;
      mapRef.current?.animateToRegion(
        {
          latitude: clampedLat,
          longitude: clampedLng,
          latitudeDelta: clampedLatDelta,
          longitudeDelta: clampedLngDelta,
        },
        300,
      );
    }

    // The rider dragged the map → adopt the (clamped) centre as the pickup
    // point. clampedLat/Lng is the final resting centre whether or not we
    // snapped, so we geocode it directly rather than waiting on the snap.
    if (userPannedRef.current) {
      userPannedRef.current = false;
      reverseGeocodePickup(clampedLat, clampedLng);
    }
  };

  const activeCount =
    activeTab === 'private'
      ? privateCount
      : activeTab === 'scheduled'
      ? scheduledCount
      : instantCount;

  const badgeText: string = (() => {
    if (activeCount === null) return 'Looking for nearby cabs…';
    if (activeTab === 'scheduled') {
      // Only show a positive count — the negative ("no drivers") message
      // was confusing for scheduled (the route list below shows real
      // availability per route, so a top-level "none nearby" was misleading).
      return activeCount > 0
        ? `${activeCount} driver${activeCount === 1 ? '' : 's'} on routes near you`
        : '';
    }
    return activeCount > 0
      ? `${activeCount} cab${activeCount === 1 ? '' : 's'} nearby`
      : 'Looking for nearby cabs…';
  })();

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* ── Teal Top Bar ── */}
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <View style={styles.topBarInner}>
          {/* Menu + Greeting */}
          <View style={styles.topLeft}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => navigation.navigate('Account')}
            >
              <MenuIcon size={46} color={Colors.white} />
            </TouchableOpacity>
            <View style={styles.greetingBlock}>
              <View style={styles.greetingRow}>
                <Text style={styles.greetingText}>{greeting}</Text>
                <View style={{ marginLeft: 6 }}>
                  <SunriseIcon size={24} />
                </View>
              </View>
              <Text style={styles.userName}>{firstName}</Text>
            </View>
          </View>
          {/* Right cluster: wallet */}
          <View style={styles.topRight}>
            {/* Wallet Badge */}
            <TouchableOpacity style={styles.walletBadge} onPress={() => navigation.navigate('WalletTopUp')} activeOpacity={0.85}>
              <Ionicons name="wallet-outline" size={16} color={Colors.primary} />
              <Text style={styles.walletText}>{walletBalance.toFixed(0)}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Shown only when location permission is missing — gives the user a
            one-tap way to allow it (or open Settings if blocked) instead of a
            silently broken map. Rendered inside the absolute top bar so it
            inherits its z-index and sits directly below the greeting row. */}
        <LocationRequiredBanner />
      </View>

      {/* ── Map / Illustration Area ──
          Scheduled has no top map (the static illustration was just
          decorative and pushed the route list too far down the screen).
          The bottom sheet renders fullscreen-tall under the top bar
          instead — search inputs + inline route picker are the actual
          content. */}
      <View
        style={[
          styles.mapContainer,
          { top: headerHeight },
          isScheduled && { display: 'none' as const },
        ]}
      >
        {!isScheduled && (
          <>
            <MapView
              ref={(r) => {
                mapRef.current = r;
              }}
              provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
              style={StyleSheet.absoluteFill}
              initialRegion={mapRegion}
              showsUserLocation
              showsMyLocationButton={false}
              showsCompass={false}
              toolbarEnabled={false}
              // Hard cap on zoom-out. Zoom level 13 ≈ ~5 km visible span on a
              // typical phone, matching MAX_HOME_RADIUS_KM. The gesture is
              // blocked mid-pinch — the user physically cannot zoom further
              // out — so there's no "rubber band" snap-back. onRegionChangeComplete
              // is kept as a belt-and-braces fallback for platforms / providers
              // that don't honour minZoomLevel.
              minZoomLevel={13}
              onPanDrag={() => {
                userPannedRef.current = true;
              }}
              onRegionChangeComplete={handleRegionChangeComplete}
            >
              {driverMarkers.map((d) => (
                <Marker
                  key={d.id}
                  coordinate={{ latitude: d.lat, longitude: d.lng }}
                  anchor={{ x: 0.5, y: 0.5 }}
                  flat
                  tracksViewChanges={false}
                >
                  <View style={styles.markerWrap}>
                    <View style={[styles.carHalo, { backgroundColor: d.haloColor }]} />
                    <CabIcon size={d.size} rotation={d.rotation} />
                  </View>
                </Marker>
              ))}
            </MapView>

            <View pointerEvents="none" style={styles.cabBadge}>
              <Ionicons name="flash" size={12} color="#FFFFFF" />
              <Text style={styles.cabBadgeText}>{badgeText}</Text>
            </View>

            {/* Fixed centre pickup pin. The rider drags the map under it; on
                settle we reverse-geocode the centre into their pickup. */}
            <View pointerEvents="none" style={styles.centerPinWrap}>
              <View style={styles.centerPinPill}>
                <Text style={styles.centerPinPillText} numberOfLines={1}>
                  {pickupGeocoding ? 'Locating…' : 'Move map to set pickup'}
                </Text>
              </View>
              <Ionicons name="location" size={38} color={Colors.primary} />
            </View>
          </>
        )}
      </View>

      {/* ── Bottom Sheet ──
          When the upper map area is hidden (Scheduled tab), pin the
          sheet to just below the top bar so the route list fills the
          screen instead of leaving a blank gap at the top. The inner
          ScrollView lets the route list grow past the viewport — without
          it, the cards were clipped at the bottom of the sheet and
          nothing scrolled (the sheet itself is position:absolute, so
          the page-level ScrollView never sees this content). */}
      <View
        style={[
          styles.bottomSheet,
          isScheduled && { top: headerHeight },
        ]}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.bottomSheetScroll,
            // Leave room for the floating "Schedule Ride" footer so the last
            // route card can scroll clear of it instead of sitting under it.
            isScheduled && { paddingBottom: insets.bottom + 96 },
          ]}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
        >
        {/* Handle */}
        <View style={styles.handle} />

        {/* Ride Type Tabs */}
        <View style={styles.tabRow}>
          {tabs.map(({ key, label, Icon }) => {
            const isActive = activeTab === key;
            const iconColor = isActive ? Colors.white : Colors.borderDark;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.tab, isActive && styles.tabActive]}
                onPress={() => setActiveTab(key)}
                activeOpacity={0.7}
              >
                <View style={{ marginRight: 5 }}>
                  <Icon size={16} color={iconColor} />
                </View>
                <Text
                  style={[styles.tabLabel, isActive && styles.tabLabelActive]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {isScheduled && (
          <View style={styles.scheduledCountChip}>
            <Ionicons name="people-outline" size={14} color={Colors.primary} />
            <Text style={styles.scheduledCountText}>{badgeText}</Text>
          </View>
        )}

        {/* Pickup Input — same tap-to-open-picker behaviour across all
            tabs (Instant / Private / Scheduled) so the user always gets
            live autocomplete instead of a bare text field on Scheduled. */}
        <View style={styles.inputWrapper}>
          <Text style={styles.inputFloatLabel}>{isScheduled ? 'From' : 'Pickup location'}</Text>
          <TouchableOpacity
            style={[styles.inputContainer, styles.inputContainerActive]}
            activeOpacity={0.8}
            onPress={() => setShowPickupPicker(true)}
          >
            <View style={styles.inputIconCircle}>
              <Image source={pickupGif} style={styles.inputIconImage} resizeMode="contain" />
            </View>
            <Text style={styles.inputValue} numberOfLines={1}>
              {reduxPickup?.address
                || (isScheduled && scheduledPickup)
                || defaultPickup.location?.address
                || 'Set your pickup location'}
            </Text>
            <TouchableOpacity style={styles.gpsButton}>
              <TargetIcon size={24} color={Colors.primary} />
            </TouchableOpacity>
          </TouchableOpacity>
        </View>

        {/* Drop-off Input.
            - Instant / Private → navigates to the full-screen SearchRide
              flow (which itself uses the same geo autocomplete).
            - Scheduled → opens the inline picker sheet in drop mode so
              the rider gets the same live search experience without
              losing the tab they're on. The picked address is stored in
              both Redux (for ScheduledRouteScreen to read) and local
              scheduledDrop state (so the label here updates). */}
        <View style={styles.inputWrapper}>
          <Text style={styles.inputFloatLabel}>{isScheduled ? 'To' : 'Where to?'}</Text>
          <TouchableOpacity
            style={styles.inputContainer}
            activeOpacity={0.8}
            onPress={() => setShowDropPicker(true)}
          >
            <View style={[styles.inputIconCircle, styles.inputIconCircleDrop]}>
              <Image source={dropGif} style={styles.inputIconImage} resizeMode="contain" />
            </View>
            {dropLabel ? (
              <Text style={styles.inputValue} numberOfLines={1}>
                {dropLabel}
              </Text>
            ) : (
              <Text style={styles.inputPlaceholder} numberOfLines={1}>
                Where is your Drop?
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Saved addresses as quick drop-offs on Instant/Private. Tapping a
            row fills the drop straight from the address book — the same job
            the old SearchRide screen did, but inline so the rider never
            leaves Home. */}
        {!isScheduled && nearbySavedAddresses.length > 0 && (
          <View style={styles.recentSection}>
            <View style={styles.recentHeader}>
              <Text style={styles.recentTitle}>Saved addresses</Text>
            </View>
            {nearbySavedAddresses.map((entry) => (
              <TouchableOpacity
                key={`drop-${entry.idx}-${entry.addr.label}`}
                style={styles.recentRow}
                activeOpacity={0.7}
                onPress={() =>
                  dispatch(
                    setDropoff({
                      address: entry.addr.address,
                      lat: entry.addr.lat,
                      lng: entry.addr.lng,
                    }),
                  )
                }
              >
                <View style={styles.recentIcon}>
                  <Ionicons
                    name={(entry.addr.icon as any) || 'location'}
                    size={20}
                    color={Colors.primary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.recentTitleText}>{entry.addr.label}</Text>
                    {entry.addr.isPrimary && (
                      <View style={styles.recentPrimaryPill}>
                        <Text style={styles.recentPrimaryPillText}>Primary</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.recentSub} numberOfLines={1}>
                    {entry.addr.address}
                  </Text>
                </View>
                <Text style={styles.recentDistance}>
                  {Number.isFinite(entry.distanceKm)
                    ? `${entry.distanceKm.toFixed(1)} km`
                    : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Saved-address suggestions on the Scheduled tab. When the user is
            near at least one saved address we surface the top-3 nearest with
            a "Near you" hint so they can one-tap pick a known pickup; otherwise
            we keep the static demo list as a placeholder. */}
        {isScheduled && nearbySavedAddresses.length > 0 && (
          <View style={styles.recentSection}>
            <View style={styles.recentHeader}>
              <Text style={styles.recentTitle}>
                {hasNearbySaved ? 'Saved addresses near you' : 'Your saved addresses'}
              </Text>
            </View>
            {nearbySavedAddresses.map((entry) => (
              <TouchableOpacity
                key={`${entry.idx}-${entry.addr.label}`}
                style={styles.recentRow}
                activeOpacity={0.7}
                onPress={() => {
                  // Just set the pickup inline — the route list below
                  // refetches automatically off this state, no need to
                  // route to a separate screen for the same job.
                  setScheduledPickup(entry.addr.address);
                }}
              >
                <View style={styles.recentIcon}>
                  <Ionicons
                    name={(entry.addr.icon as any) || 'location'}
                    size={20}
                    color={Colors.primary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.recentTitleText}>{entry.addr.label}</Text>
                    {entry.addr.isPrimary && (
                      <View style={styles.recentPrimaryPill}>
                        <Text style={styles.recentPrimaryPillText}>Primary</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.recentSub} numberOfLines={1}>
                    {entry.addr.address}
                  </Text>
                </View>
                <Text style={styles.recentDistance}>
                  {Number.isFinite(entry.distanceKm)
                    ? `${entry.distanceKm.toFixed(1)} km`
                    : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Inline scheduled-route picker. Replaces the old ScheduledRoute
            screen so the rider never leaves Home to pick a route — the
            list refetches as they edit pickup/drop above, and tapping
            "Schedule Ride" jumps straight to ScheduledBoardingDrop with
            whichever row is selected. */}
        {isScheduled && (
          <View style={styles.scheduledRoutes}>
            {scheduledRoutes === null && !scheduledRoutesError && (
              <View style={styles.scheduledRoutesEmpty}>
                <Text style={styles.scheduledRoutesEmptyText}>Loading routes…</Text>
              </View>
            )}
            {scheduledRoutesError && (
              <View style={styles.scheduledRoutesEmpty}>
                <Text style={styles.scheduledRoutesEmptyText}>{scheduledRoutesError}</Text>
              </View>
            )}
            {scheduledRoutes && scheduledRoutes.length === 0 && !scheduledRoutesError && (
              <View style={styles.scheduledRoutesEmpty}>
                <Text style={styles.scheduledRoutesEmptyText}>
                  No scheduled routes match these stops. Try changing your pickup
                  or drop location.
                </Text>
              </View>
            )}
            {scheduledRoutes?.map((r) => {
              const isActive = r.id === selectedScheduledRouteId;
              const durationLabel = r.durationMin > 0 ? `${r.durationMin}min` : '—';
              const remaining = Math.max(0, r.capacity - (r.bookedSeats ?? 0));
              const availableLabel = r.capacity
                ? `${remaining}/${r.capacity}`
                : '—';
              return (
                <TouchableOpacity
                  key={r.id}
                  activeOpacity={0.9}
                  onPress={() => setSelectedScheduledRouteId(r.id)}
                  style={[styles.routeCard, isActive && styles.routeCardActive]}
                >
                  <Text style={styles.routeName} numberOfLines={1}>
                    {r.name}
                  </Text>

                  {/* Stop list — pickup, vertical connector, dropoff.
                      Matches Figma's "City Center → Station B" treatment. */}
                  <View style={styles.routeStopRow}>
                    <View style={styles.routeStopIconWrap}>
                      <Ionicons
                        name="navigate-circle-outline"
                        size={18}
                        color={Colors.primary}
                      />
                    </View>
                    <Text style={styles.routeStopText} numberOfLines={1}>
                      {r.from}
                    </Text>
                  </View>
                  <View style={styles.routeStopConnector} />
                  <View style={styles.routeStopRow}>
                    <View style={styles.routeStopIconWrap}>
                      <Ionicons name="location-outline" size={18} color="#9CA3AF" />
                    </View>
                    <Text style={styles.routeStopText} numberOfLines={1}>
                      {r.to}
                    </Text>
                  </View>

                  {!!r.nearestPickupStopName && r.nearestPickupStopKm != null && (
                    <View style={styles.routeNearestStop}>
                      <Ionicons name="walk-outline" size={14} color={Colors.primary} />
                      <Text style={styles.routeNearestStopText}>
                        Boards at {r.nearestPickupStopName} •{' '}
                        {r.nearestPickupStopKm.toFixed(1)} km away
                      </Text>
                    </View>
                  )}

                  {/* Duration / Available / Price — matches the Figma trio.
                      Small icon+label above (30% opacity), big SemiBold
                      value below. */}
                  <View style={styles.routeMetricsRow}>
                    <View style={styles.routeMetricCell}>
                      <View style={styles.routeMetricHead}>
                        <Ionicons name="time-outline" size={12} color="#6A7282" />
                        <Text style={styles.routeMetricLabel}>Duration</Text>
                      </View>
                      <Text style={styles.routeMetricValue}>{durationLabel}</Text>
                    </View>
                    <View style={styles.routeMetricCell}>
                      <View style={styles.routeMetricHead}>
                        <Ionicons name="person-outline" size={12} color="#6A7282" />
                        <Text style={styles.routeMetricLabel}>Available</Text>
                      </View>
                      <Text style={styles.routeMetricValue}>{availableLabel}</Text>
                    </View>
                    <View style={styles.routeMetricCell}>
                      <View style={styles.routeMetricHead}>
                        <Ionicons name="card-outline" size={12} color="#6A7282" />
                        <Text style={styles.routeMetricLabel}>Price</Text>
                      </View>
                      <Text style={styles.routeMetricValue}>₹ {r.price}</Text>
                    </View>
                  </View>

                  <View style={styles.routeCardDivider} />
                  <Text style={styles.routeNextDeparture}>
                    Next Departure: {r.nextDeparture}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Book Now / Hire Now button (Instant / Private). The Scheduled
            tab's "Schedule Ride" button is rendered as a floating footer
            below — outside the ScrollView — so the route list scrolls behind
            it and the rider can tap it without scrolling past the whole list. */}
        {!isScheduled && (
          <TouchableOpacity
            style={styles.bookNowButton}
            activeOpacity={0.85}
            onPress={() => setShowRiderSheet(true)}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {isPrivate ? (
                <CarIcon size={20} color={Colors.white} />
              ) : (
                <FlashIcon size={16} color={Colors.white} />
              )}
              <Text style={styles.bookNowText}>
                {isPrivate ? 'Hire Now' : 'Book Now'}
              </Text>
            </View>
          </TouchableOpacity>
        )}
        </ScrollView>

        {/* Floating "Schedule Ride" — Scheduled tab only. Pinned to the
            bottom of the sheet so the route list scrolls behind it. Jumps
            straight to ScheduledBoardingDrop with the inline-selected route. */}
        {isScheduled && (
          <View style={[styles.scheduleFloatingFooter, { paddingBottom: insets.bottom + 12 }]}>
            <TouchableOpacity
              style={[styles.bookNowButton, !selectedScheduledRouteId && { opacity: 0.5 }]}
              activeOpacity={0.85}
              disabled={!selectedScheduledRouteId}
              onPress={() => {
                const selected =
                  scheduledRoutes?.find((r) => r.id === selectedScheduledRouteId) ?? null;
                if (!selected) return;
                navigation.navigate('ScheduledBoardingDrop', { route: selected });
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="time-outline" size={20} color={Colors.white} />
                <Text style={styles.bookNowText}>Schedule Ride</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <BookingRideForSheet
        visible={showRiderSheet}
        onClose={() => setShowRiderSheet(false)}
        onDone={(rider) => {
          setShowRiderSheet(false);
          // Effective pickup = whatever the rider set (map pin / picker)
          // falling back to the resolved default (GPS → saved).
          const pickupLoc = reduxPickup ?? defaultPickup.location;
          if (!pickupLoc) {
            // No pickup at all — let them set one before we can price a ride.
            setShowPickupPicker(true);
            return;
          }
          if (!reduxDropoff) {
            // Booking needs a destination; open the drop picker inline.
            setShowDropPicker(true);
            return;
          }
          // Make sure Redux carries the pickup (default may not have been
          // dispatched yet) so SelectRide can estimate fares straight away.
          if (!reduxPickup) dispatch(setPickup(pickupLoc));
          navigation.navigate('SelectRide', {
            pickup: pickupLoc.address,
            dropoff: reduxDropoff.address,
            // Booking-for-others: pass the rider name (undefined when it's
            // the account holder) so the ride is attributed correctly.
            bookingForName: rider.name === 'Myself' ? undefined : rider.name,
          });
        }}
      />

      <PickupPickerSheet
        visible={showPickupPicker}
        onClose={() => setShowPickupPicker(false)}
        liveCoords={live.coords ? { lat: live.coords.lat, lng: live.coords.lng } : null}
        liveAddress={live.address}
        // Scheduled tab tracks pickup in local state too so the input
        // label and the navigation params see the same value; the sheet
        // dispatches setPickup() to Redux either way for the existing
        // Instant/Private flows.
        onPicked={(loc) => {
          if (isScheduled) {
            setScheduledPickup(loc.address);
            setScheduledPickupPincode(loc.pincode);
          }
        }}
      />

      <PickupPickerSheet
        visible={showDropPicker}
        onClose={() => setShowDropPicker(false)}
        liveCoords={live.coords ? { lat: live.coords.lat, lng: live.coords.lng } : null}
        liveAddress={live.address}
        mode="drop"
        onPicked={(loc) => {
          // The sheet already dispatches setDropoff() to Redux (which drives
          // Instant/Private). Only the Scheduled tab needs the value mirrored
          // into its local state for the route lookup + input label.
          if (isScheduled) {
            setScheduledDrop(loc.address);
            setScheduledDropPincode(loc.pincode);
          }
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  /* ── Top Bar ── */
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.primary,
    zIndex: 20,
    paddingBottom: 14,
    paddingHorizontal: 16,
  },
  topBarInner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  menuButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
    backgroundColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
  },
  menuAvatar: {
    width: '100%',
    height: '100%',
    borderRadius: 23,
  },
  menuInitialsCircle: {
    width: '100%',
    height: '100%',
    borderRadius: 23,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuInitialsText: {
    fontFamily: 'Inter-Bold',
    fontSize: 16,
    letterSpacing: 0.5,
    color: Colors.primary,
  },
  greetingBlock: {
    justifyContent: 'center',
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  greetingText: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: '#FEFEFE',
  },
  greetingEmoji: {
    fontSize: 15,
  },
  userName: {
    fontFamily: 'Inter-Bold',
    fontSize: 16,
    color: '#FEFEFE',
    marginTop: 2,
  },
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  notifButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  notifBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: '#F44336',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  notifBadgeText: {
    fontFamily: 'Inter-Bold',
    fontSize: 10,
    lineHeight: 13,
    color: '#FFFFFF',
  },
  walletBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.white,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 78,
    justifyContent: 'center',
  },
  walletText: {
    fontFamily: 'Inter-Medium',
    fontSize: 16,
    color: Colors.primary,
  },

  /* ── Map ── */
  mapContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: height * 0.44,
    minHeight: height * 0.34,
    backgroundColor: Colors.mapBackground,
    overflow: 'hidden',
  },
  cabBadge: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.cabBadgeBlue,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 92,
    ...Shadow.sm,
  },
  cabBadgeText: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    lineHeight: 18,
    color: '#FFFFFF',
  },
  centerPinWrap: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    alignItems: 'center',
    // Lift the cluster so the pin's tip rests on the map centre (region
    // centre) rather than the icon's own centre.
    marginTop: -56,
  },
  centerPinPill: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 92,
    marginBottom: 2,
    ...Shadow.sm,
  },
  centerPinPillText: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    lineHeight: 16,
    color: '#FFFFFF',
  },
  markerWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 44,
  },
  carHalo: {
    position: 'absolute',
    width: 38,
    height: 38,
    borderRadius: 19,
    opacity: 0.9,
  },

  /* ── Bottom Sheet ── */
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    ...Shadow.top,
  },
  // Padding lives on the inner scroll content so the ScrollView itself
  // can fully occupy the sheet's bounds and clip scroll content cleanly
  // at the rounded corners.
  bottomSheetScroll: {
    paddingHorizontal: 20,
    paddingBottom: 28,
    flexGrow: 1,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D9D9D9',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 16,
  },

  /* ── Tabs ── */
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: Spacing.lg,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    paddingHorizontal: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderDark,
    backgroundColor: Colors.white,
  },
  tabActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  tabLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 13.5,
    lineHeight: 18,
    color: Colors.borderDark,
  },
  tabLabelActive: {
    color: Colors.white,
  },

  /* ── Location Inputs ── */
  inputWrapper: {
    marginBottom: 14,
    position: 'relative',
    paddingTop: 8,
  },
  inputFloatLabel: {
    position: 'absolute',
    top: 0,
    left: 20,
    zIndex: 2,
    backgroundColor: Colors.white,
    paddingHorizontal: 8,
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    lineHeight: 16,
    color: Colors.textSecondary,
    letterSpacing: -0.35,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    height: 60,
    gap: 10,
    ...Shadow.sm,
  },
  inputIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  inputIconImage: {
    width: 40,
    height: 40,
  },
  inputContainerActive: {
    borderColor: Colors.primary,
  },
  inputIconCircleDrop: {
    backgroundColor: 'transparent',
  },
  pickupDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },
  dropoffDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.dropoffRed,
  },
  inputValue: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    lineHeight: 20,
    color: Colors.textSecondary,
    opacity: 0.5,
    flex: 1,
    letterSpacing: -0.35,
  },
  inputPlaceholder: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    lineHeight: 20,
    color: Colors.textSecondary,
    flex: 1,
    letterSpacing: -0.35,
  },
  inputTextField: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: Colors.textPrimary,
    padding: 0,
    letterSpacing: -0.35,
  },
  gpsButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* ── Recent Places (Scheduled) ── */
  recentSection: {
    marginTop: 4,
    marginBottom: 4,
  },
  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  recentTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 15,
    color: Colors.textPrimary,
  },
  recentClear: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: Colors.textSecondary,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 12,
  },
  recentIcon: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentTextBlock: {
    flex: 1,
  },
  recentRowTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: Colors.textPrimary,
  },
  recentRowAddr: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  recentDistance: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: Colors.textSecondary,
  },
  recentTitleText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: Colors.textPrimary,
  },
  recentSub: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  recentPrimaryPill: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
  },
  recentPrimaryPillText: {
    fontFamily: 'Inter-Medium',
    fontSize: 9,
    color: '#fff',
  },

  /* ── Scheduled Count Chip ── */
  scheduledCountChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,150,136,0.08)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 12,
  },
  scheduledCountText: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    color: Colors.primary,
  },

  /* ── Inline scheduled-routes list ── */
  scheduledRoutes: {
    marginTop: 8,
    marginBottom: 8,
  },
  scheduledRoutesEmpty: {
    paddingVertical: 24,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  scheduledRoutesEmptyText: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  // Route card — Figma node 67:5970. 24px radius, transparent border
  // by default (becomes teal at 2px when selected), generous outer
  // shadow.
  routeCard: {
    backgroundColor: Colors.white,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: 'transparent',
    paddingVertical: 22,
    paddingHorizontal: 23,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  routeCardActive: {
    borderColor: Colors.primary,
  },
  routeName: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 24,
    lineHeight: 30,
    color: Colors.textPrimary,
    opacity: 0.85,
    marginBottom: 18,
  },
  routeStopRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  routeStopIconWrap: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeStopText: {
    fontFamily: 'Inter-Light',
    fontSize: 14,
    lineHeight: 20,
    color: Colors.textPrimary,
    opacity: 0.85,
    flex: 1,
  },
  routeStopConnector: {
    width: 1.5,
    height: 18,
    backgroundColor: '#D1D5DB',
    marginLeft: 8.25, // (18 / 2) - 0.75, centred under the icon
    marginVertical: 4,
  },

  routeMetricsRow: {
    flexDirection: 'row',
    marginTop: 20,
  },
  routeMetricCell: { flex: 1 },
  routeMetricHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    opacity: 0.3,
    marginBottom: 4,
  },
  routeMetricLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    lineHeight: 16,
    color: '#000000',
  },
  routeMetricValue: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    lineHeight: 22,
    color: Colors.textPrimary,
    opacity: 0.85,
  },
  routeCardDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginTop: 16,
    marginBottom: 12,
  },
  routeNextDeparture: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 15,
    lineHeight: 22,
    color: Colors.textPrimary,
    opacity: 0.85,
  },
  routeNearestStop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(0, 151, 179, 0.08)',
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  routeNearestStopText: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    color: Colors.primary,
  },

  /* ── Book Now ── */
  bookNowButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 8,
    height: 60,
    marginTop: Spacing.lg,
  },
  // Floating footer that holds the Scheduled tab's "Schedule Ride" button.
  // Absolutely pinned to the bottom of the sheet so the route list scrolls
  // behind it. The button keeps its own marginTop, hence the small paddingTop.
  scheduleFloatingFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 4,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    ...Shadow.top,
  },
  bookNowText: {
    fontFamily: 'Inter-Medium',
    fontSize: 16,
    lineHeight: 23,
    color: Colors.white,
  },
});
