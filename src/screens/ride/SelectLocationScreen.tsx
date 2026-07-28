import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  FlatList,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import MapView, {
  Marker,
  PROVIDER_GOOGLE,
  Region,
} from 'react-native-maps';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Typography, BorderRadius, Shadow } from '@/theme';
import { fs, s, vs } from '@/theme/responsive';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { geoService } from '@/services/geoService';
import { setPickup, setDropoff } from '@/store/slices/rideSlice';
import { useLiveLocation } from '@/hooks/useLiveLocation';
import { driverService, NearbyDriver } from '@/services/driverService';
import { rideService } from '@/services/rideService';
import { CabIcon } from '@/components/icons/HomeIcons';
import { DEFAULT_COORDS } from '@/utils/location';

const { width, height } = Dimensions.get('window');

interface SelectLocationScreenProps {
  navigation: any;
  route: {
    params?: {
      pickup?: string;
      dropoff?: string;
      dropoffAddress?: string;
      pickFromMap?: boolean;
      type?: string;
      /**
       * Pre-filled pickup passed from HomeScreen. When present we seed both
       * the visible pickup text AND the underlying coordinate state from
       * this object, so the user sees the same address they saw on Home and
       * confirms with real coords behind it. The legacy string `pickup`
       * param remains for backward compatibility.
       */
      initialPickup?: { address: string; lat: number; lng: number };
    };
  };
}

type RideTab = 'instant' | 'private' | 'scheduled';

interface RecentPlace {
  id: string;
  name: string;
  address: string;
  /** 'saved' = address book (Home/Work/etc), 'recent' = past ride drop-off. */
  source: 'saved' | 'recent';
  /** Optional Ionicons name to render in the row. */
  icon?: string;
  /** Distance from the rider's current GPS, in km. Computed at render time. */
  distanceKm?: number;
  lat: number;
  lng: number;
}

