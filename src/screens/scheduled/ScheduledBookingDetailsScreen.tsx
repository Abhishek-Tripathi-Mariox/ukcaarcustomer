import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Alert,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Shadow, alpha } from '@/theme';
import { fs, s, vs } from '@/theme/responsive';
import { routeService } from '@/services/routeService';
import type { ScheduledRoute } from './ScheduledRouteScreen';
import type { Passenger } from './ScheduledPassengerDetailsScreen';

interface Stop { id: string; name: string; time: string }

interface Props {
  navigation: any;
  route: {
    params: {
      route: ScheduledRoute;
      boarding: Stop;
      dropping: Stop;
      seats: number[];
      passengers: Passenger[];
      total: number;
      departureDate?: string;
      departureIndex?: number;
      /** Persisted booking id (`sched_`-prefixed or raw) — present when the
       *  booking exists server-side so Cancel can act on it. */
      bookingId?: string;
      /** Driver/vehicle the seats are on — forwarded into the ticket QR. */
      driverId?: string;
      returnDeparture?: { time: string };
    };
  };
}

// Format a YYYY-MM-DD into "Sunday, January 18, 2026". Falls back to
// today only if the booking flow somehow didn't carry a date through.
const formatDepartureDate = (iso?: string): string => {
  const d = iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? new Date(`${iso}T00:00:00`)
    : new Date();
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
};

