import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { KeyboardAwareScrollView } from '@/components/common';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Shadow, alpha } from '@/theme';
import { fs, s, vs } from '@/theme/responsive';
import { routeService } from '@/services/routeService';

interface Props {
  navigation: any;
  route: {
    params: {
      bookingId?: string;
      routeName?: string;
      fromName?: string;
      toName?: string;
      dropStopName?: string;
      originalFare?: number;
      partialFare?: number;
      refund?: number;
      refundMethod?: string;
      droppedAt?: string;
      /** When true this is a NORMAL completed trip (no early drop): show a plain
       *  Trip Summary with the full fare instead of the partial-fare/refund. */
      completed?: boolean;
      fare?: number;
      dateLabel?: string;
      seats?: number[];
      /** For the "View Ticket" jump. */
      routeId?: string;
      departureDate?: string;
      departureIndex?: number;
      driverId?: string;
      passengers?: any[];
    };
  };
}

const QUICK = [
  'Driver was courteous',
  'Felt safe',
  'Clean vehicle',
  'On time',
  'Smooth drop-off',
];

/**
 * "Ride Ended / Early Drop" summary → feedback → thank-you. Reached after the
 * rider taps "I've Exited Safely". Shows the auto-adjusted partial fare and the
 * refund, then collects a rating.
 */
