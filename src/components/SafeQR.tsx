import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

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
    const size = this.props.size ?? 150;
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
        backgroundColor="#FFFFFF"
        color="#1E293B"
      />
    );
  }
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
  },
  fallbackText: { fontSize: 12, color: '#64748B' },
});
