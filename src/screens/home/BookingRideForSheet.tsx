import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  TextInput,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { Colors, Spacing } from '@/theme';

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
        <View style={styles.sheet}>
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
                    <Ionicons name="person-outline" size={20} color={Colors.borderDark} />
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
              <Ionicons name="person-add-outline" size={20} color={Colors.link} />
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
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 24,
  },
  title: {
    fontFamily: 'Inter-Bold',
    fontSize: 20,
    lineHeight: 28,
    color: Colors.textPrimary,
    marginBottom: Spacing.lg,
  },
  riderList: {
    marginBottom: 8,
  },
  riderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 14,
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: Colors.borderDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  riderName: {
    fontFamily: 'Inter-Medium',
    fontSize: 16,
    lineHeight: 22,
    color: Colors.textPrimary,
  },
  riderPhone: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 1,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
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
    width: 11,
    height: 11,
    borderRadius: 5.5,
    backgroundColor: Colors.success,
  },
  addNewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    marginBottom: 8,
  },
  addNewText: {
    fontFamily: 'Inter-Medium',
    fontSize: 15,
    lineHeight: 20,
    color: Colors.link,
  },
  addForm: {
    marginBottom: 8,
    gap: 10,
  },
  addInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 48,
    fontFamily: 'Inter-Regular',
    fontSize: 15,
    color: Colors.textPrimary,
  },
  addActions: {
    flexDirection: 'row',
    gap: 12,
  },
  addCancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCancelText: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    color: Colors.textSecondary,
  },
  addSaveBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addSaveText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: Colors.white,
  },
  disclaimerBox: {
    backgroundColor: '#EDEDED',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: Spacing.lg,
  },
  disclaimerText: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    lineHeight: 20,
    color: Colors.textSecondary,
  },
  doneButton: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: {
    fontFamily: 'Inter-Medium',
    fontSize: 16,
    lineHeight: 23,
    color: Colors.white,
  },
});
