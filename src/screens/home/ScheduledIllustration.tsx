import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { Colors } from '@/theme';

import { fs, s, vs } from '@/theme/responsive';

/**
 * Replaces the live map on the Home Scheduled tab. Scheduled rides follow
 * fixed admin-defined routes, so a live map of nearby cabs is misleading.
 * A static two-pin "route line" makes the metaphor obvious.
 */
export const ScheduledIllustration: React.FC = () => {
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: Colors.primary }]} />
        <View style={styles.dashedLine} />
        <View style={[styles.dot, { backgroundColor: Colors.error }]} />
      </View>
      <View style={styles.captionRow}>
        <Ionicons name="information-circle-outline" size={s(14)} color={Colors.textMuted} />
        <Text style={styles.caption}>
          Scheduled rides follow fixed routes — pick yours below.
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.backgroundCard,
    paddingHorizontal: s(24),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: vs(12),
  },
  dot: {
    width: s(14),
    height: s(14),
    borderRadius: s(7),
  },
  dashedLine: {
    flex: 1,
    height: 0,
    borderTopWidth: 2,
    borderTopColor: Colors.border,
    borderStyle: 'dashed',
    marginHorizontal: s(8),
  },
  captionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(6),
  },
  caption: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(12),
    color: Colors.textMuted,
    textAlign: 'center',
  },
});
