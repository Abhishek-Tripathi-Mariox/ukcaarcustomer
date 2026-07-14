import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  StatusBar,
  Image,
} from 'react-native';
import { Colors, Typography } from '@/theme';
import { fs, s, vs } from '@/theme/responsive';
import { useAppSelector } from '@/store/hooks';
import { useResolveLocation } from '@/hooks/useResolveLocation';

interface SplashScreenProps {
  navigation: any;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ navigation }) => {
  const logoScale = useRef(new Animated.Value(0.5)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const { isAuthenticated, isProfileSetup } = useAppSelector((state) => state.auth);

  // Kick off device-location resolution while the splash is on screen so
  // the home screen can render with real coordinates from the very first
  // frame, instead of starting its own GPS watch and falling back to a
  // hardcoded Dehradun center while the OS warms up.
  useResolveLocation();

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(logoScale, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(taglineOpacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(() => {
      if (isAuthenticated && isProfileSetup) {
        // Fully setup user — go to main app
        navigation.getParent()?.reset({ index: 0, routes: [{ name: 'MainApp' }] });
      } else if (isAuthenticated && !isProfileSetup) {
        // Authenticated but profile not complete
        navigation.replace('CompleteProfile');
      } else {
        // Not authenticated — show onboarding
        navigation.replace('Onboarding');
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [isAuthenticated, isProfileSetup]);

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* Centered Logo */}
      <Animated.View
        style={[
          styles.logoContainer,
          {
            transform: [{ scale: logoScale }],
            opacity: logoOpacity,
          },
        ]}
      >
        <Image
          source={require('../../../assets/images/ukcaar-logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </Animated.View>

      {/* Tagline at bottom */}
      <Animated.Text style={[styles.tagline, { opacity: taglineOpacity }]}>
        Your Ride, Your Road, Our Service
      </Animated.Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: s(213),
    height: s(213),
  },
  tagline: {
    position: 'absolute',
    bottom: vs(50),
    fontFamily: 'Inter-Medium',
    fontSize: fs(16),
    color: Colors.white,
    textAlign: 'center',
    letterSpacing: 0.5,
    textTransform: 'capitalize',
    lineHeight: fs(23),
  },
});
