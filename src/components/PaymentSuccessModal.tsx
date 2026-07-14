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
import { Colors, alpha } from '@/theme';
import { fs, s, vs } from '@/theme/responsive';

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
          <View style={[styles.marker, { top: vs(12), left: s(30) }]}>
            <DecorativeCrossIcon size={s(19)} />
          </View>
          <View style={[styles.marker, { top: vs(160), right: s(30) }]}>
            <DecorativeCrossIcon size={s(19)} />
          </View>
          <View style={[styles.marker, { top: vs(80), left: s(18) }]}>
            <DecorativeDotIcon size={s(8)} />
          </View>
          <View style={[styles.marker, { top: vs(30), right: s(36) }]}>
            <DecorativeDotIcon size={s(8)} />
          </View>
          <View style={[styles.marker, { top: vs(170), left: s(45) }]}>
            <SparkleIcon size={s(12)} />
          </View>
          <View style={[styles.marker, { top: vs(90), right: s(18) }]}>
            <SparkleIcon size={s(12)} />
          </View>

          {/* Success animation */}
          <View style={styles.animationWrap}>
            <SuccessAnimationIcon size={s(132)} />
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

const CARD_WIDTH = Math.min(s(370), SCREEN_WIDTH - s(32));

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: alpha('#414141', 0.5),
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: s(16),
  },
  card: {
    width: CARD_WIDTH,
    backgroundColor: Colors.white,
    borderRadius: s(20),
    paddingTop: vs(28),
    paddingBottom: vs(32),
    alignItems: 'center',
    overflow: 'hidden',
  },
  marker: {
    position: 'absolute',
  },
  animationWrap: {
    marginTop: vs(8),
    marginBottom: vs(24),
  },
  title: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(24),
    color: Colors.primary,
    textAlign: 'center',
    marginBottom: vs(12),
  },
  amount: {
    fontFamily: 'Inter-Bold',
    fontSize: fs(22),
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: vs(16),
  },
  rupee: {
    fontFamily: 'Inter-Bold',
    fontSize: fs(22),
  },
  dateText: {
    fontFamily: 'Inter-Medium',
    fontSize: fs(16),
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: vs(4),
  },
  taxId: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(14),
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: vs(22),
  },
  rateButton: {
    width: s(235),
    height: vs(46),
    backgroundColor: Colors.primary,
    borderRadius: s(8),
    alignItems: 'center',
    justifyContent: 'center',
  },
  rateButtonText: {
    fontFamily: 'Inter-Medium',
    fontSize: fs(14),
    color: Colors.white,
  },
  closeButton: {
    marginTop: vs(12),
    paddingVertical: vs(8),
    paddingHorizontal: s(16),
  },
  closeButtonText: {
    fontFamily: 'Inter-Medium',
    fontSize: fs(14),
    color: Colors.textSecondary,
  },
});
