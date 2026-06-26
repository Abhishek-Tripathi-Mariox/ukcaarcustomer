import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Animated,
  TouchableOpacity,
  StatusBar,
  Image,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, BorderRadius } from '@/theme';

const { width, height } = Dimensions.get('window');

interface OnboardingScreenProps {
  navigation: any;
}

const slides = [
  {
    id: '1',
    image: require('../../../assets/images/onboarding-ride.png'),
    title: 'Ride Anytime, Anywhere',
    subtitle: 'Book cabs, autos, or bikes in seconds\nwith real-time tracking and transparent fares.',
  },
  {
    id: '2',
    image: require('../../../assets/images/onboarding-schedule.png'),
    title: 'Schedule Rides in Advance',
    subtitle: 'Plan your trips easily — book a taxi for later and\nenjoy on-time pickups without the wait.',
  },
  {
    id: '3',
    image: require('../../../assets/images/onboarding-safe.png'),
    title: 'Safe & Reliable Every Time',
    subtitle: 'Electricians, cleaners, beauticians & more —\nverified experts just a tap away.',
  },
];

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;
  const flatListRef = useRef<any>(null);
  const autoScrollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeIndexRef = useRef(0);

  const startAutoScroll = useCallback(() => {
    if (autoScrollTimer.current) clearInterval(autoScrollTimer.current);
    autoScrollTimer.current = setInterval(() => {
      const nextIndex = (activeIndexRef.current + 1) % slides.length;
      flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
      activeIndexRef.current = nextIndex;
      setActiveIndex(nextIndex);
    }, 3000);
  }, []);

  useEffect(() => {
    startAutoScroll();
    return () => {
      if (autoScrollTimer.current) clearInterval(autoScrollTimer.current);
    };
  }, [startAutoScroll]);

  const handleSkip = () => {
    navigation.replace('Login');
  };

  const handleCTA = () => {
    navigation.replace('Login');
  };

  const renderSlide = ({ item, index }: { item: typeof slides[0]; index: number }) => {
    return (
      <View style={[styles.slide, { width }]}>
        <Image
          source={item.image}
          style={styles.illustration}
          resizeMode="cover"
        />
        <Text style={styles.slideTitle}>{item.title}</Text>
        <Text style={styles.slideSubtitle}>{item.subtitle}</Text>
      </View>
    );
  };

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      const index = viewableItems[0].index;
      setActiveIndex(index);
      activeIndexRef.current = index;
      // Reset auto-scroll timer on manual swipe
      startAutoScroll();
    }
  }).current;

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      {/* Skip button - top right, above image (Figma: top ~59px) */}
      <TouchableOpacity
        style={[styles.skipButton, { top: insets.top + Spacing.md }]}
        onPress={handleSkip}
      >
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      {/* Slide content area — fills space between top and bottom section */}
      <View style={[styles.slideArea, { paddingTop: insets.top + 52 }]}>
        <Animated.FlatList
          ref={flatListRef}
          data={slides}
          renderItem={renderSlide}
          keyExtractor={(item) => item.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { x: scrollX } } }],
            { useNativeDriver: true }
          )}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{ viewAreaCoveragePercentThreshold: 50 }}
          bounces={false}
        />
      </View>

      {/* Bottom Section — fixed at bottom */}
      <View style={styles.bottomSection}>
        {/* Dots indicator */}
        <View style={styles.pagination}>
          {slides.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === activeIndex ? styles.dotActive : styles.dotInactive,
              ]}
            />
          ))}
        </View>

        {/* CTA Button — Teal (Figma) */}
        <TouchableOpacity style={styles.ctaButton} onPress={handleCTA} activeOpacity={0.85}>
          <Text style={styles.ctaText}>Login</Text>
        </TouchableOpacity>

        {/* Terms footer */}
        <Text style={styles.termsText}>
          By continuing you agree to our{' '}
          <Text style={styles.termsLink} onPress={() => Linking.openURL('https://ukcaar.com/terms')}>Terms of Services</Text> and{' '}
          <Text style={styles.termsLink} onPress={() => Linking.openURL('https://ukcaar.com/privacy')}>Privacy Policy</Text>
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.backgroundWhite,
  },
  skipButton: {
    position: 'absolute',
    right: Spacing.base,
    zIndex: 10,
    paddingVertical: Spacing.xs + 2,
    paddingHorizontal: Spacing.base,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.textSecondaryFigma,
    backgroundColor: Colors.backgroundWhite,
  },
  skipText: {
    ...Typography.body,
    color: Colors.textSecondaryFigma,
  },
  slideArea: {
    flex: 1,
  },
  slide: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl + 6,
  },
  illustration: {
    width: 274,
    height: 247,
    borderRadius: 20,
    marginBottom: Spacing['2xl'],
  },
  slideTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: Colors.black,
    textAlign: 'center',
    lineHeight: 40,
    marginBottom: Spacing.md,
  },
  slideSubtitle: {
    fontSize: 16,
    fontWeight: '400',
    color: '#7D8A95',
    textAlign: 'center',
    lineHeight: 24,
    letterSpacing: 0,
  },
  bottomSection: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing['2xl'],
    alignItems: 'center',
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xl,
    gap: Spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    backgroundColor: Colors.primary,
  },
  dotInactive: {
    backgroundColor: '#D9D9D9',
  },
  ctaButton: {
    width: '100%',
    height: 58,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.button,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.base,
  },
  ctaText: {
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 24,
    color: Colors.textOnPrimary,
  },
  termsText: {
    fontSize: 14,
    fontWeight: '400',
    color: Colors.termsMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
  termsLink: {
    color: Colors.link,
  },
});
