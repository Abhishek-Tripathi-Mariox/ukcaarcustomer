import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Linking,
  TextInput,
  Alert,
} from 'react-native';
import { fs, s, vs } from '@/theme/responsive';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius } from '@/theme';
import { faqService } from '@/services/faqService';
import { supportService } from '@/services/supportService';
import { appSettingsService, AppSettings } from '@/services/appSettingsService';
import { KeyboardAwareScrollView } from '@/components/common';

interface HelpSupportScreenProps {
  navigation: any;
}

interface FAQItem {
  question: string;
  answer: string;
}

const FAQ_DATA: FAQItem[] = [
  {
    question: 'How do I book a ride?',
    answer: 'Tap the search bar on the home screen, enter your destination, select a ride type, and confirm your booking. A nearby driver will be assigned to you.',
  },
  {
    question: 'How do I cancel a ride?',
    answer: 'You can cancel a ride from the ride tracking screen by tapping the "Cancel Ride" button. Note that cancellation charges may apply if the driver has already started coming to your location.',
  },
  {
    question: 'How do I add money to my wallet?',
    answer: 'Go to Profile > Payment Methods > Top Up, or tap the wallet icon on the home screen. Select an amount and complete the payment through Razorpay.',
  },
  {
    question: 'How do I get a refund?',
    answer: 'If you were overcharged or faced an issue, go to Help & Support > Report an Issue. Our team will review your case and process the refund within 3-5 business days.',
  },
  {
    question: 'How do I change my phone number?',
    answer: 'Currently, phone number changes require contacting our support team. Use the "Contact Us" option below or email us at support@ukcaar.com.',
  },
  {
    question: 'What payment methods are accepted?',
    answer: 'We accept credit/debit cards, UPI, digital wallets (PhonePe, Paytm, Google Pay, Amazon Pay), UKCAAR Wallet, and cash payments.',
  },
  {
    question: 'Is my ride insured?',
    answer: 'Yes, all UKCAAR rides come with accident insurance coverage for both riders and drivers.',
  },
];

const SUPPORT_OPTIONS = [
  {
    icon: 'chatbubble-ellipses',
    label: 'My Tickets',
    desc: 'View replies & chat with support',
    color: Colors.primary,
    action: 'chat',
  },
  {
    icon: 'call',
    label: 'Call Us',
    desc: '',  // filled from admin settings at render
    color: '#4CAF50',
    action: 'call',
  },
  {
    icon: 'mail',
    label: 'Email Us',
    desc: '',  // filled from admin settings at render
    color: '#2196F3',
    action: 'email',
  },
];

