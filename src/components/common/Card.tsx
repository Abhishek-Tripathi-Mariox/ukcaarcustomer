import React from 'react';
import { View, StyleSheet, ViewStyle, ViewProps } from 'react-native';
import { Colors, BorderRadius, Spacing, Shadow } from '@/theme';

interface CardProps extends ViewProps {
  variant?: 'default' | 'elevated' | 'outline' | 'gold';
  padding?: number;
  style?: ViewStyle;
  children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({
  variant = 'default',
  padding = Spacing.base,
  style,
  children,
  ...props
}) => {
  return (
    <View
      style={[
        styles.base,
        styles[variant],
        { padding },
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  base: {
    borderRadius: BorderRadius.lg,
  },
  default: {
    backgroundColor: Colors.backgroundCard,
  },
  elevated: {
    backgroundColor: Colors.backgroundElevated,
    ...Shadow.md,
  },
  outline: {
    backgroundColor: Colors.backgroundCard,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  gold: {
    backgroundColor: Colors.primaryMuted,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
});
