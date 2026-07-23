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
    const paymentMethod = (ride.paymentMethod || '—').toString().toUpperCase();
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
        <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
        <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBoxBtn}>
            <Ionicons name="chevron-back" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Trip Summary</Text>
          <View style={{ width: s(34) }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0097B3" />
        </View>
      </View>
    );
  }

  if (!ride || !breakdown) return null;

  const inv = shortInvoiceId(ride._id);

  // This screen used to be completed-only in spirit but reachable for any
  // ride, so a CANCELLED trip rendered "Thanks for riding", a full fare and a
  // downloadable tax invoice for a journey that never happened.
  const isCancelled = ride.status === 'cancelled';
  const cxl: any = (ride as any).cancellation ?? {};
  const cancelledByLabel =
    cxl.cancelledBy === 'driver'
      ? 'Cancelled by driver'
      : cxl.cancelledBy === 'system'
      ? 'Cancelled — no driver found'
      : cxl.cancelledBy === 'admin'
      ? 'Cancelled by support'
      : 'Cancelled by you';
  const refundAmt = Number(cxl.refundAmount ?? 0);
  const feeAmt = Number(cxl.fee ?? 0);
  // The rating the rider gave, shown read-only on completed trips.
  const givenRating = Number((ride as any).rating?.customerToDriver ?? 0);

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBoxBtn}
          activeOpacity={0.8}
        >
          <Ionicons name="chevron-back" size={20} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isCancelled ? 'Cancelled Ride' : 'Trip Summary'}</Text>
        <View style={{ width: s(34) }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {isCancelled ? (
          <View style={styles.cancelBanner}>
            <Ionicons name="close-circle" size={20} color="#EF4444" />
            <View style={{ flex: 1 }}>
              <Text style={styles.cancelBannerTitle}>{cancelledByLabel}</Text>
              {!!cxl.reason && (
                <Text style={styles.cancelBannerReason}>{cxl.reason}</Text>
              )}
              {(refundAmt > 0 || feeAmt > 0) && (
                <Text style={styles.cancelBannerMoney}>
                  {[
                    refundAmt > 0 ? `₹${Math.round(refundAmt)} refunded to wallet` : null,
                    feeAmt > 0 ? `₹${Math.round(feeAmt)} cancellation fee` : null,
                  ]
                    .filter(Boolean)
                    .join(' • ')}
                </Text>
              )}
            </View>
          </View>
        ) : (
          <Text style={styles.topSubheading}>Thanks for riding with  UKCAAR!</Text>
        )}

        {/* Ticket Receipt Card */}
        <View style={styles.receiptCard}>
          {/* Trip ID Header */}
          <Text style={styles.tripIdLabel}>Trip ID</Text>
          <Text style={styles.tripIdValue}>{inv || shortInvoiceId(ride._id || '1234')}</Text>

          <View style={styles.divider} />

          {/* Date & Time */}
          <View style={styles.fieldSection}>
            <View style={styles.fieldHeader}>
              <Ionicons name="calendar-outline" size={16} color="#718096" />
              <Text style={styles.fieldLabel}>Date & Time</Text>
            </View>
            <Text style={styles.fieldValueBold}>
              {formatDateTime(ride.completedAt || ride.createdAt)}
            </Text>
          </View>

          {/* Route */}
          <View style={styles.fieldSection}>
            <View style={styles.fieldHeader}>
              <Ionicons name="git-commit-outline" size={16} color="#0097B3" />
              <Text style={styles.fieldLabel}>Route</Text>
            </View>
            <Text style={styles.fieldValueBold}>{ride.pickup?.address || 'Pickup'}</Text>
            <View style={styles.routeConnectorLine} />
            <View style={styles.stopRow}>
              <Ionicons name="location-outline" size={16} color="#718096" style={{ marginRight: 6 }} />
              <Text style={styles.fieldValueBold}>{ride.dropoff?.address || 'Drop-off'}</Text>
            </View>
          </View>

          {/* Duration Distance — meaningless for a trip that never ran */}
          {!isCancelled && (
          <View style={styles.fieldSection}>
            <View style={styles.fieldHeader}>
              <Ionicons name="time-outline" size={16} color="#718096" />
              <Text style={styles.fieldLabel}>Duration Distance</Text>
            </View>
            <Text style={styles.fieldValueBold}>
              {Math.round(breakdown.tripDuration)}min  |  {breakdown.tripDistance.toFixed(1)} km
            </Text>
          </View>
          )}

          {!isCancelled && <View style={styles.divider} />}

          {/* Fare Breakdown — hidden for cancelled rides; the money line lives
              in the banner above (fee / refund), not a fabricated fare. */}
          {!isCancelled && (
          <View style={styles.fieldSection}>
            <View style={styles.fieldHeader}>
              <Ionicons name="receipt-outline" size={18} color="#4A5568" />
              <Text style={styles.fareTitle}>Fare Breakdown</Text>
            </View>
            <View style={styles.fareRow}>
              <Text style={styles.fareItemLabel}>Base Fare</Text>
              <Text style={styles.fareItemValue}>₹{breakdown.baseFare.toFixed(0)}</Text>
            </View>
            {breakdown.distanceCharge > 0 && (
              <View style={styles.fareRow}>
                <Text style={styles.fareItemLabel}>Distance Charge</Text>
                <Text style={styles.fareItemValue}>₹{breakdown.distanceCharge.toFixed(0)}</Text>
              </View>
            )}
            {breakdown.timeCharge > 0 && (
              <View style={styles.fareRow}>
                <Text style={styles.fareItemLabel}>Time Charge</Text>
                <Text style={styles.fareItemValue}>₹{breakdown.timeCharge.toFixed(0)}</Text>
              </View>
            )}
            {breakdown.surgeCharge > 0 && (
              <View style={styles.fareRow}>
                <Text style={styles.fareItemLabel}>Surge Charge</Text>
                <Text style={styles.fareItemValue}>₹{breakdown.surgeCharge.toFixed(0)}</Text>
              </View>
            )}
            {breakdown.tip > 0 && (
              <View style={styles.fareRow}>
                <Text style={styles.fareItemLabel}>Tip</Text>
                <Text style={styles.fareItemValue}>₹{breakdown.tip.toFixed(0)}</Text>
              </View>
            )}
            {breakdown.discount > 0 && (
              <View style={styles.fareRow}>
                <Text style={[styles.fareItemLabel, { color: '#15803D' }]}>Discount</Text>
                <Text style={[styles.fareItemValue, { color: '#15803D' }]}>-₹{breakdown.discount.toFixed(0)}</Text>
              </View>
            )}
          </View>
          )}

          {!isCancelled && <View style={styles.divider} />}

          {/* Total Amount & Payment Method */}
          {!isCancelled && (
          <View style={styles.totalBlock}>
            <View style={styles.totalRow}>
              <Text style={styles.totalTitle}>Total Amount</Text>
              <Text style={styles.totalValueBold}>₹{breakdown.totalFare.toFixed(0)}</Text>
            </View>
            <Text style={styles.paymentMethodLabel}>
              Payment Method : {(ride.paymentMethod || '—').toString().toUpperCase()}
            </Text>
          </View>
          )}

          {/* Your rating — read-only once given (the Activity tab gates the
              Rate Trip button on the same field). */}
          {!isCancelled && givenRating > 0 && (
            <View style={styles.ratingBlock}>
              <Text style={styles.ratingBlockLabel}>Your rating</Text>
              <View style={{ flexDirection: 'row', gap: 3 }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Ionicons
                    key={star}
                    name={star <= givenRating ? 'star' : 'star-outline'}
                    size={16}
                    color="#F5A623"
                  />
                ))}
              </View>
            </View>
          )}

          {/* Decorative tear edge */}
          <View style={styles.tearRow}>
            {Array.from({ length: 18 }).map((_, i) => (
              <View key={i} style={styles.tearDot} />
            ))}
          </View>
        </View>

        {/* PDF receipt — only when a fare was actually paid. A cancelled or
            unpaid ride was still offering a signed-looking tax invoice. */}
        {!isCancelled && ride.paymentStatus !== 'pending' && ride.paymentStatus !== 'failed' && (
        <TouchableOpacity
          style={styles.pdfButton}
          activeOpacity={0.75}
          onPress={() => setInvoiceOpen(true)}
        >
          <Ionicons name="download-outline" size={20} color="#4A5568" />
          <Text style={styles.pdfText}>Get PDF Receipt</Text>
        </TouchableOpacity>
        )}
      </ScrollView>

      {/* Bottom Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={styles.cta}
          onPress={() => navigation.navigate('SelectRide')}
          activeOpacity={0.85}
        >
          <Text style={styles.ctaText}>Book Again</Text>
        </TouchableOpacity>
      </View>

      {/* Invoice preview modal */}
      <Modal
        visible={invoiceOpen}
        animationType="slide"
        onRequestClose={() => setInvoiceOpen(false)}
      >
        <View style={styles.modalContainer}>
          <StatusBar translucent backgroundColor="#0097B3" barStyle="light-content" />
          <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
            <TouchableOpacity
              onPress={() => setInvoiceOpen(false)}
              style={styles.backBoxBtn}
              activeOpacity={0.8}
            >
              <Ionicons name="close" size={20} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Invoice</Text>
            <TouchableOpacity
              onPress={handleShareInvoice}
              style={styles.backBoxBtn}
              activeOpacity={0.8}
            >
              <Ionicons name="share-social-outline" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          <WebView
            originWhitelist={['*']}
            source={{ html: invoiceHtml }}
            style={{ flex: 1, backgroundColor: '#FFFFFF' }}
            javaScriptEnabled={false}
            scalesPageToFit={Platform.OS === 'android'}
          />
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  modalContainer: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.primary,
    paddingHorizontal: s(16),
    paddingVertical: vs(14),
  },
  backBoxBtn: {
    width: s(34),
    height: s(34),
    borderRadius: s(8),
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(18),
    color: Colors.white,
    flex: 1,
    textAlign: 'center',
  },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  content: { paddingHorizontal: s(20) },
  cancelBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: s(10),
    backgroundColor: '#FEF2F2',
    borderRadius: s(12),
    padding: s(14),
    marginBottom: vs(16),
  },
  cancelBannerTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(14.5),
    color: '#B91C1C',
  },
  cancelBannerReason: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(12.5),
    color: '#7F1D1D',
    marginTop: vs(3),
  },
  cancelBannerMoney: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(12.5),
    color: '#B91C1C',
    marginTop: vs(6),
  },
  ratingBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: vs(12),
    paddingTop: vs(12),
    borderTopWidth: 1,
    borderTopColor: '#EDF2F7',
  },
  ratingBlockLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: fs(13),
    color: '#718096',
  },
  topSubheading: {
    fontFamily: 'Inter-Medium',
    fontSize: fs(15),
    color: '#4A5568',
    textAlign: 'center',
    marginTop: vs(16),
    marginBottom: vs(18),
  },

  receiptCard: {
    backgroundColor: Colors.white,
    borderRadius: s(24),
    paddingTop: vs(24),
    paddingHorizontal: s(22),
    paddingBottom: vs(20),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
    overflow: 'hidden',
  },

  tripIdLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(12),
    color: '#718096',
    textAlign: 'center',
  },
  tripIdValue: {
    fontFamily: 'Inter-Bold',
    fontSize: fs(22),
    color: '#2D3748',
    textAlign: 'center',
    marginTop: vs(4),
    letterSpacing: 0.5,
  },

  divider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: vs(16),
  },

  fieldSection: {
    marginBottom: vs(16),
  },
  fieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(6),
  },
  fieldLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(13),
    color: '#718096',
  },
  fieldValueBold: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(15),
    color: '#2D3748',
    marginTop: vs(4),
    marginLeft: s(22),
  },
  routeConnectorLine: {
    width: 2,
    height: vs(16),
    backgroundColor: '#CBD5E0',
    marginLeft: s(28),
    marginVertical: vs(4),
  },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: s(22),
    marginTop: vs(2),
  },

  fareTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: fs(15),
    color: '#2D3748',
  },
  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: vs(10),
    paddingLeft: s(2),
  },
  fareItemLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(13),
    color: '#4A5568',
  },
  fareItemValue: {
    fontFamily: 'Inter-Medium',
    fontSize: fs(14),
    color: '#2D3748',
  },

  totalBlock: {
    marginTop: vs(2),
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: fs(16),
    color: '#2D3748',
  },
  totalValueBold: {
    fontFamily: 'Inter-Bold',
    fontSize: fs(18),
    color: '#2D3748',
  },
  paymentMethodLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(12),
    color: '#718096',
    marginTop: vs(6),
  },

  tearRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: vs(20),
    marginHorizontal: -s(22),
    marginBottom: -vs(25),
    paddingHorizontal: s(6),
  },
  tearDot: {
    width: s(12),
    height: s(12),
    borderRadius: s(6),
    backgroundColor: '#F8FAFC',
  },

  pdfButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: s(8),
    marginTop: vs(32),
    paddingVertical: vs(12),
  },
  pdfText: {
    fontFamily: 'Inter-Medium',
    fontSize: fs(14),
    color: '#4A5568',
  },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: s(16),
    backgroundColor: Colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 8,
  },
  cta: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: s(10),
    height: vs(52),
  },
  ctaText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(16),
    color: Colors.white,
  },
});
