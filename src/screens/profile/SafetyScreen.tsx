import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Switch,
  Alert,
  TextInput,
  Modal,
  KeyboardAvoidingView,
} from 'react-native';
import { Typography, Colors, Spacing, BorderRadius } from '@/theme';
import { fs, s, vs } from '@/theme/responsive';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppSelector } from '@/store/hooks';
import { safetyService } from '@/services/safetyService';
import { appSettingsService, AppSettings } from '@/services/appSettingsService';

// Helpline + guidelines now come from the admin panel (GET /settings/app).
// They used to be these hardcoded literals, so the app dialled a placeholder
// number and opened a URL the admin could never change.

interface SafetyScreenProps {
  navigation: any;
}

interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
}

export const SafetyScreen: React.FC<SafetyScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { user } = useAppSelector((state) => state.auth);
  const coords = useAppSelector((state) => state.geolocation.coords);

  const [shareRide, setShareRide] = useState(true);
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>([]);
  const [showAddContact, setShowAddContact] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [sosSending, setSosSending] = useState(false);
  // Admin-configured helpline + guidelines URL.
  const [settings, setSettings] = useState<AppSettings>(appSettingsService.peek());
  useEffect(() => {
    appSettingsService.get().then(setSettings).catch(() => {});
  }, []);

  // Restore the saved "share ride details" preference.
  useEffect(() => {
    AsyncStorage.getItem('pref.shareRide').then((v) => {
      if (v !== null) setShareRide(v === '1');
    });
  }, []);

  // Load persisted emergency contacts on mount.
  useEffect(() => {
    let alive = true;
    safetyService
      .getContacts()
      .then((list) => {
        if (!alive) return;
        setEmergencyContacts(
          list.map((c, i) => ({ id: `${i}-${c.phone}`, name: c.name, phone: c.phone })),
        );
      })
      .catch(() => {
        /* keep empty list on failure */
      });
    return () => {
      alive = false;
    };
  }, []);

  // Persist the full list to the backend whenever it changes locally.
  const persistContacts = async (next: EmergencyContact[]) => {
    setEmergencyContacts(next);
    try {
      await safetyService.saveContacts(next.map((c) => ({ name: c.name, phone: c.phone })));
    } catch {
      Alert.alert('Sync failed', 'Could not save your emergency contacts. Please try again.');
    }
  };

  const handleAddContact = () => {
    if (!contactName.trim() || !contactPhone.trim()) {
      Alert.alert('Required', 'Please enter name and phone number');
      return;
    }
    if (emergencyContacts.length >= 5) {
      Alert.alert('Limit', 'You can add up to 5 emergency contacts');
      return;
    }
    persistContacts([
      ...emergencyContacts,
      { id: Date.now().toString(), name: contactName.trim(), phone: contactPhone.trim() },
    ]);
    setContactName('');
    setContactPhone('');
    setShowAddContact(false);
  };

  const handleShareToggle = (v: boolean) => {
    setShareRide(v);
    AsyncStorage.setItem('pref.shareRide', v ? '1' : '0').catch(() => {});
  };

  const callHelpline = () => {
    const num = (settings.safetyHelpline || settings.supportPhone || '').trim();
    if (!num) {
      Alert.alert(
        'Helpline unavailable',
        'No safety helpline is configured yet. Please contact support from Help & Support.',
      );
      return;
    }
    Linking.openURL(`tel:${num.replace(/\s/g, '')}`).catch(() =>
      Alert.alert('Unable to call', `Please dial ${num}`),
    );
  };

  const openGuidelines = () => {
    const url = (settings.safetyGuidelinesUrl || '').trim();
    if (!url) {
      Alert.alert(
        'Guidelines unavailable',
        'Safety guidelines have not been published yet. Please check back soon.',
      );
      return;
    }
    Linking.openURL(url).catch(() => Alert.alert('Unable to open', url));
  };

  const showInsuranceInfo = () => {
    Alert.alert(
      'Ride Insurance',
      'Every UKCAAR ride is covered by accident insurance for both riders and drivers at no extra cost. Contact support for claim assistance.',
    );
  };

  const handleRemoveContact = (id: string) => {
    Alert.alert('Remove Contact', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: () => persistContacts(emergencyContacts.filter(c => c.id !== id)),
      },
    ]);
  };

  const handleSOS = () => {
    Alert.alert(
      'SOS Alert',
      'This will share your live location with your emergency contacts and UKCAAR support. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send SOS',
          style: 'destructive',
          onPress: async () => {
            setSosSending(true);
            try {
              const res = await safetyService.sendSos({
                lat: coords?.lat,
                lng: coords?.lng,
              });
              Alert.alert(
                'SOS Sent',
                `UKCAAR support has been alerted (ref ${res.ticketNumber}). ${res.notifiedContacts} emergency contact${res.notifiedContacts === 1 ? '' : 's'} on file.`,
              );
            } catch (err: any) {
              Alert.alert(
                'SOS failed',
                err?.response?.data?.message || 'Could not send SOS. Please call the helpline.',
              );
            } finally {
              setSosSending(false);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.black} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Safety</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* SOS Button */}
        <TouchableOpacity
          style={[styles.sosCard, sosSending && { opacity: 0.7 }]}
          onPress={handleSOS}
          activeOpacity={0.85}
          disabled={sosSending}
        >
          <View style={styles.sosIconWrap}>
            <Ionicons name="warning" size={28} color="#fff" />
          </View>
          <View style={styles.sosInfo}>
            <Text style={styles.sosTitle}>{sosSending ? 'Sending SOS…' : 'Emergency SOS'}</Text>
            <Text style={styles.sosDesc}>
              Tap to alert emergency contacts and UKCAAR support with your live location
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#fff" />
        </TouchableOpacity>

        {/* Safety Features */}
        <Text style={styles.sectionTitle}>Safety Features</Text>

        <View style={styles.featureRow}>
          <View style={[styles.featureIcon, { backgroundColor: 'rgba(0,151,179,0.12)' }]}>
            <Ionicons name="share-social" size={20} color={Colors.primary} />
          </View>
          <View style={styles.featureInfo}>
            <Text style={styles.featureLabel}>Share Ride Details</Text>
            <Text style={styles.featureDesc}>Automatically share ride status with emergency contacts</Text>
          </View>
          <Switch
            value={shareRide}
            onValueChange={handleShareToggle}
            trackColor={{ false: '#E0E0E0', true: Colors.primary + '60' }}
            thumbColor={shareRide ? Colors.primary : '#BDBDBD'}
          />
        </View>

        <TouchableOpacity style={styles.featureRow} onPress={showInsuranceInfo}>
          <View style={[styles.featureIcon, { backgroundColor: '#4CAF5018' }]}>
            <Ionicons name="shield-checkmark" size={20} color="#4CAF50" />
          </View>
          <View style={styles.featureInfo}>
            <Text style={styles.featureLabel}>Ride Insurance</Text>
            <Text style={styles.featureDesc}>All rides are covered with accident insurance</Text>
          </View>
          <View style={styles.activeBadge}>
            <Text style={styles.activeBadgeText}>Active</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.featureRow} onPress={callHelpline}>
          <View style={[styles.featureIcon, { backgroundColor: '#2196F318' }]}>
            <Ionicons name="call" size={20} color="#2196F3" />
          </View>
          <View style={styles.featureInfo}>
            <Text style={styles.featureLabel}>24/7 Safety Helpline</Text>
            <Text style={styles.featureDesc}>Call UKCAAR safety team anytime</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#B0B0B0" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.featureRow} onPress={openGuidelines}>
          <View style={[styles.featureIcon, { backgroundColor: '#FF980018' }]}>
            <Ionicons name="document-text" size={20} color="#FF9800" />
          </View>
          <View style={styles.featureInfo}>
            <Text style={styles.featureLabel}>Safety Guidelines</Text>
            <Text style={styles.featureDesc}>Tips for a safe ride experience</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#B0B0B0" />
        </TouchableOpacity>

        {/* Emergency Contacts */}
        <Text style={styles.sectionTitle}>Emergency Contacts</Text>
        <Text style={styles.sectionDesc}>
          These contacts will be notified when you trigger SOS or share ride details
        </Text>

        {emergencyContacts.map((contact) => (
          <View key={contact.id} style={styles.contactRow}>
            <View style={styles.contactAvatar}>
              <Text style={styles.contactInitial}>{contact.name[0].toUpperCase()}</Text>
            </View>
            <View style={styles.contactInfo}>
              <Text style={styles.contactName}>{contact.name}</Text>
              <Text style={styles.contactPhone}>{contact.phone}</Text>
            </View>
            <TouchableOpacity onPress={() => handleRemoveContact(contact.id)}>
              <Ionicons name="trash-outline" size={20} color="#F44336" />
            </TouchableOpacity>
          </View>
        ))}

        {emergencyContacts.length === 0 && (
          <View style={styles.emptyContacts}>
            <Ionicons name="people-outline" size={36} color="#B0B0B0" />
            <Text style={styles.emptyText}>No emergency contacts added</Text>
          </View>
        )}

        <TouchableOpacity style={styles.addContactBtn} onPress={() => setShowAddContact(true)}>
          <Ionicons name="add-circle" size={22} color={Colors.primary} />
          <Text style={styles.addContactText}>Add Emergency Contact</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Add Contact Modal */}
      <Modal visible={showAddContact} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior="padding" style={styles.modalSheet}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Add Emergency Contact</Text>

              <Text style={styles.fieldLabel}>Name</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="Contact name"
                placeholderTextColor="#B0B0B0"
                value={contactName}
                onChangeText={setContactName}
                autoCapitalize="words"
              />

              <Text style={styles.fieldLabel}>Phone Number</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="+91 XXXXX XXXXX"
                placeholderTextColor="#B0B0B0"
                value={contactPhone}
                onChangeText={setContactPhone}
                keyboardType="phone-pad"
                maxLength={15}
              />

              <TouchableOpacity style={styles.saveBtn} onPress={handleAddContact} activeOpacity={0.85}>
                <Text style={styles.saveBtnText}>Save Contact</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAddContact(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
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

  // SOS
  sosCard: {
    flexDirection: 'row', alignItems: 'center', gap: s(Spacing.md),
    backgroundColor: '#F44336', borderRadius: s(BorderRadius.lg),
    padding: s(Spacing.lg), marginBottom: vs(Spacing.xl),
  },
  sosIconWrap: {
    width: s(48), height: s(48), borderRadius: s(24),
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  sosInfo: { flex: 1 },
  sosTitle: { fontFamily: 'Inter-Bold', fontSize: fs(18), color: '#fff' },
  sosDesc: { fontFamily: 'Inter-Regular', fontSize: fs(13), color: 'rgba(255,255,255,0.85)', marginTop: vs(2), lineHeight: fs(18) },

  // Section
  sectionTitle: { fontFamily: 'Inter-Bold', fontSize: fs(18), color: Colors.black, marginTop: vs(Spacing.xl), marginBottom: vs(Spacing.sm) },
  sectionDesc: { fontFamily: 'Inter-Regular', fontSize: fs(14), color: '#7D8A95', marginBottom: vs(Spacing.md), lineHeight: fs(20) },

  // Feature
  featureRow: {
    flexDirection: 'row', alignItems: 'center', gap: s(Spacing.md),
    paddingVertical: vs(16), borderBottomWidth: 1, borderBottomColor: '#F5F5F5',
  },
  featureIcon: {
    width: s(44), height: s(44), borderRadius: s(22),
    alignItems: 'center', justifyContent: 'center',
  },
  featureInfo: { flex: 1 },
  featureLabel: { fontFamily: 'Inter-SemiBold', fontSize: fs(16), color: Colors.black },
  featureDesc: { fontFamily: 'Inter-Regular', fontSize: fs(13), color: '#7D8A95', marginTop: vs(2) },
  activeBadge: {
    backgroundColor: '#E8F5E9', borderRadius: s(12),
    paddingHorizontal: s(10), paddingVertical: vs(4),
  },
  activeBadgeText: { fontFamily: 'Inter-SemiBold', fontSize: fs(12), color: '#4CAF50' },

  // Contacts
  contactRow: {
    flexDirection: 'row', alignItems: 'center', gap: s(Spacing.md),
    paddingVertical: vs(14), borderBottomWidth: 1, borderBottomColor: '#F5F5F5',
  },
  contactAvatar: {
    width: s(40), height: s(40), borderRadius: s(20),
    backgroundColor: Colors.primary + '18',
    alignItems: 'center', justifyContent: 'center',
  },
  contactInitial: { fontFamily: 'Inter-Bold', fontSize: fs(16), color: Colors.primary },
  contactInfo: { flex: 1 },
  contactName: { fontFamily: 'Inter-SemiBold', fontSize: fs(16), color: Colors.black },
  contactPhone: { fontFamily: 'Inter-Regular', fontSize: fs(13), color: '#7D8A95', marginTop: vs(2) },

  emptyContacts: { alignItems: 'center', paddingVertical: vs(Spacing.xl), gap: s(8) },
  emptyText: { fontFamily: 'Inter-Regular', fontSize: fs(14), color: '#B0B0B0' },

  addContactBtn: {
    flexDirection: 'row', alignItems: 'center', gap: s(Spacing.sm),
    paddingVertical: vs(Spacing.md),
  },
  addContactText: { fontFamily: 'Inter-SemiBold', fontSize: fs(16), color: Colors.primary },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#fff', borderTopLeftRadius: s(24), borderTopRightRadius: s(24),
    padding: s(Spacing.xl), paddingBottom: vs(Spacing['3xl']),
  },
  modalTitle: { fontFamily: 'Inter-Bold', fontSize: fs(22), color: Colors.black, textAlign: 'center', marginBottom: vs(Spacing.lg) },
  fieldLabel: { fontFamily: 'Inter-SemiBold', fontSize: fs(14), color: '#7D8A95', marginBottom: vs(6), marginTop: vs(Spacing.md) },
  fieldInput: {
    height: vs(52), borderWidth: 1, borderColor: '#E0E0E0', borderRadius: s(BorderRadius.base),
    paddingHorizontal: s(Spacing.base), fontFamily: 'Inter-Regular', fontSize: fs(16), color: Colors.black,
  },
  saveBtn: {
    height: vs(56), backgroundColor: Colors.primary, borderRadius: s(BorderRadius.button),
    alignItems: 'center', justifyContent: 'center', marginTop: vs(Spacing.xl),
  },
  saveBtnText: { fontFamily: 'Inter-SemiBold', fontSize: fs(18), color: '#fff' },
  cancelBtn: { height: vs(48), alignItems: 'center', justifyContent: 'center', marginTop: vs(Spacing.sm) },
  cancelBtnText: { fontFamily: 'Inter-Medium', fontSize: fs(16), color: '#7D8A95' },
});
