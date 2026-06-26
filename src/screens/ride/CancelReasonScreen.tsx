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
    backgroundColor: '#FFFFFF',
  },
  header: {
    backgroundColor: '#0097B3',
    paddingBottom: 14,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    padding: 8,
  },
  headerTitle: {
    fontFamily: 'Inter-Medium',
    fontSize: 16,
    lineHeight: 20,
    color: '#FFFFFF',
    marginLeft: 4,
  },
  title: {
    fontFamily: 'Inter-Medium',
    fontSize: 18,
    lineHeight: 28,
    color: '#121212',
    paddingHorizontal: 20,
    marginTop: 18,
    marginBottom: 6,
  },
  list: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
  },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#0097B3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#0097B3',
  },
  reasonText: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: '#121212',
    opacity: 0.8,
    marginLeft: 16,
  },
  bottomBar: {
    paddingHorizontal: 24,
    paddingTop: 12,
    backgroundColor: '#FFFFFF',
  },
  cancelButton: {
    height: 48,
    backgroundColor: '#0097B3',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontFamily: 'Inter-Medium',
    fontSize: 18,
    color: '#FFFFFF',
  },
});
