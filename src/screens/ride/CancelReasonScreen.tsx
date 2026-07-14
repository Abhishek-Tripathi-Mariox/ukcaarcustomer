import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { Colors } from '@/theme';
import { fs, s, vs } from '@/theme/responsive';

interface CancelReasonScreenProps {
  navigation: any;
  route?: {
    params?: {
      rideId?: string;
    };
  };
}

const REASONS = [
  'Change in plans',
  'Waiting for long time',
  'Unable to contact driver',
  'Driver denied to go to destination',
  'Driver denied to come to pickup',
  'Wrong address shown',
  'The price is not reasonable',
  'Emergency situation',
  'Booking mistake',
  'Poor weather conditions',
  'Other',
];

export const CancelReasonScreen: React.FC<CancelReasonScreenProps> = ({
  navigation,
  route,
}) => {
  const insets = useSafeAreaInsets();
  const rideId = route?.params?.rideId;
  const [selected, setSelected] = useState<string>(REASONS[0]);

  const handleProceed = () => {
    navigation.navigate('CancelRide', { rideId, reason: selected });
  };

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="#0097B3" barStyle="light-content" />

      {/* Teal header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Cancel</Text>
      </View>

      {/* Title */}
      <Text style={styles.title}>Why are you cancelling?</Text>

      {/* Reasons list */}
      <ScrollView
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      >
        {REASONS.map((reason) => {
          const isSelected = selected === reason;
          return (
            <TouchableOpacity
              key={reason}
              style={styles.row}
              onPress={() => setSelected(reason)}
              activeOpacity={0.7}
            >
              <View style={styles.radioOuter}>
                {isSelected && <View style={styles.radioInner} />}
              </View>
              <Text style={styles.reasonText}>{reason}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Bottom Cancel ride button */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={handleProceed}
          activeOpacity={0.85}
        >
          <Text style={styles.cancelButtonText}>Cancel ride</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  header: {
    backgroundColor: Colors.primary,
    paddingBottom: vs(14),
    paddingHorizontal: s(12),
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    padding: s(8),
  },
  headerTitle: {
    fontFamily: 'Inter-Medium',
    fontSize: fs(16),
    lineHeight: fs(20),
    color: Colors.white,
    marginLeft: s(4),
  },
  title: {
    fontFamily: 'Inter-Medium',
    fontSize: fs(18),
    lineHeight: fs(28),
    color: Colors.textPrimary,
    paddingHorizontal: s(20),
    marginTop: vs(18),
    marginBottom: vs(6),
  },
  list: {
    paddingHorizontal: s(20),
    paddingTop: vs(8),
    paddingBottom: vs(24),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: vs(13),
  },
  radioOuter: {
    width: s(18),
    height: s(18),
    borderRadius: s(9),
    borderWidth: 1.5,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: s(9),
    height: s(9),
    borderRadius: s(4.5),
    backgroundColor: Colors.primary,
  },
  reasonText: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(14),
    color: Colors.textPrimary,
    opacity: 0.8,
    marginLeft: s(16),
  },
  bottomBar: {
    paddingHorizontal: s(24),
    paddingTop: vs(12),
    backgroundColor: Colors.white,
  },
  cancelButton: {
    height: vs(48),
    backgroundColor: Colors.primary,
    borderRadius: s(8),
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontFamily: 'Inter-Medium',
    fontSize: fs(18),
    color: Colors.white,
  },
});
