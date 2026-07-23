import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { driverRatingText } from '@/utils/driverRating';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  Alert,
  Modal,
  Share,
  Platform,
  BackHandler,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { WebView } from 'react-native-webview';
import {
  FilledTickCircleIcon,
  TickIconBackground,
  DownloadIcon,
  ReceiptSerratedEdge,
} from '@/components/icons/PaymentSuccessIcons';
import { RatingSheet } from '@/components/RatingSheet';
import { rideService } from '@/services/rideService';

interface PaymentSuccessScreenProps {
  navigation: any;
  route: {
    params: {
      amount?: string;
      method?: string;
      transactionId?: string;
      rideId?: string;
      openRating?: boolean;
    };
  };
}

const n = (v: any, fallback = 0): number => {
  const x = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(x) ? x : fallback;
};

const formatDate = (iso?: string) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso ?? '—';
  }
};

const shortInvoiceId = (rideId?: string) => {
  if (!rideId) return 'UKC-XXXXXXXX';
  return `UKC-${rideId.slice(-8).toUpperCase()}`;
};

export const PaymentSuccessScreen: React.FC<PaymentSuccessScreenProps> = ({
  navigation,
  route,
}) => {
  const insets = useSafeAreaInsets();
  const amount = route?.params?.amount || '₹ 145';
  const method = route?.params?.method || 'Bank Transfer';
  const transactionId = route?.params?.transactionId || '000085752257';
  const rideId = route?.params?.rideId;
  // Default to opening the rating prompt whenever we have a ride to rate, so
  // the rider lands on the star prompt right after paying — no extra button.
  const openRating = route?.params?.openRating ?? !!rideId;

  const [ratingVisible, setRatingVisible] = useState(openRating);
  const [ride, setRide] = useState<any>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);

  // Pull the latest ride doc so the invoice HTML has real fare breakdown,
  // start/end timestamps, etc. Falls back to params if the fetch fails.
  useEffect(() => {
    if (!rideId) return;
    let cancelled = false;
    rideService
      .getRide(rideId)
      .then((r) => {
        if (cancelled) return;
        setRide(r);
        // Already rated (e.g. rated from RideComplete, then paid, or the user
        // re-landed here) — don't reopen the sheet at 0 stars asking again;
        // the backend now rejects re-rating anyway.
        if (Number((r as any)?.rating?.customerToDriver ?? 0) > 0) {
          setRatingVisible(false);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [rideId]);

  // Hardware back: if the invoice modal is open, dismiss it; otherwise
  // route straight home (this is a terminal screen — backing onto an
  // already-paid RideComplete would be confusing).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (invoiceOpen) {
        setInvoiceOpen(false);
        return true;
      }
      handleDone();
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceOpen]);

  const formattedDateTime = new Date().toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const handleDone = () => {
    navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
  };

  const handleSubmitRating = async (rating: number, feedback: string) => {
    setRatingVisible(false);
    // A 0-star rating is not a real submission (and the backend rejects
    // rating < 1). Skip silently instead of claiming success.
    if (!rideId || rating < 1) {
      handleDone();
      return;
    }
    try {
      await rideService.rateRide(rideId, rating, feedback || undefined);
      Alert.alert('Thank you!', 'Your rating has been submitted.');
    } catch (err: any) {
      // Don't lie "submitted" when it failed — the backend rejects a rating on
      // a ride that isn't `completed` yet (e.g. a cash ride not confirmed), and
      // the old code swallowed that error and still showed a success message.
      Alert.alert(
        'Rating not saved',
        err?.response?.data?.message ||
          'We could not save your rating right now. You can rate this trip later from your ride history.',
      );
    }
    setTimeout(handleDone, 300);
  };

  const cleanAmount = amount.toString().replace(/₹\s*/g, '').trim();
  const methodLabel = (method || 'card').toString().toUpperCase();

  // Build the invoice HTML on the fly from the ride doc. Same shape as
  // the one in RideDetailsScreen so the rider sees a consistent receipt
  // whether they download it now or revisit later from Ride History.
  const invoiceHtml = useMemo(() => {
    const inv = shortInvoiceId(rideId);
    const date = formatDate(ride?.completedAt || ride?.createdAt);
    const pickup = ride?.pickup?.address || '—';
    const dropoff = ride?.dropoff?.address || '—';
    const rideTypeLabel = (ride?.rideType || '').toString().toUpperCase();

    const baseFare = n(ride?.baseFare, 0);
    const distanceCharge = n(ride?.distanceFare, 0);
    const timeCharge = n(ride?.timeFare, 0);
    const surgeCharge = n(ride?.surgeFare, 0);
    const tip = n(ride?.tip, 0);
    const discount = n(ride?.discount, 0);
    const totalFare = n(
      ride?.actualFare ?? ride?.estimatedFare ?? Number(cleanAmount),
      baseFare + distanceCharge + timeCharge + surgeCharge - discount + tip,
    );
    const tripDistance = n(ride?.actualDistance ?? ride?.estimatedDistance, 0);
    const tripDuration = n(ride?.actualDuration ?? ride?.estimatedDuration, 0);

    const rows: string[] = [];
    if (baseFare > 0)
      rows.push(`<tr><td>Base Fare</td><td class="r">₹${baseFare.toFixed(2)}</td></tr>`);
    if (distanceCharge > 0)
      rows.push(
        `<tr><td>Distance Charge (${tripDistance.toFixed(1)} km)</td><td class="r">₹${distanceCharge.toFixed(2)}</td></tr>`,
      );
    if (timeCharge > 0)
      rows.push(
        `<tr><td>Time Charge (${Math.round(tripDuration)} min)</td><td class="r">₹${timeCharge.toFixed(2)}</td></tr>`,
      );
    if (surgeCharge > 0)
      rows.push(`<tr><td>Surge</td><td class="r">₹${surgeCharge.toFixed(2)}</td></tr>`);
    if (tip > 0) rows.push(`<tr><td>Tip</td><td class="r">₹${tip.toFixed(2)}</td></tr>`);
    if (discount > 0)
      rows.push(
        `<tr><td>Discount</td><td class="r" style="color:#15803D">-₹${discount.toFixed(2)}</td></tr>`,
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
  .paid { display:inline-block; background:#ECFDF5; color:#15803D; font-size:11px; font-weight:700; padding:3px 10px; border-radius:999px; margin-left:8px; vertical-align: middle; }
  .foot { margin-top: 24px; font-size: 11px; color: #6A7282; text-align: center; line-height: 1.5; }
</style></head>
<body><div class="wrap">
  <div class="brand">
    <div>
      <h1>UKCAAR</h1>
      <div class="sub">Tax Invoice / Bill of Supply</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:13px;font-weight:700">${inv}<span class="paid">PAID</span></div>
      <div style="font-size:12px;color:#6A7282;margin-top:4px">${date}</div>
    </div>
  </div>

  <div class="meta">
    <div><div class="label">Ride Type</div><div class="val">${rideTypeLabel || '—'}</div></div>
    <div><div class="label">Payment Method</div><div class="val">${methodLabel}</div></div>
    <div><div class="label">Distance</div><div class="val">${tripDistance.toFixed(1)} km</div></div>
    <div><div class="label">Duration</div><div class="val">${Math.round(tripDuration)} min</div></div>
  </div>

  <h2>Trip</h2>
  <div class="loc">
    <div class="row"><div class="dot pick"></div><div><div style="color:#6A7282;font-size:11px">Pickup</div><div>${pickup}</div></div></div>
    <div class="row"><div class="dot drop"></div><div><div style="color:#6A7282;font-size:11px">Drop-off</div><div>${dropoff}</div></div></div>
  </div>

  <h2>Fare Breakdown</h2>
  <table>
    ${rows.join('') || '<tr><td>Ride fare</td><td class="r">₹' + totalFare.toFixed(2) + '</td></tr>'}
    <tr class="total"><td>Total Paid</td><td class="r">₹${totalFare.toFixed(2)}</td></tr>
  </table>

  <div class="foot">
    Thank you for riding with UKCAAR.<br/>
    This is a system-generated invoice and does not require a signature.
  </div>
</div></body></html>`;
  }, [ride, rideId, methodLabel, cleanAmount]);

  // Share the invoice as plain text so the rider can route it through
  // any installed app (Drive, email, WhatsApp). On Android the system
  // share sheet also exposes "Print" / "Save as PDF", which doubles as
  // the PDF-download path without us shipping a native PDF library.
  const handleShareInvoice = useCallback(async () => {
    const inv = shortInvoiceId(rideId);
    const lines: string[] = [];
    lines.push(`UKCAAR — Invoice ${inv}`);
    lines.push(formatDate(ride?.completedAt || ride?.createdAt));
    lines.push('');
    if (ride?.pickup?.address) lines.push(`Pickup: ${ride.pickup.address}`);
    if (ride?.dropoff?.address) lines.push(`Drop-off: ${ride.dropoff.address}`);
    if (ride?.actualDistance) lines.push(`Distance: ${ride.actualDistance.toFixed(1)} km`);
    if (ride?.actualDuration) lines.push(`Duration: ${Math.round(ride.actualDuration)} min`);
    lines.push(`Payment: ${methodLabel}`);
    lines.push('');
    if (ride?.baseFare > 0) lines.push(`  Base Fare: ₹${ride.baseFare.toFixed(2)}`);
    if (ride?.distanceFare > 0) lines.push(`  Distance: ₹${ride.distanceFare.toFixed(2)}`);
    if (ride?.timeFare > 0) lines.push(`  Time: ₹${ride.timeFare.toFixed(2)}`);
    if (ride?.surgeFare > 0) lines.push(`  Surge: ₹${ride.surgeFare.toFixed(2)}`);
    if (ride?.tip > 0) lines.push(`  Tip: ₹${ride.tip.toFixed(2)}`);
    if (ride?.discount > 0) lines.push(`  Discount: -₹${ride.discount.toFixed(2)}`);
    lines.push(`  Total Paid: ₹${(ride?.actualFare ?? Number(cleanAmount)).toFixed?.(2) ?? cleanAmount}`);
    try {
      await Share.share({
        message: lines.join('\n'),
        title: `UKCAAR Invoice ${inv}`,
      });
    } catch {
      /* user dismissed */
    }
  }, [ride, rideId, methodLabel, cleanAmount]);

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 60, paddingBottom: 140 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.receiptWrap}>
          {/* Success tick badge floating over the card */}
          <View style={styles.tickBadge}>
            <TickIconBackground size={56} />
            <View style={styles.tickInner}>
              <FilledTickCircleIcon size={32} />
            </View>
          </View>

          <View style={styles.receiptCard}>
            <Text style={styles.title}>Payment Success!</Text>
            <Text style={styles.subtitle}>
              Your payment has been successfully done.
            </Text>

            <View style={styles.divider} />

            <Text style={styles.totalLabel}>Total Payment</Text>
            <Text style={styles.totalAmount}>
              <Text style={styles.rupee}>{'₹ '}</Text>
              {cleanAmount}
            </Text>

            <View style={styles.grid}>
              <View style={styles.row}>
                <View style={styles.cell}>
                  <Text style={styles.cellLabel}>Ref Number</Text>
                  <Text style={styles.cellValue} numberOfLines={1}>
                    {transactionId}
                  </Text>
                </View>
                <View style={styles.cell}>
                  <Text style={styles.cellLabel}>Payment Time</Text>
                  <Text style={styles.cellValue}>{formattedDateTime}</Text>
                </View>
              </View>
              <View style={styles.row}>
                <View style={styles.cell}>
                  <Text style={styles.cellLabel}>Payment Method</Text>
                  <Text style={styles.cellValue}>{methodLabel}</Text>
                </View>
                <View style={styles.cell}>
                  <Text style={styles.cellLabel}>Invoice</Text>
                  <Text style={styles.cellValue}>{shortInvoiceId(rideId)}</Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={styles.pdfButton}
              activeOpacity={0.7}
              onPress={() => setInvoiceOpen(true)}
            >
              <DownloadIcon size={22} color="#3D3D3D" />
              <Text style={styles.pdfText}>Get PDF Receipt</Text>
            </TouchableOpacity>
          </View>

          {/* Serrated bottom edge */}
          <View style={styles.serrated}>
            <ReceiptSerratedEdge width={345} notchRadius={8} />
          </View>
        </View>
      </ScrollView>

      {/* Bottom Done button */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={styles.doneButton}
          onPress={handleDone}
          activeOpacity={0.85}
        >
          <Text style={styles.doneText}>Done</Text>
        </TouchableOpacity>
      </View>

      <RatingSheet
        visible={ratingVisible}
        onClose={() => setRatingVisible(false)}
        onSubmit={handleSubmitRating}
        driverName={
          ride?.driver
            ? `${ride.driver.firstName ?? ''} ${ride.driver.lastName ?? ''}`.trim() ||
              'your driver'
            : undefined
        }
        driverAvatar={ride?.driver?.avatar ?? undefined}
        driverRating={driverRatingText(ride?.driver?.driverProfile?.rating)}
      />

      {/* Invoice modal — renders the same HTML the rider would see in the
          ride-history details view. The header Share button forwards
          through the system share sheet; on Android that exposes a
          "Print / Save as PDF" target which gives the rider a real PDF
          on disk without us bundling a native html-to-pdf library. */}
      <Modal
        visible={invoiceOpen}
        animationType="slide"
        onRequestClose={() => setInvoiceOpen(false)}
      >
        <View style={styles.invoiceContainer}>
          <StatusBar translucent backgroundColor="#0097B3" barStyle="light-content" />
          <View style={[styles.invoiceHeader, { paddingTop: insets.top + 14 }]}>
            <TouchableOpacity
              onPress={() => setInvoiceOpen(false)}
              style={styles.invoiceHeaderBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.invoiceHeaderTitle}>Receipt</Text>
            <TouchableOpacity
              onPress={handleShareInvoice}
              style={styles.invoiceHeaderBtn}
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
            scalesPageToFit={Platform.OS === 'android'}
          />
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scroll: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  receiptWrap: {
    width: 345,
    alignItems: 'center',
  },
  tickBadge: {
    position: 'absolute',
    top: -28,
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickInner: {
    position: 'absolute',
    top: 12,
    left: 12,
  },
  receiptCard: {
    width: 345,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    paddingTop: 48,
    paddingBottom: 32,
    paddingHorizontal: 16,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  title: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 20,
    lineHeight: 28,
    color: '#121212',
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    lineHeight: 22,
    color: '#474747',
    textAlign: 'center',
    marginTop: 6,
  },
  divider: {
    height: 1,
    width: 297,
    backgroundColor: '#ECECEC',
    marginVertical: 22,
  },
  totalLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    lineHeight: 22,
    color: '#474747',
    textAlign: 'center',
  },
  totalAmount: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 26,
    lineHeight: 34,
    color: '#121212',
    textAlign: 'center',
    marginTop: 4,
  },
  rupee: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 26,
  },
  grid: {
    width: '100%',
    marginTop: 22,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  cell: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#EDEDED',
    borderRadius: 6,
    padding: 12,
  },
  cellLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    lineHeight: 16,
    color: '#707070',
    marginBottom: 4,
  },
  cellValue: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    lineHeight: 18,
    color: '#121212',
  },
  pdfButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#0097B3',
    borderRadius: 10,
  },
  pdfText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    lineHeight: 22,
    color: '#0097B3',
  },
  serrated: {
    width: 345,
    marginTop: -1,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
    paddingTop: 12,
    backgroundColor: '#FFFFFF',
  },
  doneButton: {
    height: 58,
    backgroundColor: '#0097B3',
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: {
    fontFamily: 'Inter-Regular',
    fontSize: 16,
    lineHeight: 30,
    color: '#FFFFFF',
    letterSpacing: -0.408,
  },
  invoiceContainer: { flex: 1, backgroundColor: '#F8F9FB' },
  invoiceHeader: {
    backgroundColor: '#0097B3',
    paddingBottom: 16,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  invoiceHeaderBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  invoiceHeaderTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 18,
    lineHeight: 28,
    color: '#FFFFFF',
  },
});
