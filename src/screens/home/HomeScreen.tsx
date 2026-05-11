import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  Image,
  TextInput,
  Platform,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import Ionicons from 'react-native-vector-icons/Ionicons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLiveLocation } from '@/hooks/useLiveLocation';
import { useDefaultPickup } from '@/hooks/useDefaultPickup';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '@/theme';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { setWalletBalance } from '@/store/slices/appSlice';
import { setRideType } from '@/store/slices/rideSlice';
import { paymentService } from '@/services/paymentService';
import { driverService, NearbyDriver } from '@/services/driverService';
import { rideService } from '@/services/rideService';
import {
  SunriseIcon,
  TargetIcon,
  FlashIcon,
  CarIcon,
  CalendarClockIcon,
  CabIcon,
} from '@/components/icons/HomeIcons';
import { BookingRideForSheet } from './BookingRideForSheet';
import { ScheduledIllustration } from './ScheduledIllustration';

const pickupGif = require('../../../assets/home-screen/gifs/charging-station.gif');
const dropGif = require('../../../assets/home-screen/gifs/location.gif');

const { height } = Dimensions.get('window');

type RideTab = 'instant' | 'private' | 'scheduled';

interface RecentPlace {
  id: string;
  title: string;
  address: string;
  distanceKm: number;
}

const RECENT_PLACES: RecentPlace[] = [
  { id: '1', title: 'Office', address: '2972 Westheimer Rd. Santa Ana, Illinois 85486', distanceKm: 2.7 },
  { id: '2', title: 'Coffee shop', address: '1901 Thornridge Cir. Shiloh, Hawaii 81063', distanceKm: 1.1 },
  { id: '3', title: 'Shopping center', address: '4140 Parker Rd. Allentown, New Mexico 31134', distanceKm: 4.9 },
];

interface HomeScreenProps {
  navigation: any;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<RideTab>('instant');
  const [showRiderSheet, setShowRiderSheet] = useState(false);
  const [scheduledPickup, setScheduledPickup] = useState('');
  const [scheduledDrop, setScheduledDrop] = useState('');
  const { user } = useAppSelector((state) => state.auth);
  const reduxPickup = useAppSelector((state) => state.ride.pickup);
  const defaultPickup = useDefaultPickup();
  const walletBalance = useAppSelector((state) => state.app.walletBalance);
  const dispatch = useAppDispatch();

  useEffect(() => {
    paymentService.getWallet().then((res) => {
      if (res.success) dispatch(setWalletBalance(res.data.wallet?.balance || 0));
    }).catch(() => {});
  }, [dispatch]);

  useEffect(() => {
    dispatch(setRideType(activeTab));
  }, [activeTab, dispatch]);

  // Default the Scheduled-tab pickup field to the resolved default location
  // (live GPS → primary saved → first saved) — only while the field is empty
  // so we never clobber what the user typed.
  useEffect(() => {
    if (scheduledPickup) return;
    const addr = defaultPickup.location?.address;
    if (addr) setScheduledPickup(addr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultPickup.location?.address]);

  // ── Live nearby drivers for the map ─────────────────────────────
  // Center coords for the static-map projection. Falls back to a Dehradun-ish
  // default until the device returns a fix so the map never appears empty.
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number }>({
    lat: 30.3165,
    lng: 78.0322,
  });
  const [nearbyDrivers, setNearbyDrivers] = useState<NearbyDriver[]>([]);
  const [instantCount, setInstantCount] = useState<number | null>(null);
  const [privateCount, setPrivateCount] = useState<number | null>(null);
  const [scheduledCount, setScheduledCount] = useState<number | null>(null);
  // Wider radius while the driver pool is small / spread across cities so a
  // rider isn't shown an empty map. Tighten to 5 once driver density is up.
  const radiusKm = 50;
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Real-time device location. The hook keeps a watchPosition subscription
  // alive, so userCoords updates as the rider moves and the nearby-driver
  // poll re-runs against the fresh point.
  const live = useLiveLocation({ watch: true, reverseGeocode: false });
  useEffect(() => {
    if (!live.coords) return;
    setUserCoords({ lat: live.coords.lat, lng: live.coords.lng });
  }, [live.coords?.lat, live.coords?.lng]);

