import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  StatusBar,
  Keyboard,
  ActivityIndicator,
  Alert,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '@/theme';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setPickup, setDropoff } from '@/store/slices/rideSlice';
import { geoService, GeoSuggestion } from '@/services/geoService';
import { rideService } from '@/services/rideService';
import { useLiveLocation } from '@/hooks/useLiveLocation';
import { DEFAULT_COORDS } from '@/utils/location';

interface SearchRideScreenProps {
  navigation: any;
}

interface SearchLocation {
  id: string;
  name: string;
  address: string;
  type?: string;
  /** 'saved' or 'recent' — drives the section grouping in the list. */
  source?: 'saved' | 'recent';
  distance?: string;
  lat: number;
  lng: number;
}

// Last-resort pickup if GPS is unavailable.
const FALLBACK_PICKUP: SearchLocation = {
  id: 'current',
  name: 'Current Location',
  address: 'Detecting your location…',
  type: 'location',
  lat: DEFAULT_COORDS.lat,
  lng: DEFAULT_COORDS.lng,
};

export const SearchRideScreen: React.FC<SearchRideScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const live = useLiveLocation({ watch: true, reverseGeocode: true });
  const { user } = useAppSelector((s) => s.auth);
  const [pickupText, setPickupText] = useState('');
  const [pickupTouched, setPickupTouched] = useState(false);
  const [dropoffText, setDropoffText] = useState('');
  const [pickupLocation, setPickupLocation] = useState<SearchLocation>(FALLBACK_PICKUP);
  const [focusedField, setFocusedField] = useState<'pickup' | 'dropoff'>('dropoff');
  // Idle-state suggestions: previous drop-offs from this user's rides, max 3,
  // de-duplicated by address. Fetched once on mount; empty means "no history".
  const [recentDropoffs, setRecentDropoffs] = useState<SearchLocation[]>([]);
  const [searchResults, setSearchResults] = useState<SearchLocation[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const dropoffRef = useRef<TextInput>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchSeq = useRef(0);

  // Saved addresses (Home, Work, …) — pulled directly from the auth slice.
  const savedAddressSuggestions: SearchLocation[] = useMemo(() => {
    const list = user?.savedAddresses ?? [];
    return list
      .filter((a) => a.address && (a.lat !== 0 || a.lng !== 0))
      .map((a, idx) => ({
        id: `saved-${idx}`,
        name: a.label || a.address,
        address: a.address,
        type: (a.icon || 'location') as string,
        source: 'saved' as const,
        lat: a.lat,
        lng: a.lng,
      }));
  }, [user?.savedAddresses]);

  // Fetch the user's last few rides once on mount and pull up to 3 unique
  // drop-offs out of them. We rely on the backend default sort (most recent
  // first) and de-duplicate by address. No history → no suggestions.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await rideService.getRides(1, 20);
        const rides: Array<{ dropoff?: { address: string; lat: number; lng: number } }> =
          (data as any)?.rides || (data as any)?.items || [];
        const seen = new Set<string>();
        const uniqueDropoffs: SearchLocation[] = [];
        for (const r of rides) {
          const d = r?.dropoff;
          if (!d?.address) continue;
          const key = d.address.trim().toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          uniqueDropoffs.push({
            id: `recent-${uniqueDropoffs.length}-${key.slice(0, 16)}`,
            name: d.address.split(',')[0] || d.address,
            address: d.address,
            type: 'location',
            source: 'recent',
            lat: d.lat,
            lng: d.lng,
          });
          if (uniqueDropoffs.length >= 3) break;
        }
        if (!cancelled) setRecentDropoffs(uniqueDropoffs);
      } catch {
        // First-time / unauthenticated / network-down — show no suggestions.
        if (!cancelled) setRecentDropoffs([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // What the idle state shows (no live query): saved addresses on top, then
  // recent drop-offs. Either list can be empty; if both are, we show nothing.
  const idleSuggestions: SearchLocation[] = useMemo(
    () => [...savedAddressSuggestions, ...recentDropoffs],
    [savedAddressSuggestions, recentDropoffs],
  );

  // Live GPS → pickup. Stops auto-updating once the user types in the pickup
  // field so we don't clobber their edit.
  useEffect(() => {
    if (pickupTouched) return;
    if (!live.coords) return;
    const addr = live.address || 'Current Location';
    setPickupLocation({
      id: 'current',
      name: addr,
      address: addr,
      type: 'location',
      lat: live.coords.lat,
      lng: live.coords.lng,
    });
    // Show the actual reverse-geocoded address in the visible input so the
    // user sees their exact pickup, not the generic "Current Location" label.
    setPickupText(addr);
  }, [live.coords?.lat, live.coords?.lng, live.address, pickupTouched]);

  const activeQuery = focusedField === 'dropoff' ? dropoffText : pickupText;
  // When the pickup field is showing the auto-resolved current address and
  // the user hasn't edited it, treat it as idle — we don't want to query
  // autocomplete for the user's own current location.
  const pickupShowsCurrent = focusedField === 'pickup' && !pickupTouched;

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    const q = activeQuery.trim();
    if (q.length < 2 || q === 'Current Location' || pickupShowsCurrent) {
      // Idle list — driven by saved addresses + recent drop-offs only.
      setSearchResults(idleSuggestions);
      setSearching(false);
      setSearchError(null);
      return;
    }

    setSearching(true);
    setSearchError(null);
    const seq = ++fetchSeq.current;
    debounceTimer.current = setTimeout(async () => {
      try {
        // Bias the autocomplete to a 10 km radius around the customer so we
        // don't surface destinations on the other side of the country. If
        // GPS hasn't given us a fix yet, fall back to the (pickup) location
        // we're showing on the screen.
        const center = live.coords
          ? { lat: live.coords.lat, lng: live.coords.lng }
          : { lat: pickupLocation.lat, lng: pickupLocation.lng };
        const results = await geoService.autocomplete(q, 8, {
          center,
          radiusKm: 10,
        });
        if (seq !== fetchSeq.current) return;
        const mapped: SearchLocation[] = results.map((r: GeoSuggestion) => ({
          id: r.id,
          name: r.displayName,
          address: r.address,
          lat: r.lat,
          lng: r.lng,
        }));
        setSearchResults(mapped);
      } catch (err: any) {
        if (seq !== fetchSeq.current) return;
        setSearchResults([]);
        const status = err?.response?.status;
        const msg = err?.response?.data?.message ?? err?.message ?? 'Search failed';
        setSearchError(status ? `${msg} (${status})` : msg);
      } finally {
        if (seq === fetchSeq.current) setSearching(false);
      }
    }, 300);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [activeQuery, idleSuggestions, pickupShowsCurrent]);

  const handleSelectLocation = (location: SearchLocation) => {
    if (focusedField === 'dropoff') {
      setDropoffText(location.name);
      dispatch(setPickup({ address: pickupLocation.address, lat: pickupLocation.lat, lng: pickupLocation.lng }));
      dispatch(setDropoff({ address: location.address, lat: location.lat, lng: location.lng }));
      navigation.navigate('SelectRide', {
        pickup: pickupLocation.name || pickupText,
        dropoff: location.name,
      });
    } else {
      setPickupText(location.name);
      setPickupLocation(location);
      dropoffRef.current?.focus();
    }
  };

  // Home / Work shortcuts → set the saved address as the drop-off and proceed.
  const handleQuickPick = (label: 'Home' | 'Work') => {
    const match = savedAddressSuggestions.find(
      (a) =>
        (a.name || '').toLowerCase().includes(label.toLowerCase()) ||
        (a.type || '').toLowerCase() === label.toLowerCase()
    );
    if (!match) {
      Alert.alert(`No ${label} address`, `Save a ${label} address to use this shortcut.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Add', onPress: () => navigation.navigate('SavedAddresses') },
      ]);
      return;
    }
    dispatch(setPickup({ address: pickupLocation.address, lat: pickupLocation.lat, lng: pickupLocation.lng }));
    dispatch(setDropoff({ address: match.address, lat: match.lat, lng: match.lng }));
    navigation.navigate('SelectRide', {
      pickup: pickupLocation.name || pickupText,
      dropoff: match.name,
    });
  };

  const getLocationIcon = (type: string) => {
    switch (type) {
      case 'airport': return 'airplane';
      case 'station': return 'train';
      case 'landmark': return 'business';
      default: return 'location';
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      {/* Search Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Search Ride</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Route Input Card */}
      <View style={styles.routeCard}>
        {/* Pickup */}
        <View style={styles.inputRow}>
          <View style={[styles.routeDot, styles.pickupDot]}>
            <View style={styles.innerDot} />
          </View>
          <TextInput
            style={styles.routeInput}
            value={pickupText}
            onChangeText={(t) => {
              setPickupText(t);
              setPickupTouched(true);
            }}
            placeholder="Pickup location"
            placeholderTextColor={Colors.textMuted}
            onFocus={() => setFocusedField('pickup')}
            selectionColor={Colors.primary}
          />
          {pickupText.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                setPickupText('');
                setPickupTouched(true);
              }}
            >
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Route line */}
        <View style={styles.routeLineContainer}>
          <View style={styles.routeLine} />
        </View>

        {/* Dropoff */}
        <View style={styles.inputRow}>
          <View style={[styles.routeDot, styles.dropoffDot]}>
            <Ionicons name="location" size={10} color={Colors.white} />
          </View>
          <TextInput
            ref={dropoffRef}
            style={styles.routeInput}
            value={dropoffText}
            onChangeText={setDropoffText}
            placeholder="Where to?"
            placeholderTextColor={Colors.textMuted}
            onFocus={() => setFocusedField('dropoff')}
            selectionColor={Colors.primary}
            autoFocus
          />
          {dropoffText.length > 0 && (
            <TouchableOpacity onPress={() => setDropoffText('')}>
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

      </View>

      {/* Quick Picks */}
      <View style={styles.quickPicks}>
        <TouchableOpacity style={styles.quickPick} onPress={() => handleQuickPick('Home')}>
          <Ionicons name="home" size={16} color={Colors.primary} />
          <Text style={styles.quickPickText}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickPick} onPress={() => handleQuickPick('Work')}>
          <Ionicons name="briefcase" size={16} color={Colors.info} />
          <Text style={styles.quickPickText}>Work</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickPick}
          onPress={() => navigation.navigate('SelectLocation', { pickFromMap: true })}
        >
          <Ionicons name="map" size={16} color={Colors.success} />
          <Text style={styles.quickPickText}>Map</Text>
        </TouchableOpacity>
      </View>

      {/* Results */}
      <FlatList
        data={searchResults}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => {
          const isLiveSearch =
            activeQuery.trim().length >= 2 && activeQuery !== 'Current Location';
          // In idle mode, render a small section header above the first row of
          // each source ("Saved addresses" then "Recent rides"). In live-search
          // mode just stream rows — the screen-level "Results" header is enough.
          const prev = searchResults[index - 1];
          const showSavedHeader =
            !isLiveSearch && item.source === 'saved' && prev?.source !== 'saved';
          const showRecentHeader =
            !isLiveSearch && item.source === 'recent' && prev?.source !== 'recent';
          return (
            <View>
              {showSavedHeader && (
                <Text style={styles.sectionHeader}>Saved addresses</Text>
              )}
              {showRecentHeader && (
                <Text style={styles.sectionHeader}>Recent rides</Text>
              )}
              <TouchableOpacity
                style={styles.resultItem}
                onPress={() => handleSelectLocation(item)}
              >
                <View style={styles.resultIcon}>
                  <Ionicons
                    name={getLocationIcon((item as any).type || 'location')}
                    size={18}
                    color={Colors.textSecondary}
                  />
                </View>
                <View style={styles.resultText}>
                  <Text style={styles.resultName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.resultAddress} numberOfLines={1}>{item.address}</Text>
                </View>
                {'distance' in item && (item as any).distance && (
                  <Text style={styles.resultDistance}>{(item as any).distance}</Text>
                )}
              </TouchableOpacity>
            </View>
          );
        }}
        ListHeaderComponent={
          <View>
            {activeQuery.trim().length >= 2 &&
              activeQuery !== 'Current Location' && (
                <Text style={styles.resultsTitle}>Results</Text>
              )}
            {searching && (
              <View style={styles.statusRow}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.statusText}>Searching…</Text>
              </View>
            )}
            {!!searchError && !searching && (
              <Text style={styles.errorText}>{searchError}</Text>
            )}
          </View>
        }
        ListEmptyComponent={
          !searching && !searchError && activeQuery.trim().length >= 2 ? (
            <Text style={styles.emptyText}>No places found for "{activeQuery}"</Text>
          ) : null
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.resultsList}
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );
};

import { fs, s, vs } from '@/theme/responsive';

// ... other imports ...

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: s(Spacing.base),
    paddingVertical: vs(Spacing.md),
  },
  backButton: {
    width: s(40),
    height: s(40),
    borderRadius: s(20),
    backgroundColor: Colors.backgroundCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...Typography.h5,
    fontSize: fs(18),
    fontFamily: 'Inter-SemiBold',
    color: '#1E293B',
  },
  routeCard: {
    marginHorizontal: s(Spacing.base),
    backgroundColor: Colors.backgroundCard,
    borderRadius: s(BorderRadius.lg),
    padding: s(Spacing.base),
    ...Shadow.md,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(Spacing.md),
    paddingVertical: vs(Spacing.sm),
  },
  routeDot: {
    width: s(20),
    height: s(20),
    borderRadius: s(10),
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickupDot: {
    backgroundColor: Colors.pickupGreen,
  },
  dropoffDot: {
    backgroundColor: Colors.dropoffRed,
  },
  innerDot: {
    width: s(8),
    height: s(8),
    borderRadius: s(4),
    backgroundColor: Colors.white,
  },
  routeInput: {
    flex: 1,
    ...Typography.bodyLarge,
    fontSize: fs(16),
    fontFamily: 'Inter-Regular',
    color: Colors.textPrimary,
    paddingVertical: vs(Spacing.sm),
  },
  routeLineContainer: {
    paddingLeft: s(9),
    paddingVertical: 0,
  },
  routeLine: {
    width: s(2),
    height: vs(20),
    backgroundColor: Colors.border,
  },
  addStop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(Spacing.sm),
    paddingTop: vs(Spacing.md),
    paddingLeft: s(Spacing['2xl']),
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    marginTop: vs(Spacing.sm),
  },
  addStopText: {
    ...Typography.body,
    fontSize: fs(14),
    fontFamily: 'Inter-Medium',
    color: Colors.primary,
  },
  quickPicks: {
    flexDirection: 'row',
    paddingHorizontal: s(Spacing.base),
    paddingVertical: vs(Spacing.md),
    gap: s(Spacing.sm),
  },
  quickPick: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.backgroundCard,
    borderRadius: s(BorderRadius.full),
    paddingHorizontal: s(Spacing.base),
    paddingVertical: vs(Spacing.sm),
    gap: s(Spacing.xs),
    borderWidth: 1,
    borderColor: Colors.border,
  },
  quickPickText: {
    ...Typography.captionBold,
    fontSize: fs(12),
    fontFamily: 'Inter-Bold',
    color: Colors.textPrimary,
  },
  resultsList: {
    paddingHorizontal: s(Spacing.base),
    paddingBottom: vs(Spacing['3xl']),
  },
  resultsTitle: {
    ...Typography.labelSmall,
    fontSize: fs(12),
    fontFamily: 'Inter-Medium',
    color: Colors.textMuted,
    marginBottom: vs(Spacing.md),
    marginTop: vs(Spacing.sm),
  },
  sectionHeader: {
    ...Typography.labelSmall,
    fontSize: fs(12),
    fontFamily: 'Inter-Medium',
    color: Colors.textMuted,
    marginTop: vs(Spacing.md),
    marginBottom: vs(Spacing.sm),
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: vs(Spacing.md),
    gap: s(Spacing.md),
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  resultIcon: {
    width: s(40),
    height: s(40),
    borderRadius: s(20),
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultText: {
    flex: 1,
  },
  resultName: {
    ...Typography.label,
    fontSize: fs(14),
    fontFamily: 'Inter-SemiBold',
    color: Colors.textPrimary,
  },
  resultAddress: {
    ...Typography.caption,
    fontSize: fs(12),
    fontFamily: 'Inter-Regular',
    color: Colors.textMuted,
    marginTop: vs(2),
  },
  resultDistance: {
    ...Typography.captionBold,
    fontSize: fs(12),
    fontFamily: 'Inter-Bold',
    color: Colors.textSecondary,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(Spacing.sm),
    paddingVertical: vs(Spacing.sm),
  },
  statusText: {
    ...Typography.caption,
    fontSize: fs(12),
    fontFamily: 'Inter-Regular',
    color: Colors.textSecondary,
  },
  errorText: {
    ...Typography.caption,
    fontSize: fs(12),
    fontFamily: 'Inter-Regular',
    color: Colors.dropoffRed,
    paddingVertical: vs(Spacing.sm),
  },
  emptyText: {
    ...Typography.caption,
    fontSize: fs(12),
    fontFamily: 'Inter-Regular',
    color: Colors.textMuted,
    paddingVertical: vs(Spacing.md),
    textAlign: 'center',
  },
});
