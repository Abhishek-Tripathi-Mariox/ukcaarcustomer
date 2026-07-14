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
import { fs, s, vs } from '@/theme/responsive';
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
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

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
    paddingBottom: vs(20),
    paddingHorizontal: s(16),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  headerBackBtn: {
    position: 'absolute',
    left: s(16),
    bottom: vs(20),
    padding: s(4),
  },
  headerTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(18),
    lineHeight: fs(28),
    color: '#FFFFFF',
    textAlign: 'center',
  },
  list: {
    paddingHorizontal: s(16),
    paddingTop: vs(14),
    paddingBottom: vs(120),
    flexGrow: 1,
  },
  addressCard: {
    paddingVertical: vs(14),
    paddingHorizontal: s(11),
    borderRadius: s(7),
    backgroundColor: '#FFFFFF',
    marginBottom: vs(10),
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
    gap: s(8),
  },
  primaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(3),
    backgroundColor: '#0097B3',
    paddingHorizontal: s(6),
    paddingVertical: vs(2),
    borderRadius: s(10),
  },
  primaryBadgeText: {
    fontFamily: 'Inter-Medium',
    fontSize: fs(10),
    color: '#fff',
  },
  starBtn: {
    padding: s(8),
  },
  addressInfo: {
    flex: 1,
  },
  addressLabel: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(14),
    lineHeight: fs(22),
    color: 'rgba(0,0,0,0.9)',
  },
  addressText: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(14),
    lineHeight: fs(22),
    color: 'rgba(0,0,0,0.4)',
    marginTop: vs(4),
  },
  deleteBtn: {
    padding: s(8),
    position: 'absolute',
    right: s(8),
    top: vs(14),
  },
  empty: {
    alignItems: 'center',
    paddingTop: vs(80),
    gap: s(10),
  },
  emptyTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: fs(16),
    color: '#6B7280',
  },
  emptyDesc: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(14),
    color: '#9CA3AF',
    textAlign: 'center',
    paddingHorizontal: s(40),
  },
  bottomCtaWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: s(20),
    backgroundColor: '#FFFFFF',
  },
  addButton: {
    backgroundColor: '#0097B3',
    borderRadius: s(8),
    height: vs(56),
    alignItems: 'center',
    justifyContent: 'center',
  },
  addText: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(14),
    lineHeight: fs(20),
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
    marginBottom: vs(-18),
    zIndex: 2,
  },
  closeBtn: {
    width: s(36),
    height: s(36),
    borderRadius: s(18),
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: s(28),
    borderTopRightRadius: s(28),
    paddingTop: vs(28),
    maxHeight: '88%',
  },
  sheetTitle: {
    fontFamily: 'Inter-Medium',
    fontSize: fs(16),
    color: '#0F0F0F',
    textAlign: 'center',
    marginTop: vs(4),
    marginBottom: vs(14),
  },
  sheetDivider: {
    height: 1,
    backgroundColor: '#EAEAEA',
    width: '100%',
  },
  sheetContent: {
    paddingHorizontal: s(16),
    paddingTop: vs(24),
    paddingBottom: vs(32),
  },
  fieldWrap: {
    position: 'relative',
    marginBottom: vs(18),
  },
  fieldBox: {
    height: vs(40),
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: s(8),
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    paddingHorizontal: s(15),
  },
  fieldInput: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(12),
    color: '#000000',
    padding: 0,
  },
  fieldLabelWrap: {
    position: 'absolute',
    top: vs(-7),
    left: s(10),
    paddingHorizontal: s(6),
    backgroundColor: '#FFFFFF',
  },
  fieldLabelText: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(12),
    color: '#000000',
    opacity: 0.55,
  },
  row2: {
    flexDirection: 'row',
  },
  sectionLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: fs(12),
    color: '#000000',
    marginTop: vs(6),
    marginBottom: vs(14),
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(6),
    marginTop: vs(4),
    marginBottom: vs(14),
    paddingLeft: s(46),
  },
  infoText: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(10),
    color: '#000000',
  },
  labelRow: {
    flexDirection: 'row',
    gap: s(12),
    marginBottom: vs(22),
  },
  labelChip: {
    flex: 1,
    height: vs(40),
    borderRadius: s(8),
    borderWidth: 1,
    borderColor: '#000000',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: s(14),
  },
  labelChipInactive: {
    opacity: 0.5,
  },
  labelChipText: {
    fontFamily: 'Inter-Regular',
    fontSize: fs(12),
    color: '#000000',
  },
  labelChipTextInactive: {
    color: '#000000',
  },
  radioOuter: {
    width: s(18),
    height: s(18),
    borderRadius: s(9),
    borderWidth: 1.5,
    borderColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterInactive: {
    borderColor: '#000000',
  },
  radioInner: {
    width: s(10),
    height: s(10),
    borderRadius: s(5),
    backgroundColor: '#000000',
  },
  continueBtn: {
    height: vs(43),
    borderRadius: s(8),
    backgroundColor: '#0097B3',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: vs(4),
  },
  continueBtnText: {
    fontFamily: 'Inter-Medium',
    fontSize: fs(12),
    color: '#FFFFFF',
    letterSpacing: -0.18,
  },
});
