import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View, ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import { Colors } from '@/theme';

export interface LatLng {
  lat: number;
  lng: number;
}

interface OsmMapProps {
  pickup?: string | LatLng;
  dropoff?: string | LatLng;
  driver?: LatLng | null;
  showRoute?: boolean;
  style?: ViewStyle;
  fallbackCenter?: LatLng;
}

const DEFAULT_CENTER: LatLng = { lat: 28.4595, lng: 77.0266 };

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OSRM = 'https://router.project-osrm.org/route/v1/driving';

const geocodeCache = new Map<string, LatLng | null>();

async function geocode(query: string): Promise<LatLng | null> {
  if (!query) return null;
  const key = query.trim().toLowerCase();
  if (geocodeCache.has(key)) return geocodeCache.get(key)!;
  try {
    const url = `${NOMINATIM}?format=json&limit=1&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'ukcaar-customer/1.0' },
    });
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      const hit: LatLng = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      geocodeCache.set(key, hit);
      return hit;
    }
  } catch (e) {
    console.warn('geocode failed:', e);
  }
  geocodeCache.set(key, null);
  return null;
}

async function resolve(value?: string | LatLng): Promise<LatLng | null> {
  if (!value) return null;
  if (typeof value === 'object' && 'lat' in value) return value;
  return geocode(value);
}

async function fetchRoute(from: LatLng, to: LatLng): Promise<LatLng[]> {
  try {
    const url = `${OSRM}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    const coords = data?.routes?.[0]?.geometry?.coordinates;
    if (Array.isArray(coords)) {
      return coords.map((c: [number, number]) => ({ lat: c[1], lng: c[0] }));
    }
  } catch (e) {
    console.warn('route failed:', e);
  }
  return [from, to];
}

function dotIcon(bg: string): string {
  return `<div style="width:16px;height:16px;border-radius:50%;background:${bg};border:3px solid #fff;box-shadow:0 2px 4px rgba(0,0,0,0.35)"></div>`;
}

function carIconHtml(): string {
  return '<div style="width:40px;height:40px;border-radius:50%;background:#fff;border:2px solid #3B5BDB;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.3);font-size:22px">\uD83D\uDE97</div>';
}

function buildHtml(
  center: LatLng,
  pickup: LatLng | null,
  dropoff: LatLng | null,
  driver: LatLng | null,
  greenRoute: LatLng[],
  blueRoute: LatLng[]
): string {
  const layers: string[] = [];

  if (greenRoute.length >= 2) {
    layers.push(
      `L.polyline(${JSON.stringify(greenRoute.map(c => [c.lat, c.lng]))},{color:'#22C55E',weight:6,opacity:0.95,lineCap:'round',lineJoin:'round'}).addTo(map);`
    );
  }

  if (blueRoute.length >= 2) {
    layers.push(
      `L.polyline(${JSON.stringify(blueRoute.map(c => [c.lat, c.lng]))},{color:'#3B5BDB',weight:5,opacity:0.9,lineCap:'round',lineJoin:'round'}).addTo(map);`
    );
  }

  if (pickup) {
    layers.push(
      `L.marker([${pickup.lat},${pickup.lng}],{icon:L.divIcon({className:'',html:'${dotIcon('#3B5BDB')}',iconSize:[16,16],iconAnchor:[8,8]})}).addTo(map);`
    );
  }

  if (dropoff) {
    layers.push(
      `L.marker([${dropoff.lat},${dropoff.lng}],{icon:L.divIcon({className:'',html:'${dotIcon('#16A34A')}',iconSize:[16,16],iconAnchor:[8,8]})}).addTo(map);`
    );
  }

  if (driver) {
    layers.push(
      `L.marker([${driver.lat},${driver.lng}],{icon:L.divIcon({className:'',html:'${carIconHtml()}',iconSize:[40,40],iconAnchor:[20,20]})}).addTo(map);`
    );
  }

  const all: LatLng[] = [...greenRoute, ...blueRoute];
  if (pickup) all.push(pickup);
  if (dropoff) all.push(dropoff);
  if (driver) all.push(driver);

  const fitJs =
    all.length >= 2
      ? `map.fitBounds(${JSON.stringify(all.map(c => [c.lat, c.lng]))},{padding:[60,60],maxZoom:17});`
      : '';

  return `<!DOCTYPE html><html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>html,body,#m{height:100%;margin:0;padding:0;background:#e8eef5}.leaflet-control-attribution{font-size:9px}</style>
</head><body>
<div id="m"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var map = L.map('m',{zoomControl:false,attributionControl:true}).setView([${center.lat},${center.lng}],16);
var primary = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',{maxZoom:19,subdomains:'abcd',attribution:'&copy; OSM &copy; CARTO'});
var fallback = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OSM'});
primary.on('tileerror', function(){ if(!map.hasLayer(fallback)){ map.removeLayer(primary); fallback.addTo(map); } });
primary.addTo(map);
${layers.join('\n')}
${fitJs}
</script></body></html>`;
}

export const OsmMap: React.FC<OsmMapProps> = ({
  pickup,
  dropoff,
  driver,
  showRoute = true,
  style,
  fallbackCenter = DEFAULT_CENTER,
}) => {
  const [pickupLL, setPickupLL] = useState<LatLng | null>(null);
  const [dropoffLL, setDropoffLL] = useState<LatLng | null>(null);
  const [greenRoute, setGreenRoute] = useState<LatLng[]>([]);
  const [blueRoute, setBlueRoute] = useState<LatLng[]>([]);
  const [loading, setLoading] = useState(true);

  const pickupKey = typeof pickup === 'string' ? pickup : pickup ? `${pickup.lat},${pickup.lng}` : '';
  const dropoffKey = typeof dropoff === 'string' ? dropoff : dropoff ? `${dropoff.lat},${dropoff.lng}` : '';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [p, d] = await Promise.all([resolve(pickup), resolve(dropoff)]);
      if (cancelled) return;
      setPickupLL(p);
      setDropoffLL(d);
      if (showRoute && p && d) {
        const r = await fetchRoute(p, d);
        if (!cancelled) setGreenRoute(r);
      } else {
        setGreenRoute([]);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [pickupKey, dropoffKey, showRoute]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (driver && pickupLL) {
        const r = await fetchRoute(driver, pickupLL);
        if (!cancelled) setBlueRoute(r);
      } else {
        setBlueRoute([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [driver?.lat, driver?.lng, pickupLL?.lat, pickupLL?.lng]);

  const html = useMemo(() => {
    const center = pickupLL || dropoffLL || driver || fallbackCenter;
    return buildHtml(center, pickupLL, dropoffLL, driver || null, greenRoute, blueRoute);
  }, [
    pickupLL,
    dropoffLL,
    driver?.lat,
    driver?.lng,
    greenRoute,
    blueRoute,
    fallbackCenter.lat,
    fallbackCenter.lng,
  ]);

  return (
    <View style={[styles.container, style]}>
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        style={styles.web}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        androidLayerType="hardware"
        setSupportMultipleWindows={false}
      />
      {loading && (
        <View style={styles.loading} pointerEvents="none">
          <ActivityIndicator color={Colors.primary} />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#e8eef5',
    overflow: 'hidden',
  },
  web: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  loading: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 20,
    padding: 8,
  },
});
