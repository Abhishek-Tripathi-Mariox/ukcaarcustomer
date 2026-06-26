import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { Colors, Typography, Spacing } from '@/theme';

interface LocationDotProps {
  type: 'pickup' | 'dropoff' | 'stop';
  label?: string;
  address?: string;
  showLine?: boolean;
}

export const LocationDot: React.FC<LocationDotProps> = ({
  type,
  label,
  address,
  showLine = false,
}) => {
  const dotColor =
    type === 'pickup'
      ? Colors.pickupGreen
      : type === 'dropoff'
      ? Colors.dropoffRed
      : Colors.primary;

  return (
    <View style={styles.container}>
      <View style={styles.dotColumn}>
        <View style={[styles.dot, { backgroundColor: dotColor }]}>
          {type === 'pickup' && (
            <View style={styles.innerDot} />
          )}
          {type === 'dropoff' && (
            <Ionicons name="location" size={12} color={Colors.white} />
          )}
        </View>
        {showLine && <View style={styles.line} />}
      </View>
      <View style={styles.textColumn}>
        {label && <Text style={styles.label}>{label}</Text>}
        {address && (
          <Text style={styles.address} numberOfLines={1}>
            {address}
          </Text>
        )}
      </View>
    </View>
  );
};

interface RouteIndicatorProps {
  pickup: string;
  dropoff: string;
  pickupLabel?: string;
  dropoffLabel?: string;
}

export const RouteIndicator: React.FC<RouteIndicatorProps> = ({
  pickup,
  dropoff,
  pickupLabel = 'Pick up',
  dropoffLabel = 'Drop off',
}) => (
  <View style={styles.routeContainer}>
    <LocationDot
      type="pickup"
      label={pickupLabel}
      address={pickup}
      showLine
    />
    <LocationDot
      type="dropoff"
      label={dropoffLabel}
      address={dropoff}
    />
  </View>
);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  dotColumn: {
    alignItems: 'center',
    width: 24,
    marginRight: Spacing.md,
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.white,
  },
  line: {
    width: 2,
    height: 32,
    backgroundColor: Colors.border,
    marginVertical: 4,
  },
  textColumn: {
    flex: 1,
    paddingTop: 1,
  },
  label: {
    ...Typography.captionBold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  address: {
    ...Typography.body,
    color: Colors.textPrimary,
    marginTop: 2,
  },
  routeContainer: {
    paddingVertical: Spacing.sm,
  },
});
