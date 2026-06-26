import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  StatusBar,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/theme';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { updateSavedAddresses, fetchProfile, setPrimaryAddress } from '@/store/slices/authSlice';
import { SavedAddress } from '@/services/authService';
import { BackArrowIcon } from '@/components/icons/ProfileIcons';

interface SavedAddressesScreenProps {
  navigation: any;
}

interface DisplayAddress extends SavedAddress {
  id: string;
}

export const SavedAddressesScreen: React.FC<SavedAddressesScreenProps> = ({
  navigation,
}) => {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const { user, loading } = useAppSelector((state) => state.auth);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);

  const savedAddresses: DisplayAddress[] = (user?.savedAddresses || []).map(
    (addr, index) => ({
      ...addr,
      id: `${index}`,
    })
  );

  useEffect(() => {
    dispatch(fetchProfile());
    const unsubscribe = navigation.addListener('focus', () => {
      dispatch(fetchProfile());
    });
    return unsubscribe;
  }, [dispatch, navigation]);

  const handleSetPrimary = useCallback(
    async (id: string) => {
      const idx = parseInt(id, 10);
      if (Number.isNaN(idx)) return;
      try {
        await dispatch(setPrimaryAddress(idx)).unwrap();
        await dispatch(fetchProfile());
      } catch (err: any) {
        Alert.alert('Error', err?.message || 'Failed to set primary address');
      }
    },
    [dispatch],
  );

  const handleDelete = useCallback(
    (id: string) => {
      Alert.alert(
        'Delete Address',
        'Are you sure you want to remove this saved address?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              setSaving(true);
              try {
                const updatedAddresses = savedAddresses
                  .filter((a) => a.id !== id)
                  .map(({ id: _, ...rest }) => rest);
                await dispatch(updateSavedAddresses(updatedAddresses)).unwrap();
              } catch (err: any) {
                Alert.alert('Error', err?.message || 'Failed to delete address');
              } finally {
                setSaving(false);
              }
            },
          },
        ]
      );
    },
    [dispatch, savedAddresses]
  );

  const renderAddress = ({ item }: { item: DisplayAddress }) => (
    <TouchableOpacity
      style={[styles.addressCard, item.isPrimary && styles.addressCardPrimary]}
      activeOpacity={0.7}
      onPress={() => {
        if (!editMode) {
          navigation.navigate('SelectLocation', {
            dropoff: item.label,
            dropoffAddress: item.address,
            dropoffLat: item.lat,
            dropoffLng: item.lng,
          });
        }
      }}
    >
      <View style={styles.addressInfo}>
        <View style={styles.addressLabelRow}>
          <Text style={styles.addressLabel}>{item.label}</Text>
          {item.isPrimary && (
            <View style={styles.primaryBadge}>
              <Ionicons name="star" size={10} color="#fff" />
              <Text style={styles.primaryBadgeText}>Primary</Text>
            </View>
          )}
        </View>
        <Text style={styles.addressText} numberOfLines={2}>
          {item.address}
        </Text>
      </View>

      {/* Star toggle — visible whether or not editMode is on so the user can
          flip the primary without entering "Edit" mode. */}
      {!item.isPrimary && (
        <TouchableOpacity
          style={styles.starBtn}
          onPress={() => handleSetPrimary(item.id)}
          disabled={saving}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="star-outline" size={20} color="#7D8A95" />
        </TouchableOpacity>
      )}

      {editMode && (
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => handleDelete(item.id)}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color={Colors.error} />
          ) : (
            <Ionicons name="trash-outline" size={20} color={Colors.error} />
          )}
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );

  if (loading && savedAddresses.length === 0) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0097B3" />

      {/* Teal Header */}
      <View style={[styles.tealHeader, { paddingTop: insets.top + 14 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.headerBackBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <BackArrowIcon size={18} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Saved Address</Text>
      </View>

      <FlatList
        data={savedAddresses}
        renderItem={renderAddress}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="location-outline" size={48} color="#999" />
            <Text style={styles.emptyTitle}>No saved addresses</Text>
            <Text style={styles.emptyDesc}>
              Save your frequently visited places for quick access
            </Text>
          </View>
        }
      />

      {/* Add New Address button pinned at bottom */}
      <View style={[styles.bottomCtaWrap, { paddingBottom: insets.bottom + 20 }]}>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate('AddAddress')}
          activeOpacity={0.85}
        >
          <Text style={styles.addText}>+ Add New Address</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  tealHeader: {
    backgroundColor: '#0097B3',
    paddingBottom: 20,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  headerBackBtn: {
    position: 'absolute',
    left: 16,
    bottom: 20,
    padding: 4,
  },
  headerTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 18,
    lineHeight: 28,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 120,
    flexGrow: 1,
  },
  addressCard: {
    paddingVertical: 14,
    paddingHorizontal: 11,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  addressCardPrimary: {
    backgroundColor: 'rgba(0,151,179,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(0,151,179,0.3)',
  },
  addressLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  primaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#0097B3',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  primaryBadgeText: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    color: '#fff',
  },
  starBtn: {
    padding: 8,
  },
  addressInfo: {
    flex: 1,
  },
  addressLabel: {
    fontFamily: 'Roboto-SemiBold',
    fontWeight: '600',
    fontSize: 14,
    lineHeight: 22,
    color: 'rgba(0,0,0,0.9)',
  },
  addressText: {
    fontFamily: 'Roboto-Regular',
    fontSize: 14,
    lineHeight: 22,
    color: 'rgba(0,0,0,0.4)',
    marginTop: 4,
  },
  deleteBtn: {
    padding: 8,
    position: 'absolute',
    right: 8,
    top: 14,
  },
  empty: {
    alignItems: 'center',
    paddingTop: 80,
    gap: 10,
  },
  emptyTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    color: '#6B7280',
  },
  emptyDesc: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  bottomCtaWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
  },
  addButton: {
    backgroundColor: '#0097B3',
    borderRadius: 8,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    lineHeight: 20,
    color: '#FFFFFF',
  },

  // ── Add-Address bottom sheet ──
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalKeyboardWrap: {
    width: '100%',
  },
  sheetContainer: {
    width: '100%',
  },
  closeWrap: {
    alignItems: 'center',
    marginBottom: -18,
    zIndex: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 28,
    maxHeight: '88%',
  },
  sheetTitle: {
    fontFamily: 'Poppins-Medium',
    fontWeight: '500',
    fontSize: 16,
    color: '#0F0F0F',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 14,
  },
  sheetDivider: {
    height: 1,
    backgroundColor: '#EAEAEA',
    width: '100%',
  },
  sheetContent: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 32,
  },
  fieldWrap: {
    position: 'relative',
    marginBottom: 18,
  },
  fieldBox: {
    height: 40,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    paddingHorizontal: 15,
  },
  fieldInput: {
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    color: '#000000',
    padding: 0,
  },
  fieldLabelWrap: {
    position: 'absolute',
    top: -7,
    left: 10,
    paddingHorizontal: 6,
    backgroundColor: '#FFFFFF',
  },
  fieldLabelText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    color: '#000000',
    opacity: 0.55,
  },
  row2: {
    flexDirection: 'row',
  },
  sectionLabel: {
    fontFamily: 'Poppins-Medium',
    fontWeight: '500',
    fontSize: 12,
    color: '#000000',
    marginTop: 6,
    marginBottom: 14,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    marginBottom: 14,
    paddingLeft: 46,
  },
  infoText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 10,
    color: '#000000',
  },
  labelRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 22,
  },
  labelChip: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#000000',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  labelChipInactive: {
    opacity: 0.5,
  },
  labelChipText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    color: '#000000',
  },
  labelChipTextInactive: {
    color: '#000000',
  },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterInactive: {
    borderColor: '#000000',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#000000',
  },
  continueBtn: {
    height: 43,
    borderRadius: 8,
    backgroundColor: '#0097B3',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  continueBtnText: {
    fontFamily: 'Poppins-Medium',
    fontWeight: '500',
    fontSize: 12,
    color: '#FFFFFF',
    letterSpacing: -0.18,
  },
});