export const ScheduledBookingDetailsScreen: React.FC<Props> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const {
    route: scheduledRoute,
    boarding,
    dropping,
    seats,
    passengers,
    total,
    departureDate,
    departureIndex,
    bookingId,
    driverId,
    returnDeparture,
  } = route.params;

  const [cancelling, setCancelling] = useState(false);

  // Real seat label — just the picked seat numbers. The previous "A12"
  // default was a leftover demo.
  const seatLabel = seats.length > 0 ? seats.map((s) => `Seat ${s}`).join(', ') : '—';

  const handleCancel = () => {
    if (!bookingId) {
      // No persisted booking id to act on (older nav path) — just send the
      // rider home; they can cancel from the Activity tab where the id is known.
      Alert.alert(
        'Cancel from Activity',
        'Please cancel this booking from the Activity → Scheduled tab.',
        [{ text: 'OK', onPress: handleGoHome }],
      );
      return;
    }
    Alert.alert('Cancel Ride', 'Are you sure you want to cancel this scheduled ride?', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel Ride',
        style: 'destructive',
        onPress: async () => {
          setCancelling(true);
          try {
            await routeService.cancelBooking(bookingId);
            Alert.alert('Cancelled', 'Your scheduled ride has been cancelled.', [
              { text: 'OK', onPress: handleGoHome },
            ]);
          } catch {
            Alert.alert('Error', 'Failed to cancel. Please try again.');
          } finally {
            setCancelling(false);
          }
        },
      },
    ]);
  };

  // Drop the rider on the home tab navigator instead of popping the
  // booking flow's stack — the booking persists server-side, they can
  // open the Activity tab later to review it. Without this the back
  // chevron unwound through the entire booking flow.
  const handleGoHome = () => {
    navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
  };

  // Jump to a specific main tab (Home / Activity / Account) from the bottom
  // navbar. Reset rather than navigate so the booking-flow stack is cleared —
  // the rider lands cleanly on the tab with the real bottom navbar, instead of
  // back-buttoning through seats/payment.
  const goToTab = (screen: 'Home' | 'Activity' | 'Account') => {
    navigation.reset({
      index: 0,
      routes: [{ name: 'MainTabs', params: { screen } }],
    });
  };

  // Mirror the real bottom tab bar (MainNavigator → TabNavigator): same order,
  // icons, labels, sizes and colours so it reads as the app's navbar, not a
  // bespoke one.
  const NAV_ITEMS: { screen: 'Home' | 'Activity' | 'Account'; label: string; icon: string }[] = [
    { screen: 'Activity', label: 'Activity', icon: 'document-text-outline' },
    { screen: 'Home', label: 'Home', icon: 'home-outline' },
    { screen: 'Account', label: 'Account', icon: 'person-outline' },
  ];

  const handleViewTicket = () => {
    navigation.navigate('ScheduledTripSummary', {
      route: scheduledRoute,
      boarding,
      dropping,
      seats,
      passengers,
      total,
      departureDate,
      departureIndex,
      bookingId,
      driverId,
      returnDeparture,
    });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleGoHome}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={s(24)} color={Colors.white} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 110 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.checkCircle}>
            <Ionicons name="checkmark" size={44} color={Colors.white} />
          </View>
          <Text style={styles.title}>Booking Confirmed!</Text>
          <Text style={styles.subtitle}>Your ride has been successfully booked</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Booking Details</Text>
            <View style={styles.statusChip}>
              <Ionicons name="checkmark-circle" size={14} color={Colors.white} />
              <Text style={styles.statusText}>Confirmed</Text>
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Route</Text>
            <View style={styles.fieldValueRow}>
              <Ionicons name="bus" size={20} color={Colors.primary} />
              <Text style={styles.fieldValue}>
                {boarding.name} → {dropping.name}
              </Text>
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Departure Date & Time</Text>
            <Text style={styles.fieldValueLight}>{formatDepartureDate(departureDate)}</Text>
            <Text style={styles.fieldValueBold}>{boarding.time}</Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Seat Number</Text>
            <View style={styles.fieldValueRow}>
              <Ionicons name="person" size={20} color={Colors.primary} />
              <Text style={styles.seatValue}>{seatLabel}</Text>
            </View>
          </View>

          <View style={[styles.field, { marginBottom: 0 }]}>
            <Text style={styles.fieldLabel}>Fare</Text>
            <Text style={styles.fareValue}>{'\u20B9'}{total}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.trackBtn}
          activeOpacity={0.85}
          onPress={() =>
            navigation.navigate('ScheduledTrack', { routeId: scheduledRoute.id })
          }
        >
          <Text style={styles.trackText}>Track Vehicle</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.cancelBtn, cancelling && { opacity: 0.6 }]}
          onPress={handleCancel}
          disabled={cancelling}
          activeOpacity={0.85}
        >
          <Text style={styles.cancelText}>{cancelling ? 'Cancelling…' : 'Cancel Ride'}</Text>
        </TouchableOpacity>

        <View style={styles.reminderBanner}>
          <Text style={styles.reminderText}>💡 We'll remind you before departure</Text>
        </View>

        <TouchableOpacity
          style={styles.viewTicketLink}
          onPress={handleViewTicket}
          activeOpacity={0.7}
        >
          <Text style={styles.viewTicketText}>View Ticket</Text>
          <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
        </TouchableOpacity>

      </ScrollView>

      {/* Bottom navbar — the booking lives on the server, so let the rider jump
          straight to any main tab instead of back-buttoning through the whole
          booking flow. */}
      <View style={[styles.navbar, { paddingBottom: insets.bottom + 10 }]}>
        {NAV_ITEMS.map((t) => (
          <TouchableOpacity
            key={t.screen}
            style={styles.navItem}
            onPress={() => goToTab(t.screen)}
            activeOpacity={0.7}
          >
            <Ionicons name={t.icon as any} size={22} color={Colors.tabInactive} />
            <Text style={styles.navLabel}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundCard },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: s(8),
    paddingVertical: vs(8),
    backgroundColor: Colors.primary,
  },
  backBtn: {
    width: s(40),
    height: s(40),
    alignItems: 'center',
    justifyContent: 'center',
  },

  content: { paddingHorizontal: s(16), paddingBottom: vs(40) },

  hero: { alignItems: 'center', marginTop: vs(8), marginBottom: vs(24) },
  checkCircle: {
    width: s(80),
    height: s(80),
    borderRadius: s(40),
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(30),
    lineHeight: fs(40),
    color: Colors.textPrimary,
    textAlign: 'center',
    marginTop: vs(22),
  },
  subtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(16),
    lineHeight: fs(24),
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: vs(4),
  },

  card: {
    backgroundColor: Colors.white,
    borderRadius: s(12),
    padding: s(16),
    ...Shadow.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: vs(16),
  },
  cardTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(20),
    lineHeight: fs(28),
    color: Colors.textPrimary,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(4),
    backgroundColor: Colors.success,
    paddingHorizontal: s(10),
    paddingVertical: vs(4),
    borderRadius: s(8),
  },
  statusText: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(13),
    color: Colors.white,
  },

  field: { marginBottom: vs(16) },
  fieldLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: fs(14),
    lineHeight: fs(22),
    color: Colors.textSecondary,
    marginBottom: vs(4),
  },
  fieldValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(8),
  },
  fieldValue: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(16),
    lineHeight: fs(24),
    color: Colors.textPrimary,
    flex: 1,
    flexShrink: 1,
  },
  fieldValueLight: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(16),
    lineHeight: fs(24),
    color: Colors.textPrimary,
  },
  fieldValueBold: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(16),
    lineHeight: fs(24),
    color: Colors.textPrimary,
  },
  seatValue: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(20),
    lineHeight: fs(28),
    color: Colors.textPrimary,
  },
  fareValue: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(20),
    lineHeight: fs(28),
    color: Colors.primary,
  },

  trackBtn: {
    backgroundColor: Colors.primary,
    borderRadius: s(16),
    height: vs(48),
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: vs(24),
  },
  trackText: {
    fontFamily: 'Inter-Medium',
    fontSize: fs(14),
    color: Colors.white,
  },
  cancelBtn: {
    borderWidth: 1.2,
    borderColor: alpha(Colors.error, 0.5),
    borderRadius: s(16),
    height: vs(50),
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: vs(16),
  },
  cancelText: {
    fontFamily: 'Inter-Medium',
    fontSize: fs(14),
    color: Colors.error,
  },

  reminderBanner: {
    backgroundColor: Colors.primary,
    borderRadius: s(24),
    paddingVertical: vs(16),
    paddingHorizontal: s(16),
    marginTop: vs(24),
    alignItems: 'center',
  },
  reminderText: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(14),
    lineHeight: fs(20),
    color: Colors.white,
    textAlign: 'center',
  },

  viewTicketLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: s(4),
    marginTop: vs(18),
    paddingVertical: vs(8),
  },
  viewTicketText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(14),
    color: Colors.primary,
  },
  navbar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.backgroundCard,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    paddingTop: vs(6),
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: vs(2),
  },
  navLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: fs(11),
    color: Colors.tabInactive,
  },
});
