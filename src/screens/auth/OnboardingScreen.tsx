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
import { fs, s, vs } from '@/theme/responsive';

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
    // The original copy here advertised "electricians, cleaners, beauticians"
    // — home-services wording that belongs to a different product. Replaced
    // with ride-safety copy that matches the heading and what UKCAAR does.
    subtitle: 'Verified drivers, live trip tracking and\n24/7 support on every ride.',
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
      <View
        style={[
          styles.bottomSection,
          { paddingBottom: insets.bottom + vs(Spacing['2xl']) },
        ]}
      >
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
    right: s(Spacing.base),
    zIndex: 10,
    paddingVertical: vs(Spacing.xs + 2),
    paddingHorizontal: s(Spacing.base),
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.textSecondary,
    backgroundColor: Colors.backgroundWhite,
  },
  skipText: {
    ...Typography.body,
    fontFamily: 'Inter-Medium',
    color: Colors.textSecondary,
  },
  slideArea: {
    flex: 1,
  },
  slide: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: s(Spacing.xl + 6),
  },
  illustration: {
    width: s(274),
    height: s(247),
    borderRadius: s(20),
    marginBottom: vs(Spacing['2xl']),
  },
  slideTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: fs(30),
    color: Colors.textPrimary,
    textAlign: 'center',
    lineHeight: fs(40),
    marginBottom: vs(Spacing.md),
  },
  slideSubtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(16),
    color: Colors.textPrimary,
    textAlign: 'center',
    lineHeight: fs(24),
    letterSpacing: 0,
    // The slide's 30px side padding leaves ~315px, which the longest authored
    // line ("Plan your trips easily — book a taxi for later and") overruns by a
    // hair, wrapping into an unintended 3rd line. Reclaim 12px per side so each
    // half of the "\n" break stays on one line as designed.
    marginHorizontal: -s(Spacing.md),
  },
  bottomSection: {
    paddingHorizontal: s(Spacing.lg),
    paddingBottom: vs(Spacing['2xl']),
    alignItems: 'center',
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: vs(Spacing.xl),
    gap: s(Spacing.sm),
  },
  dot: {
    width: s(8),
    height: s(8),
    borderRadius: s(4),
  },
  dotActive: {
    backgroundColor: Colors.primary,
  },
  dotInactive: {
    backgroundColor: '#D9D9D9',
  },
  ctaButton: {
    width: '100%',
    height: vs(58),
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.button,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: vs(Spacing.base),
  },
  ctaText: {
    fontFamily: 'Inter-Medium',
    fontSize: fs(18),
    lineHeight: fs(24),
    color: Colors.textOnPrimary,
  },
  termsText: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(14),
    color: Colors.termsMuted,
    textAlign: 'center',
    lineHeight: fs(22),
  },
  termsLink: {
    color: Colors.link,
  },
});
