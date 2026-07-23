import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing } from '@/theme';
import { fs, s, vs } from '@/theme/responsive';

export interface Rider {
  id: string;
  name: string;
  phone?: string;
}

interface BookingRideForSheetProps {
  visible: boolean;
  onClose: () => void;
  onDone: (rider: Rider) => void;
}

const STORAGE_KEY = 'savedRiders';
const DEFAULT_RIDERS: Rider[] = [{ id: 'myself', name: 'Myself' }];

export const BookingRideForSheet: React.FC<BookingRideForSheetProps> = ({
  visible,
  onClose,
  onDone,
}) => {
  const insets = useSafeAreaInsets();
  const [riders, setRiders] = useState<Rider[]>(DEFAULT_RIDERS);
  const [selectedId, setSelectedId] = useState<string>('myself');
  // Inline "add new rider" form state.
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');

  // Load any riders the user previously added so they persist across sessions.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        const saved = JSON.parse(raw) as Rider[];
        if (Array.isArray(saved) && saved.length) {
          setRiders([...DEFAULT_RIDERS, ...saved.filter((r) => r.id !== 'myself')]);
        }
      })
      .catch(() => {});
  }, []);

  const persist = (list: Rider[]) => {
    AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(list.filter((r) => r.id !== 'myself')),
    ).catch(() => {});
  };

  const handleSaveRider = () => {
    const name = newName.trim();
    if (!name) return;
    const rider: Rider = {
      id: `r_${Date.now()}`,
      name,
      phone: newPhone.trim() || undefined,
    };
    const next = [...riders, rider];
    setRiders(next);
    persist(next);
    setSelectedId(rider.id);
    setNewName('');
    setNewPhone('');
    setAdding(false);
  };

  const handleDone = () => {
    const rider = riders.find((r) => r.id === selectedId) ?? DEFAULT_RIDERS[0];
    onDone(rider);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        {/* Lift the sheet above the keyboard while typing a rider's name. */}
        <KeyboardAvoidingView behavior="padding">
        <View style={[styles.sheet, { paddingBottom: insets.bottom + vs(24) }]}>
          <Text style={styles.title}>Booking ride for</Text>

          <View style={styles.riderList}>
            {riders.map((rider) => {
              const isSelected = selectedId === rider.id;
              return (
                <TouchableOpacity
                  key={rider.id}
                  style={styles.riderRow}
                  activeOpacity={0.7}
                  onPress={() => setSelectedId(rider.id)}
                >
                  <View style={styles.avatarCircle}>
                    <Ionicons name="person-outline" size={s(20)} color={Colors.borderDark} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.riderName}>{rider.name}</Text>
                    {!!rider.phone && <Text style={styles.riderPhone}>{rider.phone}</Text>}
                  </View>
                  <View
                    style={[
                      styles.radioOuter,
                      isSelected && styles.radioOuterSelected,
                    ]}
                  >
                    {isSelected && <View style={styles.radioInner} />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {adding ? (
            <View style={styles.addForm}>
              <TextInput
                style={styles.addInput}
                placeholder="Rider name"
                placeholderTextColor={Colors.textMuted}
                value={newName}
                onChangeText={setNewName}
                autoFocus
              />
              <TextInput
                style={styles.addInput}
                placeholder="Phone (optional)"
                placeholderTextColor={Colors.textMuted}
                value={newPhone}
                onChangeText={setNewPhone}
                keyboardType="phone-pad"
              />
              <View style={styles.addActions}>
                <TouchableOpacity
                  style={styles.addCancelBtn}
                  onPress={() => {
                    setAdding(false);
                    setNewName('');
                    setNewPhone('');
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.addCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.addSaveBtn, !newName.trim() && { opacity: 0.5 }]}
                  onPress={handleSaveRider}
                  disabled={!newName.trim()}
                  activeOpacity={0.85}
                >
                  <Text style={styles.addSaveText}>Save rider</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.addNewRow}
              activeOpacity={0.7}
              onPress={() => setAdding(true)}
            >
              <Ionicons name="person-add-outline" size={s(20)} color={Colors.link} />
              <Text style={styles.addNewText}>Add new rider</Text>
            </TouchableOpacity>
          )}

          <View style={styles.disclaimerBox}>
            <Text style={styles.disclaimerText}>
              Contact name won't be shared with captain
            </Text>
          </View>

          <TouchableOpacity
            style={styles.doneButton}
            activeOpacity={0.85}
            onPress={handleDone}
          >
            <Text style={styles.doneText}>Done</Text>
          </TouchableOpacity>
        </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: s(24),
    borderTopRightRadius: s(24),
    paddingHorizontal: s(20),
    paddingTop: vs(24),
    paddingBottom: vs(24),
  },
  title: {
    fontFamily: 'Inter-Bold',
    fontSize: fs(20),
    lineHeight: fs(28),
    color: Colors.textPrimary,
    marginBottom: vs(16), // replacing Spacing.lg
  },
  riderList: {
    marginBottom: vs(8),
  },
  riderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: vs(12),
    gap: s(14),
  },
  avatarCircle: {
    width: s(36),
    height: s(36),
    borderRadius: s(18),
    borderWidth: 1.5,
    borderColor: Colors.borderDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  riderName: {
    fontFamily: 'Inter-Medium',
    fontSize: fs(16),
    lineHeight: fs(22),
    color: Colors.textPrimary,
  },
  riderPhone: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(12),
    color: Colors.textMuted,
    marginTop: 1,
  },
  radioOuter: {
    width: s(22),
    height: s(22),
    borderRadius: s(11),
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: {
    borderColor: Colors.success,
    borderWidth: 2,
  },
  radioInner: {
    width: s(11),
    height: s(11),
    borderRadius: s(5.5),
    backgroundColor: Colors.success,
  },
  addNewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(10),
    paddingVertical: vs(12),
    marginBottom: vs(8),
  },
  addNewText: {
    fontFamily: 'Inter-Medium',
    fontSize: fs(15),
    lineHeight: fs(20),
    color: Colors.link,
  },
  addForm: {
    marginBottom: vs(8),
    gap: vs(10),
  },
  addInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: s(10),
    paddingHorizontal: s(14),
    height: vs(48),
    fontFamily: 'Inter-Regular',
    fontSize: fs(15),
    color: Colors.textPrimary,
  },
  addActions: {
    flexDirection: 'row',
    gap: s(12),
    marginTop: vs(8),
    marginBottom: vs(8),
  },
  addCancelBtn: {
    flex: 1,
    height: vs(48),
    borderRadius: s(10),
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCancelText: {
    fontFamily: 'Inter-Medium',
    fontSize: fs(14),
    color: Colors.textSecondary,
  },
  addSaveBtn: {
    flex: 1,
    height: vs(48),
    borderRadius: s(10),
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addSaveText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(14),
    color: Colors.white,
  },
  disclaimerBox: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: s(10),
    paddingHorizontal: s(16),
    paddingVertical: vs(14),
    marginBottom: vs(16), // replacing Spacing.lg
  },
  disclaimerText: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(14),
    lineHeight: fs(20),
    color: Colors.textSecondary,
  },
  doneButton: {
    backgroundColor: Colors.primary,
    borderRadius: s(10),
    height: vs(56),
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: {
    fontFamily: 'Inter-Medium',
    fontSize: fs(16),
    lineHeight: fs(23),
    color: Colors.white,
  },
});
