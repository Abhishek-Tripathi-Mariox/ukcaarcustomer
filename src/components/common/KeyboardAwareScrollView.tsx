import React from 'react';
import { ScrollViewProps, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { KeyboardAwareScrollView as KASV } from 'react-native-keyboard-aware-scroll-view';

interface KeyboardAwareScrollViewProps extends ScrollViewProps {
  children: React.ReactNode;
  /** Style for the scroll container (defaults to flex:1 so it fills its slot). */
  containerStyle?: StyleProp<ViewStyle>;
  /**
   * Gap (px) kept between the focused input and the top of the keyboard. Larger
   * = the whole input box sits further above the keyboard.
   */
  extraHeight?: number;
}

/**
 * Drop-in replacement for a screen's main `ScrollView` that lifts the WHOLE
 * focused input above the keyboard.
 *
 * Backed by `react-native-keyboard-aware-scroll-view` (pure JS) because the
 * customer app's translucent status bar disables Android's `adjustResize`, so
 * the OS won't scroll inputs into view on its own. The library:
 *   - `enableOnAndroid`        → works despite the broken adjustResize
 *   - `enableAutomaticScroll`  → re-scrolls every time a *different* field is
 *                                focused (fixes the pincode/field-switch case)
 *                                and as multiline content grows (Enter key)
 *   - `extraHeight`            → leaves room so the entire box clears the
 *                                keyboard, not just its bottom edge
 * `keyboardShouldPersistTaps="handled"` keeps buttons tappable while typing.
 */
export const KeyboardAwareScrollView: React.FC<KeyboardAwareScrollViewProps> = ({
  children,
  containerStyle,
  contentContainerStyle,
  extraHeight = 130,
  ...scrollProps
}) => {
  return (
    <KASV
      style={[styles.flex, containerStyle]}
      contentContainerStyle={contentContainerStyle}
      enableOnAndroid
      enableAutomaticScroll
      extraHeight={extraHeight}
      extraScrollHeight={0}
      keyboardOpeningTime={0}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      {...scrollProps}
    >
      {children}
    </KASV>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
