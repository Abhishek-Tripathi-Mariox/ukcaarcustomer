import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  Image,
  Platform,
  TextInput,
} from 'react-native';
import MapView, {
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
  Region,
} from 'react-native-maps';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { Colors, Shadow } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { estimateFare, setSelectedVehicle, setPendingPromoCode } from '@/store/slices/rideSlice';
import { FlashIcon, CabIcon } from '@/components/icons/HomeIcons';
import { TaxiAIcon, TaxiBIcon } from '@/components/icons/TaxiIcons';
import { ClockSmallIcon, UserCircleSmallIcon } from '@/components/icons/RideIcons';
import { rideService, NearbyVehicleType } from '@/services/rideService';
import { paymentService } from '@/services/paymentService';
import { driverService, NearbyDriver } from '@/services/driverService';
import { geoService, GeoDirections } from '@/services/geoService';
import { fs, s, vs } from '@/theme/responsive';

const motorbikePng = require('../../../assets/select-ride/motorbike.png');
const autoPng = require('../../../assets/select-ride/auto.png');

interface SelectRideScreenProps {
  navigation: any;
  route: {
    // Optional: "Book Again" pushes this screen with no params at all and the
    // addresses are read back from the ride slice instead.
    params?: {
      pickup?: string;
      dropoff?: string;
      bookingForName?: string;
    };
  };
}

// Admin-defined types carry no "wheels" field, so the art is picked from the
// code AND display name. Admins name types freely ("Two Wheeler", "Auto
// Rickshaw", "Scooty"), which the old code-only bike/auto match missed — every
// type then fell through to the car icon.
const TWO_WHEELER = /\b(bike|moto|motorcycle|scoot|two[\s-]?wheel|2[\s-]?wheel|2w)/i;
const THREE_WHEELER = /\b(auto|rick|tuk|three[\s-]?wheel|3[\s-]?wheel|3w)/i;
// Vans/minibuses. Kept OUT of THREE_WHEELER: "Tempo Traveller" is a 12-seater
// van, and matching it as an auto-rickshaw showed the wrong art AND (because
// the seat fallback shares these patterns) "3 Seats" instead of 12.
const VAN = /\b(tempo|traveller|traveler|van|minibus|mini[\s-]?bus)/i;
const PREMIUM = /\b(premium|luxury|prime|suv|xl|muv|black|exec)/i;

function renderVehicleArt(
  type: { code: string; name?: string },
  size: number,
): React.ReactElement {
  const c = `${type.code} ${type.name ?? ''}`;
  if (TWO_WHEELER.test(c)) {
    return (
      <Image
        source={motorbikePng}
        style={{ width: size, height: size * 0.78 }}
        resizeMode="contain"
      />
    );
  }
  if (THREE_WHEELER.test(c)) {
    return (
      <Image
        source={autoPng}
        style={{ width: size, height: size * 0.85 }}
        resizeMode="contain"
      />
    );
  }
  // Vans have no dedicated art — the car silhouette reads better for them
  // than the premium sedan, so check this before PREMIUM ("XL"/"traveller").
  if (VAN.test(c)) {
    return <TaxiBIcon size={size} />;
  }
  if (PREMIUM.test(c)) {
    return <TaxiAIcon size={size} />;
  }
  return <TaxiBIcon size={size} />;
}

// Fallback seat count derived from the type code, used only when the backend
// hasn't been given an explicit `seats` capacity for the vehicle type yet.
function seatsForCode(code: string): number {
  const c = code.toLowerCase();
  if (TWO_WHEELER.test(c)) return 1;
  if (THREE_WHEELER.test(c)) return 3;
  // Vans before the car sizes — a Tempo Traveller seats 12, not 4/6.
  if (VAN.test(c)) return 12;
  if (c.includes('muv') || c.includes('suv')) return 6;
  if (c.includes('hatch') || c.includes('sedan')) return 4;
  return 4;
}

// Prefer the admin-configured capacity from the backend; fall back to the
// code heuristic so existing vehicle types (no `seats` set) still show a value.
function seatsForType(type: { code: string; name?: string; seats?: number }): number {
  return typeof type.seats === 'number' && type.seats > 0
    ? type.seats
    : seatsForCode(`${type.code} ${type.name ?? ''}`);
}