export const ScheduledEarlyDropSummaryScreen: React.FC<Props> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const p = route.params ?? {};
  const isCompleted = p.completed === true;
  const original = Math.max(0, Math.round(p.originalFare ?? 0));
  const partial = Math.max(0, Math.round(p.partialFare ?? 0));
  const refund = Math.max(0, Math.round(p.refund ?? Math.max(0, original - partial)));
  const fare = Math.max(0, Math.round(p.fare ?? original));
  const refundToWallet = p.refundMethod === 'wallet';

  const openTicket = () =>
    navigation.navigate('ScheduledTripSummary', {
      route: { id: p.routeId, name: p.routeName },
      boarding: { name: p.fromName, time: '' },
      dropping: { name: p.toName, time: '' },
      seats: p.seats ?? [],
      passengers: p.passengers ?? [],
      total: fare,
      departureDate: p.departureDate,
      departureIndex: p.departureIndex,
      bookingId: p.bookingId,
      driverId: p.driverId,
    });
  const dropTime = (() => {
    try {
      return p.droppedAt
        ? new Date(p.droppedAt).toLocaleTimeString('en-IN', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          })
        : null;
    } catch {
      return null;
    }
  })();

  const [step, setStep] = useState<'summary' | 'feedback' | 'thanks'>('summary');
  const [stars, setStars] = useState(0);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const goHome = () => {
    navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
  };

  const submitFeedback = async () => {
    if (stars < 1) return;
    setSubmitting(true);
    try {
      if (p.bookingId) {
        const chips = QUICK.filter((q) => picked[q]);
        const note = [comment.trim(), chips.length ? `(${chips.join(', ')})` : '']
          .filter(Boolean)
          .join(' ');
        await routeService.rateBooking(p.bookingId, stars, note || undefined);
      }
    } catch {
      // Feedback is best-effort — never block the thank-you on a network hiccup.
    } finally {
      setSubmitting(false);
      setStep('thanks');
    }
  };

  // ── Thank you ──
  if (step === 'thanks') {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />
        <View style={[styles.bigIcon, { backgroundColor: alpha(Colors.success, 0.14) }]}>
          <Ionicons name="checkmark-circle" size={s(56)} color={Colors.success} />
        </View>
        <Text style={styles.thanksTitle}>Thank You!</Text>
        <Text style={styles.thanksBody}>
          Your feedback helps us keep every UKCAAR ride safe and comfortable.
        </Text>
        <View style={{ height: vs(24) }} />
        <TouchableOpacity style={styles.primaryBtn} onPress={goHome}>
          <Text style={styles.primaryBtnText}>Back to Home</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.outlineBtn}
          onPress={() => navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] })}
        >
          <Text style={styles.outlineBtnText}>Book Another Ride</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Feedback ──
  if (step === 'feedback') {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setStep('summary')} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={s(22)} color={Colors.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>How Was Your Ride?</Text>
          <View style={styles.iconBtn} />
        </View>
        <KeyboardAwareScrollView contentContainerStyle={styles.content}>
          <Text style={styles.feedbackPrompt}>Rate your experience</Text>
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <TouchableOpacity key={n} onPress={() => setStars(n)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Ionicons
                  name={n <= stars ? 'star' : 'star-outline'}
                  size={s(38)}
                  color={n <= stars ? '#F59E0B' : Colors.border}
                  style={{ marginHorizontal: s(4) }}
                />
              </TouchableOpacity>
            ))}
          </View>
          {stars > 0 && (
            <Text style={styles.starsLabel}>
              {['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent!'][stars]}
            </Text>
          )}

          <Text style={styles.sectionLabel}>Quick Feedback</Text>
          <View style={styles.chipsWrap}>
            {QUICK.map((q) => {
              const on = !!picked[q];
              return (
                <TouchableOpacity
                  key={q}
                  style={[styles.chip, on && styles.chipOn]}
                  onPress={() => setPicked((prev) => ({ ...prev, [q]: !prev[q] }))}
                  activeOpacity={0.85}
                >
                  {on && <Ionicons name="checkmark" size={s(14)} color={Colors.white} style={{ marginRight: s(4) }} />}
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{q}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.sectionLabel}>Additional comments</Text>
          <TextInput
            style={styles.input}
            placeholder="Tell us more (optional)"
            placeholderTextColor={Colors.textMuted}
            value={comment}
            onChangeText={setComment}
            multiline
          />
        </KeyboardAwareScrollView>
        <View style={[styles.footer, { paddingBottom: insets.bottom + vs(12) }]}>
          <TouchableOpacity
            style={[styles.primaryBtn, (stars < 1 || submitting) && { opacity: 0.5 }]}
            disabled={stars < 1 || submitting}
            onPress={submitFeedback}
          >
            {submitting ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.primaryBtnText}>Submit Feedback</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Summary ──
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={s(24)} color={Colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isCompleted ? 'Trip Summary' : 'Ride Ended'}</Text>
        <View style={styles.iconBtn} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.endedTop}>
          {isCompleted ? (
            <>
              <View style={[styles.bigIcon, { backgroundColor: alpha(Colors.success, 0.14) }]}>
                <Ionicons name="checkmark-done-circle" size={s(38)} color={Colors.success} />
              </View>
              <View style={[styles.earlyBadge, { backgroundColor: Colors.success }]}>
                <Text style={styles.earlyBadgeText}>Completed</Text>
              </View>
              <Text style={styles.endedSub}>
                You've arrived{p.toName ? ` at ${p.toName}` : ''}. Thanks for riding with UKCAAR!
              </Text>
            </>
          ) : (
            <>
              <View style={[styles.bigIcon, { backgroundColor: alpha('#F59E0B', 0.14) }]}>
                <Ionicons name="exit-outline" size={s(34)} color="#EA580C" />
              </View>
              <View style={styles.earlyBadge}>
                <Text style={styles.earlyBadgeText}>Early Drop</Text>
              </View>
              <Text style={styles.endedSub}>
                You were dropped off{p.dropStopName ? ` at ${p.dropStopName}` : ''}
                {dropTime ? ` · ${dropTime}` : ''}.
              </Text>
            </>
          )}
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Trip Summary</Text>
          <Row label="Route" value={`${p.fromName ?? '—'} → ${p.toName ?? '—'}`} />
          {isCompleted ? (
            <>
              {!!p.dateLabel && <Row label="Date" value={p.dateLabel} />}
              {!!(p.seats && p.seats.length) && (
                <Row label="Seats" value={p.seats.map((n) => `Seat ${n}`).join(', ')} />
              )}
              <View style={styles.divider} />
              <View style={styles.refundRow}>
                <Text style={styles.refundLabel}>Total Fare</Text>
                <Text style={[styles.refundValue, { color: Colors.primary }]}>₹{fare}</Text>
              </View>
            </>
          ) : (
            <>
              <Row label="Original Fare" value={`₹${original}`} />
              <Row label="Partial Fare (auto-adjusted)" value={`₹${partial}`} />
              <View style={styles.divider} />
              <View style={styles.refundRow}>
                <Text style={styles.refundLabel}>Refund</Text>
                <Text style={styles.refundValue}>₹{refund}</Text>
              </View>
            </>
          )}
        </View>

        {!isCompleted && (
          <View style={styles.refundInfo}>
            <Ionicons name="information-circle-outline" size={s(18)} color={Colors.primary} />
            <Text style={styles.refundInfoText}>
              {refund > 0
                ? refundToWallet
                  ? `₹${refund} has been credited to your UKCAAR wallet.`
                  : `₹${refund} will be refunded to your original payment method within 24 hours.`
                : 'No refund is due — you had almost reached your booked stop.'}
            </Text>
          </View>
        )}

        <TouchableOpacity style={styles.ticketBtn} onPress={openTicket} activeOpacity={0.85}>
          <Ionicons name="qr-code-outline" size={s(18)} color={Colors.primary} />
          <Text style={styles.ticketBtnText}>View Ticket</Text>
        </TouchableOpacity>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + vs(12) }]}>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => setStep('feedback')}>
          <Text style={styles.primaryBtnText}>Give Feedback</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.textBtn} onPress={goHome}>
          <Text style={styles.textBtnText}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.row}>
    <Text style={styles.rowLabel} numberOfLines={1}>
      {label}
    </Text>
    <Text style={styles.rowValue} numberOfLines={1}>
      {value}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundCard },
  centered: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: s(28) },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.primary,
    paddingHorizontal: s(12),
    paddingVertical: vs(14),
  },
  iconBtn: { width: s(36), height: s(36), alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: 'Inter-SemiBold', fontSize: fs(18), color: Colors.white },

  content: { padding: s(18), paddingBottom: vs(30) },

  endedTop: { alignItems: 'center', marginBottom: vs(18) },
  bigIcon: {
    width: s(76),
    height: s(76),
    borderRadius: s(38),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: vs(10),
  },
  earlyBadge: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: s(14),
    paddingVertical: vs(5),
    borderRadius: s(999),
  },
  earlyBadgeText: { fontFamily: 'Inter-SemiBold', fontSize: fs(13), color: Colors.white },
  endedSub: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(13),
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: vs(10),
  },

  summaryCard: {
    backgroundColor: Colors.white,
    borderRadius: s(16),
    padding: s(16),
    ...Shadow.sm,
  },
  summaryTitle: { fontFamily: 'Inter-Bold', fontSize: fs(16), color: Colors.textPrimary, marginBottom: vs(6) },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: vs(7) },
  rowLabel: { fontFamily: 'Inter-Regular', fontSize: fs(13), color: Colors.textSecondary, flex: 1, marginRight: s(10) },
  rowValue: { fontFamily: 'Inter-SemiBold', fontSize: fs(14), color: Colors.textPrimary },
  divider: { height: 1, backgroundColor: Colors.borderLight, marginVertical: vs(8) },
  refundRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  refundLabel: { fontFamily: 'Inter-Bold', fontSize: fs(16), color: Colors.textPrimary },
  refundValue: { fontFamily: 'Inter-Bold', fontSize: fs(20), color: Colors.success },

  refundInfo: {
    flexDirection: 'row',
    gap: s(8),
    backgroundColor: alpha(Colors.primary, 0.07),
    borderRadius: s(12),
    padding: s(14),
    marginTop: vs(14),
  },
  refundInfoText: { flex: 1, fontFamily: 'Inter-Regular', fontSize: fs(13), color: Colors.primary, lineHeight: fs(19) },
  ticketBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: s(8),
    height: vs(50),
    borderRadius: s(14),
    borderWidth: 1.5,
    borderColor: Colors.primary,
    marginTop: vs(14),
  },
  ticketBtnText: { fontFamily: 'Inter-SemiBold', fontSize: fs(15), color: Colors.primary },

  // Feedback
  feedbackPrompt: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(16),
    color: Colors.textPrimary,
    textAlign: 'center',
    marginTop: vs(8),
  },
  starsRow: { flexDirection: 'row', justifyContent: 'center', marginTop: vs(14) },
  starsLabel: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(15),
    color: '#F59E0B',
    textAlign: 'center',
    marginTop: vs(8),
  },
  sectionLabel: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(14),
    color: Colors.textPrimary,
    marginTop: vs(22),
    marginBottom: vs(10),
  },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: s(8) },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: s(14),
    paddingVertical: vs(9),
    borderRadius: s(999),
    borderWidth: 1,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.white,
  },
  chipOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontFamily: 'Inter-Medium', fontSize: fs(13), color: Colors.textSecondary },
  chipTextOn: { color: Colors.white },
  input: {
    minHeight: vs(90),
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: s(12),
    padding: s(12),
    fontFamily: 'Inter-Regular',
    fontSize: fs(14),
    color: Colors.textPrimary,
    textAlignVertical: 'top',
    backgroundColor: Colors.white,
  },

  thanksTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: fs(26),
    color: Colors.textPrimary,
    marginTop: vs(14),
  },
  thanksBody: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(14),
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: fs(21),
    marginTop: vs(8),
  },

  footer: {
    paddingHorizontal: s(18),
    paddingTop: vs(10),
    backgroundColor: Colors.backgroundCard,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  primaryBtn: {
    height: vs(54),
    borderRadius: s(14),
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  primaryBtnText: { fontFamily: 'Inter-SemiBold', fontSize: fs(16), color: Colors.white },
  outlineBtn: {
    height: vs(54),
    borderRadius: s(14),
    borderWidth: 1.5,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: vs(12),
    width: '100%',
  },
  outlineBtnText: { fontFamily: 'Inter-SemiBold', fontSize: fs(16), color: Colors.primary },
  textBtn: { height: vs(46), alignItems: 'center', justifyContent: 'center', marginTop: vs(6) },
  textBtnText: { fontFamily: 'Inter-Medium', fontSize: fs(14), color: Colors.textSecondary },
});

export default ScheduledEarlyDropSummaryScreen;
