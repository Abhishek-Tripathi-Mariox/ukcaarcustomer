import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Colors, Spacing } from '@/theme';

interface DividerProps {
  color?: string;
  thickness?: number;
  vertical?: boolean;
  spacing?: number;
}

export const Divider: React.FC<DividerProps> = ({
  color = Colors.divider,
  thickness = 1,
  vertical = false,
  spacing = Spacing.base,
}) => (
  <View
    style={[
      vertical ? styles.vertical : styles.horizontal,
      {
        backgroundColor: color,
        [vertical ? 'width' : 'height']: thickness,
        [vertical ? 'marginHorizontal' : 'marginVertical']: spacing,
      },
    ]}
  />
);

const styles = StyleSheet.create({
  horizontal: {
    width: '100%',
  },
  vertical: {
    height: '100%',
  },
});