export const SelectRideScreen: React.FC<SelectRideScreenProps> = ({
  navigation,
  route,
}) => {
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();
  const { pickup: pickupLoc, dropoff: dropoffLoc, estimateData, loading } =
    useAppSelector((s) => s.ride);
  // "Book Again" (RideDetails / ScheduledTripSummary) navigates here with NO
  // params, so destructuring route.params directly threw "Cannot read property
  // 'pickup' of undefined" and crashed the screen. Fall back to whatever the
  // ride slice already holds.
  const { pickup, dropoff } = {
    pickup: route.params?.pickup ?? pickupLoc?.address ?? '',
    dropoff: route.params?.dropoff ?? dropoffLoc?.address ?? '',
  };

  // Single combined list of nearby vehicle types (instant + private merged).
  // The Instant/Private split was a backend convenience that didn't help the
  // rider — they just want to see every car they can book with its fare.
  const [nearbyTypes, setNearbyTypes] = useState<NearbyVehicleType[]>([]);
  const [typesLoading, setTypesLoading] = useState(true);
  const [typesError, setTypesError] = useState<string | null>(null);
  const [selectedRide, setSelectedRide] = useState<string | null>(null);

  // Live nearby drivers for the map.
  const [nearbyDrivers, setNearbyDrivers] = useState<NearbyDriver[]>([]);
  // Driving route between pickup and dropoff.
  const [directions, setDirections] = useState<GeoDirections | null>(null);

  // Initial fare estimate as soon as we have endpoints — uses the backend's
  // Haversine fallback so the cards have *something* to show while the real
  // routing request is in flight. The directions effect below re-dispatches
  // with the routed distance/duration once they land so the cards reflect
  // the same time the user sees on the map chip.
  // Outside-service-area refusal from the backend geofence (only enforced
  // once admins draw a "Service area" zone). Shown in place of the ride list
  // and blocks Book, so the rider finds out here rather than after booking.
  const [areaError, setAreaError] = useState<string | null>(null);
  useEffect(() => {
    if (pickupLoc && dropoffLoc) {
      setAreaError(null);
      dispatch(estimateFare({ pickup: pickupLoc, dropoff: dropoffLoc }))
        .unwrap()
        .catch((msg: unknown) => {
          if (typeof msg === 'string' && /service area/i.test(msg)) setAreaError(msg);
        });
    }
  }, [pickupLoc, dropoffLoc, dispatch]);

  // Pull nearby vehicle types as soon as we have a pickup location.
  useEffect(() => {
    if (!pickupLoc) return;
    let cancelled = false;
    setTypesLoading(true);
    setTypesError(null);
    rideService
      .getNearbyVehicleTypes(pickupLoc.lat, pickupLoc.lng)
      .then((res) => {
        if (cancelled) return;
        // Merge tiers into one list and surface every bookable type. Sort
        // by availableCount so the most plentiful option leads.
        const merged = [...(res.instant ?? []), ...(res.private ?? [])].sort(
          (a, b) => b.availableCount - a.availableCount,
        );
        setNearbyTypes(merged);
        if (merged.length) setSelectedRide(merged[0].code);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('[select-ride] nearby types fetch failed:', err);
        setTypesError('Could not load nearby cars. Try again in a moment.');
      })
      .finally(() => {
        if (!cancelled) setTypesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pickupLoc?.lat, pickupLoc?.lng]);

  // Poll nearby drivers every 15s so the map markers reflect reality.
  useEffect(() => {
    if (!pickupLoc) return;
    let cancelled = false;
    const fetchDrivers = async () => {
      try {
        const list = await driverService.getNearby(pickupLoc.lat, pickupLoc.lng, 8);
        if (!cancelled) setNearbyDrivers(list);
      } catch {
        /* keep prior list */
      }
    };
    fetchDrivers();
    const t = setInterval(fetchDrivers, 15000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [pickupLoc?.lat, pickupLoc?.lng]);

  // Fetch the driving route polyline once we know both endpoints. As soon
  // as the route resolves, re-dispatch the fare estimate with the real
  // distance + duration so the per-vehicle cards match the route chip on
  // the map (otherwise the cards would keep showing the Haversine number,
  // e.g. "164 min" vs the routed "99 min" the chip already displays).
  useEffect(() => {
    if (!pickupLoc || !dropoffLoc) return;
    let cancelled = false;
    geoService
      .directions(
        { lat: pickupLoc.lat, lng: pickupLoc.lng },
        { lat: dropoffLoc.lat, lng: dropoffLoc.lng },
      )
      .then((d) => {
        if (cancelled || !d) return;
        setDirections(d);
        const distanceKm = d.distanceMeters / 1000;
        const durationMin = d.durationSeconds / 60;
        if (Number.isFinite(distanceKm) && Number.isFinite(durationMin)) {
          dispatch(
            estimateFare({
              pickup: pickupLoc,
              dropoff: dropoffLoc,
              distance: distanceKm,
              duration: durationMin,
            }),
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [pickupLoc?.lat, pickupLoc?.lng, dropoffLoc?.lat, dropoffLoc?.lng, dispatch]);

  const estimates = estimateData?.estimates || [];

  const getEstimateForType = (rideCode: string) => {
    const exact = estimates.find((e) => e.rideType === rideCode);
    if (exact) return exact;
    const c = rideCode.toLowerCase();
    if (c.includes('premium') || c.includes('luxury'))
      return estimates.find((e) => e.rideType === 'premium');
    if (c.includes('suv') || c.includes('muv') || c.includes('xl'))
      return estimates.find((e) => e.rideType === 'xl');
    if (c.includes('electric')) return estimates.find((e) => e.rideType === 'electric');
    if (c.includes('comfort') || c.includes('sedan'))
      return estimates.find((e) => e.rideType === 'comfort');
    return estimates.find((e) => e.rideType === 'economy');
  };

  const selectedType = nearbyTypes.find((t) => t.code === selectedRide);
  const selectedEstimate = selectedRide ? getEstimateForType(selectedRide) : null;

  // Map viewport — fit pickup, dropoff, and the route polyline. Falls back to
  // pickup-only when we don't have a dropoff yet.
  const mapRef = useRef<MapView | null>(null);
  const initialRegion: Region = useMemo(() => {
    const lat = pickupLoc?.lat ?? 30.3165;
    const lng = pickupLoc?.lng ?? 78.0322;
    return {
      latitude: lat,
      longitude: lng,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };
  }, [pickupLoc?.lat, pickupLoc?.lng]);

  // Fit map to pickup + dropoff once both are known so the user sees the
  // whole route, not just one endpoint.
  useEffect(() => {
    if (!pickupLoc || !dropoffLoc || !mapRef.current) return;
    const coords = [
      { latitude: pickupLoc.lat, longitude: pickupLoc.lng },
      { latitude: dropoffLoc.lat, longitude: dropoffLoc.lng },
    ];
    // Small delay so the map has laid out before we ask it to fit.
    const t = setTimeout(() => {
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
        animated: true,
      });
    }, 300);
    return () => clearTimeout(t);
  }, [pickupLoc?.lat, pickupLoc?.lng, dropoffLoc?.lat, dropoffLoc?.lng]);

  const polylineCoords = useMemo(() => {
    if (!directions?.polyline?.length) return [];
    return directions.polyline.map((p) => ({ latitude: p.lat, longitude: p.lng }));
  }, [directions]);

  const distanceKm = directions
    ? directions.distanceMeters / 1000
    : selectedEstimate?.estimatedDistance ?? 0;
  const durationMin = directions
    ? Math.round(directions.durationSeconds / 60)
    : selectedEstimate?.estimatedDuration ?? 0;

  // ── Promo code ──
  // Validated up front against /payments/promo/validate so the rider sees the
  // discount before booking; the backend re-checks and applies it on
  // createRide (FindingDriver forwards the code). A code tapped on the Home
  // "Offers" rail arrives via the ride slice and is applied automatically.
  const pendingPromo = useAppSelector((s) => s.ride.pendingPromoCode);
  const [promoInput, setPromoInput] = useState(pendingPromo ?? '');
  const [promoApplied, setPromoApplied] = useState<{
    code: string;
    type: 'percentage' | 'fixed';
    value: number;
    maxDiscount?: number;
    minFare?: number;
  } | null>(null);
  const [promoBusy, setPromoBusy] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);

  const applyPromo = async (codeArg?: string) => {
    const code = (codeArg ?? promoInput).trim().toUpperCase();
    if (!code || promoBusy) return;
    setPromoBusy(true);
    setPromoError(null);
    try {
      const res = await paymentService.validatePromo(code);
      setPromoApplied(res.data);
      setPromoInput(code);
    } catch (err: any) {
      setPromoApplied(null);
      setPromoError(err?.response?.data?.message ?? 'Invalid or expired promo code');
    } finally {
      setPromoBusy(false);
    }
  };
  const clearPromo = () => {
    setPromoApplied(null);
    setPromoError(null);
    setPromoInput('');
  };
  useEffect(() => {
    if (pendingPromo) applyPromo(pendingPromo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPromo]);

  // Preview of what the backend will take off (it caps at maxDiscount and at
  // 50% of the fare, and ignores the code under minFare).
  const promoDiscount = (() => {
    if (!promoApplied || !selectedEstimate) return 0;
    const fare = selectedEstimate.estimatedFare;
    if (promoApplied.minFare && fare < promoApplied.minFare) return 0;
    const cap =
      promoApplied.maxDiscount && promoApplied.maxDiscount > 0
        ? promoApplied.maxDiscount
        : Infinity;
    const raw =
      promoApplied.type === 'percentage'
        ? (fare * promoApplied.value) / 100
        : promoApplied.value;
    return Math.max(0, Math.min(raw, cap, fare * 0.5));
  })();

  const handleConfirm = () => {
    if (!selectedType || areaError) return;
    dispatch(setSelectedVehicle(selectedType.code));
    // The code has been consumed by this booking — don't re-apply it next time.
    dispatch(setPendingPromoCode(null));
    const est = selectedEstimate;
    navigation.navigate('FindingDriver', {
      pickup,
      dropoff,
      promoCode: promoApplied?.code,
      rideType: {
        id: selectedType.code,
        name: selectedType.name,
        seats: seatsForType(selectedType),
        tier: selectedType.tier,
        price: est ? `₹${est.estimatedFare.toFixed(2)}` : '₹0.00',
        estimatedFare: est?.estimatedFare || 0,
        baseFare: est?.baseFare || 0,
        distanceFare: est?.distanceFare || 0,
        timeFare: est?.timeFare || 0,
        distance: est?.estimatedDistance || 0,
        duration: est?.estimatedDuration || 0,
        isPrivate: selectedType.tier === 'private',
      },
    });
  };

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      {/* ── Real Google Map ── */}
      <View style={styles.mapSection}>
        <MapView
          ref={(r) => {
            mapRef.current = r;
          }}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          style={StyleSheet.absoluteFill}
          initialRegion={initialRegion}
          showsUserLocation
          showsMyLocationButton={false}
          showsCompass={false}
          toolbarEnabled={false}
        >
          {pickupLoc && (
            <Marker
              coordinate={{ latitude: pickupLoc.lat, longitude: pickupLoc.lng }}
              anchor={{ x: 0.5, y: 1 }}
              title="Pickup"
              description={pickup}
            >
              <View style={styles.pickupMarker}>
                <View style={styles.pickupMarkerDot} />
              </View>
            </Marker>
          )}
          {dropoffLoc && (
            <Marker
              coordinate={{ latitude: dropoffLoc.lat, longitude: dropoffLoc.lng }}
              anchor={{ x: 0.5, y: 1 }}
              title="Drop"
              description={dropoff}
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

          {nearbyDrivers
            .filter((d) => d.location && Number.isFinite(d.location.lat))
            .map((d) => (
              <Marker
                key={d.id}
                coordinate={{ latitude: d.location.lat, longitude: d.location.lng }}
                anchor={{ x: 0.5, y: 0.5 }}
                flat
                tracksViewChanges={false}
              >
                <CabIcon size={30} rotation={0} />
              </Marker>
            ))}
        </MapView>

        {/* Route summary chip — distance + ETA from Google/OSRM directions */}
        {directions && (
          <View style={styles.routeChip} pointerEvents="none">
            <Ionicons name="navigate" size={12} color={Colors.white} />
            <Text style={styles.routeChipText}>
              {distanceKm.toFixed(1)} km · {durationMin} min
            </Text>
          </View>
        )}

        {/* Back button */}
        <TouchableOpacity
          style={[styles.backButton, { top: insets.top + vs(10) }]}
          onPress={() => navigation.goBack()}
          activeOpacity={0.85}
        >
          <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* ── Bottom Sheet ── */}
      <View style={styles.bottomSheet}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>Available rides</Text>

        {areaError ? (
          <View style={{ paddingVertical: 32, paddingHorizontal: 24, alignItems: 'center' }}>
            <Ionicons name="alert-circle-outline" size={30} color="#C62828" />
            <Text style={[styles.loadingText, { textAlign: 'center', color: '#C62828' }]}>
              {areaError}
            </Text>
          </View>
        ) : (typesLoading || (loading && estimates.length === 0)) ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>
              {typesLoading ? 'Looking for nearby cars...' : 'Calculating fares...'}
            </Text>
          </View>
        ) : typesError ? (
          <View style={{ paddingVertical: 32, paddingHorizontal: 24 }}>
            <Text style={[styles.loadingText, { textAlign: 'center' }]}>{typesError}</Text>
          </View>
        ) : nearbyTypes.length === 0 ? (
          <View style={{ paddingVertical: 32, paddingHorizontal: 24 }}>
            <Text style={[styles.loadingText, { textAlign: 'center' }]}>
              No cars within 7 km right now. Please try again in a moment.
            </Text>
          </View>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {nearbyTypes.map((type, idx) => {
              const est = getEstimateForType(type.code);
              const isSelected = selectedRide === type.code;
              const price = est
                ? `₹ ${est.estimatedFare.toFixed(2)}`
                : `₹ —`;
              const duration = est ? `${est.estimatedDuration} min` : '— min';
              const seats = seatsForType(type);

              return (
                <TouchableOpacity
                  key={type._id}
                  style={[styles.rideCard, isSelected && styles.rideCardSelected]}
                  onPress={() => setSelectedRide(type.code)}
                  activeOpacity={0.7}
                >
                  <View style={styles.rideImageBox}>
                    {renderVehicleArt(type, 64)}
                  </View>

                  <View style={styles.rideInfo}>
                    <Text style={styles.rideName}>{type.name}</Text>
                    <View style={styles.rideDetails}>
                      <Text style={styles.ridePrice}>{price}</Text>
                      <View style={{ marginLeft: 10 }}>
                        <ClockSmallIcon size={13} />
                      </View>
                      <Text style={styles.rideDetailText}>{duration}</Text>
                      <View style={{ marginLeft: 10 }}>
                        <UserCircleSmallIcon size={13} />
                      </View>
                      <Text style={styles.rideDetailText}>{seats} Seats</Text>
                    </View>
                    <Text style={styles.availableText}>
                      {type.availableCount} nearby
                    </Text>
                  </View>

                  <View
                    style={[styles.radioOuter, isSelected && styles.radioOuterSelected]}
                  >
                    {isSelected && <View style={styles.radioInner} />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        <View style={[styles.bookSection, { paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.promoRow}>
            <TextInput
              style={styles.promoInput}
              value={promoInput}
              onChangeText={(t) => {
                setPromoInput(t);
                if (promoApplied) setPromoApplied(null);
                if (promoError) setPromoError(null);
              }}
              placeholder="Have a promo code?"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!promoBusy}
              returnKeyType="done"
              onSubmitEditing={() => applyPromo()}
            />
            <TouchableOpacity
              style={[
                styles.promoApply,
                (!promoInput.trim() || promoBusy) && styles.promoApplyDisabled,
              ]}
              onPress={() => (promoApplied ? clearPromo() : applyPromo())}
              disabled={!promoInput.trim() || promoBusy}
              activeOpacity={0.8}
            >
              {promoBusy ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <Text style={styles.promoApplyText}>{promoApplied ? 'Remove' : 'Apply'}</Text>
              )}
            </TouchableOpacity>
          </View>
          {!!promoError && <Text style={styles.promoError}>{promoError}</Text>}
          {promoApplied && (
            <View style={styles.rewardBanner}>
              <Text style={styles.rewardBannerText}>
                🏷️ {promoApplied.code} applied
                {promoDiscount > 0
                  ? ` — ₹${promoDiscount.toFixed(0)} off`
                  : promoApplied.minFare && selectedEstimate
                  ? ` — needs a fare of ₹${promoApplied.minFare}+`
                  : ''}
              </Text>
            </View>
          )}
          {!!selectedEstimate?.loyaltyDiscount && selectedEstimate.loyaltyDiscount > 0 && (
            <View style={styles.rewardBanner}>
              <Text style={styles.rewardBannerText}>
                🎁 Reward applied — ₹{selectedEstimate.loyaltyDiscount.toFixed(0)} off
              </Text>
            </View>
          )}
          <TouchableOpacity
            style={[
              styles.bookButton,
              (!selectedRide || !!areaError) && styles.bookButtonDisabled,
            ]}
            onPress={handleConfirm}
            disabled={!selectedRide || !!areaError}
            activeOpacity={0.85}
          >
            <FlashIcon size={18} color={Colors.white} />
            <Text style={styles.bookText}>Book {selectedType?.name ?? 'Cab'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  /* ── Map ── */
  mapSection: {
    height: '45%',
    position: 'relative',
    backgroundColor: Colors.mapBackground,
    overflow: 'hidden',
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
  routeChip: {
    position: 'absolute',
    top: vs(50),
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(6),
    backgroundColor: Colors.primary,
    paddingHorizontal: s(14),
    paddingVertical: vs(7),
    borderRadius: s(92),
    ...Shadow.sm,
  },
  routeChipText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(13),
    color: Colors.white,
  },
  backButton: {
    position: 'absolute',
    left: s(16),
    width: s(40),
    height: s(40),
    borderRadius: s(20),
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.sm,
  },

  /* ── Bottom Sheet ── */
  bottomSheet: {
    flex: 1,
    backgroundColor: Colors.white,
    borderTopLeftRadius: s(24),
    borderTopRightRadius: s(24),
    marginTop: vs(-20),
    paddingTop: vs(12),
    ...Shadow.top,
  },
  sheetHandle: {
    width: s(40),
    height: vs(4),
    borderRadius: s(2),
    backgroundColor: '#D9D9D9',
    alignSelf: 'center',
    marginBottom: vs(10),
  },
  sheetTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(16),
    color: '#1E293B',
    paddingHorizontal: s(20),
    marginBottom: vs(8),
  },
  scrollContent: {
    paddingHorizontal: s(20),
    paddingBottom: vs(10),
    paddingTop: vs(4),
  },

  availableText: {
    marginTop: vs(2),
    fontFamily: 'Inter-Regular',
    fontSize: fs(11),
    color: '#10B981',
  },
  loadingText: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(14),
    color: Colors.textMuted,
    marginTop: vs(12),
  },

  /* ── Ride Cards ── */
  rideCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: s(16),
    padding: s(14),
    marginBottom: vs(12),
    borderWidth: 1.5,
    borderColor: '#EAEAEA',
    position: 'relative',
  },
  rideCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(0, 151, 179, 0.06)',
  },
  rideImageBox: {
    width: s(70),
    height: vs(50),
    marginRight: s(14),
    alignItems: 'center',
    justifyContent: 'center',
  },
  rideInfo: {
    flex: 1,
  },
  rideName: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(16),
    color: Colors.textPrimary,
    marginBottom: vs(4),
  },
  rideDetails: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ridePrice: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(14),
    color: Colors.textPrimary,
  },
  rideDetailText: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(13),
    color: Colors.textMuted,
    marginLeft: s(4),
  },
  radioOuter: {
    width: s(22),
    height: s(22),
    borderRadius: s(11),
    borderWidth: 2,
    borderColor: '#D0D0D0',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: s(8),
  },
  radioOuterSelected: {
    borderColor: Colors.primary,
  },
  radioInner: {
    width: s(11),
    height: s(11),
    borderRadius: s(5.5),
    backgroundColor: Colors.primary,
  },

  /* ── Book Cab ── */
  bookSection: {
    paddingHorizontal: s(20),
    paddingBottom: vs(24),
    paddingTop: vs(10),
  },
  rewardBanner: {
    backgroundColor: '#E8F5E9',
    borderRadius: s(10),
    paddingVertical: vs(8),
    paddingHorizontal: s(12),
    marginBottom: vs(10),
    alignItems: 'center',
  },
  rewardBannerText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(13),
    color: '#2E7D32',
  },
  promoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: vs(10),
  },
  promoInput: {
    flex: 1,
    height: vs(42),
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: s(10),
    paddingHorizontal: s(12),
    fontFamily: 'Inter-Regular',
    fontSize: fs(13),
    color: Colors.textPrimary,
    backgroundColor: Colors.white,
  },
  promoApply: {
    marginLeft: s(8),
    height: vs(42),
    minWidth: s(72),
    paddingHorizontal: s(14),
    borderRadius: s(10),
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promoApplyDisabled: {
    opacity: 0.5,
  },
  promoApplyText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(13),
    color: Colors.white,
  },
  promoError: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(12),
    color: '#C62828',
    marginBottom: vs(8),
  },
  bookButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: s(12),
    height: vs(58),
    gap: s(10),
  },
  bookButtonDisabled: {
    opacity: 0.5,
  },
  bookText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(18),
    color: Colors.white,
  },
});
