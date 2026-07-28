import React from 'react';
import { ScrollViewProps, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
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
 *
 * BOTTOM PADDING: this library does NOT honour `contentContainerStyle`'s
 * `paddingBottom` — confirmed on device, where Help & Support's "Submit Report"
 * button stayed half under the navigation bar at maximum scroll even though the
 * padding was set. So we strip paddingBottom out of the style and render it as a
 * real spacer View after the children, which the library cannot swallow. Call
 * sites keep passing `contentContainerStyle={{ paddingBottom: insets.bottom + N }}`
 * exactly as before; every screen using this wrapper gets the fix for free.
 */
export const KeyboardAwareScrollView: React.FC<KeyboardAwareScrollViewProps> = ({
  children,
  containerStyle,
  contentContainerStyle,
  extraHeight = 130,
  ...scrollProps
}) => {
  const flat = (StyleSheet.flatten(contentContainerStyle) ?? {}) as ViewStyle;
  const rawTail = flat.paddingBottom;
  const tailHeight = typeof rawTail === 'number' ? rawTail : 0;
  // Pass the rest of the style through minus paddingBottom, so the spacer is the
  // single source of tail space (no doubled gap if the library ever honours it).
  const { paddingBottom: _paddingBottom, ...contentStyle } = flat;

  return (
    <KASV
      style={[styles.flex, containerStyle]}
      contentContainerStyle={contentStyle}
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
      {tailHeight > 0 ? <View style={{ height: tailHeight }} /> : null}
    </KASV>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
