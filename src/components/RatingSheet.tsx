import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Image,
  KeyboardAvoidingView,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OutlineStarIcon, RatingStarIcon } from '@/components/icons/PaymentSuccessIcons';
import { Colors, alpha } from '@/theme';
import { fs, s, vs } from '@/theme/responsive';

interface RatingSheetProps {
  visible: boolean;
  driverName?: string;
  driverAvatar?: any;
  driverRating?: string;
  onClose: () => void;
  onSubmit: (rating: number, feedback: string) => void;
}

export const RatingSheet: React.FC<RatingSheetProps> = ({
  visible,
  driverName = 'Ramesh yadav',
  driverAvatar,
  driverRating = '5.0 (235 ratings)',
  onClose,
  onSubmit,
}) => {
  const insets = useSafeAreaInsets();
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');

  const handleSubmit = () => {
    onSubmit(rating, feedback);
    setRating(0);
    setFeedback('');
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropPress} onPress={onClose} />
        <KeyboardAvoidingView
          behavior="padding"
          style={styles.sheetWrap}
        >
          <View style={[styles.sheet, { paddingBottom: insets.bottom + vs(16) }]}>
            {/* Grab handle */}
            <View style={styles.handle} />

            {/* Driver row */}
            <View style={styles.driverRow}>
              <View style={styles.avatar}>
                {driverAvatar ? (
                  <Image source={driverAvatar} style={styles.avatarImg} />
                ) : (
                  <Image
                    source={require('../../assets/payment-success/driver-ramesh.png')}
                    style={styles.avatarImg}
                  />
                )}
              </View>
              <View style={styles.driverInfo}>
                <Text style={styles.driverName}>{driverName}</Text>
                <View style={styles.ratingRow}>
                  <OutlineStarIcon size={s(17)} color="#F5A623" />
                  <Text style={styles.ratingText}>{driverRating}</Text>
                </View>
              </View>
            </View>

            <View style={styles.divider} />

            {/* Title */}
            <Text style={styles.title}>How was your trip?</Text>
            <Text style={styles.subtitle}>
              Your feedback will help us improve driving experience better.
            </Text>

            {/* Star rating */}
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => setRating(i)}
                  activeOpacity={0.7}
                  style={styles.starButton}
                >
                  <RatingStarIcon size={s(44)} filled={i <= rating} />
                </TouchableOpacity>
              ))}
            </View>

            {/* Feedback */}
            <Text style={styles.feedbackLabel}>FEEDBACK</Text>
            <View style={styles.feedbackBox}>
              <TextInput
                style={styles.feedbackInput}
                placeholder="Write here...."
                placeholderTextColor="#000000"
                value={feedback}
                onChangeText={setFeedback}
                multiline
              />
            </View>

            {/* Submit */}
            <TouchableOpacity
              style={styles.submitButton}
              onPress={handleSubmit}
              activeOpacity={0.85}
            >
              <Text style={styles.submitText}>SUBMIT</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: alpha('#414141', 0.5),
    justifyContent: 'flex-end',
  },
  backdropPress: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetWrap: {
    width: '100%',
  },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: s(16),
    borderTopRightRadius: s(16),
    paddingHorizontal: s(22),
    paddingTop: vs(10),
  },
  handle: {
    alignSelf: 'center',
    width: s(57),
    height: vs(5),
    borderRadius: s(100),
    backgroundColor: Colors.textPrimary,
    marginBottom: vs(18),
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: vs(16),
  },
  avatar: {
    width: s(54),
    height: s(54),
    borderRadius: s(27),
    overflow: 'hidden',
    backgroundColor: Colors.borderLight,
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  driverInfo: {
    marginLeft: s(15),
  },
  driverName: {
    fontFamily: 'Inter-Bold',
    fontSize: fs(14),
    color: Colors.textPrimary,
    marginBottom: vs(4),
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(4),
  },
  ratingText: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(14),
    color: Colors.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.borderLight,
    marginBottom: vs(18),
  },
  title: {
    fontFamily: 'Inter-Bold',
    fontSize: fs(24),
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: vs(8),
    letterSpacing: 0.048,
  },
  subtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(14),
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: vs(18),
    paddingHorizontal: s(20),
  },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: vs(22),
  },
  starButton: {
    paddingHorizontal: s(2),
  },
  feedbackLabel: {
    fontFamily: 'Inter-Bold',
    fontSize: fs(12),
    color: Colors.textPrimary,
    letterSpacing: 0.024,
    marginBottom: vs(8),
  },
  feedbackBox: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: s(6),
    backgroundColor: Colors.white,
    paddingHorizontal: s(16),
    paddingVertical: vs(10),
    marginBottom: vs(18),
  },
  feedbackInput: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(14),
    color: Colors.textPrimary,
    padding: 0,
    minHeight: vs(56),
    maxHeight: vs(120),
    textAlignVertical: 'top',
  },
  submitButton: {
    height: vs(52),
    backgroundColor: Colors.primary,
    borderRadius: s(6),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: vs(8),
  },
  submitText: {
    fontFamily: 'Inter-Medium',
    fontSize: fs(17),
    color: Colors.white,
    letterSpacing: 0.5,
  },
});
