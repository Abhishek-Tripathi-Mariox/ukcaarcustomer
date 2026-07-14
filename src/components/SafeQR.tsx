import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Colors } from '@/theme';
import { fs, s } from '@/theme/responsive';

interface Props {
  value: string;
  size?: number;
}

/**
 * QR code wrapped in an error boundary. If the SVG/QR renderer throws for any
 * reason (bad payload, native hiccup), we show a small fallback instead of
 * letting the exception bubble up and tear down the whole ticket screen.
 */
export class SafeQR extends React.Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    // Swallow — the fallback UI below is enough; nothing actionable to log.
  }

  render() {
    const size = this.props.size ?? s(150);
    if (this.state.failed || !this.props.value) {
      return (
        <View style={[styles.fallback, { width: size, height: size }]}>
          <Text style={styles.fallbackText}>QR unavailable</Text>
        </View>
      );
    }
    return (
      <QRCode
        value={this.props.value}
        size={size}
        backgroundColor={Colors.white}
        color={Colors.textPrimary}
      />
    );
  }
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.backgroundCard,
    borderRadius: s(8),
  },
  fallbackText: { 
    fontFamily: 'Inter-Regular',
    fontSize: fs(12), 
    color: Colors.textSecondary,
  },
});
