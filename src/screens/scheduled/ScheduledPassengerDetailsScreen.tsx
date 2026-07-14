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
import { Colors, Shadow, alpha } from '@/theme';
import { fs, s, vs } from '@/theme/responsive';
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
              <Ionicons name="person-outline" size={s(18)} color={Colors.textMuted} />
              <TextInput
                value={p.name}
                onChangeText={(t) => updatePassenger(idx, 'name', t)}
                placeholder="Enter passenger name"
                placeholderTextColor={Colors.textMuted}
                style={styles.input}
              />
            </View>

            <Text style={[styles.label, { marginTop: 16 }]}>Contact Number</Text>
            <View style={styles.inputBox}>
              <Ionicons
                name="call-outline"
                size={s(18)}
                color={Colors.textMuted}
              />
              <TextInput
                value={p.contact}
                onChangeText={(t) => updatePassenger(idx, 'contact', t)}
                placeholder="Enter contact number"
                placeholderTextColor={Colors.textMuted}
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
  headerTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(18),
    color: Colors.white,
    flex: 1,
    textAlign: 'center',
  },

  content: { padding: s(16), paddingBottom: vs(120) },

  card: {
    backgroundColor: Colors.white,
    borderRadius: s(17),
    paddingHorizontal: s(16),
    paddingTop: vs(22),
    paddingBottom: vs(24),
    marginBottom: vs(16),
    ...Shadow.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: vs(16),
  },
  routeName: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(18),
    color: Colors.textPrimary,
    flex: 1,
    marginRight: s(12),
  },
  seatBadge: {
    backgroundColor: Colors.primary,
    height: vs(31),
    minWidth: s(71),
    borderRadius: s(8),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: s(10),
  },
  seatBadgeText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(14),
    color: Colors.white,
  },

  label: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(14),
    color: Colors.textSecondary,
    marginBottom: vs(8),
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(12),
    backgroundColor: Colors.white,
    borderRadius: s(12),
    borderWidth: 1,
    borderColor: Colors.borderLight,
    paddingHorizontal: s(18),
    height: vs(56),
  },
  input: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: fs(14),
    color: Colors.textPrimary,
    padding: 0,
  },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: s(16),
    paddingVertical: vs(18),
    backgroundColor: Colors.backgroundCard,
    ...Shadow.top,
  },
  cta: {
    backgroundColor: Colors.primary,
    borderRadius: s(8),
    height: vs(56),
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaDisabled: {
    opacity: 0.5,
  },
  ctaText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(16),
    color: Colors.white,
  },
  ctaTextDisabled: { color: Colors.white },
});