  // Poll nearby drivers every 15s so the map stays alive.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const fetchDrivers = async () => {
      if (activeTab === 'scheduled') {
        setNearbyDrivers([]);
        return;
      }
      try {
        const drivers = await driverService.getNearby(userCoords.lat, userCoords.lng, radiusKm);
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
  }, [userCoords.lat, userCoords.lng, activeTab]);

  // Tab-aware driver counts. Single source of truth for the Home badge:
  //   - instant/private: /vehicle-types/nearby (7 km, tier-filtered)
  //   - scheduled: distinct approved drivers across active routes
  // Polled on coord change so the number updates as the rider moves.
  useEffect(() => {
    let cancelled = false;
    const fetchCounts = async () => {
      try {
        const [tiers, scheduled] = await Promise.all([
          rideService.getNearbyVehicleTypes(userCoords.lat, userCoords.lng),
          driverService.getScheduledNearbyCount(userCoords.lat, userCoords.lng),
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
  }, [userCoords.lat, userCoords.lng]);

  const isPrivate = activeTab === 'private';
  const isScheduled = activeTab === 'scheduled';

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

  const activeCount =
    activeTab === 'private'
      ? privateCount
      : activeTab === 'scheduled'
      ? scheduledCount
      : instantCount;

  const badgeText: string = (() => {
    if (activeCount === null) return 'Looking for nearby cabs…';
    if (activeTab === 'scheduled') {
      return activeCount > 0
        ? `${activeCount} driver${activeCount === 1 ? '' : 's'} on routes near you`
        : 'No scheduled drivers near you';
    }
    return activeCount > 0
      ? `${activeCount} cab${activeCount === 1 ? '' : 's'} nearby`
      : 'Looking for nearby cabs…';
  })();

  return (
    <View style={styles.container}>
      <StatusBar hidden />

      {/* ── Teal Top Bar ── */}
      <View style={[styles.topBar, { paddingTop: Spacing.md }]}>
        <View style={styles.topBarInner}>
          {/* Menu + Greeting */}
          <View style={styles.topLeft}>
            <TouchableOpacity style={styles.menuButton} activeOpacity={0.8}>
              {user?.avatar ? (
                <Image
                  source={{ uri: user.avatar }}
                  style={styles.menuAvatar}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.menuInitialsCircle}>
                  <Text style={styles.menuInitialsText}>{initials}</Text>
                </View>
              )}
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
          {/* Wallet Badge */}
          <TouchableOpacity style={styles.walletBadge} onPress={() => navigation.navigate('WalletTopUp')} activeOpacity={0.85}>
            <Ionicons name="wallet-outline" size={16} color={Colors.primary} />
            <Text style={styles.walletText}>{walletBalance.toFixed(0)}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Map / Illustration Area ── */}
      <View style={[styles.mapContainer, { top: 90 }]}>
        {isScheduled ? (
          <ScheduledIllustration />
        ) : (
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
          </>
        )}
      </View>

      {/* ── Bottom Sheet ── */}
      <View style={styles.bottomSheet}>
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
                <View style={{ marginRight: 6 }}>
                  <Icon size={16} color={iconColor} />
                </View>
                <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
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

        {/* Pickup Input */}
        <View style={styles.inputWrapper}>
          <Text style={styles.inputFloatLabel}>Pickup location</Text>
          {isScheduled ? (
            <View style={[styles.inputContainer, styles.inputContainerActive]}>
              <View style={styles.inputIconCircle}>
                <Image source={pickupGif} style={styles.inputIconImage} resizeMode="contain" />
              </View>
              <TextInput
                style={styles.inputTextField}
                value={scheduledPickup}
                onChangeText={setScheduledPickup}
                placeholder="Enter pickup location"
                placeholderTextColor={Colors.textMuted}
              />
              <TouchableOpacity style={styles.gpsButton}>
                <TargetIcon size={24} color={Colors.primary} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.inputContainer, styles.inputContainerActive]}
              activeOpacity={0.8}
              onPress={() => {
                const initial = reduxPickup ?? defaultPickup.location ?? undefined;
                navigation.navigate('SelectLocation', {
                  type: 'pickup',
                  initialPickup: initial,
                });
              }}
            >
              <View style={styles.inputIconCircle}>
                <Image source={pickupGif} style={styles.inputIconImage} resizeMode="contain" />
              </View>
              <Text style={styles.inputValue} numberOfLines={1}>
                {reduxPickup?.address
                  || defaultPickup.location?.address
                  || 'Set your pickup location'}
              </Text>
              <TouchableOpacity style={styles.gpsButton}>
                <TargetIcon size={24} color={Colors.primary} />
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        </View>

        {/* Drop-off Input */}
        <View style={styles.inputWrapper}>
          <Text style={styles.inputFloatLabel}>Where to?</Text>
          {isScheduled ? (
            <View style={styles.inputContainer}>
              <View style={[styles.inputIconCircle, styles.inputIconCircleDrop]}>
                <Image source={dropGif} style={styles.inputIconImage} resizeMode="contain" />
              </View>
              <TextInput
                style={styles.inputTextField}
                value={scheduledDrop}
                onChangeText={setScheduledDrop}
                placeholder="Where is your Drop?"
                placeholderTextColor={Colors.textMuted}
              />
            </View>
          ) : (
            <TouchableOpacity
              style={styles.inputContainer}
              activeOpacity={0.8}
              onPress={() => navigation.navigate('SearchRide')}
            >
              <View style={[styles.inputIconCircle, styles.inputIconCircleDrop]}>
                <Image source={dropGif} style={styles.inputIconImage} resizeMode="contain" />
              </View>
              <Text style={styles.inputPlaceholder} numberOfLines={1}>
                Where is your Drop?
              </Text>
            </TouchableOpacity>
          )}
        </View>

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
                  setScheduledPickup(entry.addr.address);
                  navigation.navigate('ScheduledRoute', {
                    pickup: entry.addr.address,
                    drop: scheduledDrop,
                  });
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

        {/* Recent Places fallback — only shown when the user has no saved addresses */}
        {isScheduled && nearbySavedAddresses.length === 0 && (
          <View style={styles.recentSection}>
            <View style={styles.recentHeader}>
              <Text style={styles.recentTitle}>Recent places</Text>
              <TouchableOpacity activeOpacity={0.7}>
                <Text style={styles.recentClear}>Clear All</Text>
              </TouchableOpacity>
            </View>
            {RECENT_PLACES.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={styles.recentRow}
                activeOpacity={0.7}
                onPress={() => {
                  setScheduledDrop(p.title);
                  navigation.navigate('ScheduledRoute', {
                    pickup: scheduledPickup,
                    drop: p.title,
                  });
                }}
              >
                <View style={styles.recentIcon}>
                  <Ionicons name="time-outline" size={20} color={Colors.textMuted} />
                </View>
                <View style={styles.recentTextBlock}>
                  <Text style={styles.recentRowTitle}>{p.title}</Text>
                  <Text style={styles.recentRowAddr} numberOfLines={1}>{p.address}</Text>
                </View>
                <Text style={styles.recentDistance}>{p.distanceKm}km</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Book Now / Hire Now / Schedule Ride Button */}
        <TouchableOpacity
          style={styles.bookNowButton}
          activeOpacity={0.85}
          onPress={() => {
            if (isScheduled) {
              navigation.navigate('ScheduledRoute', {
                pickup: scheduledPickup,
                drop: scheduledDrop,
              });
            } else {
              setShowRiderSheet(true);
            }
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {isScheduled ? (
              <Ionicons name="time-outline" size={20} color={Colors.white} />
            ) : isPrivate ? (
              <CarIcon size={20} color={Colors.white} />
            ) : (
              <FlashIcon size={16} color={Colors.white} />
            )}
            <Text style={styles.bookNowText}>
              {isScheduled ? 'Schedule Ride' : isPrivate ? 'Hire Now' : 'Book Now'}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      <BookingRideForSheet
        visible={showRiderSheet}
        onClose={() => setShowRiderSheet(false)}
        onDone={() => {
          setShowRiderSheet(false);
          navigation.navigate('SearchRide');
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
    paddingHorizontal: 20,
    paddingBottom: 20,
    ...Shadow.top,
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
    gap: 10,
    marginBottom: Spacing.lg,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
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
    fontFamily: 'Inter-Regular',
    fontSize: 16,
    lineHeight: 23,
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

  /* ── Book Now ── */
  bookNowButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 8,
    height: 60,
    marginTop: Spacing.lg,
  },
  bookNowText: {
    fontFamily: 'Inter-Medium',
    fontSize: 16,
    lineHeight: 23,
    color: Colors.white,
  },
});
