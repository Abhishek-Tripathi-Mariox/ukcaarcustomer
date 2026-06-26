import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Platform,
  ActivityIndicator,
} from 'react-native';
import MapView, {
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
  Region,
} from 'react-native-maps';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/theme';
import { CabIcon } from '@/components/icons/HomeIcons';
import {
  joinRouteRoom,
  leaveRouteRoom,
  setSocketListeners,
} from '@/services/socketService';
import { routeService, type ScheduledRouteApi } from '@/services/routeService';

interface LatLng {
  lat: number;
  lng: number;
}

interface ScheduledTrackScreenProps {
  navigation: any;
  route: { params: { routeId: string } };
}

/**
 * Live tracking for scheduled-shuttle riders. Subscribes to the
 * `route:<id>` socket room and renders the driver's live GPS pin on top
 * of the route's stop polyline. The backend's `driver:location` handler
 * fans every position update from any driver approved on this route into
 * this room, so the bus moves on the rider's map as the driver moves.
 */
export const ScheduledTrackScreen: React.FC<ScheduledTrackScreenProps> = ({
  navigation,
  route,
}) => {
  const insets = useSafeAreaInsets();
  const { routeId } = route.params;

  const [routeDoc, setRouteDoc] = useState<ScheduledRouteApi | null>(null);
  const [driverPos, setDriverPos] = useState<LatLng | null>(null);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);

  // Pull route details so we know the stop coordinates for the polyline
  // and so the map can fit the corridor on first render.
  useEffect(() => {
    let cancelled = false;
    routeService
      .getById(routeId)
      .then((r) => {
        if (!cancelled) setRouteDoc(r);
      })
      .catch(() => {
        /* keep null — empty map is better than a crash */
      });
    return () => {
      cancelled = true;
    };
  }, [routeId]);

  // Join the route room and listen for the bus's GPS pings. We don't
  // filter by driverId here — admins may swap drivers mid-route and the
  // rider should keep seeing whoever's actively running it.
  useEffect(() => {
    joinRouteRoom(routeId);
    setSocketListeners({
      onDriverLocation: (payload) => {
        if (payload.routeId !== routeId) return;
        setDriverPos({ lat: payload.location.lat, lng: payload.location.lng });
        setLastUpdate(payload.timestamp ?? Date.now());
      },
    });
    return () => leaveRouteRoom(routeId);
  }, [routeId]);

  const stopCoords: LatLng[] = useMemo(() => {
    const stops = routeDoc?.stops ?? [];
    return [...stops]
      .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
      .map((s) => ({ lat: s.lat, lng: s.lng }));
  }, [routeDoc]);

  const mapRef = useRef<MapView | null>(null);
  const initialRegion: Region | null = useMemo(() => {
    const c = driverPos ?? stopCoords[0] ?? null;
    if (!c) return null;
    return {
      latitude: c.lat,
      longitude: c.lng,
      latitudeDelta: 0.1,
      longitudeDelta: 0.1,
    };
  }, [driverPos?.lat, driverPos?.lng, stopCoords]);

  // Re-fit the camera to include the bus and the next few stops whenever
  // either moves enough to matter.
  useEffect(() => {
    if (!mapRef.current || !stopCoords.length) return;
    const coords: { latitude: number; longitude: number }[] = stopCoords.map(
      (c) => ({ latitude: c.lat, longitude: c.lng }),
    );
    if (driverPos) coords.push({ latitude: driverPos.lat, longitude: driverPos.lng });
    const t = setTimeout(() => {
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: 120, right: 80, bottom: 200, left: 80 },
        animated: true,
      });
    }, 250);
    return () => clearTimeout(t);
  }, [driverPos?.lat, driverPos?.lng, stopCoords]);

  const lastUpdateLabel = useMemo(() => {
    if (!lastUpdate) return null;
    const secs = Math.max(0, Math.round((Date.now() - lastUpdate) / 1000));
    if (secs < 5) return 'just now';
    if (secs < 60) return `${secs}s ago`;
    return `${Math.round(secs / 60)} min ago`;
  }, [lastUpdate]);

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="#0097B3" barStyle="light-content" />

      {initialRegion ? (
        <MapView
          ref={(r) => {
            mapRef.current = r;
          }}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          style={StyleSheet.absoluteFill}
          initialRegion={initialRegion}
          showsUserLocation={false}
          showsMyLocationButton={false}
          showsCompass={false}
          toolbarEnabled={false}
        >
          {stopCoords.map((c, idx) => (
            <Marker
              key={`stop-${idx}`}
              coordinate={{ latitude: c.lat, longitude: c.lng }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
            >
              <View
                style={[
                  styles.stopPin,
                  idx === 0 && styles.stopPinFirst,
                  idx === stopCoords.length - 1 && styles.stopPinLast,
                ]}
              />
            </Marker>
          ))}
          {stopCoords.length > 1 && (
            <Polyline
              coordinates={stopCoords.map((c) => ({
                latitude: c.lat,
                longitude: c.lng,
              }))}
              strokeColor={Colors.primary}
              strokeWidth={4}
            />
          )}
          {driverPos && (
            <Marker
              key="bus"
              coordinate={{ latitude: driverPos.lat, longitude: driverPos.lng }}
              anchor={{ x: 0.5, y: 0.5 }}
              flat
              tracksViewChanges={false}
            >
              <CabIcon size={38} rotation={0} />
            </Marker>
          )}
        </MapView>
      ) : (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      )}

      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Track Vehicle</Text>
        <View style={styles.backBtn} />
      </View>

      <View style={[styles.statusCard, { bottom: insets.bottom + 20 }]}>
        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor: driverPos ? '#00C896' : '#9CA3AF',
              },
            ]}
          />
          <Text style={styles.statusText}>
            {driverPos
              ? 'Vehicle is live'
              : 'Waiting for the driver to come online…'}
          </Text>
        </View>
        {!!lastUpdateLabel && driverPos && (
          <Text style={styles.statusSub}>Last update {lastUpdateLabel}</Text>
        )}
        {!!routeDoc?.name && (
          <Text style={styles.routeName} numberOfLines={1}>
            {routeDoc.name}
          </Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FB' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#0097B3',
    paddingBottom: 16,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 18,
    lineHeight: 28,
    color: '#FFFFFF',
  },

  stopPin: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  stopPinFirst: {
    backgroundColor: Colors.primary,
    borderColor: '#FFFFFF',
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  stopPinLast: {
    backgroundColor: '#EF4444',
    borderColor: '#FFFFFF',
    width: 16,
    height: 16,
    borderRadius: 8,
  },

  statusCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 15,
    color: '#101828',
  },
  statusSub: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: '#6A7282',
    marginTop: 4,
    marginLeft: 18,
  },
  routeName: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: Colors.primary,
    marginTop: 8,
  },
});
