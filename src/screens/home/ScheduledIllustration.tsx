import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { Colors } from '@/theme';

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
        <View style={[styles.dot, { backgroundColor: Colors.dropoffRed }]} />
      </View>
      <View style={styles.captionRow}>
        <Ionicons name="information-circle-outline" size={14} color={Colors.textMuted} />
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
    paddingHorizontal: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  dashedLine: {
    flex: 1,
    height: 0,
    borderTopWidth: 2,
    borderTopColor: Colors.border,
    borderStyle: 'dashed',
    marginHorizontal: 8,
  },
  captionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  caption: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
  },
});
