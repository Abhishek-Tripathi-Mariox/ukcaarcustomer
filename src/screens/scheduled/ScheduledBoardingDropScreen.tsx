import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  Alert,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Shadow, alpha } from '@/theme';
import { fs, s, vs } from '@/theme/responsive';
import { istDateStr, istMinutesOfDay } from '@/utils/date';
import type { ScheduledRoute } from './ScheduledRouteScreen';
import { fmt12h } from './ScheduledRouteScreen';
import { routeService, type ScheduledRouteApi } from '@/services/routeService';

interface Stop {
  id: string;
  name: string;
  time: string;
  sequence: number;
}

interface Props {
  navigation: any;
  route: { params: { route: ScheduledRoute } };
}

/**
 * Step 2 of the scheduled booking flow. The previous version rendered a
 * hard-coded "City Center / Sector 18 / Main Bus Terminal" list — clearly
 * wrong for an admin-defined route like Kasganj → Aligarh. This version
 * fetches the live route doc and derives:
 *
 *   - Boarding choices: every stop EXCEPT the last (you can't board at
 *     the destination). Default-selects the first stop.
 *   - Dropping choices: every stop AFTER the chosen boarding stop.
 *   - Per-stop time: the next-upcoming departure time of the route is
 *     anchored to the FIRST stop; later stops show the same time when
 *     the route doesn't carry per-stop ETAs (the model currently only
 *     records `departures[].time` per route, not per intermediate stop).
 *     We deliberately don't fabricate stop-level ETAs.
 */
