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
import { Colors, Shadow } from '@/theme';
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
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      <View style={styles.header}>
        <TouchableOpacity
          // The booking persists on the backend — leaving the screen
          // shouldn't pop the booking-flow stack (which would dump the
          // rider back on the seat/pickers). Drop straight to Home.
          onPress={handleGoHome}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
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
  container: { flex: 1, backgroundColor: Colors.white },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  content: { paddingHorizontal: 16, paddingBottom: 40 },

  hero: { alignItems: 'center', marginTop: 8, marginBottom: 24 },
  checkCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 30,
    lineHeight: 40,
    color: '#1E293B',
    textAlign: 'center',
    marginTop: 22,
  },
  subtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 16,
    lineHeight: 24,
    color: 'rgba(0,0,0,0.6)',
    textAlign: 'center',
    marginTop: 4,
  },

  card: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 16,
    ...Shadow.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  cardTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 20,
    lineHeight: 28,
    color: '#1E293B',
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#2E7D32',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: Colors.white,
  },

  field: { marginBottom: 16 },
  fieldLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    lineHeight: 22,
    color: 'rgba(0,0,0,0.6)',
    marginBottom: 4,
  },
  fieldValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fieldValue: {
    fontFamily: 'Inter-Regular',
    fontSize: 16,
    lineHeight: 24,
    color: '#1E293B',
    flex: 1,
  },
  fieldValueLight: {
    fontFamily: 'Inter-Regular',
    fontSize: 16,
    lineHeight: 24,
    color: '#1E293B',
  },
  fieldValueBold: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    lineHeight: 24,
    color: '#1E293B',
  },
  seatValue: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 20,
    lineHeight: 28,
    color: '#1E293B',
  },
  fareValue: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 20,
    lineHeight: 28,
    color: Colors.primary,
  },

  trackBtn: {
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderRadius: 16,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  trackText: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    color: 'rgba(0,0,0,0.26)',
  },
  cancelBtn: {
    borderWidth: 1.2,
    borderColor: 'rgba(255,107,107,0.5)',
    borderRadius: 16,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  cancelText: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    color: '#FF6B6B',
  },

  reminderBanner: {
    backgroundColor: '#33ABC2',
    borderRadius: 24,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginTop: 24,
    alignItems: 'center',
  },
  reminderText: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    lineHeight: 20,
    color: Colors.white,
    textAlign: 'center',
  },

  viewTicketLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 18,
    paddingVertical: 8,
  },
  viewTicketText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: Colors.primary,
  },
  // Matches MainNavigator's tabBarStyle (backgroundCard, divider border,
  // 6px top padding) so it's visually identical to the home navbar.
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
    paddingTop: 6,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  navLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    color: Colors.tabInactive,
  },
});
