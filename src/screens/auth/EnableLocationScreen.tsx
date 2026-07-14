import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Dimensions,
  Alert,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {
  check,
  request,
  PERMISSIONS,
  RESULTS,
} from 'react-native-permissions';
import { Platform } from 'react-native';
import { fs, s, vs } from '@/theme/responsive';
import { Colors, Typography, Spacing, BorderRadius, alpha } from '@/theme';

// ... other imports ...

const LOCATION_PERMISSION =
  Platform.OS === 'ios'
    ? PERMISSIONS.IOS.LOCATION_WHEN_IN_USE
    : PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION;

const { width, height } = Dimensions.get('window');

interface EnableLocationScreenProps {
  navigation: any;
}

export const EnableLocationScreen: React.FC<EnableLocationScreenProps> = ({
  navigation,
}) => {
  const goToMain = () => {
    navigation.getParent()?.reset({ index: 0, routes: [{ name: 'MainApp' }] });
  };

  const handleUseLocation = async () => {
    const current = await check(LOCATION_PERMISSION);
    const status =
      current === RESULTS.GRANTED ? current : await request(LOCATION_PERMISSION);
    if (status === RESULTS.GRANTED || status === RESULTS.LIMITED) {
      goToMain();
    } else {
      Alert.alert(
        'Location Permission',
        'Location access helps us find rides near you. You can enable it later from Settings.',
        [{ text: 'Continue anyway', onPress: goToMain }],
      );
    }
  };

  const handleSkip = () => {
    goToMain();
  };

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      {/* Map Background Grid */}
      <View style={styles.mapBackground}>
        <View style={styles.mapGrid}>
          {Array.from({ length: 20 }).map((_, i) => (
            <View key={`h${i}`} style={[styles.mapLineH, { top: vs(i * 40) }]} />
          ))}
          {Array.from({ length: 12 }).map((_, i) => (
            <View key={`v${i}`} style={[styles.mapLineV, { left: s(i * 40) }]} />
          ))}
        </View>
      </View>

      {/* Content overlay */}
      <View style={styles.contentOverlay}>
        {/* Location Icon */}
        <View style={styles.iconContainer}>
          <View style={styles.pulseOuter} />
          <View style={styles.pulseMiddle} />
          <View style={styles.iconCircle}>
            <Ionicons name="location" size={s(32)} color={Colors.primary} />
          </View>
        </View>

        {/* Title */}
        <Text style={styles.title}>Enable your location</Text>
        <Text style={styles.subtitle}>
          Choose your location to start find the{'\n'}request around you
        </Text>

        {/* Use my location button - Teal */}
        <TouchableOpacity
          style={styles.ctaButton}
          onPress={handleUseLocation}
          activeOpacity={0.85}
        >
          <Text style={styles.ctaText}>Use my location</Text>
        </TouchableOpacity>

        {/* Skip for now */}
        <TouchableOpacity
          style={styles.skipButton}
          onPress={handleSkip}
          activeOpacity={0.7}
        >
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E8F0F2', // Keep background color specific for map
  },
  mapBackground: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.3,
  },
  mapGrid: {
    flex: 1,
    position: 'relative',
  },
  mapLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#B0C4CE',
  },
  mapLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: '#B0C4CE',
  },
  contentOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  iconContainer: {
    width: s(120),
    height: s(120),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing['2xl'],
    position: 'relative',
  },
  pulseOuter: {
    position: 'absolute',
    width: s(120),
    height: s(120),
    borderRadius: s(60),
    backgroundColor: Colors.primaryMuted,
  },
  pulseMiddle: {
    position: 'absolute',
    width: s(90),
    height: s(90),
    borderRadius: s(45),
    backgroundColor: alpha(Colors.primary, 0.15),
  },
  iconCircle: {
    width: s(60),
    height: s(60),
    borderRadius: s(30),
    backgroundColor: Colors.backgroundWhite,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.primary,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  title: {
    fontFamily: 'Inter-Bold',
    fontSize: fs(30),
    lineHeight: fs(40),
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  subtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(16),
    color: Colors.textPrimary,
    textAlign: 'center',
    lineHeight: fs(24),
    letterSpacing: 0,
    marginBottom: Spacing['3xl'],
  },
  ctaButton: {
    width: '100%',
    height: vs(58),
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.button,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.base,
  },
  ctaText: {
    fontFamily: 'Inter-Medium',
    fontSize: fs(18),
    lineHeight: fs(24),
    color: Colors.textOnPrimary,
  },
  skipButton: {
    paddingVertical: Spacing.md,
  },
  skipText: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(16),
    color: Colors.termsMuted,
  },
});
