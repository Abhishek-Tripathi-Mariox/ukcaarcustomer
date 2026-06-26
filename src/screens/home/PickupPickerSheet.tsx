import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius } from '@/theme';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setPickup, setDropoff } from '@/store/slices/rideSlice';
import { geoService, GeoSuggestion } from '@/services/geoService';

/**
 * Inline location picker for the home screen. Replaces the old
 * full-screen SelectLocationScreen that the pickup/drop taps used to
 * navigate to — same data sources (autocomplete + saved addresses +
 * current GPS), but rendered as a bottom-sheet modal so the user never
 * leaves Home. Used for both pickup and drop-off:
 *
 *   - mode='pickup'  (default): "Use current location" shortcut + saved
 *     addresses as idle suggestions; selecting dispatches setPickup().
 *   - mode='drop': hides the GPS shortcut (you rarely want to drop where
 *     you currently are); selecting dispatches setDropoff(). The
 *     onPicked callback also fires so the caller can mirror the address
 *     into local state (e.g. the Scheduled tab's drop input label).
 *
 * The autocomplete query is biased to a 10 km radius around liveCoords
 * so results stay local — same behavior in both modes.
 */
interface PickupPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Live GPS from useLiveLocation — used for the "use current location"
   *  shortcut and to bias the autocomplete proxy. */
  liveCoords?: { lat: number; lng: number } | null;
  liveAddress?: string | null;
  /** Whether the sheet is picking the trip's pickup or its drop-off.
   *  Defaults to 'pickup' so existing call-sites don't break. */
  mode?: 'pickup' | 'drop';
  /** Optional callback fired with the picked address string. Used by
   *  the scheduled tab to mirror the chosen drop into its local input.
   *  Pincode is included when the underlying source (autocomplete proxy)
   *  returned one — scheduled-route matching relies on this. */
  onPicked?: (location: {
    address: string;
    lat: number;
    lng: number;
    pincode?: string;
  }) => void;
}

interface PickerRow {
  id: string;
  title: string;
  address: string;
  /** Drives the row icon. 'gps' = the "Use current location" shortcut,
   *  'saved' = an address book entry, 'search' = a live autocomplete hit. */
  source: 'gps' | 'saved' | 'search';
  icon?: string;
  lat: number;
  lng: number;
  /** Pincode parsed out of the autocomplete suggestion or reverse-geocode
   *  result. Used by the scheduled-routes lookup to match the rider to a
   *  route serving their PIN even when GPS coords don't fall on a stop. */
  pincode?: string;
}

// Stable empty-array reference so the savedAddresses selector below
// doesn't return a fresh [] literal on every store update (which trips
// React-Redux's strict-equality check and the "different result" warning).
const EMPTY_SAVED_ADDRESSES: any[] = [];

