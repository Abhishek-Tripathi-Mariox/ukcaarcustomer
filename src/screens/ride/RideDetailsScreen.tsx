import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  Alert,
  Modal,
  Share,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { WebView } from 'react-native-webview';
import { rideService, Ride } from '@/services/rideService';
import { Colors } from '@/theme';
import { fs, s, vs } from '@/theme/responsive';

interface RideDetailsScreenProps {
  navigation: any;
  route: { params: { rideId: string } };
}

const n = (v: any, fallback = 0): number => {
  const x = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(x) ? x : fallback;
};

const formatDateTime = (iso?: string) => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const date = d.toLocaleDateString('en-IN', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const time = d.toLocaleTimeString('en-IN', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    return `${date} • ${time}`;
  } catch {
    return iso;
  }
};

const formatDate = (iso?: string) => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
};

const shortInvoiceId = (rideId: string) => {
  return `UKC-${rideId.slice(-8).toUpperCase()}`;
};

export const RideDetailsScreen: React.FC<RideDetailsScreenProps> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { rideId } = route.params;
  const [ride, setRide] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [invoiceOpen, setInvoiceOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await rideService.getRide(rideId);
        setRide(r);
      } catch {
        Alert.alert('Error', 'Failed to load ride details.');
        navigation.goBack();
      } finally {
        setLoading(false);
      }
    })();
  }, [rideId, navigation]);

  const breakdown = useMemo(() => {
    if (!ride) return null;
    const baseFare = n(ride.baseFare, 0);
    const distanceCharge = n(ride.distanceFare, 0);
    const timeCharge = n(ride.timeFare, 0);
    const surgeCharge = n(ride.surgeFare, 0);
    const discount = n(ride.discount, 0);
    const tip = n(ride.tip, 0);
    const totalFare = n(
      ride.actualFare ?? ride.estimatedFare,
      baseFare + distanceCharge + timeCharge + surgeCharge - discount + tip,
    );
    const tripDistance = n(ride.actualDistance ?? ride.estimatedDistance, 0);
    const tripDuration = n(ride.actualDuration ?? ride.estimatedDuration, 0);
    return {
      baseFare,
      distanceCharge,
      timeCharge,
      surgeCharge,
      discount,
      tip,
      totalFare,
      tripDistance,
      tripDuration,
    };
  }, [ride]);

  const invoiceHtml = useMemo(() => {
    if (!ride || !breakdown) return '';
    const inv = shortInvoiceId(ride._id);
    const date = formatDate(ride.completedAt || ride.createdAt);
    const rideTypeLabel = (ride.rideType || '').toString().toUpperCase();
    const pickup = ride.pickup?.address || '—';
    const dropoff = ride.dropoff?.address || '—';
    const paymentMethod = (ride.paymentMethod || 'cash').toString().toUpperCase();
    const rows: string[] = [];
    rows.push(
      `<tr><td>Base Fare</td><td class="r">₹${breakdown.baseFare.toFixed(2)}</td></tr>`,
    );
    if (breakdown.distanceCharge > 0)
      rows.push(
        `<tr><td>Distance Charge (${breakdown.tripDistance.toFixed(1)} km)</td><td class="r">₹${breakdown.distanceCharge.toFixed(2)}</td></tr>`,
      );
    if (breakdown.timeCharge > 0)
      rows.push(
        `<tr><td>Time Charge (${Math.round(breakdown.tripDuration)} min)</td><td class="r">₹${breakdown.timeCharge.toFixed(2)}</td></tr>`,
      );
    if (breakdown.surgeCharge > 0)
      rows.push(
        `<tr><td>Surge</td><td class="r">₹${breakdown.surgeCharge.toFixed(2)}</td></tr>`,
      );
    if (breakdown.tip > 0)
      rows.push(`<tr><td>Tip</td><td class="r">₹${breakdown.tip.toFixed(2)}</td></tr>`);
    if (breakdown.discount > 0)
      rows.push(
        `<tr><td>Discount</td><td class="r" style="color:#15803D">-₹${breakdown.discount.toFixed(2)}</td></tr>`,
      );

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Invoice ${inv}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, system-ui, Roboto, Arial, sans-serif; margin: 0; padding: 20px; color: #101828; background: #fff; }
  .wrap { max-width: 720px; margin: 0 auto; }
  .brand { display:flex; align-items:center; justify-content:space-between; border-bottom: 2px solid #0097B3; padding-bottom: 12px; margin-bottom: 18px; }
  .brand h1 { font-size: 22px; margin: 0; color: #0097B3; letter-spacing: 0.5px; }
  .brand .sub { font-size: 12px; color: #6A7282; margin-top: 4px; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; font-size: 13px; }
  .meta .label { color: #6A7282; }
  .meta .val { color: #101828; font-weight: 600; }
  h2 { font-size: 14px; color: #45474A; margin: 18px 0 8px; text-transform: uppercase; letter-spacing: 0.6px; }
  .loc { background: #F8F9FB; border-radius: 10px; padding: 12px 14px; font-size: 13px; }
  .loc .row { display:flex; gap:10px; align-items:flex-start; }
  .loc .row + .row { margin-top: 10px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; margin-top:4px; flex-shrink: 0; }
  .dot.pick { background: #219EBC; }
  .dot.drop { background: #EF4444; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  td { padding: 8px 0; border-bottom: 1px solid #F1F3F5; }
  td.r { text-align: right; font-weight: 600; }
  tr.total td { border-top: 2px solid #101828; border-bottom: none; padding-top: 12px; font-size: 16px; font-weight: 700; color: #0097B3; }
  .foot { margin-top: 24px; font-size: 11px; color: #6A7282; text-align: center; line-height: 1.5; }
  .pill { display: inline-block; background: #EFF6FF; color: #155DFC; font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 999px; }
</style></head>
<body><div class="wrap">
  <div class="brand">
    <div>
      <h1>UKCAAR</h1>
      <div class="sub">Tax Invoice / Bill of Supply</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:13px;font-weight:700">${inv}</div>
      <div style="font-size:12px;color:#6A7282;margin-top:4px">${date}</div>
    </div>
  </div>

  <div class="meta">
    <div><div class="label">Ride Type</div><div class="val"><span class="pill">${rideTypeLabel}</span></div></div>
    <div><div class="label">Payment Method</div><div class="val">${paymentMethod}</div></div>
    <div><div class="label">Distance</div><div class="val">${breakdown.tripDistance.toFixed(1)} km</div></div>
    <div><div class="label">Duration</div><div class="val">${Math.round(breakdown.tripDuration)} min</div></div>
  </div>

  <h2>Trip</h2>
  <div class="loc">
    <div class="row"><div class="dot pick"></div><div><div style="color:#6A7282;font-size:11px">Pickup</div><div>${pickup}</div></div></div>
    <div class="row"><div class="dot drop"></div><div><div style="color:#6A7282;font-size:11px">Drop-off</div><div>${dropoff}</div></div></div>
  </div>

  <h2>Fare Breakdown</h2>
  <table>
    ${rows.join('')}
    <tr class="total"><td>Total</td><td class="r">₹${breakdown.totalFare.toFixed(2)}</td></tr>
  </table>

  <div class="foot">
    Thank you for riding with UKCAAR.<br/>
    This is a system-generated invoice and does not require a signature.
  </div>
</div></body></html>`;
  }, [ride, breakdown]);

  const handleShareInvoice = useCallback(async () => {
    if (!ride || !breakdown) return;
    const inv = shortInvoiceId(ride._id);
    const lines: string[] = [];
    lines.push(`UKCAAR — Invoice ${inv}`);
    lines.push(formatDate(ride.completedAt || ride.createdAt));
    lines.push('');
    lines.push(`Pickup: ${ride.pickup?.address || '—'}`);
    lines.push(`Drop-off: ${ride.dropoff?.address || '—'}`);
    lines.push(`Distance: ${breakdown.tripDistance.toFixed(1)} km`);
    lines.push(`Duration: ${Math.round(breakdown.tripDuration)} min`);
    lines.push(`Payment: ${(ride.paymentMethod || 'cash').toString().toUpperCase()}`);
    lines.push('');
    lines.push('Fare Breakdown');
    lines.push(`  Base Fare: ₹${breakdown.baseFare.toFixed(2)}`);
    if (breakdown.distanceCharge > 0)
      lines.push(`  Distance: ₹${breakdown.distanceCharge.toFixed(2)}`);
    if (breakdown.timeCharge > 0)
      lines.push(`  Time: ₹${breakdown.timeCharge.toFixed(2)}`);
    if (breakdown.surgeCharge > 0)
      lines.push(`  Surge: ₹${breakdown.surgeCharge.toFixed(2)}`);
    if (breakdown.tip > 0) lines.push(`  Tip: ₹${breakdown.tip.toFixed(2)}`);
    if (breakdown.discount > 0)
      lines.push(`  Discount: -₹${breakdown.discount.toFixed(2)}`);
    lines.push(`  Total: ₹${breakdown.totalFare.toFixed(2)}`);
    try {
      await Share.share({
        message: lines.join('\n'),
        title: `UKCAAR Invoice ${inv}`,
      });
    } catch {
      // user dismissed
    }
  }, [ride, breakdown]);

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar translucent backgroundColor="#0097B3" barStyle="light-content" />
        <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Ride Details</Text>
          <View style={styles.backBtn} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0097B3" />
        </View>
      </View>
    );
  }

  if (!ride || !breakdown) return null;

  const inv = shortInvoiceId(ride._id);

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="#0097B3" barStyle="light-content" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ride Details</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
      >
        {/* Summary card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.dateText}>
                {formatDateTime(ride.completedAt || ride.createdAt)}
              </Text>
              <View style={[styles.statusPill, { backgroundColor: 'rgba(0,200,150,0.1)' }]}>
                <View style={[styles.statusDot, { backgroundColor: '#00C896' }]} />
                <Text style={[styles.statusText, { color: '#00C896' }]}>Completed</Text>
              </View>
            </View>
            <View style={styles.typeChip}>
              <Text style={styles.typeChipText}>
                {(ride.rideType || 'economy').toString().toUpperCase()}
              </Text>
            </View>
          </View>

          <View style={styles.invoiceIdRow}>
            <Text style={styles.invoiceIdLabel}>Invoice</Text>
            <Text style={styles.invoiceIdValue}>{inv}</Text>
          </View>

          {/* Locations */}
          <View style={styles.locations}>
            <View style={styles.locationRow}>
              <View style={styles.pickupDot} />
              <View style={styles.locationTexts}>
                <Text style={styles.locationLabel}>Pickup</Text>
                <Text style={styles.locationValue}>{ride.pickup?.address || '—'}</Text>
              </View>
            </View>
            <View style={styles.connector} />
            <View style={styles.locationRow}>
              <Ionicons name="location" size={14} color="#EF4444" style={styles.dropoffIcon} />
              <View style={styles.locationTexts}>
                <Text style={styles.locationLabel}>Drop-off</Text>
                <Text style={styles.locationValue}>{ride.dropoff?.address || '—'}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Trip metrics */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Trip Summary</Text>
          <View style={styles.metricsRow}>
            <View style={styles.metricCell}>
              <Text style={styles.metricLabel}>Distance</Text>
              <Text style={styles.metricValue}>{breakdown.tripDistance.toFixed(1)} km</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricCell}>
              <Text style={styles.metricLabel}>Duration</Text>
              <Text style={styles.metricValue}>{Math.round(breakdown.tripDuration)} min</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricCell}>
              <Text style={styles.metricLabel}>Payment</Text>
              <Text style={styles.metricValue}>
                {(ride.paymentMethod || 'cash').toString().toUpperCase()}
              </Text>
            </View>
          </View>
        </View>

        {/* Fare breakdown */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Fare Breakdown</Text>
          <View style={styles.chargeRow}>
            <Text style={styles.chargeLabel}>Base Fare</Text>
            <Text style={styles.chargeValue}>₹{breakdown.baseFare.toFixed(2)}</Text>
          </View>
          {breakdown.distanceCharge > 0 && (
            <View style={[styles.chargeRow, { marginTop: 10 }]}>
              <Text style={styles.chargeLabel}>Distance Charge</Text>
              <Text style={styles.chargeValue}>₹{breakdown.distanceCharge.toFixed(2)}</Text>
            </View>
          )}
          {breakdown.timeCharge > 0 && (
            <View style={[styles.chargeRow, { marginTop: 10 }]}>
              <Text style={styles.chargeLabel}>Time Charge</Text>
              <Text style={styles.chargeValue}>₹{breakdown.timeCharge.toFixed(2)}</Text>
            </View>
          )}
          {breakdown.surgeCharge > 0 && (
            <View style={[styles.chargeRow, { marginTop: 10 }]}>
              <Text style={[styles.chargeLabel, { color: '#FF6B00' }]}>Surge</Text>
              <Text style={[styles.chargeValue, { color: '#FF6B00' }]}>
                ₹{breakdown.surgeCharge.toFixed(2)}
              </Text>
            </View>
          )}
          {breakdown.tip > 0 && (
            <View style={[styles.chargeRow, { marginTop: 10 }]}>
              <Text style={styles.chargeLabel}>Tip</Text>
              <Text style={styles.chargeValue}>₹{breakdown.tip.toFixed(2)}</Text>
            </View>
          )}
          {breakdown.discount > 0 && (
            <View style={[styles.chargeRow, { marginTop: 10 }]}>
              <Text style={[styles.chargeLabel, { color: '#15803D' }]}>Discount</Text>
              <Text style={[styles.chargeValue, { color: '#15803D' }]}>
                -₹{breakdown.discount.toFixed(2)}
              </Text>
            </View>
          )}
          <View style={styles.totalDivider} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total Paid</Text>
            <Text style={styles.totalValue}>₹{breakdown.totalFare.toFixed(2)}</Text>
          </View>
        </View>

        {/* Invoice actions */}
        <TouchableOpacity
          style={styles.primaryBtn}
          activeOpacity={0.85}
          onPress={() => setInvoiceOpen(true)}
        >
          <Ionicons name="document-text-outline" size={20} color="#FFFFFF" />
          <Text style={styles.primaryBtnText}>View Invoice</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryBtn}
          activeOpacity={0.85}
          onPress={handleShareInvoice}
        >
          <Ionicons name="share-social-outline" size={20} color="#0097B3" />
          <Text style={styles.secondaryBtnText}>Share / Download Invoice</Text>
        </TouchableOpacity>

        <Text style={styles.privacyNote}>
          Driver details are hidden for privacy after a ride is completed.
        </Text>
      </ScrollView>

      {/* Invoice preview modal */}
      <Modal
        visible={invoiceOpen}
        animationType="slide"
        onRequestClose={() => setInvoiceOpen(false)}
      >
        <View style={styles.container}>
          <StatusBar translucent backgroundColor="#0097B3" barStyle="light-content" />
          <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
            <TouchableOpacity
              onPress={() => setInvoiceOpen(false)}
              style={styles.backBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Invoice</Text>
            <TouchableOpacity
              onPress={handleShareInvoice}
              style={styles.backBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="share-social-outline" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          <WebView
            originWhitelist={['*']}
            source={{ html: invoiceHtml }}
            style={{ flex: 1, backgroundColor: '#FFFFFF' }}
            javaScriptEnabled={false}
            // Allow user to scroll, zoom (pinch) the invoice
            scalesPageToFit={Platform.OS === 'android'}
          />
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FB' },
  header: {
    backgroundColor: Colors.primary,
    paddingBottom: vs(16),
    paddingHorizontal: s(12),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: { width: s(40), height: s(40), alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(18),
    lineHeight: fs(28),
    color: Colors.white,
  },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { flex: 1 },
  listContent: { padding: s(16), gap: s(16) },

  card: {
    backgroundColor: Colors.white,
    borderRadius: s(16),
    padding: s(16),
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
    marginBottom: vs(16),
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: vs(12),
  },
  dateText: {
    fontFamily: 'Inter-Medium',
    fontSize: fs(16),
    lineHeight: fs(24),
    color: '#101828',
    marginBottom: vs(8),
  },
  statusPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: s(12),
    paddingVertical: vs(4),
    borderRadius: s(999),
  },
  statusDot: { width: s(8), height: s(8), borderRadius: s(4), marginRight: s(8) },
  statusText: { fontFamily: 'Inter-Medium', fontSize: fs(14), lineHeight: fs(20) },
  typeChip: {
    paddingHorizontal: s(12),
    paddingVertical: vs(4),
    borderRadius: s(10),
    backgroundColor: '#EFF6FF',
    marginLeft: s(8),
  },
  typeChipText: {
    fontFamily: 'Inter-Medium',
    fontSize: fs(13),
    lineHeight: fs(20),
    color: '#155DFC',
  },
  invoiceIdRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: vs(10),
    paddingHorizontal: s(12),
    backgroundColor: '#F8F9FB',
    borderRadius: s(10),
    marginBottom: vs(14),
  },
  invoiceIdLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(13),
    color: '#6A7282',
  },
  invoiceIdValue: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(14),
    color: '#101828',
    letterSpacing: 0.5,
  },
  locations: { marginTop: vs(4) },
  locationRow: { flexDirection: 'row', alignItems: 'flex-start' },
  pickupDot: {
    width: s(12),
    height: s(12),
    borderRadius: s(6),
    backgroundColor: '#219EBC',
    marginTop: vs(5),
    marginRight: s(12),
  },
  dropoffIcon: { marginRight: s(11), marginTop: vs(3), marginLeft: s(-1) },
  locationTexts: { flex: 1 },
  locationLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(12),
    lineHeight: fs(16),
    color: '#6A7282',
  },
  locationValue: {
    fontFamily: 'Inter-Medium',
    fontSize: fs(15),
    lineHeight: fs(22),
    color: '#101828',
  },
  connector: {
    width: s(2),
    height: vs(16),
    backgroundColor: '#E5E7EB',
    marginLeft: s(5),
    marginVertical: vs(4),
  },

  sectionTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(16),
    color: '#101828',
    marginBottom: vs(14),
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metricCell: { flex: 1, alignItems: 'center' },
  metricDivider: { width: 1, height: vs(36), backgroundColor: '#E5E7EB' },
  metricLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(12),
    color: '#6A7282',
    marginBottom: vs(4),
  },
  metricValue: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(15),
    color: '#101828',
  },

  chargeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chargeLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: fs(15),
    color: '#45474A',
  },
  chargeValue: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(15),
    color: '#45474A',
  },
  totalDivider: {
    height: 1,
    backgroundColor: '#E5E5E5',
    marginTop: vs(16),
    marginBottom: vs(12),
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(18),
    color: '#101828',
  },
  totalValue: {
    fontFamily: 'Inter-Bold',
    fontSize: fs(20),
    color: Colors.primary,
  },

  primaryBtn: {
    height: vs(54),
    borderRadius: s(12),
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: s(8),
  },
  primaryBtnText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(16),
    color: Colors.white,
  },
  secondaryBtn: {
    height: vs(54),
    borderRadius: s(12),
    borderWidth: 1.4,
    borderColor: Colors.primary,
    backgroundColor: Colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: s(8),
    marginTop: vs(12),
  },
  secondaryBtnText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(16),
    color: Colors.primary,
  },
  privacyNote: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(12),
    color: '#6A7282',
    textAlign: 'center',
    marginTop: vs(16),
    paddingHorizontal: s(8),
    lineHeight: fs(18),
  },
});