export const HelpSupportScreen: React.FC<HelpSupportScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [expandedFAQ, setExpandedFAQ] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [reportText, setReportText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Live admin-managed FAQs, falling back to the bundled list if the
  // request fails or returns nothing (e.g. offline or none configured yet).
  const [faqs, setFaqs] = useState<FAQItem[]>(FAQ_DATA);
  // Support phone/email are admin-managed. They were hardcoded here, and the
  // phone was the literal placeholder +911800XXXXXXX which cannot be dialled.
  const [settings, setSettings] = useState<AppSettings>(appSettingsService.peek());
  useEffect(() => {
    appSettingsService.get().then(setSettings).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    faqService
      .list()
      .then((items) => {
        if (cancelled || !items.length) return;
        setFaqs(items.map((f) => ({ question: f.question, answer: f.answer })));
      })
      .catch(() => {
        /* keep bundled fallback */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredFAQs = searchQuery.trim()
    ? faqs.filter(f =>
        f.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.answer.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : faqs;

  const handleSupportAction = (action: string) => {
    switch (action) {
      case 'chat':
        navigation.navigate('MyTickets');
        break;
      case 'call': {
        const num = (settings.supportPhone || '').trim();
        if (!num) {
          Alert.alert(
            'Phone support unavailable',
            'No support number is configured yet. Please use Live Chat or Email instead.',
          );
          return;
        }
        Linking.openURL(`tel:${num.replace(/\s/g, '')}`).catch(() =>
          Alert.alert('Unable to call', `Please dial ${num}`),
        );
        break;
      }
      case 'email': {
        const mail = (settings.supportEmail || '').trim();
        if (!mail) {
          Alert.alert(
            'Email support unavailable',
            'No support email is configured yet. Please use Live Chat instead.',
          );
          return;
        }
        Linking.openURL(`mailto:${mail}?subject=UKCAAR Support Request`).catch(() =>
          Alert.alert('Unable to open mail app', `Please email ${mail}`),
        );
        break;
      }
    }
  };

  const handleReportIssue = async () => {
    const text = reportText.trim();
    if (!text) {
      Alert.alert('Required', 'Please describe your issue');
      return;
    }
    setSubmitting(true);
    try {
      const ticket = await supportService.createTicket({
        // First line (capped) becomes the subject; the full text is the body.
        subject: text.split('\n')[0].slice(0, 80) || 'Support request',
        description: text,
        category: 'other',
      });
      setReportText('');
      // Drop the user straight into the new ticket's thread so they can see
      // their message and watch for the admin's reply.
      navigation.navigate('TicketThread', { ticketId: ticket._id });
    } catch (err: any) {
      Alert.alert(
        'Could not submit',
        err?.response?.data?.message || 'Something went wrong. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.black} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Help & Support</Text>
        <View style={{ width: 32 }} />
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + vs(Spacing['3xl']) },
        ]}
      >

        {/* Contact Support */}
        <Text style={styles.sectionTitle}>Contact Us</Text>
        {SUPPORT_OPTIONS.map((o) => {
          // Show the real admin-configured contact, and hide the row entirely
          // when none is set rather than advertising a number that can't be dialled.
          const opt =
            o.action === 'call'
              ? { ...o, desc: settings.supportPhone || 'Not available yet' }
              : o.action === 'email'
              ? { ...o, desc: settings.supportEmail || 'Not available yet' }
              : o;
          return (
          <TouchableOpacity
            key={opt.action}
            style={styles.supportRow}
            onPress={() => handleSupportAction(opt.action)}
          >
            <View style={[styles.supportIcon, { backgroundColor: opt.color + '18' }]}>
              <Ionicons name={opt.icon as any} size={22} color={opt.color} />
            </View>
            <View style={styles.supportInfo}>
              <Text style={styles.supportLabel}>{opt.label}</Text>
              <Text style={styles.supportDesc}>{opt.desc}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#B0B0B0" />
          </TouchableOpacity>
          );
        })}

        {/* FAQ Section */}
        <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color="#B0B0B0" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search FAQs..."
            placeholderTextColor="#B0B0B0"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color="#B0B0B0" />
            </TouchableOpacity>
          )}
        </View>

        {filteredFAQs.map((faq, index) => (
          <TouchableOpacity
            key={index}
            style={styles.faqItem}
            onPress={() => setExpandedFAQ(expandedFAQ === index ? null : index)}
            activeOpacity={0.7}
          >
            <View style={styles.faqHeader}>
              <Text style={styles.faqQuestion}>{faq.question}</Text>
              <Ionicons
                name={expandedFAQ === index ? 'chevron-up' : 'chevron-down'}
                size={20}
                color="#7D8A95"
              />
            </View>
            {expandedFAQ === index && (
              <Text style={styles.faqAnswer}>{faq.answer}</Text>
            )}
          </TouchableOpacity>
        ))}

        {filteredFAQs.length === 0 && (
          <View style={styles.noResults}>
            <Text style={styles.noResultsText}>No matching FAQs found</Text>
          </View>
        )}

        {/* Report an Issue */}
        <Text style={styles.sectionTitle}>Report an Issue</Text>
        <Text style={styles.sectionDesc}>
          Facing a problem? Describe it below and our team will look into it.
        </Text>

        <TextInput
          style={styles.reportInput}
          placeholder="Describe your issue..."
          placeholderTextColor="#B0B0B0"
          value={reportText}
          onChangeText={setReportText}
          multiline
          textAlignVertical="top"
        />

        <TouchableOpacity
          style={[styles.reportBtn, submitting && { opacity: 0.6 }]}
          onPress={handleReportIssue}
          activeOpacity={0.85}
          disabled={submitting}
        >
          <Text style={styles.reportBtnText}>
            {submitting ? 'Submitting…' : 'Submit Report'}
          </Text>
        </TouchableOpacity>

      </KeyboardAwareScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: s(Spacing.base), paddingVertical: vs(Spacing.md),
  },
  backBtn: { width: s(36), height: s(36), alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: 'Inter-Bold', fontSize: fs(20), color: '#1E293B' },
  content: { paddingHorizontal: s(Spacing.xl), paddingBottom: vs(Spacing['3xl']) },

  sectionTitle: { fontFamily: 'Inter-Bold', fontSize: fs(18), color: '#1E293B', marginTop: vs(Spacing.xl), marginBottom: vs(Spacing.md) },
  sectionDesc: { fontFamily: 'Inter-Regular', fontSize: fs(14), color: '#7D8A95', marginBottom: vs(Spacing.md), lineHeight: fs(20) },

  // Support
  supportRow: {
    flexDirection: 'row', alignItems: 'center', gap: s(Spacing.md),
    paddingVertical: vs(16), borderBottomWidth: 1, borderBottomColor: '#F5F5F5',
  },
  supportIcon: {
    width: s(48), height: s(48), borderRadius: s(24),
    alignItems: 'center', justifyContent: 'center',
  },
  supportInfo: { flex: 1 },
  supportLabel: { fontFamily: 'Inter-SemiBold', fontSize: fs(16), color: Colors.black },
  supportDesc: { fontFamily: 'Inter-Regular', fontSize: fs(13), color: '#7D8A95', marginTop: vs(2) },

  // Search
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: s(8),
    backgroundColor: '#F5F5F5', borderRadius: s(BorderRadius.base),
    height: vs(44), paddingHorizontal: s(Spacing.md), marginBottom: vs(Spacing.md),
  },
  searchInput: { flex: 1, fontFamily: 'Inter-Regular', fontSize: fs(15), color: Colors.black, paddingVertical: 0 },

  // FAQ
  faqItem: {
    borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
    paddingVertical: vs(16),
  },
  faqHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  faqQuestion: { flex: 1, fontFamily: 'Inter-SemiBold', fontSize: fs(15), color: Colors.black, paddingRight: s(8) },
  faqAnswer: {
    fontFamily: 'Inter-Regular', fontSize: fs(14), color: '#7D8A95', lineHeight: fs(22),
    marginTop: vs(10), paddingRight: s(24),
  },

  noResults: { alignItems: 'center', paddingVertical: vs(Spacing.xl) },
  noResultsText: { fontFamily: 'Inter-Regular', fontSize: fs(14), color: '#B0B0B0' },

  // Report — minHeight (not a fixed height) so the box grows as the user
  // types multiple lines instead of hiding text beyond the first lines.
  reportInput: {
    minHeight: vs(120), borderWidth: 1, borderColor: '#E0E0E0', borderRadius: s(BorderRadius.base),
    paddingHorizontal: s(Spacing.base), paddingTop: vs(Spacing.md), paddingBottom: vs(Spacing.md),
    fontFamily: 'Inter-Regular', fontSize: fs(15), color: Colors.black,
  },
  reportBtn: {
    height: vs(56), backgroundColor: Colors.primary, borderRadius: s(BorderRadius.button),
    alignItems: 'center', justifyContent: 'center', marginTop: vs(Spacing.lg),
  },
  reportBtnText: { fontFamily: 'Inter-SemiBold', fontSize: fs(18), color: '#fff' },
});
