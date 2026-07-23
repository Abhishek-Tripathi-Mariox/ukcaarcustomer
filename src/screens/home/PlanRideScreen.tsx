import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Modal,
  TextInput,
  FlatList,
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Colors } from '@/theme';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  setPickup,
  setDropoff,
  setRideType,
  clearPickup,
  clearDropoff,
} from '@/store/slices/rideSlice';
import { useLiveLocation } from '@/hooks/useLiveLocation';
import { useDefaultPickup } from '@/hooks/useDefaultPickup';
import { geoService, GeoSuggestion } from '@/services/geoService';
import { routeService } from '@/services/routeService';
import { routeToUi, type ScheduledRoute } from '@/screens/scheduled/ScheduledRouteScreen';

type RideType = 'instant' | 'private' | 'scheduled';
type Field = 'pickup' | 'drop';

interface PlanRideScreenProps {
  navigation: any;
  route?: { params?: { rideType?: RideType } };
}

interface Rider {
  id: string;
  name: string;
}

interface Suggestion {
  id: string;
  title: string;
  address: string;
  lat: number;
  lng: number;
  pincode?: string;
  source: 'saved' | 'search';
  icon?: string;
}

const RIDERS_KEY = 'savedRiders';
const MYSELF: Rider = { id: 'myself', name: 'Myself' };
const EMPTY_SAVED: any[] = [];

const RIDE_LABEL: Record<RideType, string> = {
  instant: 'Instant',
  private: 'Private',
  scheduled: 'Scheduled',
};
const RIDE_ICON: Record<RideType, string> = {
  instant: 'flash',
  private: 'car-sport',
  scheduled: 'calendar',
};

/** Straight-line km between two points — good enough to rank suggestions. */
function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const KM_PER_DEG_LAT = 111;
  const kmPerDegLng = 111 * Math.cos((a.lat * Math.PI) / 180) || 111;
  const dLat = (b.lat - a.lat) * KM_PER_DEG_LAT;
  const dLng = (b.lng - a.lng) * kmPerDegLng;
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

/**
 * "Plan your ride" — the single entry point behind each Home ride tab.
 *
 * Layout follows the mainstream ride-app pattern: ride-type and rider chips
 * on top, then ONE bordered box holding the pickup and drop fields stacked
 * (dot over square), with results listed directly underneath. Typing in
 * either field searches into the same list, so the rider never leaves this
 * screen to set an address.
 */
