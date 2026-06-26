import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { Colors, Typography, Spacing, IconSize } from '@/theme';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  rightAction?: React.ReactNode;
  transparent?: boolean;
  light?: boolean;
  style?: ViewStyle;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  onBack,
  rightAction,
  transparent = false,
  light = false,
  style,
}) => {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + Spacing.sm },
        transparent && styles.transparent,
        style,
      ]}
    >
      <StatusBar
        barStyle={light ? 'dark-content' : 'light-content'}
        translucent
        backgroundColor="transparent"
      />
      <View style={styles.content}>
        <View style={styles.left}>
          {onBack && (
            <TouchableOpacity
              onPress={onBack}
              style={styles.backButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <View style={styles.backCircle}>
                <Ionicons
                  name="chevron-back"
                  size={IconSize.md}
                  color={Colors.textPrimary}
                />
              </View>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.center}>
          {title && (
            <Text
              style={[styles.title, light && styles.titleLight]}
              numberOfLines={1}
            >
              {title}
            </Text>
          )}
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
        <View style={styles.right}>{rightAction}</View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.background,
    paddingBottom: Spacing.md,
    paddingHorizontal: Spacing.base,
  },
  transparent: {
    backgroundColor: 'transparent',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
  },
  left: {
    width: 48,
    alignItems: 'flex-start',
  },
  center: {
    flex: 1,
    alignItems: 'center',
  },
  right: {
    width: 48,
    alignItems: 'flex-end',
  },
  backButton: {},
  backCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.backgroundElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...Typography.h5,
    color: Colors.textPrimary,
  },
  titleLight: {
    color: Colors.textDark,
  },
  subtitle: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginTop: 2,
  },
});
