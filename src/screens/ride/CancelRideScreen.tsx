import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Alert,
  ImageBackground,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppDispatch } from '@/store/hooks';
import { cancelRide, clearRide } from '@/store/slices/rideSlice';
import { Colors } from '@/theme';
import { fs, s, vs } from '@/theme/responsive';

interface CancelRideScreenProps {
  navigation: any;
  route?: {
    params?: {
      rideId?: string;
      reason?: string;
    };
  };
}

const RedCrossIcon: React.FC = () => (
  <Svg width={28} height={28} viewBox="0 0 28 28" fill="none">
    <Circle cx="14" cy="14" r="13" stroke="#EE3E35" strokeWidth={1.6} fill="#FFFFFF" />
    <Path
      d="M9.5 9.5L18.5 18.5M18.5 9.5L9.5 18.5"
      stroke="#EE3E35"
      strokeWidth={2}
      strokeLinecap="round"
    />
  </Svg>
);

export const CancelRideScreen: React.FC<CancelRideScreenProps> = ({
  navigation,
  route,
}) => {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const rideId = route?.params?.rideId;
  const reason = route?.params?.reason || 'User cancelled';
  const [cancelling, setCancelling] = useState(false);

  const handleCancel = async () => {
    setCancelling(true);
    try {
      if (rideId) {
        await dispatch(cancelRide({ id: rideId, reason })).unwrap();
      }
      dispatch(clearRide());
      navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
    } catch (err: any) {
      Alert.alert('Error', err || 'Failed to cancel ride');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <ImageBackground
      source={require('../../../assets/cancel-ride/cars-background.png')}
      style={styles.container}
      resizeMode="cover"
    >
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      {/* Dim overlay */}
      <View style={styles.dim} />

      {/* Modal Card */}
      <View style={styles.modal}>
        <View style={styles.iconWrap}>
          <RedCrossIcon />
        </View>

        <Text style={styles.title}>Wait! Driver is almost there.</Text>
        <Text style={styles.subtitle}>
          Are you sure you still want to cancel your UKCAAR?
        </Text>

        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.continueBtn}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <Text style={styles.continueText}>No, Continue</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.cancelBtn, cancelling && { opacity: 0.6 }]}
            onPress={handleCancel}
            disabled={cancelling}
            activeOpacity={0.85}
          >
            <Text style={styles.cancelText}>
              {cancelling ? 'Cancelling...' : 'Yes, Cancel Ride'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Connecting helper text */}
      <Text style={styles.helperText}>
        We are connecting you with the nearest driver {'\u{1F697}'}
      </Text>

      {/* Bottom outlined "Cancel Booking" button */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={styles.cancelBookingBtn}
          onPress={handleCancel}
          disabled={cancelling}
          activeOpacity={0.85}
        >
          <Text style={styles.cancelBookingText}>Cancel Booking</Text>
        </TouchableOpacity>
      </View>
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F4F4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(65,65,65,0.5)',
  },
  modal: {
    width: s(295),
    backgroundColor: Colors.white,
    borderRadius: s(14),
    paddingVertical: vs(30),
    paddingHorizontal: s(24),
    alignItems: 'center',
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
  iconWrap: {
    marginBottom: vs(14),
  },
  title: {
    fontFamily: 'Inter-Bold',
    fontSize: fs(16),
    lineHeight: fs(22),
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: vs(10),
  },
  subtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(14),
    lineHeight: fs(20),
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: vs(22),
  },
  buttonRow: {
    flexDirection: 'row',
    gap: s(12),
  },
  continueBtn: {
    width: s(110),
    height: vs(48),
    borderRadius: s(10),
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueText: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(14),
    color: Colors.primary,
  },
  cancelBtn: {
    width: s(130),
    height: vs(48),
    borderRadius: s(10),
    backgroundColor: Colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(14),
    color: Colors.white,
  },
  helperText: {
    position: 'absolute',
    bottom: vs(110),
    left: 0,
    right: 0,
    fontFamily: 'Inter-Regular',
    fontSize: fs(14),
    lineHeight: fs(20),
    color: Colors.white,
    textAlign: 'center',
    paddingHorizontal: s(24),
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: s(24),
    paddingTop: vs(12),
  },
  cancelBookingBtn: {
    height: vs(58),
    borderRadius: s(8),
    borderWidth: 1,
    borderColor: Colors.error,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBookingText: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(16),
    color: Colors.error,
    letterSpacing: -0.408,
  },
});
