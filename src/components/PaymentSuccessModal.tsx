import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Dimensions,
} from 'react-native';
import {
  SuccessAnimationIcon,
  DecorativeCrossIcon,
  DecorativeDotIcon,
  SparkleIcon,
} from '@/components/icons/PaymentSuccessIcons';

interface PaymentSuccessModalProps {
  visible: boolean;
  amount: number;
  dateTimeLabel?: string;
  taxId?: string;
  ctaLabel?: string;
  onCtaPress?: () => void;
  onRateDriver?: () => void;
  /** When provided, shows a neutral "Done" dismiss + backdrop-tap to close,
   *  so a success popup never forces the user down one path (e.g. booking). */
  onClose?: () => void;
  /** Label for the secondary dismiss button (default "Done"). */
  closeLabel?: string;
}

const SCREEN_WIDTH = Dimensions.get('window').width;

export const PaymentSuccessModal: React.FC<PaymentSuccessModalProps> = ({
  visible,
  amount,
  dateTimeLabel,
  taxId = 'WAVE5400151255',
  ctaLabel,
  onCtaPress,
  onRateDriver,
  onClose,
  closeLabel = 'Done',
}) => {
  const handlePress = onCtaPress || onRateDriver || (() => {});
  const buttonLabel = ctaLabel || 'Rate Your Driver';
  const formattedDate =
    dateTimeLabel ||
    new Date().toLocaleString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} disabled={!onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          {/* Decorative scattered markers */}
          <View style={[styles.marker, { top: 12, left: 30 }]}>
            <DecorativeCrossIcon size={19} />
          </View>
          <View style={[styles.marker, { top: 160, right: 30 }]}>
            <DecorativeCrossIcon size={19} />
          </View>
          <View style={[styles.marker, { top: 80, left: 18 }]}>
            <DecorativeDotIcon size={8} />
          </View>
          <View style={[styles.marker, { top: 30, right: 36 }]}>
            <DecorativeDotIcon size={8} />
          </View>
          <View style={[styles.marker, { top: 170, left: 45 }]}>
            <SparkleIcon size={12} />
          </View>
          <View style={[styles.marker, { top: 90, right: 18 }]}>
            <SparkleIcon size={12} />
          </View>

          {/* Success animation */}
          <View style={styles.animationWrap}>
            <SuccessAnimationIcon size={132} />
          </View>

          {/* Heading */}
          <Text style={styles.title}>Payment Successfull</Text>

          {/* Amount */}
          <Text style={styles.amount}>
            <Text style={styles.rupee}>{'\u20B9 '}</Text>
            {amount}
          </Text>

          {/* Date/time */}
          <Text style={styles.dateText}>{formattedDate}</Text>

          {/* Tax ID */}
          <Text style={styles.taxId}>Tax ID: {taxId}</Text>

          {/* CTA button */}
          <TouchableOpacity
            style={styles.rateButton}
            onPress={handlePress}
            activeOpacity={0.85}
          >
            <Text style={styles.rateButtonText}>{buttonLabel}</Text>
          </TouchableOpacity>

          {/* Neutral dismiss — only when a close handler is supplied, so the
              popup doesn't trap the user into the CTA's path. */}
          {onClose && (
            <TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.closeButtonText}>{closeLabel}</Text>
            </TouchableOpacity>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const CARD_WIDTH = Math.min(370, SCREEN_WIDTH - 32);

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(65,65,65,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  card: {
    width: CARD_WIDTH,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingTop: 28,
    paddingBottom: 32,
    alignItems: 'center',
    overflow: 'hidden',
  },
  marker: {
    position: 'absolute',
  },
  animationWrap: {
    marginTop: 8,
    marginBottom: 24,
  },
  title: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 24,
    color: '#0097B3',
    textAlign: 'center',
    marginBottom: 12,
  },
  amount: {
    fontFamily: 'Inter-Bold',
    fontSize: 22,
    color: '#262626',
    textAlign: 'center',
    marginBottom: 16,
  },
  rupee: {
    fontFamily: 'Inter-Bold',
    fontSize: 22,
  },
  dateText: {
    fontFamily: 'Inter-Medium',
    fontSize: 16,
    color: '#000000',
    textAlign: 'center',
    marginBottom: 4,
  },
  taxId: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
    marginBottom: 22,
  },
  rateButton: {
    width: 235,
    height: 46,
    backgroundColor: '#0097B3',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rateButtonText: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    color: '#FFFFFF',
  },
  closeButton: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  closeButtonText: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    color: '#666666',
  },
});