export const ScheduledBoardingDropScreen: React.FC<Props> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const scheduledRoute = route.params.route;

  const [routeDoc, setRouteDoc] = useState<ScheduledRouteApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [boardingId, setBoardingId] = useState<string | null>(null);
  const [droppingId, setDroppingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    routeService
      .getById(scheduledRoute.id)
      .then((r) => {
        if (cancelled) return;
        setRouteDoc(r);
      })
      .catch(() => {
        if (!cancelled) setRouteDoc(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scheduledRoute.id]);

  // Pick the next-upcoming departure slot. We surface both the index
  // (needed by the booking endpoints to identify which slot the rider
  // reserved) and the YYYY-MM-DD date (today, or tomorrow if every
  // slot today is already past).
  const departureMeta = useMemo((): {
    index: number;
    time: string;
    date: string;
    label: string;
  } => {
    const today = new Date();
    const todayStr = istDateStr(today);
    const tomorrow = istDateStr(new Date(today.getTime() + 24 * 60 * 60 * 1000));

    const departures = routeDoc?.schedule?.departures ?? [];
    if (departures.length === 0) {
      return {
        index: 0,
        time: '',
        date: todayStr,
        label: scheduledRoute.nextDeparture || '—',
      };
    }

    // Keep the original index when sorting so we can return it.
    const indexed = departures.map((d, i) => ({ ...d, originalIndex: i }));
    const sorted = [...indexed].sort((a, b) => a.time.localeCompare(b.time));
    const nowMin = istMinutesOfDay(today);
    const upcoming = sorted.find((d) => {
      const [h, m] = d.time.split(':').map(Number);
      return h * 60 + m > nowMin;
    });
    if (upcoming) {
      return {
        index: upcoming.originalIndex,
        time: upcoming.time,
        date: todayStr,
        label: fmt12h(upcoming.time),
      };
    }
    // All of today's slots have passed — book against tomorrow's first.
    return {
      index: sorted[0].originalIndex,
      time: sorted[0].time,
      date: tomorrow,
      label: fmt12h(sorted[0].time),
    };
  }, [routeDoc, scheduledRoute.nextDeparture]);

  // ── Travel date + departure-slot selection ──
  // Previously the date was forced to today/tomorrow and the slot auto-picked.
  // Now the rider chooses both; `selectedDate`/`selectedIndex` flow forward.
  const sortedDepartures = useMemo(
    () =>
      (routeDoc?.schedule?.departures ?? [])
        .map((d, i) => ({ time: d.time, index: i }))
        .sort((a, b) => a.time.localeCompare(b.time)),
    [routeDoc],
  );

  const dateOptions = useMemo(() => {
    const out: { date: string; label: string }[] = [];
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    for (let i = 0; i < 14; i++) {
      const d = new Date(base.getTime() + i * 86400000);
      out.push({
        date: istDateStr(d),
        label:
          i === 0
            ? 'Today'
            : i === 1
              ? 'Tomorrow'
              : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }),
      });
    }
    return out;
  }, []);

  const [selectedDate, setSelectedDate] = useState(departureMeta.date);
  const [selectedIndex, setSelectedIndex] = useState(departureMeta.index);

  const todayStr = useMemo(() => istDateStr(), []);
  const nowMin = useMemo(() => istMinutesOfDay(), []);

  // For the chosen date, hide slots that have already passed (only matters for today).
  const availableSlots = useMemo(
    () =>
      sortedDepartures.filter((s) => {
        if (selectedDate !== todayStr) return true;
        const [h, m] = s.time.split(':').map(Number);
        return h * 60 + m > nowMin;
      }),
    [sortedDepartures, selectedDate, todayStr, nowMin],
  );

  // Keep the selected slot valid whenever the available set changes.
  useEffect(() => {
    if (availableSlots.length === 0) return;
    if (!availableSlots.some((s) => s.index === selectedIndex)) {
      setSelectedIndex(availableSlots[0].index);
    }
  }, [availableSlots, selectedIndex]);

  const selectedTime =
    sortedDepartures.find((s) => s.index === selectedIndex)?.time ?? departureMeta.time;
  const departureTime = selectedTime ? fmt12h(selectedTime) : departureMeta.label;

  // Stops sorted by sequence, mapped to UI shape.
  const allStops: Stop[] = useMemo(() => {
    const stops = routeDoc?.stops ?? [];
    return [...stops]
      .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
      .map((s, i) => ({
        id: `${i}-${s.name}`,
        name: s.name,
        time: departureTime,
        sequence: typeof s.sequence === 'number' ? s.sequence : i,
      }));
  }, [routeDoc, departureTime]);

  const boardingOptions = useMemo(
    // Every stop except the last (no boarding at destination).
    () => allStops.slice(0, Math.max(0, allStops.length - 1)),
    [allStops],
  );

  // Default boarding = the route's first stop. Once stops are loaded we
  // seed the selection so the Confirm button can be hit immediately.
  useEffect(() => {
    if (!boardingId && boardingOptions.length > 0) {
      setBoardingId(boardingOptions[0].id);
    }
  }, [boardingOptions, boardingId]);

  const selectedBoarding = useMemo(
    () => allStops.find((s) => s.id === boardingId) ?? null,
    [allStops, boardingId],
  );

  // Dropping options = stops AFTER the chosen boarding stop's sequence.
  // Falls back to "every stop after the first" while the boarding hasn't
  // resolved yet so the list isn't empty during the initial render.
  const droppingOptions = useMemo(() => {
    const afterSeq = selectedBoarding?.sequence ?? -1;
    return allStops.filter((s) => s.sequence > afterSeq);
  }, [allStops, selectedBoarding]);

  // Default drop = first stop after boarding. Re-seed whenever the
  // boarding choice changes (so picking "Stop B" doesn't leave us with
  // a stale drop pointing to a stop before B).
  useEffect(() => {
    if (droppingOptions.length === 0) {
      setDroppingId(null);
      return;
    }
    const stillValid = droppingOptions.find((s) => s.id === droppingId);
    if (!stillValid) setDroppingId(droppingOptions[0].id);
  }, [droppingOptions, droppingId]);

  const handleConfirm = () => {
    const boarding = allStops.find((p) => p.id === boardingId);
    const dropping = allStops.find((p) => p.id === droppingId);
    if (!boarding || !dropping) return;
    if (availableSlots.length === 0) {
      Alert.alert('Pick a date', 'No departures remain for the selected date. Please choose another date.');
      return;
    }

    // Per-seat fare for THIS segment. Stops carry `fareFromPrevious` (the
    // incremental fare from the prior stop), so the fare from boarding to
    // dropping is the sum of fareFromPrevious for every stop after the
    // boarding stop up to and including the dropping stop. e.g. stops at
    // +200 each give 1→3 = 400 and 3→4 = 200. When a route has no segment
    // fares configured we fall back to the flat per-seat seatPrice.
    const segmentFare = (routeDoc?.stops ?? [])
      .filter(
        (s) =>
          (s.sequence ?? 0) > boarding.sequence &&
          (s.sequence ?? 0) <= dropping.sequence,
      )
      .reduce((sum, s) => sum + (s.fareFromPrevious ?? 0), 0);
    const unitFare =
      segmentFare > 0
        ? segmentFare
        : routeDoc?.schedule?.seatPrice ?? scheduledRoute.price;

    navigation.navigate('ScheduledVehicle', {
      route: scheduledRoute,
      // Downstream screens read `.name` and `.time` only, so the shape
      // stays compatible with Vehicle / Seat / FareSummary / BookingDetails.
      // `.sequence` rides along so the booking can persist the booked segment
      // (powers the early-drop partial-fare recompute) without threading extra
      // params through every screen.
      boarding: { id: boarding.id, name: boarding.name, time: boarding.time, sequence: boarding.sequence },
      dropping: { id: dropping.id, name: dropping.name, time: dropping.time, sequence: dropping.sequence },
      // Real trip identity so the seat screen can fetch live availability
      // and the payment screen can atomically reserve. departureDate is
      // YYYY-MM-DD; departureIndex is the row position in the route's
      // schedule.departures array.
      departureDate: selectedDate,
      departureIndex: selectedIndex,
      // Per-seat fare for the chosen segment (or flat price fallback).
      unitFare,
    });
  };

  const renderStop = (
    stop: Stop,
    type: 'departure' | 'arrival',
    selectedId: string | null,
    setId: (id: string) => void,
  ) => {
    const isSelected = stop.id === selectedId;
    return (
      <TouchableOpacity
        key={stop.id}
        activeOpacity={0.85}
        onPress={() => setId(stop.id)}
        style={[styles.stopCard, isSelected && styles.stopCardActive]}
      >
        <View style={[styles.radio, isSelected && styles.radioActive]}>
          {isSelected && <Ionicons name="checkmark" size={12} color={Colors.white} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.stopName}>{stop.name}</Text>
          <Text style={styles.stopTime}>
            Estimated {type}{' '}
            <Text style={styles.stopTimeBold}>— {stop.time}</Text>
          </Text>
        </View>
        {isSelected && (
          <View style={styles.checkBadge}>
            <Ionicons name="checkmark" size={14} color={Colors.white} />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Select Boarding & Dropping Point</Text>
        <View style={{ width: 32 }} />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : allStops.length < 2 ? (
        <View style={styles.loadingWrap}>
          <Text style={styles.helperText}>
            This route doesn't have enough stops configured yet.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: vs(120) + insets.bottom }]}
        >
          <View style={styles.routeBanner}>
            <Text style={styles.routeBannerTitle} numberOfLines={2}>{scheduledRoute.name}</Text>
            <Text style={styles.routeBannerSub} numberOfLines={2}>
              {scheduledRoute.from} → {scheduledRoute.to}
            </Text>
          </View>

          {/* Travel date */}
          <View style={styles.sectionHead}>
            <Ionicons name="calendar" size={18} color={Colors.textPrimary} />
            <Text style={styles.sectionTitle}>Travel Date</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {dateOptions.map((opt) => {
              const sel = opt.date === selectedDate;
              return (
                <TouchableOpacity
                  key={opt.date}
                  style={[styles.dateChip, sel && styles.chipSelected]}
                  onPress={() => setSelectedDate(opt.date)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipText, sel && styles.chipTextSelected]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Departure time */}
          <View style={[styles.sectionHead, { marginTop: 14 }]}>
            <Ionicons name="time" size={18} color={Colors.textPrimary} />
            <Text style={styles.sectionTitle}>Departure Time</Text>
          </View>
          {availableSlots.length === 0 ? (
            <Text style={styles.helperText}>No more departures for this date — pick another date.</Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {availableSlots.map((s) => {
                const sel = s.index === selectedIndex;
                return (
                  <TouchableOpacity
                    key={s.index}
                    style={[styles.timeChip, sel && styles.chipSelected]}
                    onPress={() => setSelectedIndex(s.index)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipText, sel && styles.chipTextSelected]}>{fmt12h(s.time)}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          <View style={[styles.sectionHead, { marginTop: 18 }]}>
            <Ionicons name="bus" size={18} color={Colors.textPrimary} />
            <Text style={styles.sectionTitle}>Boarding Point</Text>
          </View>
          {boardingOptions.map((s) =>
            renderStop(s, 'departure', boardingId, setBoardingId),
          )}

          <View style={[styles.sectionHead, { marginTop: 18 }]}>
            <Ionicons name="location" size={18} color={Colors.primary} />
            <Text style={styles.sectionTitle}>Dropping Point</Text>
          </View>
          {droppingOptions.length === 0 ? (
            <Text style={styles.helperText}>
              No stops after the chosen boarding point. Pick an earlier
              boarding stop to see drop-off options.
            </Text>
          ) : (
            droppingOptions.map((s) =>
              renderStop(s, 'arrival', droppingId, setDroppingId),
            )
          )}

          <Text style={styles.helperText}>
            Please select your nearest boarding and dropping points for a
            smooth pickup and drop-off experience.
          </Text>
        </ScrollView>
      )}

      <View style={[styles.footer, { paddingBottom: insets.bottom + s(16) }]}>
        <TouchableOpacity
          style={[
            styles.cta,
            (!boardingId || !droppingId) && { opacity: 0.5 },
          ]}
          onPress={handleConfirm}
          activeOpacity={0.85}
          disabled={!boardingId || !droppingId}
        >
          <Text style={styles.ctaText}>Confirm Points</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundCard },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.primary,
    paddingHorizontal: s(16),
    paddingVertical: vs(14),
  },
  backBtn: { width: s(32), height: s(32), alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: 'Inter-SemiBold', fontSize: fs(18), color: Colors.white, flex: 1, textAlign: 'center' },
  content: { padding: s(16), paddingBottom: vs(120) },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: s(24) },

  routeBanner: {
    backgroundColor: Colors.white,
    borderRadius: s(12),
    padding: s(14),
    marginBottom: vs(16),
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  routeBannerTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(16),
    color: Colors.textPrimary,
  },
  routeBannerSub: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(13),
    color: Colors.textSecondary,
    marginTop: vs(2),
  },

  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: s(8), marginBottom: vs(12) },
  sectionTitle: { fontFamily: 'Inter-SemiBold', fontSize: fs(16), color: Colors.textPrimary },

  stopCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(12),
    backgroundColor: Colors.white,
    borderRadius: s(12),
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
    padding: s(14),
    marginBottom: vs(10),
    ...Shadow.sm,
  },
  stopCardActive: {
    borderColor: Colors.primary,
    backgroundColor: alpha(Colors.success, 0.04),
  },
  radio: {
    width: s(20),
    height: s(20),
    borderRadius: s(10),
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: {
    backgroundColor: Colors.success,
    borderColor: Colors.success,
  },
  stopName: { fontFamily: 'Inter-SemiBold', fontSize: fs(15), color: Colors.textPrimary, flexShrink: 1 },
  stopTime: { fontFamily: 'Inter-Regular', fontSize: fs(12), color: Colors.textMuted, marginTop: vs(2) },
  stopTimeBold: { fontFamily: 'Inter-SemiBold', color: Colors.textPrimary },
  checkBadge: {
    width: s(22),
    height: s(22),
    borderRadius: s(11),
    backgroundColor: Colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },

  helperText: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(13),
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: vs(16),
    paddingHorizontal: s(12),
  },

  chipRow: { gap: s(8), paddingVertical: vs(2), paddingRight: s(8) },
  dateChip: {
    paddingHorizontal: s(16),
    paddingVertical: vs(10),
    borderRadius: s(12),
    borderWidth: 1,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.white,
  },
  timeChip: {
    paddingHorizontal: s(16),
    paddingVertical: vs(10),
    borderRadius: s(12),
    borderWidth: 1,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.white,
  },
  chipSelected: {
    borderColor: Colors.primary,
    backgroundColor: alpha(Colors.primary, 0.08),
  },
  chipText: {
    fontFamily: 'Inter-Medium',
    fontSize: fs(13),
    color: Colors.textPrimary,
  },
  chipTextSelected: {
    color: Colors.primary,
    fontFamily: 'Inter-SemiBold',
  },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: s(16),
    backgroundColor: Colors.backgroundCard,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  cta: {
    backgroundColor: Colors.primary,
    borderRadius: s(8),
    height: vs(56),
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { fontFamily: 'Inter-SemiBold', fontSize: fs(16), color: Colors.white },
});