export const PlanRideScreen: React.FC<any> = ({ navigation, route }: PlanRideScreenProps) => {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();

  const [rideType, setLocalRideType] = useState<RideType>(route?.params?.rideType ?? 'instant');
  const live = useLiveLocation();
  const defaultPickup = useDefaultPickup(live);
  const reduxPickup = useAppSelector((s) => s.ride.pickup);
  const reduxDropoff = useAppSelector((s) => s.ride.dropoff);
  const savedAddresses = useAppSelector(
    (s) => s.auth?.user?.savedAddresses ?? EMPTY_SAVED,
  );

  // Which field the rider is editing — drives both the highlight on the
  // combined box and what a tapped suggestion sets.
  const [activeField, setActiveField] = useState<Field>('drop');
  const [pickupQuery, setPickupQuery] = useState('');
  const [dropQuery, setDropQuery] = useState('');
  const [results, setResults] = useState<Suggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [showSavedOnly, setShowSavedOnly] = useState(false);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchSeq = useRef(0);
  const dropInputRef = useRef<TextInput | null>(null);
  const pickupInputRef = useRef<TextInput | null>(null);

  // ── Rider ("booking for") ──
  const [riders, setRiders] = useState<Rider[]>([MYSELF]);
  const [riderId, setRiderId] = useState('myself');
  const [riderOpen, setRiderOpen] = useState(false);
  const [addingRider, setAddingRider] = useState(false);
  const [newRiderName, setNewRiderName] = useState('');
  const [typeOpen, setTypeOpen] = useState(false);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    dispatch(setRideType(rideType));
  }, [rideType, dispatch]);

  useEffect(() => {
    AsyncStorage.getItem(RIDERS_KEY)
      .then((raw) => {
        if (!raw) return;
        const saved = JSON.parse(raw) as Rider[];
        if (Array.isArray(saved) && saved.length) {
          setRiders([MYSELF, ...saved.filter((r) => r.id !== 'myself')]);
        }
      })
      .catch(() => {});
  }, []);

  const selectedRider = useMemo(
    () => riders.find((r) => r.id === riderId) ?? MYSELF,
    [riders, riderId],
  );

  const saveRider = () => {
    const name = newRiderName.trim();
    if (!name) return;
    const rider: Rider = { id: `r-${Date.now()}`, name };
    const next = [...riders, rider];
    setRiders(next);
    setRiderId(rider.id);
    AsyncStorage.setItem(
      RIDERS_KEY,
      JSON.stringify(next.filter((r) => r.id !== 'myself')),
    ).catch(() => {});
    setNewRiderName('');
    setAddingRider(false);
    setRiderOpen(false);
  };

  // Resolved pickup: what's in Redux, else the default (GPS → primary saved).
  // Once the rider deliberately empties the pickup field we stop falling back
  // to the GPS default — otherwise deleting the text just refills it and the
  // field looks impossible to clear.
  const [pickupCleared, setPickupCleared] = useState(false);
  const pickupLoc = reduxPickup ?? (pickupCleared ? null : defaultPickup.location) ?? null;

  // Field text: while editing a field we show the raw query; otherwise the
  // committed address. Keeps typing responsive without clobbering state.
  const [editing, setEditing] = useState<Field | null>(null);
  // Whether the rider has actually typed since focusing. Focusing SEEDS the
  // query with the committed address so it stays visible and editable — this
  // flag stops that seed from being treated as a search term (and stops the
  // suggestion list flipping to results for the address already in the box).
  const [touched, setTouched] = useState(false);
  const pickupText = editing === 'pickup' ? pickupQuery : pickupLoc?.address ?? '';
  const dropText = editing === 'drop' ? dropQuery : reduxDropoff?.address ?? '';

  /** Focus handler shared by both fields: seed, don't blank. */
  const beginEdit = (field: Field) => {
    setActiveField(field);
    setEditing(field);
    setTouched(false);
    setShowSavedOnly(false);
    const seed =
      field === 'pickup' ? pickupLoc?.address ?? '' : reduxDropoff?.address ?? '';
    if (field === 'pickup') setPickupQuery(seed);
    else setDropQuery(seed);
  };

  /** Leaving a field without picking anything must not leave phantom text —
   *  drop back to whatever is actually committed in Redux. */
  const endEdit = () => {
    setEditing(null);
    setTouched(false);
  };

  // Whenever this screen regains focus — most importantly coming back from
  // PickOnMap — drop out of edit mode so both inputs render the addresses that
  // are actually committed. Without this the field showed the pre-map query
  // (often blank) while Continue booked the pin the rider had just dropped.
  useFocusEffect(
    useCallback(() => {
      setEditing(null);
      setTouched(false);
      setPickupQuery('');
      setDropQuery('');
    }, []),
  );

  /** Typing in a field. Emptying it must also drop the stored location, or the
   *  old address springs back on blur and still gets booked. */
  const onEditText = (field: Field, text: string) => {
    if (field === 'pickup') setPickupQuery(text);
    else setDropQuery(text);
    setTouched(true);
    if (text.trim() === '') {
      if (field === 'pickup') {
        setPickupCleared(true);
        if (reduxPickup) dispatch(clearPickup());
      } else if (reduxDropoff) {
        dispatch(clearDropoff());
      }
    }
  };

  /** The ✕ affordance — same effect as backspacing the field empty, but one tap. */
  const clearField = (field: Field) => {
    if (field === 'pickup') {
      setPickupQuery('');
      setPickupCleared(true);
      if (reduxPickup) dispatch(clearPickup());
    } else {
      setDropQuery('');
      if (reduxDropoff) dispatch(clearDropoff());
    }
    setActiveField(field);
    setEditing(field);
    setTouched(true);
    setShowSavedOnly(false);
  };

  const activeQuery = activeField === 'pickup' ? pickupQuery : dropQuery;
  // Only a query the rider actually typed counts as a search.
  const isSearching = touched && activeQuery.trim().length >= 2;

  const liveCoords = live.coords ? { lat: live.coords.lat, lng: live.coords.lng } : null;
  const originForDistance = liveCoords ?? (pickupLoc ? { lat: pickupLoc.lat, lng: pickupLoc.lng } : null);

  // Saved addresses as suggestions — the idle list when nothing is typed.
  const savedSuggestions: Suggestion[] = useMemo(() => {
    const rows: Suggestion[] = [];
    for (const a of savedAddresses) {
      if (!a.address || (a.lat === 0 && a.lng === 0)) continue;
      rows.push({
        id: `saved-${a.label}-${a.lat}-${a.lng}`,
        title: a.label || a.address,
        address: a.address,
        lat: a.lat,
        lng: a.lng,
        source: 'saved',
        icon: (a.icon as string) || 'bookmark-outline',
      });
    }
    return rows;
  }, [savedAddresses]);

  // Debounced autocomplete on the active field, biased to a 10 km radius so
  // results stay somewhere the rider can actually go today.
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    const q = activeQuery.trim();
    // `touched` gate: focusing seeds the field with its committed address, and
    // that seed must not fire a search for an address the rider already has.
    if (!touched || q.length < 2) {
      setResults([]);
      setSearching(false);
      setSearchError(null);
      return;
    }
    setSearching(true);
    setSearchError(null);
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
            lat: r.lat,
            lng: r.lng,
            pincode: r.parts?.pincode || undefined,
            source: 'search' as const,
          })),
        );
      } catch (err: any) {
        if (seq !== fetchSeq.current) return;
        setResults([]);
        setSearchError(err?.response?.data?.message ?? err?.message ?? 'Search failed');
      } finally {
        if (seq === fetchSeq.current) setSearching(false);
      }
    }, 300);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeQuery, touched, liveCoords?.lat, liveCoords?.lng]);

  const listData: Suggestion[] =
    showSavedOnly ? savedSuggestions
    : isSearching ? results
    : savedSuggestions;

  const commit = (s: Suggestion) => {
    const loc = {
      address: s.address,
      lat: s.lat,
      lng: s.lng,
      ...(s.pincode ? { pincode: s.pincode } : {}),
    };
    if (activeField === 'pickup') {
      dispatch(setPickup(loc));
      setPickupQuery('');
      setPickupCleared(false);
      setEditing(null);
      // Natural next step: they still need a destination.
      if (!reduxDropoff) {
        setActiveField('drop');
        setTimeout(() => dropInputRef.current?.focus(), 80);
      } else {
        // Release focus — otherwise the field keeps the caret while
        // editing===null, so typing silently drove the search behind text
        // that never updated.
        pickupInputRef.current?.blur();
      }
    } else {
      dispatch(setDropoff(loc));
      setDropQuery('');
      setEditing(null);
      dropInputRef.current?.blur();
      Keyboard.dismiss();
    }
    setShowSavedOnly(false);
    setTouched(false);
    setResults([]);
  };

  /** "Use current location" — commits the live GPS fix to the active field,
   *  reverse-geocoding it first when useLiveLocation hasn't named it yet. */
  const useCurrentLocation = async () => {
    if (!live.coords || locating) return;
    setLocating(true);
    const { lat, lng } = live.coords;
    try {
      let address = live.address ?? '';
      let pincode: string | undefined;
      if (!address) {
        const res = await geoService.reverse(lat, lng);
        address = res?.address || res?.displayName || 'Current location';
        pincode = res?.parts?.pincode;
      }
      commit({
        id: 'gps',
        title: 'Current location',
        address,
        lat,
        lng,
        pincode,
        source: 'search',
      });
    } finally {
      setLocating(false);
    }
  };

  // ── Scheduled routes, inline ──
  // On the Scheduled tab the rider shouldn't have to press a button and jump
  // to another screen to discover routes: as soon as both stops are set we
  // list the matching shuttles right here. We pass the stored coords AND
  // pincodes straight through — no re-geocoding of the address strings, which
  // could otherwise resolve to a different place than the one they picked.
  const isScheduled = rideType === 'scheduled';
  const [routes, setRoutes] = useState<ScheduledRoute[] | null>(null);
  const [routesLoading, setRoutesLoading] = useState(false);
  const [routesError, setRoutesError] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);

  // Pincode of the rider's current GPS fix. Resolved once per fix and used as
  // the default area filter so routes serving their town appear before they've
  // set anything at all.
  const [currentPincode, setCurrentPincode] = useState<string | undefined>();
  useEffect(() => {
    if (!isScheduled || !liveCoords || currentPincode) return;
    let cancelled = false;
    geoService
      .reverse(liveCoords.lat, liveCoords.lng)
      .then((res) => {
        if (!cancelled && res?.parts?.pincode) setCurrentPincode(res.parts.pincode);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isScheduled, liveCoords?.lat, liveCoords?.lng, currentPincode]);

  const pickupPincode = (pickupLoc as any)?.pincode ?? currentPincode;
  const dropPincode = (reduxDropoff as any)?.pincode;
  const pickupKey = pickupLoc ? `${pickupLoc.lat},${pickupLoc.lng}` : '';
  const dropKey = reduxDropoff ? `${reduxDropoff.lat},${reduxDropoff.lng}` : '';

  useEffect(() => {
    if (!isScheduled) {
      setRoutes(null);
      setRoutesError(null);
      setSelectedRouteId(null);
      return;
    }
    // Fire with whatever we have. PINCODE is the primary match — the rider is
    // rarely standing exactly on a departure stop, so pure lat/lng misses the
    // "same town" routes they can actually board. Coords are sent too, as a
    // proximity rank. Requiring BOTH stops before searching showed nothing at
    // all, which is what made routes look broken.
    if (!pickupLoc && !reduxDropoff && !currentPincode) {
      setRoutes(null);
      return;
    }
    let cancelled = false;
    setRoutesLoading(true);
    setRoutesError(null);
    routeService
      .listScheduled({
        hasApprovedDriver: false,
        ...(pickupLoc ? { pickup: { lat: pickupLoc.lat, lng: pickupLoc.lng } } : {}),
        ...(reduxDropoff ? { drop: { lat: reduxDropoff.lat, lng: reduxDropoff.lng } } : {}),
        ...(pickupPincode ? { pickupPincode } : {}),
        ...(dropPincode ? { dropPincode } : {}),
      })
      .then((api) => {
        if (cancelled) return;
        const ui = api.map(routeToUi);
        setRoutes(ui);
        setSelectedRouteId((prev) =>
          prev && ui.some((r) => r.id === prev) ? prev : ui.length ? ui[0].id : null,
        );
      })
      .catch((err) => {
        if (cancelled) return;
        setRoutes([]);
        setRoutesError(err?.message ?? 'Could not load routes');
      })
      .finally(() => {
        if (!cancelled) setRoutesLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isScheduled, pickupKey, dropKey, pickupPincode, dropPincode, currentPincode]);

  const selectedRoute = routes?.find((r) => r.id === selectedRouteId) ?? null;

  // Show routes whenever the rider isn't actively searching an address. They
  // narrow as stops are added rather than only appearing at the very end.
  const showRoutes = isScheduled && !isSearching && !showSavedOnly;

  const canContinue = isScheduled
    ? !!selectedRoute
    : !!pickupLoc && !!reduxDropoff;

  const handleContinue = () => {
    if (isScheduled) {
      // Routes are listed inline; the next screen picks boarding/drop stops
      // from the chosen route, so a drop ADDRESS isn't required to continue.
      if (!selectedRoute) return;
      if (pickupLoc && !reduxPickup) dispatch(setPickup(pickupLoc));
      navigation.navigate('ScheduledBoardingDrop', { route: selectedRoute });
      return;
    }
    if (!pickupLoc) {
      setActiveField('pickup');
      return;
    }
    if (!reduxDropoff) {
      setActiveField('drop');
      dropInputRef.current?.focus();
      return;
    }
    if (!reduxPickup) dispatch(setPickup(pickupLoc));

    navigation.navigate('SelectRide', {
      pickup: pickupLoc.address,
      dropoff: reduxDropoff.address,
      bookingForName: selectedRider.id === 'myself' ? undefined : selectedRider.name,
    });
  };

  const renderSuggestion = ({ item }: { item: Suggestion }) => {
    const km = originForDistance ? distanceKm(originForDistance, item) : null;
    return (
      <TouchableOpacity style={styles.sugRow} activeOpacity={0.7} onPress={() => commit(item)}>
        <View style={styles.sugLeft}>
          <Ionicons
            name={(item.icon as any) || (item.source === 'saved' ? 'bookmark-outline' : 'time-outline')}
            size={17}
            color="#6A7282"
          />
          {km != null && Number.isFinite(km) && (
            <Text style={styles.sugKm}>{km < 10 ? km.toFixed(1) : Math.round(km)} km</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.sugTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.sugAddress} numberOfLines={1}>{item.address}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={23} color="#1D262D" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Plan your ride</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Chips: ride type + rider */}
      <View style={styles.chipRow}>
        <TouchableOpacity style={styles.chip} activeOpacity={0.8} onPress={() => setTypeOpen(true)}>
          <Ionicons name={RIDE_ICON[rideType] as any} size={15} color="#1D262D" />
          <Text style={styles.chipText}>{RIDE_LABEL[rideType]}</Text>
          <Ionicons name="chevron-down" size={15} color="#6A7282" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.chip} activeOpacity={0.8} onPress={() => setRiderOpen(true)}>
          <Ionicons name="person-outline" size={15} color="#1D262D" />
          <Text style={styles.chipText}>
            {selectedRider.id === 'myself' ? 'For me' : selectedRider.name}
          </Text>
          <Ionicons name="chevron-down" size={15} color="#6A7282" />
        </TouchableOpacity>
      </View>

      {/* ── Combined pickup + drop box ── */}
      <View style={styles.comboBox}>
        <View style={styles.comboRow}>
          <View style={styles.comboIconCol}>
            <View style={styles.dotOuter}><View style={styles.dotInner} /></View>
          </View>
          <TextInput
            ref={pickupInputRef}
            style={styles.comboInput}
            value={pickupText}
            placeholder="Pickup location"
            placeholderTextColor="#9CA3AF"
            onFocus={() => beginEdit('pickup')}
            onBlur={endEdit}
            onChangeText={(t) => onEditText('pickup', t)}
            numberOfLines={1}
          />
          {!!pickupText && (
            <TouchableOpacity
              onPress={() => clearField('pickup')}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close-circle" size={18} color="#C4C9D0" />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.comboDivider} />

        <View style={styles.comboRow}>
          <View style={styles.comboIconCol}>
            <View style={styles.squareIcon} />
          </View>
          <TextInput
            ref={dropInputRef}
            style={styles.comboInput}
            value={dropText}
            placeholder="Where to?"
            placeholderTextColor="#9CA3AF"
            onFocus={() => beginEdit('drop')}
            onBlur={endEdit}
            onChangeText={(t) => onEditText('drop', t)}
            numberOfLines={1}
          />
          {!!dropText && (
            <TouchableOpacity
              onPress={() => clearField('drop')}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close-circle" size={18} color="#C4C9D0" />
            </TouchableOpacity>
          )}
        </View>

        {/* Active-field highlight rail */}
        <View
          style={[
            styles.activeRail,
            activeField === 'pickup' ? styles.activeRailTop : styles.activeRailBottom,
          ]}
        />
      </View>

      {searchError && <Text style={styles.errorText}>{searchError}</Text>}
      {searching && <ActivityIndicator style={{ marginTop: 12 }} color={Colors.primary} />}

      {/* ── Matching shuttle routes (Scheduled only) ──
          Shown inline the moment both stops are set, so the rider never has
          to press "find routes" and bounce to another screen. Tapping the
          combined box above to edit a stop swaps this back to suggestions. */}
      {showRoutes ? (
        <FlatList
          data={routes ?? []}
          keyExtractor={(r) => r.id}
          keyboardShouldPersistTaps="handled"
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
          ListHeaderComponent={
            <Text style={styles.routesHeading}>
              {routesLoading
                ? 'Finding shuttles…'
                : routes && routes.length
                ? `${routes.length} shuttle route${routes.length === 1 ? '' : 's'}` +
                  (reduxDropoff ? ' for this trip' : ' near you')
                : ''}
            </Text>
          }
          ListEmptyComponent={
            routesLoading ? (
              <ActivityIndicator color={Colors.primary} style={{ marginTop: 20 }} />
            ) : (
              <Text style={styles.emptyText}>
                {routesError
                  ?? 'No shuttle routes serve this area yet. Try a different pickup or drop.'}
              </Text>
            )
          }
          renderItem={({ item: r }) => {
            const active = r.id === selectedRouteId;
            const remaining = Math.max(0, r.capacity - (r.bookedSeats ?? 0));
            return (
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => setSelectedRouteId(r.id)}
                style={[styles.routeCard, active && styles.routeCardActive]}
              >
                <View style={styles.routeTop}>
                  <Text style={styles.routeName} numberOfLines={1}>{r.name}</Text>
                  <Text style={styles.routePrice}>₹{r.price}</Text>
                </View>

                <View style={styles.routeStopRow}>
                  <View style={styles.routeDot} />
                  <Text style={styles.routeStopText} numberOfLines={1}>{r.from}</Text>
                </View>
                <View style={styles.routeConnector} />
                <View style={styles.routeStopRow}>
                  <View style={styles.routeSquare} />
                  <Text style={styles.routeStopText} numberOfLines={1}>{r.to}</Text>
                </View>

                {!!r.nearestPickupStopName && r.nearestPickupStopKm != null && (
                  <View style={styles.routeBoardRow}>
                    <Ionicons name="walk-outline" size={13} color={Colors.primary} />
                    <Text style={styles.routeBoardText} numberOfLines={1}>
                      Boards at {r.nearestPickupStopName} • {r.nearestPickupStopKm.toFixed(1)} km away
                    </Text>
                  </View>
                )}

                <View style={styles.routeMetaRow}>
                  <View style={styles.routeMeta}>
                    <Ionicons name="time-outline" size={13} color="#6A7282" />
                    <Text style={styles.routeMetaText}>
                      {r.durationMin > 0 ? `${r.durationMin} min` : '—'}
                    </Text>
                  </View>
                  <View style={styles.routeMeta}>
                    <Ionicons name="person-outline" size={13} color="#6A7282" />
                    <Text style={styles.routeMetaText}>
                      {r.capacity ? `${remaining}/${r.capacity} left` : '—'}
                    </Text>
                  </View>
                  <View style={styles.routeMeta}>
                    <Ionicons name="calendar-outline" size={13} color="#6A7282" />
                    <Text style={styles.routeMetaText}>{r.nextDeparture}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      ) : (
      /* Address suggestions */
      <FlatList
        data={listData}
        keyExtractor={(s) => s.id}
        renderItem={renderSuggestion}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 16 }}
        style={{ flex: 1 }}
        ListEmptyComponent={
          !searching ? (
            <Text style={styles.emptyText}>
              {activeQuery.trim().length >= 2
                ? `No places found for "${activeQuery.trim()}".`
                : 'Start typing to search, or pick an option below.'}
            </Text>
          ) : null
        }
        ListFooterComponent={
          <View style={styles.actionRows}>
            <TouchableOpacity
              style={[styles.actionRow, !live.coords && { opacity: 0.4 }]}
              activeOpacity={0.75}
              disabled={!live.coords || locating}
              onPress={useCurrentLocation}
            >
              <View style={styles.actionIcon}>
                {locating ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <Ionicons name="locate" size={18} color="#1D262D" />
                )}
              </View>
              <Text style={styles.actionText}>Use current location</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionRow}
              activeOpacity={0.75}
              onPress={() =>
                navigation.navigate('PickOnMap', { mode: activeField })
              }
            >
              <View style={styles.actionIcon}>
                <Ionicons name="location-outline" size={18} color="#1D262D" />
              </View>
              <Text style={styles.actionText}>Set location on map</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionRow}
              activeOpacity={0.75}
              onPress={() => {
                setShowSavedOnly((v) => !v);
                Keyboard.dismiss();
              }}
            >
              <View style={styles.actionIcon}>
                <Ionicons
                  name={showSavedOnly ? 'star' : 'star-outline'}
                  size={18}
                  color={showSavedOnly ? Colors.primary : '#1D262D'}
                />
              </View>
              <Text style={styles.actionText}>
                {showSavedOnly ? 'Showing saved places' : 'Saved places'}
              </Text>
            </TouchableOpacity>
          </View>
        }
      />
      )}

      {/* Continue */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          style={[styles.cta, !canContinue && styles.ctaDisabled]}
          activeOpacity={0.85}
          onPress={handleContinue}
        >
          <Text style={styles.ctaText}>
            {isScheduled ? 'Select Seats' : 'Continue'}
          </Text>
          <Ionicons name="arrow-forward" size={18} color={Colors.white} />
        </TouchableOpacity>
      </View>

      {/* Ride-type dropdown */}
      <Modal visible={typeOpen} transparent animationType="fade" onRequestClose={() => setTypeOpen(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setTypeOpen(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.sheet}>
            <Text style={styles.sheetTitle}>Ride type</Text>
            {(['instant', 'private', 'scheduled'] as RideType[]).map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.sheetRow, t === rideType && styles.sheetRowActive]}
                activeOpacity={0.75}
                onPress={() => {
                  setLocalRideType(t);
                  setTypeOpen(false);
                }}
              >
                <View style={styles.sheetIcon}>
                  <Ionicons name={RIDE_ICON[t] as any} size={18} color={Colors.primary} />
                </View>
                <Text style={styles.sheetLabel}>{RIDE_LABEL[t]}</Text>
                {t === rideType && (
                  <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Rider dropdown */}
      <Modal visible={riderOpen} transparent animationType="fade" onRequestClose={() => setRiderOpen(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setRiderOpen(false)}>
          {/* Lifts the sheet above the keyboard while typing a rider name —
              without it the input sat underneath the keyboard. */}
          <KeyboardAvoidingView behavior="padding">
          <TouchableOpacity activeOpacity={1} style={styles.sheet}>
            <Text style={styles.sheetTitle}>Who is this ride for?</Text>
            {riders.map((r) => {
              const active = r.id === riderId;
              return (
                <TouchableOpacity
                  key={r.id}
                  style={[styles.sheetRow, active && styles.sheetRowActive]}
                  activeOpacity={0.75}
                  onPress={() => {
                    setRiderId(r.id);
                    setRiderOpen(false);
                  }}
                >
                  <View style={styles.riderAvatar}>
                    <Text style={styles.riderAvatarText}>
                      {(r.id === 'myself' ? 'M' : r.name[0] || '?').toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.sheetLabel}>{r.id === 'myself' ? 'Me' : r.name}</Text>
                  {active && <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />}
                </TouchableOpacity>
              );
            })}

            {addingRider ? (
              <View style={styles.addRow}>
                <TextInput
                  style={styles.addInput}
                  value={newRiderName}
                  onChangeText={setNewRiderName}
                  placeholder="Rider's name"
                  placeholderTextColor="#9CA3AF"
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={saveRider}
                />
                <TouchableOpacity style={styles.addSaveBtn} onPress={saveRider}>
                  <Text style={styles.addSaveText}>Save</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.addAnother}
                activeOpacity={0.75}
                onPress={() => setAddingRider(true)}
              >
                <Ionicons name="add-circle-outline" size={20} color={Colors.primary} />
                <Text style={styles.addAnotherText}>Someone else</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: { width: 32, alignItems: 'flex-start' },
  headerTitle: { fontFamily: 'Inter-SemiBold', fontSize: 18, color: '#1D262D' },

  chipRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 20,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  chipText: { fontFamily: 'Inter-Medium', fontSize: 13.5, color: '#1D262D' },

  // Combined pickup + drop box, with the "+" quick-options button beside it
  comboBox: {
    marginHorizontal: 16,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#1D262D',
    borderRadius: 12,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  comboRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  comboIconCol: { width: 30, alignItems: 'center' },
  dotOuter: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#1D262D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotInner: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#1D262D' },
  squareIcon: {
    width: 13,
    height: 13,
    borderRadius: 2,
    backgroundColor: '#1D262D',
  },
  comboInput: {
    flex: 1,
    fontFamily: 'Inter-Medium',
    fontSize: 14.5,
    color: '#1D262D',
    paddingVertical: 13,
    paddingHorizontal: 4,
  },
  comboDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginLeft: 42,
  },
  // Thin accent bar marking which field is being edited.
  activeRail: {
    position: 'absolute',
    left: 0,
    width: 3,
    backgroundColor: Colors.primary,
  },
  activeRailTop: { top: 6, height: '42%' },
  activeRailBottom: { bottom: 6, height: '42%' },

  errorText: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: '#F3482A',
    paddingHorizontal: 20,
    paddingTop: 6,
  },
  emptyText: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: '#9CA3AF',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },

  // Suggestions
  sugRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  sugLeft: { width: 52, alignItems: 'center' },
  sugKm: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 3,
  },
  sugTitle: { fontFamily: 'Inter-Medium', fontSize: 14.5, color: '#1D262D' },
  sugAddress: {
    fontFamily: 'Inter-Regular',
    fontSize: 12.5,
    color: '#9CA3AF',
    marginTop: 2,
  },

  /* ── Inline shuttle route cards (Scheduled) ── */
  routesHeading: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: '#6A7282',
    paddingVertical: 10,
  },
  routeCard: {
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
  },
  routeCardActive: { borderColor: Colors.primary, backgroundColor: '#F7FDFE' },
  routeTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 10,
  },
  routeName: { flex: 1, fontFamily: 'Inter-SemiBold', fontSize: 15, color: '#1D262D' },
  routePrice: { fontFamily: 'Inter-Bold', fontSize: 16, color: Colors.primary },
  routeStopRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  routeDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#1D262D',
  },
  routeSquare: { width: 10, height: 10, borderRadius: 2, backgroundColor: '#1D262D' },
  routeConnector: {
    width: 1,
    height: 12,
    backgroundColor: '#D1D5DB',
    marginLeft: 5,
    marginVertical: 2,
  },
  routeStopText: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: 13.5,
    color: '#374151',
  },
  routeBoardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  routeBoardText: { flex: 1, fontFamily: 'Inter-Regular', fontSize: 12, color: Colors.primary },
  routeMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  routeMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  routeMetaText: { fontFamily: 'Inter-Medium', fontSize: 12, color: '#6A7282' },

  actionRows: { marginTop: 4 },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { fontFamily: 'Inter-Medium', fontSize: 14.5, color: '#1D262D' },

  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    backgroundColor: '#FFFFFF',
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 15,
  },
  ctaDisabled: { opacity: 0.45 },
  ctaText: { fontFamily: 'Inter-SemiBold', fontSize: 16, color: Colors.white },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
  },
  sheetTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    color: '#1D262D',
    marginBottom: 14,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  sheetRowActive: { backgroundColor: '#F0FBFD' },
  sheetIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F0FBFD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetLabel: { flex: 1, fontFamily: 'Inter-Medium', fontSize: 14.5, color: '#1D262D' },
  sheetSub: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  riderAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  riderAvatarText: { fontFamily: 'Inter-Bold', fontSize: 14, color: Colors.white },
  addAnother: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  addAnotherText: { fontFamily: 'Inter-Medium', fontSize: 14, color: Colors.primary },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  addInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: '#1D262D',
  },
  addSaveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  addSaveText: { fontFamily: 'Inter-SemiBold', fontSize: 14, color: Colors.white },
});
