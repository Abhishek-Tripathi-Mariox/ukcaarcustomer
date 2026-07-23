import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  Platform,
} from 'react-native';
import MapView, { PROVIDER_GOOGLE, Region } from 'react-native-maps';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/theme';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setPickup, setDropoff } from '@/store/slices/rideSlice';
import { geoService } from '@/services/geoService';
import { useLiveLocation } from '@/hooks/useLiveLocation';

interface PickOnMapScreenProps {
  navigation: any;
  route?: { params?: { mode?: 'pickup' | 'drop' } };
}

const DEFAULT_DELTA = 0.008;
// Only used when we have no seed AND no GPS yet. The pin is not treated as a
// real choice until it resolves to somewhere the rider actually is.
const FALLBACK_CENTRE = { lat: 28.6692, lng: 77.4538 };

/**
 * Drop-a-pin location picker.
 *
 * The map is the whole screen and the pin is fixed dead-centre — the rider
 * drags the map underneath it, exactly like the mainstream ride apps. Each
 * time the map settles we reverse-geocode the centre so the sheet always
 * names the spot the pin is actually on, and Confirm commits that address
 * as the trip's pickup or drop.
 */
export const PickOnMapScreen: React.FC<any> = ({
  navigation,
  route,
}: PickOnMapScreenProps) => {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const mode = route?.params?.mode ?? 'drop';
  const isPickup = mode === 'pickup';

  const live = useLiveLocation();
  const existingPickup = useAppSelector((s) => s.ride.pickup);
  const existingDropoff = useAppSelector((s) => s.ride.dropoff);

  const mapRef = useRef<MapView | null>(null);
  const geocodeSeq = useRef(0);
  const centreRef = useRef<{ lat: number; lng: number } | null>(null);

  const [address, setAddress] = useState<string>('');
  const [pincode, setPincode] = useState<string | undefined>();
  const [resolving, setResolving] = useState(false);

  // Start where the rider already is: the field being edited if it's set,
  // else their live GPS, else the other field.
  const seed = (isPickup ? existingPickup : existingDropoff)
    ?? (live.coords ? { lat: live.coords.lat, lng: live.coords.lng } : null)
    ?? existingPickup
    ?? null;

  // initialRegion is read once by MapView, so a seed that arrives later (GPS
  // still resolving on a cold start) would never move the camera — the map sat
  // on the hardcoded fallback and happily confirmed an address there.
  const hasSeed = !!seed;
  const [region] = useState<Region>({
    latitude: seed?.lat ?? FALLBACK_CENTRE.lat,
    longitude: seed?.lng ?? FALLBACK_CENTRE.lng,
    latitudeDelta: DEFAULT_DELTA,
    longitudeDelta: DEFAULT_DELTA,
  });
  // True once the rider drags the map themselves — after that we never yank
  // the camera out from under them.
  const userMovedRef = useRef(false);
  const autoCentredRef = useRef(hasSeed);

  const resolveCentre = async (lat: number, lng: number) => {
    const seq = ++geocodeSeq.current;
    centreRef.current = { lat, lng };
    setResolving(true);
    try {
      const res = await geoService.reverse(lat, lng);
      if (seq !== geocodeSeq.current) return;
      setAddress(res?.address || res?.displayName || 'Pinned location');
      setPincode(res?.parts?.pincode);
    } catch {
      if (seq === geocodeSeq.current) setAddress('Pinned location');
    } finally {
      if (seq === geocodeSeq.current) setResolving(false);
    }
  };

  // Name the seeded centre straight away so the sheet isn't blank on open.
  useEffect(() => {
    resolveCentre(region.latitude, region.longitude);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cold start with no seed: as soon as a real GPS fix lands, move the camera
  // there (once, and never after the rider has panned).
  useEffect(() => {
    if (autoCentredRef.current || userMovedRef.current) return;
    if (!live.coords) return;
    autoCentredRef.current = true;
    mapRef.current?.animateToRegion(
      {
        latitude: live.coords.lat,
        longitude: live.coords.lng,
        latitudeDelta: DEFAULT_DELTA,
        longitudeDelta: DEFAULT_DELTA,
      },
      400,
    );
  }, [live.coords?.lat, live.coords?.lng]);

  const recentre = () => {
    if (!live.coords) return;
    mapRef.current?.animateToRegion(
      {
        latitude: live.coords.lat,
        longitude: live.coords.lng,
        latitudeDelta: DEFAULT_DELTA,
        longitudeDelta: DEFAULT_DELTA,
      },
      350,
    );
  };

  const confirm = () => {
    const c = centreRef.current;
    if (!c || resolving) return;
    const loc = {
      address: address || 'Pinned location',
      lat: c.lat,
      lng: c.lng,
      ...(pincode ? { pincode } : {}),
    };
    dispatch(isPickup ? setPickup(loc) : setDropoff(loc));
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      <MapView
        ref={(r) => {
          mapRef.current = r;
        }}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        style={StyleSheet.absoluteFill}
        initialRegion={region}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        onPanDrag={() => {
          userMovedRef.current = true;
        }}
        onRegionChangeComplete={(r) => resolveCentre(r.latitude, r.longitude)}
      />

      {/* Fixed centre pin — the map moves under it. */}
      <View pointerEvents="none" style={styles.pinWrap}>
        <Ionicons name="location" size={44} color={Colors.primary} />
        <View style={styles.pinShadow} />
      </View>

      {/* Back */}
      <TouchableOpacity
        style={[styles.backBtn, { top: insets.top + 12 }]}
        onPress={() => navigation.goBack()}
        activeOpacity={0.85}
      >
        <Ionicons name="arrow-back" size={22} color="#1D262D" />
      </TouchableOpacity>

      {/* Recentre on my location */}
      {!!live.coords && (
        <TouchableOpacity style={styles.recentreBtn} onPress={recentre} activeOpacity={0.85}>
          <Ionicons name="locate" size={20} color={Colors.primary} />
        </TouchableOpacity>
      )}

      {/* Bottom sheet */}
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.handle} />
        <Text style={styles.title}>
          {isPickup ? 'Set your pickup location' : 'Set your destination'}
        </Text>
        <Text style={styles.subtitle}>Drag map to move pin</Text>

        <View style={styles.addressRow}>
          <View style={[styles.addressIcon, isPickup && styles.addressIconPickup]}>
            <Ionicons
              name={isPickup ? 'radio-button-on' : 'square'}
              size={13}
              color={isPickup ? Colors.primary : '#1D262D'}
            />
          </View>
          {resolving ? (
            <View style={styles.resolvingRow}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.resolvingText}>Finding this place…</Text>
            </View>
          ) : (
            <Text style={styles.addressText} numberOfLines={2}>
              {address || 'Move the map to choose a spot'}
            </Text>
          )}
        </View>

        <TouchableOpacity
          style={[styles.confirmBtn, resolving && styles.confirmBtnDisabled]}
          onPress={confirm}
          disabled={resolving}
          activeOpacity={0.85}
        >
          <Text style={styles.confirmText}>
            {isPickup ? 'Confirm pickup' : 'Confirm destination'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.mapBackground },

  // The icon's own tip is its anchor point, so shift up by half its height
  // to land the tip on the map centre rather than the icon's middle.
  pinWrap: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    alignItems: 'center',
    marginTop: -66,
  },
  pinShadow: {
    width: 10,
    height: 4,
    borderRadius: 5,
    backgroundColor: 'rgba(0,0,0,0.25)',
    marginTop: -4,
  },

  backBtn: {
    position: 'absolute',
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  recentreBtn: {
    position: 'absolute',
    right: 16,
    bottom: 250,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },

  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 10,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -3 },
  },
  handle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
    alignSelf: 'center',
    marginBottom: 14,
  },
  title: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 18,
    color: '#1D262D',
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 3,
    marginBottom: 16,
  },

  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 14,
  },
  addressIcon: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addressIconPickup: { borderRadius: 13, backgroundColor: '#F0FBFD' },
  addressText: {
    flex: 1,
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    color: '#1D262D',
    lineHeight: 19,
  },
  resolvingRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  resolvingText: {
    fontFamily: 'Inter-Regular',
    fontSize: 13.5,
    color: '#9CA3AF',
  },

  confirmBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  confirmBtnDisabled: { opacity: 0.5 },
  confirmText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    color: Colors.white,
  },
});
