import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Colors } from '@/theme';
import { fs, s, vs } from '@/theme/responsive';
import { useAppSelector } from '@/store/hooks';
import { getPreviousTab } from '@/navigation/tabHistory';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { rideService, Ride } from '@/services/rideService';
import { routeService } from '@/services/routeService';
import { RatingSheet } from '@/components/RatingSheet';

type TabKey = 'active' | 'completed' | 'cancelled' | 'scheduled';

interface RideHistoryScreenProps {
  navigation: any;
}

const TABS: { key: TabKey; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'scheduled', label: 'Scheduled' },
];

const ACTIVE_STATUSES: Ride['status'][] = [
  'searching',
  'driver_assigned',
  'driver_arriving',
  'driver_arrived',
  'in_progress',
];

const RIDE_TYPE_STYLES: Record<string, { bg: string; fg: string; label: string }> = {
  economy: { bg: '#EFF6FF', fg: '#155DFC', label: 'Economy' },
  comfort: { bg: '#FFFBEB', fg: '#E17100', label: 'Comfort' },
  premium: { bg: '#FAF5FF', fg: '#9810FA', label: 'Premium' },
  xl: { bg: '#ECFDF5', fg: '#059669', label: 'XL' },
  electric: { bg: '#F0F9FF', fg: '#0284C7', label: 'Electric' },
};

const formatDateTime = (iso: string) => {
  try {
    const d = new Date(iso);
    const date = d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const time = d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    return `${date} • ${time}`;
  } catch {
    return iso;
  }
};

const getRideTypeChip = (rideType: string) => {
  const key = (rideType || 'economy').toLowerCase();
  return RIDE_TYPE_STYLES[key] || RIDE_TYPE_STYLES.economy;
};

const getStatusBadge = (status: Ride['status'], tab: TabKey) => {
  // Status wins so the Scheduled tab (which now lists every status) shows a
  // Completed / Cancelled badge where appropriate instead of a blanket
  // "Scheduled".
  if (status === 'cancelled') {
    return { bg: '#FEF2F2', fg: '#EF4444', dot: '#EF4444', label: 'Cancelled' };
  }
  if (status === 'completed') {
    return { bg: 'rgba(0,200,150,0.1)', fg: '#00C896', dot: '#00C896', label: 'Completed' };
  }
  if (tab === 'scheduled') {
    return { bg: '#F3E8FF', fg: '#9810FA', dot: '#9810FA', label: 'Scheduled' };
  }
  return { bg: 'rgba(0,200,150,0.1)', fg: '#00C896', dot: '#00C896', label: 'Ongoing' };
};

