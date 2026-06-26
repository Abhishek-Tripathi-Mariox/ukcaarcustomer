import React from 'react';
import { View, Text, Image, StyleSheet, ViewStyle } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { Colors, Typography, Spacing, BorderRadius } from '@/theme';

interface AvatarProps {
  uri?: string;
  name?: string;
  size?: number;
  style?: ViewStyle;
  showOnline?: boolean;
  rating?: number;
}

export const Avatar: React.FC<AvatarProps> = ({
  uri,
  name,
  size = 48,
  style,
  showOnline,
  rating,
}) => {
  const initials = name
    ? name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '?';

  return (
    <View style={[styles.container, style]}>
      <View
        style={[
          styles.avatar,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
        ]}
      >
        {uri ? (
          <Image
            source={{ uri }}
            style={[
              styles.image,
              { width: size, height: size, borderRadius: size / 2 },
            ]}
          />
        ) : (
          <Text style={[styles.initials, { fontSize: size / 2.5 }]}>
            {initials}
          </Text>
        )}
      </View>
      {showOnline && <View style={styles.onlineDot} />}
      {rating !== undefined && (
        <View style={styles.ratingBadge}>
          <Ionicons name="star" size={10} color={Colors.star} />
          <Text style={styles.ratingText}>{rating.toFixed(1)}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  avatar: {
    backgroundColor: Colors.backgroundElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
  },
  image: {
    resizeMode: 'cover',
  },
  initials: {
    color: Colors.primary,
    fontWeight: '600',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.online,
    borderWidth: 2,
    borderColor: Colors.backgroundCard,
  },
  ratingBadge: {
    position: 'absolute',
    bottom: -4,
    right: -8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 4,
    paddingVertical: 2,
    gap: 2,
  },
  ratingText: {
    ...Typography.caption,
    color: Colors.textPrimary,
    fontWeight: '600',
    fontSize: 10,
  },
});