const haversineKm = (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number => {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
};

// Last-resort coordinates if GPS is denied or unavailable.
const FALLBACK_PICKUP = {
  address: 'Detecting your location…',
  lat: DEFAULT_COORDS.lat,
  lng: DEFAULT_COORDS.lng,
};

export const SelectLocationScreen: React.FC<SelectLocationScreenProps> = ({
  navigation,
  route,
}) => {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((s) => s.auth);
  const walletBalance = useAppSelector((s) => s.app.walletBalance);

  const live = useLiveLocation({ watch: true, reverseGeocode: true });

  const initialDropoff = route.params?.dropoff || '';

  const [activeTab, setActiveTab] = useState<RideTab>('instant');
  const seededInitial = route.params?.initialPickup;
  const [pickupText, setPickupText] = useState(
    seededInitial?.address || route.params?.pickup || FALLBACK_PICKUP.address,
  );
  // Two separate concerns that used to share one flag:
  //  - pickupProtected: "do not let live-GPS auto-fill overwrite the
  //    current text". True whenever a caller seeded a value OR the user
  //    has typed something.
  //  - pickupEditedByUser: "the user typed into the pickup field". Only
  //    used to decide whether handleSelectPlace falls back from the
  //    seeded coords to the live-GPS fix.
  const [pickupProtected, setPickupProtected] = useState(
    !!seededInitial || !!route.params?.pickup,
  );
  const [pickupEditedByUser, setPickupEditedByUser] = useState(false);
  // Cache the seeded coords so handleSelectPlace can use real lat/lng
  // instead of falling back to the live fix.
  const [seededCoords] = useState<{ lat: number; lng: number } | null>(
    seededInitial
      ? { lat: seededInitial.lat, lng: seededInitial.lng }
      : null,
  );
  const [dropoffText, setDropoffText] = useState(initialDropoff);
  const [pickupFocused, setPickupFocused] = useState(false);
  const [dropoffFocused, setDropoffFocused] = useState(false);

  const dropoffInputRef = useRef<TextInput | null>(null);
  // Set when we programmatically focus the dropoff input on mount (because
  // pickup was pre-filled from HomeScreen). Consumed by the dropoff onFocus
  // handler to skip the auto-navigate to SearchRide exactly once, so the
  // user can interact with this screen rather than being yanked forward.
  const suppressNextDropoffAutoNav = useRef(false);

  // Auto-fill pickup with the live reverse-geocoded address until the user
  // edits the field manually.
  useEffect(() => {
    if (!pickupProtected && live.address) {
      setPickupText(live.address);
    }
  }, [live.address, pickupProtected]);

  // When HomeScreen pre-filled the pickup, the user usually wants to type the
  // destination next. Focus the dropoff field on mount so the keyboard opens
  // ready for that — but only if the dropoff is currently empty so we don't
  // hijack focus when the user came back to edit something.
  useEffect(() => {
    if (!seededInitial) return;
    if (dropoffText) return;
    // Slight delay so the screen transition completes before focusing —
    // RN can drop focus calls fired during the navigation animation.
    const t = setTimeout(() => {
      suppressNextDropoffAutoNav.current = true;
      dropoffInputRef.current?.focus();
    }, 250);
    return () => clearTimeout(t);
    // We deliberately depend only on seededInitial; if the user clears the
    // dropoff later we don't want to re-focus mid-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentLat = live.coords?.lat ?? FALLBACK_PICKUP.lat;
  const currentLng = live.coords?.lng ?? FALLBACK_PICKUP.lng;

  // Real map viewport — locked to ~5 km diameter around the rider, same
  // scale the Home screen uses so the cab markers feel continuous between
  // the two screens.
  const RADIUS_KM = 5;
  const mapRegion: Region = useMemo(() => {
    const latDelta = (RADIUS_KM * 2) / 111;
    const lngDelta =
      (RADIUS_KM * 2) /
      (111 * Math.cos((currentLat * Math.PI) / 180) || 111);
    return {
      latitude: currentLat,
      longitude: currentLng,
      latitudeDelta: latDelta,
      longitudeDelta: lngDelta,
    };
  }, [currentLat, currentLng]);

  // ── Pick-on-map mode (honors route.params.pickFromMap) ──
  // When on, the map becomes pannable, a fixed center pin appears, and a
  // confirm button reverse-geocodes the map centre into the drop-off.
  const [mapPickMode, setMapPickMode] = useState(!!route.params?.pickFromMap);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({
    lat: currentLat,
    lng: currentLng,
  });
  const [confirmingPin, setConfirmingPin] = useState(false);

  const handleConfirmMapPin = async () => {
    setConfirmingPin(true);
    try {
      const res = await geoService.reverse(mapCenter.lat, mapCenter.lng);
      const address =
        res?.address ||
        res?.displayName ||
        `Pinned location (${mapCenter.lat.toFixed(5)}, ${mapCenter.lng.toFixed(5)})`;
      const name = address.split(',')[0] || 'Selected location';
      const pickupLat = !pickupEditedByUser && seededCoords ? seededCoords.lat : currentLat;
      const pickupLng = !pickupEditedByUser && seededCoords ? seededCoords.lng : currentLng;
      dispatch(setPickup({ address: pickupText, lat: pickupLat, lng: pickupLng }));
      dispatch(setDropoff({ address, lat: mapCenter.lat, lng: mapCenter.lng }));
      navigation.navigate('SelectRide', { pickup: pickupText, dropoff: name, dropoffAddress: address });
    } catch {
      /* leave the user on the map to retry */
    } finally {
      setConfirmingPin(false);
    }
  };

  // Live nearby drivers — same poll the Home and SelectRide screens use so
  // the cabs shown here move with the dispatcher's live index.
  const [nearbyDrivers, setNearbyDrivers] = useState<NearbyDriver[]>([]);
  useEffect(() => {
    let cancelled = false;
    const fetchDrivers = async () => {
      try {
        const list = await driverService.getNearby(currentLat, currentLng, 8);
        if (!cancelled) setNearbyDrivers(list);
      } catch {
        /* keep last list */
      }
    };
    fetchDrivers();
    const t = setInterval(fetchDrivers, 15000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [currentLat, currentLng]);

  // Recent places = (1) the user's saved addresses (Home/Work/etc) + (2) the
  // last few unique drop-offs from their ride history. The hardcoded Delhi
  // demo list is gone; if the user has neither, we show an empty-state
  // hint instead of fake content.
  const savedAddressPlaces: RecentPlace[] = useMemo(() => {
    const list = user?.savedAddresses ?? [];
    return list
      .filter(a => a.address && (a.lat !== 0 || a.lng !== 0))
      .map((a, idx) => {
        const dKm = haversineKm(
          { lat: currentLat, lng: currentLng },
          { lat: a.lat, lng: a.lng },
        );
        return {
          id: `saved-${idx}-${(a.label || 'addr').toLowerCase()}`,
          name: a.label || a.address,
          address: a.address,
          source: 'saved' as const,
          icon: (a.icon as string) || 'location',
          distanceKm: dKm,
          lat: a.lat,
          lng: a.lng,
        };
      });
  }, [user?.savedAddresses, currentLat, currentLng]);

  const [recentRideDropoffs, setRecentRideDropoffs] = useState<RecentPlace[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await rideService.getRides(1, 20);
        const rides: Array<{ dropoff?: { address: string; lat: number; lng: number } }> =
          (data as any)?.rides || (data as any)?.items || [];
        const seen = new Set<string>();
        const list: RecentPlace[] = [];
        for (const r of rides) {
          const d = r?.dropoff;
          if (!d?.address) continue;
          const key = d.address.trim().toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          list.push({
            id: `recent-${list.length}-${key.slice(0, 12)}`,
            name: d.address.split(',')[0] || d.address,
            address: d.address,
            source: 'recent',
            icon: 'time-outline',
            distanceKm: haversineKm(
              { lat: currentLat, lng: currentLng },
              { lat: d.lat, lng: d.lng },
            ),
            lat: d.lat,
            lng: d.lng,
          });
          if (list.length >= 5) break;
        }
        if (!cancelled) setRecentRideDropoffs(list);
      } catch {
        if (!cancelled) setRecentRideDropoffs([]);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Re-compute distance when GPS lands. Address list itself doesn't change.
  }, [currentLat, currentLng]);

  const recentPlaces: RecentPlace[] = useMemo(
    () => [...savedAddressPlaces, ...recentRideDropoffs],
    [savedAddressPlaces, recentRideDropoffs],
  );

  const firstName = user?.firstName || 'User';

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  const tabs: { key: RideTab; label: string; icon: string; iconOutline: string }[] = [
    { key: 'instant', label: 'Instant', icon: 'flash', iconOutline: 'flash-outline' },
    { key: 'private', label: 'Private', icon: 'car', iconOutline: 'car-outline' },
    { key: 'scheduled', label: 'Scheduled', icon: 'calendar', iconOutline: 'calendar-outline' },
  ];

  const handleSelectPlace = (place: RecentPlace) => {
    setDropoffText(place.name);
    // Prefer seeded coords from HomeScreen until the user types over the
    // pickup field. Manual edits should switch us to the live fix.
    const pickupLat = !pickupEditedByUser && seededCoords ? seededCoords.lat : currentLat;
    const pickupLng = !pickupEditedByUser && seededCoords ? seededCoords.lng : currentLng;
    dispatch(setPickup({ address: pickupText, lat: pickupLat, lng: pickupLng }));
    dispatch(setDropoff({ address: place.address, lat: place.lat, lng: place.lng }));
    navigation.navigate('SelectRide', {
      pickup: pickupText,
      dropoff: place.name,
      dropoffAddress: place.address,
    });
  };

  const handleBookNow = () => {
    if (dropoffText.trim()) {
      // If a destination is already entered, go to ride selection
      const matchedPlace = recentPlaces.find((p) => p.name === dropoffText);
      if (matchedPlace) {
        handleSelectPlace(matchedPlace);
      } else {
        navigation.navigate('SearchRide');
      }
    } else {
      navigation.navigate('SearchRide');
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* ── Teal Top Bar ── */}
      <View style={[styles.topBar, { paddingTop: insets.top + Spacing.sm }]}>
        <View style={styles.topBarInner}>
          <View style={styles.topLeft}>
            <TouchableOpacity style={styles.menuButton} onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={24} color={Colors.white} />
            </TouchableOpacity>
            <View style={styles.greetingBlock}>
              <Text style={styles.greetingText}>{greeting} {'👋'}</Text>
              <Text style={styles.userName}>{firstName}</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.walletBadge} onPress={() => navigation.navigate('Payment')}>
            <Ionicons name="wallet-outline" size={16} color={Colors.primary} />
            <Text style={styles.walletAmount}>{'\u20B9'} {walletBalance.toFixed(0)}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Real Google Map — same scale/markers as the Home screen ── */}
      <View style={[styles.mapContainer, { top: insets.top + 90 }]}>
        <MapView
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          style={StyleSheet.absoluteFill}
          initialRegion={mapRegion}
          // In pick mode the map is free-pannable (no controlled region) so the
          // rider can drag the centre pin to their drop-off.
          region={mapPickMode ? undefined : mapRegion}
          onRegionChangeComplete={
            mapPickMode
              ? (r) => setMapCenter({ lat: r.latitude, lng: r.longitude })
              : undefined
          }
          showsUserLocation
          showsMyLocationButton={false}
          showsCompass={false}
          toolbarEnabled={false}
        >
          {nearbyDrivers
            .filter(
              d =>
                d.location &&
                typeof d.location.lat === 'number' &&
                typeof d.location.lng === 'number',
            )
            .map(d => (
              <Marker
                key={d.id}
                coordinate={{ latitude: d.location.lat, longitude: d.location.lng }}
                anchor={{ x: 0.5, y: 0.5 }}
                flat
                tracksViewChanges={false}
              >
                <CabIcon size={28} rotation={0} />
              </Marker>
            ))}
        </MapView>

        {!mapPickMode && (
          <View pointerEvents="none" style={styles.cabBadge}>
            <Ionicons name="flash" size={12} color="#F7F7F7" />
            <Text style={styles.cabBadgeText}>
              {nearbyDrivers.length > 0
                ? `${nearbyDrivers.length} cab${nearbyDrivers.length === 1 ? '' : 's'} nearby`
                : 'Looking for nearby cabs…'}
            </Text>
          </View>
        )}

        {/* Pick-on-map: fixed centre pin + confirm bar */}
        {mapPickMode && (
          <>
            <View pointerEvents="none" style={styles.centerPin}>
              <Ionicons name="location" size={40} color={Colors.dropoffRed} />
            </View>
            <View pointerEvents="none" style={styles.mapHint}>
              <Text style={styles.mapHintText}>Move the map to set your drop-off</Text>
            </View>
            <TouchableOpacity
              style={styles.mapConfirmBtn}
              onPress={handleConfirmMapPin}
              disabled={confirmingPin}
              activeOpacity={0.85}
            >
              {confirmingPin ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.mapConfirmText}>Confirm drop-off here</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* ── Bottom Sheet ── */}
      <View
        style={[
          styles.bottomSheet,
          { paddingBottom: insets.bottom + vs(Spacing.lg) },
        ]}
      >
        <View style={styles.handle} />

        {/* Ride Type Tabs */}
        <View style={styles.tabRow}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tab, isActive && styles.tabActive]}
                onPress={() => setActiveTab(tab.key)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={(isActive ? tab.icon : tab.iconOutline) as any}
                  size={16}
                  color={isActive ? Colors.white : Colors.textSecondary}
                  style={{ marginRight: 6 }}
                />
                <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Pickup Input */}
        <View style={styles.inputWrapper}>
          <Text style={styles.inputFloatLabel}>Pickup location</Text>
          <View style={[styles.inputContainer, styles.inputContainerActive]}>
            <View style={styles.inputIconCircle}>
              <Ionicons name="location" size={18} color={Colors.primary} />
            </View>
            <TextInput
              style={styles.inputText}
              value={pickupText}
              onChangeText={(t) => {
                setPickupText(t);
                setPickupProtected(true);
                setPickupEditedByUser(true);
              }}
              placeholder="Your current location"
              placeholderTextColor={Colors.textMuted}
              onFocus={() => setPickupFocused(true)}
              onBlur={() => setPickupFocused(false)}
              selectionColor={Colors.primary}
            />
            <TouchableOpacity
              style={styles.gpsButton}
              onPress={() => {
                setPickupProtected(false);
                setPickupEditedByUser(false);
                live.refresh();
              }}
              disabled={live.loading}
            >
              {live.loading ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <Ionicons name="locate" size={20} color={Colors.primary} />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Drop-off Input */}
        <View style={styles.inputWrapper}>
          <Text style={styles.inputFloatLabel}>Where to?</Text>
          <View style={[styles.inputContainer, dropoffFocused && styles.inputContainerActive]}>
            <View style={[styles.inputIconCircle, styles.inputIconCircleDrop]}>
              <Ionicons name="location" size={18} color={Colors.dropoffRed} />
            </View>
            <TextInput
              ref={dropoffInputRef}
              style={styles.inputText}
              value={dropoffText}
              onChangeText={setDropoffText}
              placeholder="Where is your Drop?"
              placeholderTextColor={Colors.textMuted}
              onFocus={() => {
                setDropoffFocused(true);
                if (suppressNextDropoffAutoNav.current) {
                  suppressNextDropoffAutoNav.current = false;
                  return;
                }
                navigation.navigate('SearchRide');
              }}
              selectionColor={Colors.primary}
            />
            <TouchableOpacity
              style={styles.gpsButton}
              onPress={() => setMapPickMode((m) => !m)}
              accessibilityLabel="Pick drop-off on map"
            >
              <Ionicons
                name={mapPickMode ? 'close' : 'map'}
                size={20}
                color={Colors.primary}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Saved + recent places. We deliberately don't expose a Clear-All
            here: saved addresses live on the user profile and recent ride
            drop-offs come from server-side history — neither is local
            state we own to wipe. */}
        <View style={styles.recentHeader}>
          <Text style={styles.recentTitle}>
            {recentPlaces.length > 0 ? 'Recent places' : 'Saved & recent places'}
          </Text>
        </View>

        <FlatList
          data={recentPlaces}
          keyExtractor={item => item.id}
          renderItem={({ item, index }) => {
            // Tiny section headers so saved addresses don't blur into
            // ride-history drop-offs visually.
            const prev = recentPlaces[index - 1];
            const showSavedHeader =
              item.source === 'saved' && prev?.source !== 'saved';
            const showRecentHeader =
              item.source === 'recent' && prev?.source !== 'recent';
            return (
              <View>
                {showSavedHeader && (
                  <Text style={styles.sectionHeader}>Saved addresses</Text>
                )}
                {showRecentHeader && (
                  <Text style={styles.sectionHeader}>Recent drop-offs</Text>
                )}
                <TouchableOpacity
                  style={styles.placeRow}
                  onPress={() => handleSelectPlace(item)}
                  activeOpacity={0.7}
                >
                  <View style={styles.placeIconCircle}>
                    <Ionicons
                      name={(item.icon as any) || 'location'}
                      size={18}
                      color={Colors.textSecondary}
                    />
                  </View>
                  <View style={styles.placeInfo}>
                    <Text style={styles.placeName}>{item.name}</Text>
                    <Text style={styles.placeAddress} numberOfLines={1}>
                      {item.address}
                    </Text>
                  </View>
                  {Number.isFinite(item.distanceKm) && (
                    <Text style={styles.placeDistance}>
                      {(item.distanceKm as number).toFixed(1)} km
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            );
          }}
          showsVerticalScrollIndicator={false}
          style={styles.placesList}
          contentContainerStyle={{ paddingBottom: 8 }}
          ListEmptyComponent={
            <Text style={styles.emptyPlaces}>
              No saved or recent places yet. Pick a destination in the field
              above to start your trip.
            </Text>
          }
        />

        {/* Book Now Button */}
        <TouchableOpacity
          style={styles.bookNowButton}
          activeOpacity={0.85}
          onPress={handleBookNow}
        >
          <Ionicons name="sparkles" size={20} color={Colors.white} />
          <Text style={styles.bookNowText}>Book Now</Text>
        </TouchableOpacity>
      </View>
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
    paddingBottom: vs(Spacing.base),
    paddingHorizontal: s(Spacing.base),
    borderBottomLeftRadius: s(20),
    borderBottomRightRadius: s(20),
  },
  topBarInner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(Spacing.md),
  },
  menuButton: {
    width: s(40),
    height: s(40),
    borderRadius: s(20),
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  greetingBlock: {
    justifyContent: 'center',
  },
  greetingText: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(13),
    color: 'rgba(255, 255, 255, 0.85)',
    lineHeight: fs(16),
  },
  userName: {
    fontFamily: 'Inter-Bold',
    fontSize: fs(18),
    color: Colors.white,
    lineHeight: fs(24),
    marginTop: vs(1),
  },
  walletBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(6),
    backgroundColor: Colors.white,
    paddingHorizontal: s(Spacing.md),
    paddingVertical: vs(Spacing.sm),
    borderRadius: s(BorderRadius.full),
  },
  walletAmount: {
    fontFamily: 'Inter-Bold',
    fontSize: fs(12),
    color: Colors.primary,
    lineHeight: fs(16),
  },

  /* ── Map ── */
  mapContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: height * 0.55,
    backgroundColor: Colors.mapBackground,
    overflow: 'hidden',
  },
  mapGrid: {
    ...StyleSheet.absoluteFillObject,
  },
  mapLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(191, 224, 144, 0.25)',
  },
  mapLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(191, 224, 144, 0.25)',
  },
  cabBadge: {
    position: 'absolute',
    top: '35%',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(6),
    backgroundColor: Colors.cabBadgeBlue,
    paddingHorizontal: s(Spacing.md),
    paddingVertical: vs(Spacing.xs + 2),
    borderRadius: s(92),
  },
  cabBadgeText: {
    fontFamily: 'Inter-Medium',
    fontSize: fs(12),
    lineHeight: fs(15),
    color: Colors.white,
  },
  centerPin: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: s(-20),
    marginTop: vs(-40),
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapHint: {
    position: 'absolute',
    top: vs(12),
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: s(14),
    paddingVertical: vs(8),
    borderRadius: s(20),
  },
  mapHintText: {
    color: Colors.white,
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(12),
  },
  mapConfirmBtn: {
    position: 'absolute',
    left: s(16),
    right: s(16),
    bottom: vs(14),
    height: vs(50),
    borderRadius: s(12),
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.teal,
  },
  mapConfirmText: {
    color: Colors.white,
    fontFamily: 'Inter-Bold',
    fontSize: fs(15),
  },
  locationMarker: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: s(-18),
    marginTop: vs(-18),
    width: s(36),
    height: s(36),
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationPulse: {
    position: 'absolute',
    width: s(36),
    height: s(36),
    borderRadius: s(18),
    backgroundColor: 'rgba(0, 151, 179, 0.15)',
  },
  locationDot: {
    width: s(14),
    height: s(14),
    borderRadius: s(7),
    backgroundColor: Colors.primary,
    borderWidth: 3,
    borderColor: Colors.white,
    ...Shadow.teal,
  },
  mapPatch: {
    position: 'absolute',
  },
  carIcon: {
    position: 'absolute',
  },

  /* ── Bottom Sheet ── */
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.white,
    borderTopLeftRadius: s(24),
    borderTopRightRadius: s(24),
    paddingHorizontal: s(Spacing.xl),
    paddingBottom: vs(Spacing.lg),
    maxHeight: height * 0.58,
    ...Shadow.top,
  },
  handle: {
    width: s(40),
    height: vs(4),
    borderRadius: s(2),
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginTop: vs(Spacing.md),
    marginBottom: vs(Spacing.lg),
  },

  /* ── Tabs ── */
  tabRow: {
    flexDirection: 'row',
    gap: s(Spacing.sm),
    marginBottom: vs(Spacing.xl),
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: vs(Spacing.sm + 2),
    paddingHorizontal: s(Spacing.base),
    borderRadius: s(BorderRadius.full),
    borderWidth: 1,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.white,
  },
  tabActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  tabLabel: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(13),
    color: Colors.textSecondary,
    lineHeight: fs(16),
  },
  tabLabelActive: {
    color: Colors.white,
  },

  /* ── Location Inputs ── */
  inputWrapper: {
    marginBottom: vs(Spacing.md),
  },
  inputFloatLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(13),
    color: Colors.textSecondary,
    marginBottom: vs(Spacing.sm),
    marginLeft: s(2),
    lineHeight: fs(16),
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: s(14),
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
    paddingHorizontal: s(Spacing.md),
    paddingVertical: vs(Spacing.sm),
    gap: s(Spacing.md),
    height: vs(54),
  },
  inputContainerActive: {
    borderColor: Colors.primary,
  },
  inputIconCircle: {
    width: s(36),
    height: s(36),
    borderRadius: s(18),
    backgroundColor: Colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputIconCircleDrop: {
    backgroundColor: Colors.errorLight,
  },
  inputText: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: fs(14),
    color: Colors.textSecondary,
    lineHeight: fs(20),
  },
  gpsButton: {
    width: s(36),
    height: s(36),
    borderRadius: s(18),
    backgroundColor: Colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* ── Recent Places ── */
  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: vs(Spacing.sm),
    marginBottom: vs(Spacing.md),
  },
  recentTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(15),
    color: Colors.textPrimary,
    lineHeight: fs(20),
  },
  clearAll: {
    fontFamily: 'Inter-Medium',
    fontSize: fs(13),
    color: Colors.primary,
    lineHeight: fs(16),
  },
  sectionHeader: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(11),
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: vs(Spacing.sm),
    marginBottom: vs(Spacing.xs),
  },
  emptyPlaces: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(13),
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: vs(Spacing.xl),
    paddingHorizontal: s(Spacing.lg),
    lineHeight: fs(18),
  },
  placesList: {
    flexGrow: 0,
    maxHeight: vs(180),
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: vs(Spacing.md),
    gap: s(Spacing.md),
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  placeIconCircle: {
    width: s(40),
    height: s(40),
    borderRadius: s(20),
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeInfo: {
    flex: 1,
  },
  placeName: {
    fontFamily: 'Inter-Medium',
    fontSize: fs(14),
    color: Colors.textPrimary,
    lineHeight: fs(20),
  },
  placeAddress: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(12),
    color: Colors.textMuted,
    lineHeight: fs(16),
    marginTop: vs(2),
  },
  placeDistance: {
    fontFamily: 'Inter-Medium',
    fontSize: fs(13),
    color: Colors.textSecondary,
    lineHeight: fs(16),
  },

  /* ── Book Now ── */
  bookNowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: s(BorderRadius.button),
    paddingVertical: vs(Spacing.base),
    gap: s(Spacing.sm),
    marginTop: vs(Spacing.md),
  },
  bookNowText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(16),
    color: Colors.white,
    lineHeight: fs(22),
  },
});
