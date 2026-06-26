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
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
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
                  <OutlineStarIcon size={17} color="#F5A623" />
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
                  <RatingStarIcon size={44} filled={i <= rating} />
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
    backgroundColor: 'rgba(65,65,65,0.5)',
    justifyContent: 'flex-end',
  },
  backdropPress: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetWrap: {
    width: '100%',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 22,
    paddingTop: 10,
  },
  handle: {
    alignSelf: 'center',
    width: 57,
    height: 5,
    borderRadius: 100,
    backgroundColor: '#000000',
    marginBottom: 18,
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    overflow: 'hidden',
    backgroundColor: '#EEE',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  driverInfo: {
    marginLeft: 15,
  },
  driverName: {
    fontFamily: 'Inter-Bold',
    fontSize: 14,
    color: '#000000',
    marginBottom: 4,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: '#6C6C70',
  },
  divider: {
    height: 1,
    backgroundColor: '#EBEBEB',
    marginBottom: 18,
  },
  title: {
    fontFamily: 'Inter-Bold',
    fontSize: 24,
    color: '#000000',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 0.048,
  },
  subtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: '#6C6C70',
    textAlign: 'center',
    marginBottom: 18,
    paddingHorizontal: 20,
  },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 22,
  },
  starButton: {
    paddingHorizontal: 2,
  },
  feedbackLabel: {
    fontFamily: 'Inter-Bold',
    fontSize: 12,
    color: '#000000',
    letterSpacing: 0.024,
    marginBottom: 8,
  },
  feedbackBox: {
    borderWidth: 1,
    borderColor: '#F0EFF2',
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 18,
  },
  // Grows with the text (min ~3 lines) up to a cap, then scrolls — the sheet
  // itself doesn't scroll, so we bound the growth to keep Submit reachable.
  feedbackInput: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: '#000000',
    padding: 0,
    minHeight: 56,
    maxHeight: 120,
    textAlignVertical: 'top',
  },
  submitButton: {
    height: 52,
    backgroundColor: '#0097B3',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  submitText: {
    fontFamily: 'Inter-Medium',
    fontSize: 17,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
});