export const RideHistoryScreen: React.FC<RideHistoryScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabKey>('active');
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Trip-rating sheet for completed rides.
  const [ratingRide, setRatingRide] = useState<Ride | null>(null);

  const handleBack = useCallback(() => {
    // Return to whichever tab the user came from (recorded by the Tab.Navigator
    // focus listener in MainNavigator).
    const target = getPreviousTab('Activity');
    navigation.navigate(target as never);
  }, [navigation]);

  const loadRides = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const data = await rideService.getRides(1, 50);
      setRides(data?.rides || data?.items || []);
    } catch (err) {
      setRides([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadRides(true);
  }, [loadRides]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadRides(false);
  }, [loadRides]);

  const filteredRides = useMemo(() => {
    return rides.filter((r) => {
      const isScheduled = (r as any).isScheduled === true || r.rideType === 'scheduled';
      // Scheduled-shuttle bookings live ONLY under the Scheduled tab — across
      // every status (upcoming, completed, cancelled). The Active/Completed/
      // Cancelled tabs are for instant/private rides only, so they never mix
      // a shuttle ticket in with a regular ride.
      switch (activeTab) {
        case 'active':
          return !isScheduled && ACTIVE_STATUSES.includes(r.status);
        case 'completed':
          return !isScheduled && r.status === 'completed';
        case 'cancelled':
          return !isScheduled && r.status === 'cancelled';
        case 'scheduled':
          return isScheduled;
        default:
          return false;
      }
    });
  }, [rides, activeTab]);

  const handleCancelScheduled = (ride: Ride) => {
    // Scheduled bookings are cancelled via the routes booking endpoint, not
    // the ride-cancel endpoint. Prefer the real booking id; fall back to the
    // `sched_`-prefixed card id (the backend strips the prefix).
    const bookingId = (ride as any).booking?.id ?? ride._id;
    Alert.alert(
      'Cancel Scheduled Ride',
      'Are you sure you want to cancel this scheduled ride?',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Cancel Ride',
          style: 'destructive',
          onPress: async () => {
            try {
              await routeService.cancelBooking(bookingId);
              loadRides(false);
            } catch {
              Alert.alert('Error', 'Failed to cancel ride. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleSubmitRating = async (rating: number, feedback: string) => {
    const r = ratingRide;
    setRatingRide(null);
    if (!r) return;
    try {
      await rideService.rateRide(r._id, rating, feedback || undefined);
      Alert.alert('Thank you!', 'Your rating has been submitted.');
    } catch (err: any) {
      // Surface the backend reason (e.g. "Ride not found or not completed")
      // instead of a generic message — ratings are only accepted once the
      // ride has settled to `completed`.
      Alert.alert(
        'Could not submit rating',
        err?.response?.data?.message ?? err?.message ?? 'Please try again.',
      );
    }
  };

  const handleCardPress = (ride: Ride) => {
    const isScheduled = (ride as any).isScheduled === true;
    const booking = (ride as any).booking;
    // Scheduled bookings are surfaced from the ScheduledBooking
    // collection (projected to Ride shape), so the Ride-tracking flow
    // doesn't apply. Route them to ScheduledBookingDetails — the
    // booking object carries the trip metadata that screen needs.
    if (isScheduled && booking) {
      navigation.navigate('ScheduledBookingDetails', {
        // The card-id is prefixed `sched_<bookingId>` — no need to
        // unpack it on the receiver since the booking object below
        // already has the route + departure metadata.
        route: {
          id: booking.route,
          name: booking.routeName ?? 'Scheduled trip',
          from: ride.pickup?.address ?? '—',
          to: ride.dropoff?.address ?? '—',
          capacity: 0,
          price: Math.round(
            (ride.actualFare ?? ride.estimatedFare ?? 0) /
              Math.max(1, (booking.seats ?? []).length),
          ),
          nextDeparture: booking.departureTime ?? '',
          approvedDriverCount: 0,
          hasRoundTripDriver: false,
          durationMin: 0,
          bookedSeats: 0,
        },
        boarding: {
          id: 'b',
          name: ride.pickup?.address ?? '—',
          time: booking.departureTime ?? '',
        },
        dropping: {
          id: 'd',
          name: ride.dropoff?.address ?? '—',
          time: booking.departureTime ?? '',
        },
        seats: booking.seats ?? [],
        passengers: booking.passengers ?? [],
        total: ride.actualFare ?? ride.estimatedFare ?? 0,
        departureDate: booking.departureDate,
        departureIndex: booking.departureIndex,
        bookingId: booking.id ?? ride._id,
      });
      return;
    }
    if (activeTab === 'active') {
      if (ride.status === 'in_progress') {
        navigation.navigate('InRide', { rideId: ride._id });
      } else {
        navigation.navigate('RideTracking', { rideId: ride._id });
      }
    } else if (activeTab === 'completed') {
      navigation.navigate('RideDetails', { rideId: ride._id });
    }
  };

  const renderRideCard = (ride: Ride) => {
    const chip = getRideTypeChip(ride.rideType);
    const badge = getStatusBadge(ride.status, activeTab);
    const refunded = activeTab === 'cancelled' ? ride.actualFare || ride.estimatedFare : 0;

    return (
      <TouchableOpacity
        key={ride._id}
        style={styles.card}
        activeOpacity={
          activeTab === 'active' ||
          activeTab === 'completed' ||
          activeTab === 'scheduled'
            ? 0.85
            : 1
        }
        onPress={() => handleCardPress(ride)}
      >
        {/* Header row: date + ride type chip */}
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.dateText}>{formatDateTime(ride.createdAt)}</Text>
            <View style={[styles.statusPill, { backgroundColor: badge.bg }]}>
              <View style={[styles.statusDot, { backgroundColor: badge.dot }]} />
              <Text style={[styles.statusText, { color: badge.fg }]} numberOfLines={1}>
                {activeTab === 'cancelled' && refunded > 0
                  ? `Cancelled • ₹${Math.round(refunded)} refunded to wallet`
                  : badge.label}
              </Text>
            </View>
          </View>
          <View style={[styles.typeChip, { backgroundColor: chip.bg }]}>
            <Text style={[styles.typeChipText, { color: chip.fg }]}>{chip.label}</Text>
          </View>
        </View>

        {/* Pickup + drop-off */}
        <View style={styles.locations}>
          <View style={styles.locationRow}>
            <View style={styles.pickupDot} />
            <View style={styles.locationTexts}>
              <Text style={styles.locationLabel}>Pickup</Text>
              <Text style={styles.locationValue} numberOfLines={1}>
                {ride.pickup?.address || '—'}
              </Text>
            </View>
          </View>

          <View style={styles.connector} />

          <View style={styles.locationRow}>
            <Ionicons
              name="location"
              size={14}
              color="#EF4444"
              style={styles.dropoffIcon}
            />
            <View style={styles.locationTexts}>
              <Text style={styles.locationLabel}>Drop-off</Text>
              <Text style={styles.locationValue} numberOfLines={1}>
                {ride.dropoff?.address || '—'}
              </Text>
            </View>
          </View>
        </View>

        {/* Scheduled actions — Cancel only makes sense while the booking is
            still upcoming; completed/cancelled tickets just show View Details. */}
        {activeTab === 'scheduled' && (
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.actionBtn, { borderColor: '#219EBC' }]}
              activeOpacity={0.8}
              onPress={() => {
                // Pass the booking's real metadata so the ticket renders the
                // seats, passengers and QR without a follow-up fetch (the
                // sched_ id isn't a real Ride, so getRide can't resolve it).
                const b = (ride as any).booking ?? {};
                navigation.navigate('ScheduledTripSummary', {
                  boarding: { id: 'b', name: ride.pickup?.address ?? '—', time: b.departureTime ?? '' },
                  dropping: { id: 'd', name: ride.dropoff?.address ?? '—', time: b.departureTime ?? '' },
                  seats: b.seats ?? [],
                  passengers: b.passengers ?? [],
                  total: ride.actualFare ?? ride.estimatedFare ?? 0,
                  departureDate: b.departureDate,
                  departureIndex: b.departureIndex,
                  bookingId: b.id ?? ride._id,
                  driverId: b.driver ?? undefined,
                  rideId: ride._id,
                });
              }}
            >
              <Text style={[styles.actionText, { color: '#219EBC' }]}>View Details</Text>
            </TouchableOpacity>
            {ride.status !== 'completed' && ride.status !== 'cancelled' && (
              <TouchableOpacity
                style={[styles.actionBtn, { borderColor: '#EF4444', flexDirection: 'row' }]}
                activeOpacity={0.8}
                onPress={() => handleCancelScheduled(ride)}
              >
                <Ionicons name="close-circle-outline" size={16} color="#EF4444" style={{ marginRight: 6 }} />
                <Text style={[styles.actionText, { color: '#EF4444' }]}>Cancel Ride</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Completed rides — let the rider rate the trip after the fact. */}
        {activeTab === 'completed' && (
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.actionBtn, { borderColor: '#0097B3', flexDirection: 'row' }]}
              activeOpacity={0.8}
              onPress={() => setRatingRide(ride)}
            >
              <Ionicons name="star-outline" size={16} color="#0097B3" style={{ marginRight: 6 }} />
              <Text style={[styles.actionText, { color: '#0097B3' }]}>Rate Trip</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Ionicons name="car-outline" size={40} color="#0097B3" />
      </View>
      <Text style={styles.emptyTitle}>No {activeTab} rides</Text>
      <Text style={styles.emptyDesc}>
        {activeTab === 'active'
          ? 'You have no ongoing rides right now.'
          : activeTab === 'completed'
          ? 'Your completed rides will show up here.'
          : activeTab === 'cancelled'
          ? 'No cancelled rides yet.'
          : 'Schedule a ride to see it here.'}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="#0097B3" barStyle="light-content" />

      {/* Teal header */}
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <TouchableOpacity
          onPress={handleBack}
          style={styles.backBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ride History</Text>
        <View style={styles.backBtn} />
      </View>

      {/* Tabs */}
      <View style={styles.tabsRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsContent}
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tabBtn, isActive ? styles.tabBtnActive : styles.tabBtnInactive]}
                onPress={() => setActiveTab(tab.key)}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.tabText,
                    isActive ? styles.tabTextActive : styles.tabTextInactive,
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0097B3" />
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 24 },
            filteredRides.length === 0 && { flexGrow: 1, justifyContent: 'center' },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#0097B3"
              colors={['#0097B3']}
            />
          }
        >
          {filteredRides.length === 0 ? renderEmpty() : filteredRides.map(renderRideCard)}
        </ScrollView>
      )}

      <RatingSheet
        visible={!!ratingRide}
        onClose={() => setRatingRide(null)}
        onSubmit={handleSubmitRating}
        driverName={
          ratingRide?.driver
            ? `${ratingRide.driver.firstName ?? ''} ${ratingRide.driver.lastName ?? ''}`.trim() ||
              'your driver'
            : undefined
        }
        driverAvatar={ratingRide?.driver?.avatar ?? undefined}
        driverRating={
          ratingRide?.driver?.driverProfile?.rating
            ? String(ratingRide.driver.driverProfile.rating)
            : undefined
        }
      />
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
  tabsRow: {
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F3F5',
  },
  tabsContent: {
    paddingHorizontal: s(12),
    paddingVertical: vs(12),
    gap: s(8),
  },
  tabBtn: {
    paddingHorizontal: s(18),
    height: vs(36),
    borderRadius: s(999),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: s(8),
  },
  tabBtnActive: { backgroundColor: Colors.primary },
  tabBtnInactive: { backgroundColor: '#F3F4F6' },
  tabText: { fontFamily: 'Inter-Medium', fontSize: fs(14), lineHeight: fs(20) },
  tabTextActive: { color: Colors.white },
  tabTextInactive: { color: '#6E7491' },
  list: { flex: 1 },
  listContent: { padding: s(16), gap: s(16) },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },

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
    marginBottom: vs(16),
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
    maxWidth: '100%',
  },
  statusDot: { width: s(8), height: s(8), borderRadius: s(4), marginRight: s(8) },
  statusText: {
    fontFamily: 'Inter-Medium',
    fontSize: fs(14),
    lineHeight: fs(20),
    flexShrink: 1,
  },
  typeChip: {
    paddingHorizontal: s(12),
    paddingVertical: vs(4),
    borderRadius: s(10),
    marginLeft: s(8),
  },
  typeChipText: {
    fontFamily: 'Inter-Medium',
    fontSize: fs(14),
    lineHeight: fs(20),
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
    fontSize: fs(16),
    lineHeight: fs(24),
    color: '#101828',
  },
  connector: {
    width: s(2),
    height: vs(16),
    backgroundColor: '#E5E7EB',
    marginLeft: s(5),
    marginVertical: vs(4),
  },

  actionsRow: {
    flexDirection: 'row',
    gap: s(12),
    marginTop: vs(16),
    paddingTop: vs(14),
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  actionBtn: {
    flex: 1,
    height: vs(46),
    borderRadius: s(10),
    borderWidth: 1.2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    fontFamily: 'Inter-Medium',
    fontSize: fs(16),
    lineHeight: fs(24),
  },

  emptyState: { alignItems: 'center', paddingHorizontal: s(32), paddingVertical: vs(48) },
  emptyIcon: {
    width: s(80),
    height: s(80),
    borderRadius: s(40),
    backgroundColor: 'rgba(0, 151, 179, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: vs(16),
  },
  emptyTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(18),
    color: '#101828',
    marginBottom: vs(6),
    textTransform: 'capitalize',
  },
  emptyDesc: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(14),
    color: '#6A7282',
    textAlign: 'center',
    lineHeight: fs(20),
  },
});