export const PickupPickerSheet: React.FC<PickupPickerSheetProps> = ({
  visible,
  onClose,
  liveCoords,
  liveAddress,
  mode = 'pickup',
  onPicked,
}) => {
  const isPickup = mode === 'pickup';
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const savedAddresses = useAppSelector(
    s => s.auth?.user?.savedAddresses ?? EMPTY_SAVED_ADDRESSES,
  );

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PickerRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchSeq = useRef(0);
  const inputRef = useRef<TextInput | null>(null);

  // Reset the query state every time the sheet opens so a previous search
  // doesn't leak across sessions. Also auto-focus the input so the user
  // can start typing immediately.
  useEffect(() => {
    if (!visible) return;
    setQuery('');
    setResults([]);
    setError(null);
    setSearching(false);
    const t = setTimeout(() => inputRef.current?.focus(), 200);
    return () => clearTimeout(t);
  }, [visible]);

  // Idle suggestions — shown when the search box is empty or under 2 chars.
  // GPS shortcut first (so "I'm at home, just go" is a one-tap action),
  // then the user's address book.
  const idleSuggestions: PickerRow[] = useMemo(() => {
    const rows: PickerRow[] = [];
    // "Use current location" only makes sense for pickup. In drop mode
    // we skip it — the rider's current location is almost never a sane
    // drop-off and surfacing it as a one-tap option causes mistakes.
    if (isPickup && liveCoords) {
      rows.push({
        id: 'gps',
        title: 'Use current location',
        address: liveAddress || 'Detecting your address…',
        source: 'gps',
        icon: 'locate',
        lat: liveCoords.lat,
        lng: liveCoords.lng,
      });
    }
    for (const a of savedAddresses) {
      if (!a.address || (a.lat === 0 && a.lng === 0)) continue;
      rows.push({
        id: `saved-${a.label}-${a.lat}-${a.lng}`,
        title: a.label || a.address,
        address: a.address,
        source: 'saved',
        icon: (a.icon as string) || 'bookmark-outline',
        lat: a.lat,
        lng: a.lng,
      });
    }
    return rows;
  }, [isPickup, liveCoords?.lat, liveCoords?.lng, liveAddress, savedAddresses]);

  // Run autocomplete on debounce when the user types. We bias the search
  // to a 10 km radius around the rider so the dropdown surfaces places
  // they can actually reach today, not destinations on the other side of
  // the country.
  useEffect(() => {
    if (!visible) return;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      setError(null);
      return;
    }

    setSearching(true);
    setError(null);
    const seq = ++fetchSeq.current;
    debounceTimer.current = setTimeout(async () => {
      try {
        const opts = liveCoords
          ? { center: { lat: liveCoords.lat, lng: liveCoords.lng }, radiusKm: 10 }
          : undefined;
        const list = await geoService.autocomplete(q, 8, opts);
        if (seq !== fetchSeq.current) return;
        setResults(
          list.map((r: GeoSuggestion) => ({
            id: r.id,
            title: r.displayName,
            address: r.address,
            source: 'search' as const,
            icon: 'location-outline',
            lat: r.lat,
            lng: r.lng,
            pincode: r.parts?.pincode || undefined,
          })),
        );
      } catch (err: any) {
        if (seq !== fetchSeq.current) return;
        setResults([]);
        const msg = err?.response?.data?.message ?? err?.message ?? 'Search failed';
        setError(msg);
      } finally {
        if (seq === fetchSeq.current) setSearching(false);
      }
    }, 300);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [query, visible, liveCoords?.lat, liveCoords?.lng]);

  const data = query.trim().length >= 2 ? results : idleSuggestions;

  const choose = (row: PickerRow) => {
    const loc = {
      address: row.address,
      lat: row.lat,
      lng: row.lng,
      ...(row.pincode ? { pincode: row.pincode } : {}),
    };
    dispatch(isPickup ? setPickup(loc) : setDropoff(loc));
    if (onPicked) onPicked(loc);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.handle} />

          <View style={styles.headerRow}>
            <Text style={styles.title}>
              {isPickup ? 'Set pickup location' : 'Where to?'}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={Colors.textMuted} />
            <TextInput
              ref={inputRef}
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder={
                isPickup
                  ? 'Search a building, area, or landmark'
                  : 'Search your drop-off location'
              }
              placeholderTextColor={Colors.textMuted}
              selectionColor={Colors.primary}
              returnKeyType="search"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')} hitSlop={10}>
                <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {searching && (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.statusText}>Searching…</Text>
            </View>
          )}
          {!!error && !searching && (
            <Text style={styles.errorText}>{error}</Text>
          )}

          <FlatList
            data={data}
            keyExtractor={r => r.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 12 }}
            ListEmptyComponent={
              !searching && !error ? (
                <Text style={styles.emptyText}>
                  {query.trim().length >= 2
                    ? `No places found for "${query.trim()}".`
                    : 'Search for a place above, or pick from your saved addresses.'}
                </Text>
              ) : null
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.row}
                activeOpacity={0.7}
                onPress={() => choose(item)}
              >
                <View
                  style={[
                    styles.rowIcon,
                    item.source === 'gps' && styles.rowIconAccent,
                  ]}
                >
                  <Ionicons
                    name={(item.icon as any) || 'location'}
                    size={18}
                    color={
                      item.source === 'gps'
                        ? Colors.white
                        : Colors.textSecondary
                    }
                  />
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.rowAddress} numberOfLines={1}>
                    {item.address}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    maxHeight: '85%',
    minHeight: '60%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D9D9D9',
    alignSelf: 'center',
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    color: Colors.textPrimary,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: Colors.textPrimary,
    padding: 0,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  statusText: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: Colors.textSecondary,
  },
  errorText: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: Colors.dropoffRed,
    paddingVertical: 6,
  },
  emptyText: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
    lineHeight: 18,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconAccent: {
    backgroundColor: Colors.primary,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: Colors.textPrimary,
  },
  rowAddress: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
});
