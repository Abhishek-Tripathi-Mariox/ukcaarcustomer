import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  TextInput,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/theme';
import { KeyboardAwareScrollView } from '@/components/common';
import { useAppSelector } from '@/store/hooks';
import type { ScheduledRoute } from './ScheduledRouteScreen';
import type { RouteVehicle } from '@/services/routeService';

interface Stop { id: string; name: string; time: string }

interface Props {
  navigation: any;
  route: {
    params: {
      route: ScheduledRoute;
      boarding: Stop;
      dropping: Stop;
      seats: number[];
      departureDate: string;
      departureIndex: number;
      driverId: string;
      vehicle: RouteVehicle;
      unitFare: number;
    };
  };
}

export interface Passenger {
  seat: number;
  name: string;
  contact: string;
}

/**
 * One passenger card per booked seat. The first card is pre-filled with
 * the logged-in user's profile (name + phone) — they're paying for the
 * trip and almost always travelling in seat 1, so making them retype it
 * is wasted friction. The field is still editable; they can replace it
 * if they're booking the seat for someone else. Every subsequent seat
 * starts blank and must be filled by the user before Continue activates.
 */
export const ScheduledPassengerDetailsScreen: React.FC<Props> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const {
    route: scheduledRoute,
    boarding,
    dropping,
    seats,
    departureDate,
    departureIndex,
    driverId,
    vehicle,
    unitFare,
  } = route.params;
  const authUser = useAppSelector((s) => s.auth.user);

  const initialPassengers: Passenger[] = useMemo(() => {
    const firstName = (authUser?.firstName ?? '').trim();
    const lastName = (authUser?.lastName ?? '').trim();
    const fullName = [firstName, lastName].filter(Boolean).join(' ');
    const phone = (authUser?.phone ?? '').trim();
    return seats.map((s, idx) => ({
      seat: s,
      name: idx === 0 ? fullName : '',
      contact: idx === 0 ? phone : '',
    }));
    // We only want to seed once on mount; auth changes mid-screen would
    // overwrite anything the user already typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seats]);
  const [passengers, setPassengers] = useState<Passenger[]>(initialPassengers);

  const updatePassenger = (idx: number, field: 'name' | 'contact', value: string) => {
    const next = [...passengers];
    next[idx] = { ...next[idx], [field]: value };
    setPassengers(next);
  };

  const allFilled = passengers.every((p) => p.name.trim() && p.contact.trim());

  const handleContinue = () => {
    if (!allFilled) return;
    navigation.navigate('ScheduledFareSummary', {
      route: scheduledRoute,
      boarding,
      dropping,
      seats,
      passengers,
      departureDate,
      departureIndex,
      driverId,
      vehicle,
      unitFare,
    });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Passenger Details</Text>
        <View style={{ width: 32 }} />
      </View>

      <KeyboardAwareScrollView contentContainerStyle={styles.content}>
        {passengers.map((p, idx) => (
          <View key={p.seat} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.routeName} numberOfLines={1}>
                {scheduledRoute.name}
              </Text>
              <View style={styles.seatBadge}>
                <Text style={styles.seatBadgeText}>Seat {p.seat}</Text>
              </View>
            </View>

            <Text style={styles.label}>Full Name</Text>
            <View style={styles.inputBox}>
              <Ionicons
                name="person-outline"
                size={18}
                color="rgba(0,0,0,0.3)"
              />
              <TextInput
                value={p.name}
                onChangeText={(t) => updatePassenger(idx, 'name', t)}
                placeholder="Enter Full Name"
                placeholderTextColor="rgba(0,0,0,0.3)"
                style={styles.input}
              />
            </View>

            <Text style={[styles.label, { marginTop: 16 }]}>Contact Number</Text>
            <View style={styles.inputBox}>
              <Ionicons
                name="call-outline"
                size={18}
                color="rgba(0,0,0,0.3)"
              />
              <TextInput
                value={p.contact}
                onChangeText={(t) => updatePassenger(idx, 'contact', t)}
                placeholder="Enter contact number"
                placeholderTextColor="rgba(0,0,0,0.3)"
                keyboardType="phone-pad"
                style={styles.input}
              />
            </View>
          </View>
        ))}
      </KeyboardAwareScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.cta, !allFilled && styles.ctaDisabled]}
          onPress={handleContinue}
          activeOpacity={0.85}
          disabled={!allFilled}
        >
          <Text style={[styles.ctaText, !allFilled && styles.ctaTextDisabled]}>
            Continue
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 16,
    color: Colors.white,
    flex: 1,
    textAlign: 'center',
  },

  content: { padding: 16, paddingBottom: 120 },

  // Card — Figma node 71:1549 (gray-tinted at 20% opacity → effectively
  // a light fill on white). 17px radius, ample internal padding.
  card: {
    backgroundColor: 'rgba(217,217,217,0.2)',
    borderRadius: 17,
    paddingHorizontal: 16,
    paddingTop: 22,
    paddingBottom: 24,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  routeName: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 18,
    color: '#000000',
    opacity: 0.8,
    flex: 1,
    marginRight: 12,
  },
  seatBadge: {
    backgroundColor: Colors.primary,
    height: 31,
    minWidth: 71,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  seatBadgeText: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 14,
    color: Colors.white,
  },

  label: {
    fontFamily: 'Poppins-Light',
    fontSize: 14,
    color: '#000000',
    opacity: 0.8,
    marginBottom: 8,
  },
  // 56px white input with hairline border, matches Figma node 70:9251.
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.14)',
    paddingHorizontal: 18,
    height: 56,
  },
  input: {
    flex: 1,
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    color: '#000000',
    padding: 0,
  },

  // Footer — white card pinned to bottom with a top-only shadow.
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingVertical: 18,
    backgroundColor: Colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 8,
  },
  cta: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Disabled (no fields filled) matches Figma node I70:8985;12:13:
  // #333 at 10% opacity over white = a light grey fill with dark grey text.
  ctaDisabled: {
    backgroundColor: 'rgba(51,51,51,0.1)',
  },
  ctaText: {
    fontFamily: 'Inter-Bold',
    fontSize: 14,
    lineHeight: 24,
    letterSpacing: -0.3,
    color: Colors.white,
  },
  ctaTextDisabled: { color: '#333' },
});
