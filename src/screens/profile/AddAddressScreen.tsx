import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StatusBar,
  Alert,
  Platform,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { Typography, Colors, Spacing, BorderRadius } from '@/theme';
import { fs, s, vs } from '@/theme/responsive';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Geolocation from '@react-native-community/geolocation';
import { check, request, PERMISSIONS, RESULTS } from 'react-native-permissions';

const LOCATION_PERMISSION =
  Platform.OS === 'ios'
    ? PERMISSIONS.IOS.LOCATION_WHEN_IN_USE
    : PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION;
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from '@/components/common';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { updateSavedAddresses, fetchProfile } from '@/store/slices/authSlice';
import { geoService, GeoSuggestion } from '@/services/geoService';

interface AddAddressScreenProps {
  navigation: any;
  route: any;
}

const LABEL_OPTIONS = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'work', label: 'Work', icon: 'briefcase' },
  { id: 'gym', label: 'Gym', icon: 'fitness' },
  { id: 'other', label: 'Other', icon: 'location' },
];


export const AddAddressScreen: React.FC<AddAddressScreenProps> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((state) => state.auth);
  const addressInputRef = useRef<TextInput>(null);
  const [saving, setSaving] = useState(false);

  const [selectedLabel, setSelectedLabel] = useState('home');
  const [customLabel, setCustomLabel] = useState('');
  // The primary "Address" field. Doubles as the live-search box: typing here
  // queries the geo proxy and picking a result auto-fills the rest.
  const [addressLine1, setAddressLine1] = useState('');
  // Whether the Address field is being edited — gates the inline suggestion
  // dropdown so it only shows while the user is actively searching.
  const [addressFocused, setAddressFocused] = useState(false);
  // Optional apartment/society/sector field for further refinement.
  const [apartment, setApartment] = useState('');
  const [landmark, setLandmark] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('');
  const [pincode, setPincode] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Mini-map + geocoding plumbing for the details step.
  const [pinLoading, setPinLoading] = useState(false);
  const mapRef = useRef<MapView | null>(null);
  // Shared in-flight guard so a quick "type pincode then drag pin" can't
  // apply a stale geo result over a newer one.
  const geoSeqRef = useRef(0);
  // The pincode value we last resolved ourselves — lets the auto-lookup skip
  // re-fetching a value that came from a suggestion / pin drag / our own call.
  const lastGeocodedPincodeRef = useRef('');
  // True only when the rider edits the pincode field by hand. The auto-lookup
  // (which moves the pin to the pincode's area centroid) must NOT fire when we
  // fill the pincode programmatically — e.g. after "use current location",
  // picking a suggestion, or dragging the pin — otherwise it would overwrite
  // the exact coordinate we just set with a coarse centroid.
  const userEditedPincodeRef = useRef(false);

  const [suggestions, setSuggestions] = useState<GeoSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchSeq = useRef(0); // race-condition guard for stale responses

  // Debounced autocomplete on the Address field: kicks in after the user
  // pauses typing for 300ms and ignores results from earlier queries that come
  // back after a newer one. Only runs while the field is focused so picking a
  // result (which blurs + sets the text) doesn't immediately re-query.
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    const q = addressLine1.trim();
    if (!addressFocused || q.length < 2) {
      setSuggestions([]);
      setSearching(false);
      setSearchError(null);
      return;
    }

    setSearching(true);
    setSearchError(null);
    const seq = ++fetchSeq.current;
    debounceTimer.current = setTimeout(async () => {
      try {
        const results = await geoService.autocomplete(q, 8);
        if (seq === fetchSeq.current) {
          setSuggestions(results);
        }
      } catch (err: any) {
        if (seq === fetchSeq.current) {
          setSuggestions([]);
          // Show a real reason — most often "Network Error" (server unreachable
          // from the device) or a 401 if the auth token expired.
          const status = err?.response?.status;
          const msg = err?.response?.data?.message ?? err?.message ?? 'Search failed';
          setSearchError(status ? `${msg} (${status})` : msg);
        }
      } finally {
        if (seq === fetchSeq.current) setSearching(false);
      }
    }, 300);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [addressLine1, addressFocused]);

  const applySuggestion = useCallback((s: GeoSuggestion) => {
    // Show the full picked address in the field; the granular parts populate
    // City/State/Pincode below and the coords drop the map pin.
    setAddressLine1(s.address);
    setCoords({ lat: s.lat, lng: s.lng });
    setCity(s.parts.city || '');
    setStateName(s.parts.state || '');
    setPincode(s.parts.pincode || '');
    // Programmatic fill — remember the value and clear the user-edited flag so
    // the auto-lookup leaves this exact coordinate alone.
    lastGeocodedPincodeRef.current = s.parts.pincode || '';
    userEditedPincodeRef.current = false;
    // Close the dropdown and drop focus so the debounce effect stops querying.
    setAddressFocused(false);
    setSuggestions([]);
    Keyboard.dismiss();
  }, []);

  // ── Pincode → city/state + map pin ─────────────────────────────────
  const regionForCoords = (c: { lat: number; lng: number }) => ({
    latitude: c.lat,
    longitude: c.lng,
    latitudeDelta: 0.012,
    longitudeDelta: 0.012,
  });

  // Forward-geocode a 6-digit pincode into city/state + coordinates using the
  // app's geo proxy (same source as autocomplete). The top hit gives us both
  // the admin parts to autofill AND a lat/lng to drop the pin on.
  const geocodePincode = useCallback(async (pin: string) => {
    const seq = ++geoSeqRef.current;
    setPinLoading(true);
    try {
      const results = await geoService.autocomplete(pin, 5);
      if (seq !== geoSeqRef.current) return;
      const best = results.find((r) => r.parts?.pincode === pin) ?? results[0];
      if (best) {
        if (best.parts.city) setCity(best.parts.city);
        if (best.parts.state) setStateName(best.parts.state);
        setCoords({ lat: best.lat, lng: best.lng });
        lastGeocodedPincodeRef.current = pin;
      }
    } catch {
      // Leave fields untouched; the user can still type city/state by hand.
    } finally {
      if (seq === geoSeqRef.current) setPinLoading(false);
    }
  }, []);

  // Reverse-geocode a map point (pin drag / map tap) back into address parts
  // so city/state/pincode stay in sync with where the pin actually sits.
  const reverseFromCoords = useCallback(async (lat: number, lng: number) => {
    const seq = ++geoSeqRef.current;
    setPinLoading(true);
    try {
      const res = await geoService.reverse(lat, lng);
      if (seq !== geoSeqRef.current || !res) return;
      if (res.parts.city) setCity(res.parts.city);
      if (res.parts.state) setStateName(res.parts.state);
      if (res.parts.pincode) {
        setPincode(res.parts.pincode);
        lastGeocodedPincodeRef.current = res.parts.pincode;
        userEditedPincodeRef.current = false;
      }
      const street = [res.parts.road, res.parts.area].filter(Boolean).join(', ');
      if (street) setAddressLine1(street);
    } finally {
      if (seq === geoSeqRef.current) setPinLoading(false);
    }
  }, []);

  const handleMapPoint = useCallback(
    (c: { latitude: number; longitude: number }) => {
      setCoords({ lat: c.latitude, lng: c.longitude });
      reverseFromCoords(c.latitude, c.longitude);
    },
    [reverseFromCoords],
  );

  // Auto-lookup ONLY when the rider typed a 6-digit pincode by hand. We never
  // run it for programmatic fills (current location / suggestion / pin drag),
  // so the pincode's coarse centroid can't overwrite an exact coordinate.
  useEffect(() => {
    if (!userEditedPincodeRef.current) return;
    const pin = pincode.trim();
    if (pin.length !== 6 || pin === lastGeocodedPincodeRef.current) return;
    const t = setTimeout(() => geocodePincode(pin), 500);
    return () => clearTimeout(t);
  }, [pincode, geocodePincode]);

  // Recenter the mini-map whenever the resolved coordinate changes (pincode
  // lookup, suggestion, pin drag and map tap all funnel through `coords`).
  useEffect(() => {
    if (coords && mapRef.current) {
      mapRef.current.animateToRegion(regionForCoords(coords), 400);
    }
  }, [coords?.lat, coords?.lng]);

  const handleUseCurrentLocation = async () => {
    // Spinner goes up FIRST. It used to be set only inside the success
    // callback, so the up-to-10s GPS wait gave zero feedback and the button
    // read as "did nothing".
    setSearching(true);
    try {
      // Android does NOT auto-prompt here — a manifest entry alone isn't a
      // grant. Without this the GPS call just errored, so the button only
      // worked when some other screen happened to have been granted already.
      // That's the main reason it worked "sometimes".
      const currentPerm = await check(LOCATION_PERMISSION);
      const status =
        currentPerm === RESULTS.GRANTED ? currentPerm : await request(LOCATION_PERMISSION);
      if (status !== RESULTS.GRANTED) {
        setSearching(false);
        Alert.alert(
          'Location permission',
          'Allow location access to use your current location for this address.',
        );
        return;
      }

      const getPosition = (opts: any) =>
        new Promise<any>((resolve, reject) =>
          Geolocation.getCurrentPosition(resolve, reject, opts),
        );

      // Two-stage fix. A high-accuracy satellite lock frequently times out
      // indoors / under cover, which produced the intermittent failures. If it
      // does, fall back to a coarse network fix and accept a recent cached one
      // rather than failing outright.
      let pos: any;
      try {
        pos = await getPosition({
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 30000,
        });
      } catch {
        pos = await getPosition({
          enableHighAccuracy: false,
          timeout: 20000,
          maximumAge: 5 * 60 * 1000,
        });
      }

      const { latitude, longitude } = pos.coords;
      const result = await geoService.reverse(latitude, longitude);
      if (!result) {
        Alert.alert('Location', 'Couldn\'t resolve your current location.');
        return;
      }
      applySuggestion({
        id: `${latitude},${longitude}`,
        displayName: result.displayName,
        address: result.address,
        // Pin to the actual GPS fix, not the reverse-geocoder's returned
        // coordinate (it can snap to a road/area centroid away from the
        // user). The address text above still describes this exact point.
        lat: latitude,
        lng: longitude,
        parts: result.parts,
      });
    } catch (err: any) {
      Alert.alert('Location', err?.message || 'Couldn\'t fetch GPS location');
    } finally {
      // Single exit point — the old code had three separate setSearching(false)
      // calls and could leave the spinner stuck on some paths.
      setSearching(false);
    }
  };

  const handleSave = async () => {
    if (!addressLine1.trim()) {
      Alert.alert('Required', 'Please enter or search your address.');
      return;
    }
    if (!coords) {
      Alert.alert('Required', 'Pick your address from search or drop the pin on the map so we have an exact location.');
      return;
    }

    const label = selectedLabel === 'other'
      ? (customLabel.trim() || 'Other')
      : LABEL_OPTIONS.find((l) => l.id === selectedLabel)?.label || 'Other';

    const fullAddress = [addressLine1, apartment, landmark, city, stateName, pincode]
      .filter(Boolean)
      .join(', ');

    const newAddress = {
      label,
      address: fullAddress,
      lat: coords?.lat ?? 0,
      lng: coords?.lng ?? 0,
      icon: LABEL_OPTIONS.find((l) => l.id === selectedLabel)?.icon || 'location',
      apartment: apartment.trim() || undefined,
      landmark: landmark.trim() || undefined,
      city: city.trim() || undefined,
      state: stateName.trim() || undefined,
      pincode: pincode.trim() || undefined,
      // First saved address becomes primary by default; otherwise leave the
      // user's current primary alone and let them flip it from SavedAddresses.
      isPrimary: (user?.savedAddresses?.length ?? 0) === 0,
    };

    setSaving(true);
    try {
      const existingAddresses = (user?.savedAddresses || []).map((a) => ({
        label: a.label,
        address: a.address,
        lat: a.lat,
        lng: a.lng,
        icon: a.icon,
        isPrimary: !!a.isPrimary,
        houseNo: a.houseNo,
        apartment: a.apartment,
        landmark: a.landmark,
        city: a.city,
        state: a.state,
        pincode: a.pincode,
      }));
      await dispatch(updateSavedAddresses([...existingAddresses, newAddress])).unwrap();
      await dispatch(fetchProfile());
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to save address');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      {/* Header */}
      <View style={styles.detailsHeader}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.black} />
        </TouchableOpacity>
        <Text style={styles.detailsTitle}>Add Address</Text>
        <View style={{ width: 32 }} />
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={[
          styles.detailsContent,
          { paddingBottom: insets.bottom + vs(Spacing['3xl']) },
        ]}
      >
          {/* Mini-map — pin is dropped automatically from the pincode /
              suggestion; the rider can drag it or tap the map to fine-tune the
              exact spot, which syncs city/state/pincode back from that point. */}
          <View style={styles.mapWrap}>
            <View style={styles.mapBox}>
              <MapView
                ref={mapRef}
                provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
                style={StyleSheet.absoluteFill}
                initialRegion={
                  coords
                    ? regionForCoords(coords)
                    : { latitude: 30.3165, longitude: 78.0322, latitudeDelta: 0.05, longitudeDelta: 0.05 }
                }
                onPress={(e) => handleMapPoint(e.nativeEvent.coordinate)}
              >
                {coords && (
                  <Marker
                    draggable
                    coordinate={{ latitude: coords.lat, longitude: coords.lng }}
                    onDragEnd={(e) => handleMapPoint(e.nativeEvent.coordinate)}
                  />
                )}
              </MapView>

              {!coords && (
                <View pointerEvents="none" style={styles.mapHint}>
                  <Ionicons name="location-outline" size={28} color={Colors.primary} />
                  <Text style={styles.mapHintText}>
                    Enter a pincode or tap the map to drop the pin
                  </Text>
                </View>
              )}
              {pinLoading && (
                <View pointerEvents="none" style={styles.mapLoading}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                </View>
              )}
            </View>
            <Text style={styles.mapCaption}>Drag the pin or tap the map to adjust</Text>
          </View>

          {/* Label Selection */}
          <Text style={styles.sectionLabel}>Save as</Text>
          <View style={styles.labelRow}>
            {LABEL_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.id}
                style={[
                  styles.labelChip,
                  selectedLabel === opt.id && styles.labelChipActive,
                ]}
                onPress={() => setSelectedLabel(opt.id)}
              >
                <Ionicons
                  name={opt.icon as any}
                  size={16}
                  color={selectedLabel === opt.id ? '#fff' : '#7D8A95'}
                />
                <Text
                  style={[
                    styles.labelChipText,
                    selectedLabel === opt.id && styles.labelChipTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {selectedLabel === 'other' && (
            <TextInput
              style={styles.fieldInput}
              placeholder="Label name (e.g. Gym, Mom's house)"
              placeholderTextColor="#B0B0B0"
              value={customLabel}
              onChangeText={setCustomLabel}
            />
          )}

          {/* Address — live search. Typing queries the geo proxy in real time;
              picking a result auto-fills City / State / Pincode and drops the
              map pin. */}
          <Text style={styles.sectionLabel}>Address</Text>

          <Text style={styles.fieldLabel}>Address *</Text>
          <View style={styles.addrFieldRow}>
            <Ionicons name="search" size={18} color="#B0B0B0" style={{ marginRight: 8 }} />
            <TextInput
              ref={addressInputRef}
              style={styles.addrFieldInput}
              placeholder="Search building, area, street or pincode"
              placeholderTextColor="#B0B0B0"
              value={addressLine1}
              onChangeText={setAddressLine1}
              onFocus={() => setAddressFocused(true)}
              returnKeyType="search"
            />
            {searching ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : addressLine1.length > 0 ? (
              <TouchableOpacity
                onPress={() => {
                  setAddressLine1('');
                  setAddressFocused(true);
                }}
                hitSlop={8}
              >
                <Ionicons name="close-circle" size={18} color="#B0B0B0" />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Use current location (GPS → reverse geocode → autofill) */}
          <TouchableOpacity
            style={styles.useCurrentBtn}
            onPress={handleUseCurrentLocation}
            activeOpacity={0.7}
          >
            <Ionicons name="navigate" size={18} color={Colors.primary} />
            <Text style={styles.useCurrentText}>Use my current location</Text>
          </TouchableOpacity>

          {/* Real-time suggestions — shown only while the field is focused. */}
          {addressFocused && (suggestions.length > 0 || searchError) && (
            <View style={styles.suggestionsDropdown}>
              {suggestions.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  style={styles.ddRow}
                  onPress={() => applySuggestion(s)}
                >
                  <Ionicons name="location-outline" size={18} color={Colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ddText} numberOfLines={2}>
                      {s.address}
                    </Text>
                    {(s.parts.city || s.parts.pincode) && (
                      <Text style={styles.ddSub} numberOfLines={1}>
                        {[s.parts.city, s.parts.state, s.parts.pincode].filter(Boolean).join(' · ')}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
              {searchError && !searching && suggestions.length === 0 && (
                <Text style={styles.ddError}>
                  Couldn't search: {searchError}. You can still type the address by hand.
                </Text>
              )}
            </View>
          )}

          <Text style={styles.fieldLabel}>Apartment / Society (Optional)</Text>
          <TextInput
            style={styles.fieldInput}
            placeholder="e.g. Lotus Apartments, Sector 15"
            placeholderTextColor="#B0B0B0"
            value={apartment}
            onChangeText={setApartment}
          />

          <Text style={styles.fieldLabel}>Landmark (Optional)</Text>
          <TextInput
            style={styles.fieldInput}
            placeholder="e.g. Near City Mall"
            placeholderTextColor="#B0B0B0"
            value={landmark}
            onChangeText={setLandmark}
          />

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>City</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="City"
                placeholderTextColor="#B0B0B0"
                value={city}
                onChangeText={setCity}
              />
            </View>
            <View style={{ width: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>State</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="State"
                placeholderTextColor="#B0B0B0"
                value={stateName}
                onChangeText={setStateName}
              />
            </View>
          </View>

          <Text style={styles.fieldLabel}>Pincode</Text>
          <TextInput
            style={styles.fieldInput}
            placeholder="Pincode"
            placeholderTextColor="#B0B0B0"
            value={pincode}
            onChangeText={(t) => {
              userEditedPincodeRef.current = true;
              setPincode(t);
            }}
            keyboardType="number-pad"
            maxLength={6}
          />

          {/* Save Button */}
          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>Save Address</Text>
            )}
          </TouchableOpacity>
      </KeyboardAwareScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundWhite },

  // ── Search Step ──
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: s(Spacing.base),
    paddingVertical: vs(Spacing.sm),
    gap: s(Spacing.sm),
  },
  backBtn: { width: s(36), height: s(36), alignItems: 'center', justifyContent: 'center' },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: s(BorderRadius.base),
    height: vs(48),
    paddingHorizontal: s(Spacing.md),
  },
  searchIcon: { marginRight: s(8) },
  searchInput: { flex: 1, fontFamily: 'Inter-Regular', fontSize: fs(16), color: Colors.black, paddingVertical: 0 },
  clearBtn: { padding: s(4) },

  currentLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: s(Spacing.xl),
    paddingVertical: vs(Spacing.base),
    gap: s(Spacing.md),
  },
  currentLocIcon: {
    width: s(44),
    height: s(44),
    borderRadius: s(22),
    backgroundColor: 'rgba(0,151,179,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentLocInfo: { flex: 1 },
  currentLocTitle: { fontFamily: 'Inter-SemiBold', fontSize: fs(16), color: Colors.black },
  currentLocSub: { fontFamily: 'Inter-Regular', fontSize: fs(13), color: '#7D8A95', marginTop: vs(2) },

  divider: { height: vs(8), backgroundColor: '#F5F5F5' },

  suggestionsHeader: {
    paddingHorizontal: s(Spacing.xl),
    paddingTop: vs(Spacing.base),
    paddingBottom: vs(Spacing.sm),
  },
  suggestionsTitle: { fontFamily: 'Inter-SemiBold', fontSize: fs(14), color: '#7D8A95', textTransform: 'uppercase', letterSpacing: 0.5 },

  suggestionsList: { flex: 1 },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: s(Spacing.xl),
    paddingVertical: vs(14),
    gap: s(Spacing.md),
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  suggestionIcon: {
    width: s(36),
    height: s(36),
    borderRadius: s(18),
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionText: { flex: 1, fontFamily: 'Inter-Regular', fontSize: fs(15), color: Colors.black, lineHeight: fs(22) },
  suggestionSub: { fontFamily: 'Inter-Regular', fontSize: fs(12), color: '#7D8A95', marginTop: vs(2) },

  manualRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: s(Spacing.xl),
    paddingVertical: vs(16),
    gap: s(Spacing.md),
  },

  noResults: { alignItems: 'center', paddingTop: vs(40), gap: s(8) },
  noResultsText: { fontFamily: 'Inter-Regular', fontSize: fs(15), color: '#7D8A95' },
  enterManuallyBtn: { marginTop: vs(12) },
  enterManuallyText: { fontFamily: 'Inter-SemiBold', fontSize: fs(16), color: Colors.primary },

  // ── Details Step ──
  detailsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: s(Spacing.base),
    paddingVertical: vs(Spacing.md),
  },
  detailsTitle: { fontFamily: 'Inter-Bold', fontSize: fs(20), color: Colors.black },
  detailsContent: {
    paddingHorizontal: s(Spacing.xl),
    paddingBottom: vs(Spacing['3xl']),
  },

  mapWrap: { marginBottom: vs(Spacing.xl) },
  mapBox: {
    height: vs(180),
    borderRadius: s(BorderRadius.lg),
    overflow: 'hidden',
    backgroundColor: '#E5EEF0',
    borderWidth: 1,
    borderColor: 'rgba(0,151,179,0.2)',
  },
  mapHint: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: s(24),
    gap: s(6),
  },
  mapHintText: { fontFamily: 'Inter-Regular', fontSize: fs(13), color: '#7D8A95', textAlign: 'center' },
  mapLoading: {
    position: 'absolute',
    top: vs(10),
    right: s(10),
    backgroundColor: '#fff',
    borderRadius: s(16),
    padding: s(6),
    elevation: 2,
  },
  mapCaption: { fontFamily: 'Inter-Regular', fontSize: fs(12), color: '#7D8A95', marginTop: vs(6), textAlign: 'center' },

  sectionLabel: {
    fontFamily: 'Inter-Bold', fontSize: fs(18), color: Colors.black,
    marginBottom: vs(Spacing.md), marginTop: vs(Spacing.md),
  },
  labelRow: {
    flexDirection: 'row',
    gap: s(Spacing.sm),
    marginBottom: vs(Spacing.lg),
    flexWrap: 'wrap',
  },
  labelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(6),
    paddingHorizontal: s(16),
    paddingVertical: vs(10),
    borderRadius: s(24),
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    backgroundColor: '#fff',
  },
  labelChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  labelChipText: { fontFamily: 'Inter-Medium', fontSize: fs(14), color: '#7D8A95' },
  labelChipTextActive: { color: '#fff' },

  fieldLabel: { fontFamily: 'Inter-SemiBold', fontSize: fs(14), color: '#7D8A95', marginBottom: vs(6), marginTop: vs(Spacing.md) },
  fieldInput: {
    height: vs(52),
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: s(BorderRadius.base),
    paddingHorizontal: s(Spacing.base),
    fontFamily: 'Inter-Regular',
    fontSize: fs(16),
    color: Colors.black,
  },
  row: { flexDirection: 'row' },

  // Live-search Address field + inline suggestion dropdown.
  addrFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: vs(52),
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: s(BorderRadius.base),
    paddingHorizontal: s(Spacing.base),
  },
  addrFieldInput: { flex: 1, fontFamily: 'Inter-Regular', fontSize: fs(16), color: Colors.black, paddingVertical: 0 },
  useCurrentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(8),
    paddingVertical: vs(10),
    marginTop: vs(4),
  },
  useCurrentText: { fontFamily: 'Inter-SemiBold', fontSize: fs(14), color: Colors.primary },
  suggestionsDropdown: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: s(BorderRadius.base),
    marginTop: vs(4),
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  ddRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(10),
    paddingVertical: vs(12),
    paddingHorizontal: s(12),
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F2',
  },
  ddText: { flex: 1, fontFamily: 'Inter-Regular', fontSize: fs(14), color: Colors.black, lineHeight: fs(20) },
  ddSub: { fontFamily: 'Inter-Regular', fontSize: fs(12), color: '#7D8A95', marginTop: vs(2) },
  ddError: { fontFamily: 'Inter-Regular', fontSize: fs(13), color: '#E07B00', padding: s(12) },

  saveBtn: {
    height: vs(58),
    backgroundColor: Colors.primary,
    borderRadius: s(BorderRadius.button),
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: vs(Spacing['2xl']),
  },
  saveBtnText: { fontFamily: 'Inter-SemiBold', fontSize: fs(18), color: '#fff' },
});
