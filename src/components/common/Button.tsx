import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  TouchableOpacityProps,
} from 'react-native';
import { Colors, Typography, BorderRadius, Shadow, Spacing } from '@/theme';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'gold';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends TouchableOpacityProps {
  title: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  variant = 'primary',
  size = 'lg',
  loading = false,
  icon,
  iconRight,
  fullWidth = true,
  disabled,
  style,
  ...props
}) => {
  const containerStyle: ViewStyle[] = [
    styles.base,
    styles[`variant_${variant}`],
    styles[`size_${size}`],
    fullWidth && styles.fullWidth,
    disabled && styles.disabled,
    variant === 'primary' && !disabled ? Shadow.teal : undefined,
    variant === 'gold' && !disabled ? Shadow.gold : undefined,
    style as ViewStyle,
  ].filter(Boolean) as ViewStyle[];

  const textStyle: TextStyle[] = [
    styles.text,
    styles[`text_${variant}`],
    styles[`textSize_${size}`],
    disabled && styles.textDisabled,
  ];

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      disabled={disabled || loading}
      style={containerStyle}
      {...props}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' ? Colors.textOnPrimary : Colors.primary}
          size="small"
        />
      ) : (
        <>
          {icon}
          <Text style={textStyle}>{title}</Text>
          {iconRight}
        </>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.5,
  },

  // Variants
  variant_primary: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.button,
  },
  variant_secondary: {
    backgroundColor: Colors.backgroundElevated,
    borderRadius: BorderRadius.base,
  },
  variant_outline: {
    backgroundColor: Colors.transparent,
    borderRadius: BorderRadius.base,
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  variant_ghost: {
    backgroundColor: Colors.transparent,
  },
  variant_danger: {
    backgroundColor: Colors.errorLight,
    borderRadius: BorderRadius.base,
  },
  variant_gold: {
    backgroundColor: Colors.gold,
    borderRadius: BorderRadius.button,
  },

  // Sizes
  size_sm: {
    height: 36,
    paddingHorizontal: Spacing.base,
  },
  size_md: {
    height: 44,
    paddingHorizontal: Spacing.lg,
  },
  size_lg: {
    height: 54,
    paddingHorizontal: Spacing.xl,
  },

  // Text
  text: {
    ...Typography.button,
  },
  text_primary: {
    color: Colors.textOnPrimary,
  },
  text_secondary: {
    color: Colors.textPrimary,
  },
  text_outline: {
    color: Colors.primary,
  },
  text_ghost: {
    color: Colors.primary,
  },
  text_danger: {
    color: Colors.error,
  },
  text_gold: {
    color: Colors.white,
  },
  textDisabled: {
    opacity: 0.7,
  },
  textSize_sm: {
    ...Typography.buttonSmall,
  },
  textSize_md: {
    ...Typography.button,
  },
  textSize_lg: {
    ...Typography.button,
  },
});
