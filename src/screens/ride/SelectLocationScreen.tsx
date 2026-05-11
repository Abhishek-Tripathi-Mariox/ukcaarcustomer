import React, { useEffect, useState } from 'react';
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
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '@/theme';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { setPickup, setDropoff } from '@/store/slices/rideSlice';
import { useLiveLocation } from '@/hooks/useLiveLocation';

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
  distance: string;
  lat: number;
  lng: number;
}

const recentPlaces: RecentPlace[] = [
  { id: '1', name: 'Office', address: 'Sector 62, Noida, UP 201301', distance: '2.7km', lat: 28.6270, lng: 77.3650 },
  { id: '2', name: 'Coffee shop', address: 'Connaught Place, New Delhi 110001', distance: '1.1km', lat: 28.6315, lng: 77.2167 },
  { id: '3', name: 'Shopping center', address: 'Select Citywalk, Saket, New Delhi', distance: '4.9km', lat: 28.5285, lng: 77.2190 },
  { id: '4', name: 'Gym', address: 'Gold Gym, Nehru Place, New Delhi', distance: '3.5km', lat: 28.5491, lng: 77.2533 },
];

// Last-resort coordinates if GPS is denied or unavailable.
const FALLBACK_PICKUP = {
  address: 'Detecting your location…',
  lat: 28.6270,
  lng: 77.3650,
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

  // Auto-fill pickup with the live reverse-geocoded address until the user
  // edits the field manually.
  useEffect(() => {
    if (!pickupProtected && live.address) {
      setPickupText(live.address);
    }
  }, [live.address, pickupProtected]);

  const currentLat = live.coords?.lat ?? FALLBACK_PICKUP.lat;
  const currentLng = live.coords?.lng ?? FALLBACK_PICKUP.lng;

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

      {/* ── Map Area ── */}
      <View style={[styles.mapContainer, { top: insets.top + 90 }]}>
        <View style={styles.mapPlaceholder}>
          {/* Map terrain patches */}
          <View style={[styles.mapPatch, { top: '10%', left: '5%', width: 80, height: 50, backgroundColor: Colors.mapSand, borderRadius: 20 }]} />
          <View style={[styles.mapPatch, { top: '55%', right: '10%', width: 100, height: 40, backgroundColor: Colors.mapSand, borderRadius: 16 }]} />
          <View style={[styles.mapPatch, { top: '20%', left: '55%', width: 60, height: 70, backgroundColor: Colors.mapGreen, borderRadius: 30, opacity: 0.4 }]} />
          <View style={[styles.mapPatch, { top: '40%', left: '10%', width: 50, height: 50, backgroundColor: Colors.mapGreen, borderRadius: 25, opacity: 0.3 }]} />
          <View style={[styles.mapPatch, { bottom: '10%', right: '25%', width: 70, height: 35, backgroundColor: Colors.mapWater, borderRadius: 18, opacity: 0.3 }]} />

          <View style={styles.mapGrid}>
            {Array.from({ length: 14 }).map((_, i) => (
              <View key={`h${i}`} style={[styles.mapLineH, { top: i * 35 }]} />
            ))}
            {Array.from({ length: 12 }).map((_, i) => (
              <View key={`v${i}`} style={[styles.mapLineV, { left: i * 35 }]} />
            ))}
          </View>

          {/* Cab badge */}
          <View style={styles.cabBadge}>
            <Ionicons name="flash" size={12} color="#F7F7F7" />
            <Text style={styles.cabBadgeText}>Get a cab in 5 mins</Text>
          </View>

          {/* Location marker */}
          <View style={styles.locationMarker}>
            <View style={styles.locationPulse} />
            <View style={styles.locationDot} />
          </View>

          {/* Car markers */}
          <MaterialCommunityIcons name="car-side" size={22} color="#2C3E50" style={[styles.carIcon, { top: '20%', left: '20%', transform: [{ rotate: '30deg' }] }]} />
          <MaterialCommunityIcons name="car-side" size={22} color="#2C3E50" style={[styles.carIcon, { top: '15%', left: '65%', transform: [{ rotate: '-20deg' }] }]} />
          <MaterialCommunityIcons name="car-side" size={20} color="#34495E" style={[styles.carIcon, { top: '40%', left: '75%', transform: [{ rotate: '45deg' }] }]} />
          <MaterialCommunityIcons name="car-side" size={18} color="#2C3E50" style={[styles.carIcon, { top: '55%', left: '35%', transform: [{ rotate: '-10deg' }] }]} />
          <MaterialCommunityIcons name="car-side" size={20} color="#34495E" style={[styles.carIcon, { top: '30%', left: '45%', transform: [{ rotate: '60deg' }] }]} />
        </View>
      </View>

      {/* ── Bottom Sheet ── */}
      <View style={styles.bottomSheet}>
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
              style={styles.inputText}
              value={dropoffText}
              onChangeText={setDropoffText}
              placeholder="Where is your Drop?"
              placeholderTextColor={Colors.textMuted}
              onFocus={() => {
                setDropoffFocused(true);
                navigation.navigate('SearchRide');
              }}
              selectionColor={Colors.primary}
            />
          </View>
        </View>

        {/* Recent Places */}
        <View style={styles.recentHeader}>
          <Text style={styles.recentTitle}>Recent places</Text>
          <TouchableOpacity>
            <Text style={styles.clearAll}>Clear All</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={recentPlaces}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.placeRow} onPress={() => handleSelectPlace(item)} activeOpacity={0.7}>
              <View style={styles.placeIconCircle}>
                <Ionicons name="time-outline" size={18} color={Colors.textSecondary} />
              </View>
              <View style={styles.placeInfo}>
                <Text style={styles.placeName}>{item.name}</Text>
                <Text style={styles.placeAddress} numberOfLines={1}>{item.address}</Text>
              </View>
              <Text style={styles.placeDistance}>{item.distance}</Text>
            </TouchableOpacity>
          )}
          showsVerticalScrollIndicator={false}
          style={styles.placesList}
          contentContainerStyle={{ paddingBottom: 8 }}
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
    paddingBottom: Spacing.base,
    paddingHorizontal: Spacing.base,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  greetingBlock: {
    justifyContent: 'center',
  },
  greetingText: {
    fontSize: 13,
    fontWeight: '400',
    color: 'rgba(255, 255, 255, 0.85)',
    lineHeight: 16,
  },
  userName: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.white,
    lineHeight: 24,
    marginTop: 1,
  },
  walletBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  walletAmount: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
    lineHeight: 16,
  },

  /* ── Map ── */
  mapContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: height * 0.55,
  },
  mapPlaceholder: {
    flex: 1,
    minHeight: height * 0.22,
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
    gap: 6,
    backgroundColor: Colors.cabBadgeBlue,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: 92,
  },
  cabBadgeText: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    lineHeight: 15,
    color: Colors.white,
  },
  locationMarker: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -18,
    marginTop: -18,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationPulse: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 151, 179, 0.15)',
  },
  locationDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
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
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.lg,
    maxHeight: height * 0.58,
    ...Shadow.top,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
  },

  /* ── Tabs ── */
  tabRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.base,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.white,
  },
  tabActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  tabLabelActive: {
    color: Colors.white,
  },

  /* ── Location Inputs ── */
  inputWrapper: {
    marginBottom: Spacing.md,
  },
  inputFloatLabel: {
    fontSize: 13,
    fontWeight: '400',
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
    marginLeft: 2,
    lineHeight: 16,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
    height: 54,
  },
  inputContainerActive: {
    borderColor: Colors.primary,
  },
  inputIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputIconCircleDrop: {
    backgroundColor: Colors.errorLight,
  },
  inputText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '400',
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  gpsButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* ── Recent Places ── */
  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  recentTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  clearAll: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.primary,
    lineHeight: 16,
  },
  placesList: {
    flexGrow: 0,
    maxHeight: 180,
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    gap: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  placeIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeInfo: {
    flex: 1,
  },
  placeName: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  placeAddress: {
    fontSize: 12,
    fontWeight: '400',
    color: Colors.textMuted,
    lineHeight: 16,
    marginTop: 2,
  },
  placeDistance: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textSecondary,
    lineHeight: 16,
  },

  /* ── Book Now ── */
  bookNowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.button,
    paddingVertical: Spacing.base,
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  bookNowText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
    lineHeight: 22,
  },
});
