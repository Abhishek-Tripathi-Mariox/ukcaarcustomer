import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Typography, Colors, Spacing, BorderRadius } from '@/theme';
import { fs, s, vs } from '@/theme/responsive';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from '@/components/common';
import {
  loyaltyService,
  type LoyaltyMe,
  type LoyaltyReward,
  type LoyaltyRedemption,
} from '@/services/loyaltyService';

interface LoyaltyScreenProps {
  navigation: any;
}

export const LoyaltyScreen: React.FC<LoyaltyScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [redeeming, setRedeeming] = useState<string | null>(null);
  const [me, setMe] = useState<LoyaltyMe | null>(null);
  const [rewards, setRewards] = useState<LoyaltyReward[]>([]);
  const [redemptions, setRedemptions] = useState<LoyaltyRedemption[]>([]);

  const load = useCallback(async () => {
    try {
      const [meRes, rewardsRes, redemptionsRes] = await Promise.all([
        loyaltyService.me(),
        loyaltyService.rewards(),
        loyaltyService.redemptions(),
      ]);
      setMe(meRes);
      setRewards(rewardsRes);
      setRedemptions(redemptionsRes);
    } catch {
      // Surface nothing intrusive on load; the empty states handle it.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const handleRedeem = (reward: LoyaltyReward) => {
    const balance = me?.account.pointsBalance ?? 0;
    if (balance < reward.pointsCost) {
      Alert.alert('Not enough points', `You need ${reward.pointsCost - balance} more points for this reward.`);
      return;
    }
    Alert.alert('Redeem reward', `Redeem "${reward.name}" for ${reward.pointsCost} points?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Redeem',
        onPress: async () => {
          setRedeeming(reward._id);
          try {
            const res = await loyaltyService.redeem(reward._id);
            if (res.fulfilled === 'wallet') {
              Alert.alert('Redeemed!', `₹${res.walletCredited.toFixed(0)} has been added to your wallet.`);
            } else {
              Alert.alert(
                'Redeemed!',
                'Your reward is saved and will be applied automatically to your next ride.',
              );
            }
            await load();
          } catch (err: any) {
            Alert.alert('Redeem failed', err?.response?.data?.message || 'Please try again.');
          } finally {
            setRedeeming(null);
          }
        },
      },
    ]);
  };

  const balance = me?.account.pointsBalance ?? 0;
  const tierName = me?.currentTier?.name ?? 'Member';
  const nextTier = me?.nextTier;
  const pointsToNext = me?.pointsToNextTier ?? 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.black} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Rewards</Text>
        <View style={{ width: 32 }} />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <KeyboardAwareScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/* Points card */}
          <View style={styles.pointsCard}>
            <View style={styles.pointsTopRow}>
              <View>
                <Text style={styles.pointsLabel}>Available Points</Text>
                <Text style={styles.pointsValue}>{balance.toLocaleString()}</Text>
              </View>
              <View style={styles.tierBadge}>
                <Ionicons name="star" size={14} color="#fff" />
                <Text style={styles.tierBadgeText}>{tierName}</Text>
              </View>
            </View>

            {nextTier ? (
              <View style={styles.progressWrap}>
                <Text style={styles.progressText}>
                  {pointsToNext} pts to {nextTier.name}
                </Text>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${Math.min(
                          100,
                          nextTier.minLifetimePoints > 0
                            ? ((me?.account.lifetimePoints ?? 0) / nextTier.minLifetimePoints) * 100
                            : 0,
                        )}%`,
                      },
                    ]}
                  />
                </View>
              </View>
            ) : (
              <Text style={styles.progressText}>You're at the top tier 🎉</Text>
            )}
          </View>

          {/* Rewards */}
          <Text style={styles.sectionTitle}>Redeem Rewards</Text>
          {rewards.length === 0 ? (
            <Text style={styles.emptyText}>No rewards available right now.</Text>
          ) : (
            rewards.map((r) => (
              <View key={r._id} style={styles.rewardRow}>
                <View style={styles.rewardIcon}>
                  <Ionicons name="gift" size={20} color={Colors.primary} />
                </View>
                <View style={styles.rewardInfo}>
                  <Text style={styles.rewardName}>{r.name}</Text>
                  {!!r.description && <Text style={styles.rewardDesc}>{r.description}</Text>}
                  <Text style={styles.rewardCost}>{r.pointsCost} pts</Text>
                </View>
                <TouchableOpacity
                  style={[
                    styles.redeemBtn,
                    (balance < r.pointsCost || redeeming === r._id) && styles.redeemBtnDisabled,
                  ]}
                  onPress={() => handleRedeem(r)}
                  disabled={balance < r.pointsCost || redeeming === r._id}
                >
                  <Text style={styles.redeemBtnText}>
                    {redeeming === r._id ? '...' : 'Redeem'}
                  </Text>
                </TouchableOpacity>
              </View>
            ))
          )}

          {/* My Vouchers */}
          <Text style={styles.sectionTitle}>My Vouchers</Text>
          {redemptions.length === 0 ? (
            <Text style={styles.emptyText}>No vouchers yet. Redeem a reward to get one.</Text>
          ) : (
            redemptions.map((v) => (
              <View key={v._id} style={styles.voucherRow}>
                <View style={styles.voucherInfo}>
                  <Text style={styles.voucherName}>{v.rewardSnapshot?.name}</Text>
                  <Text style={styles.voucherCode}>Code: {v.code}</Text>
                </View>
                <View
                  style={[
                    styles.voucherStatus,
                    v.status === 'issued' ? styles.voucherActive : styles.voucherInactive,
                  ]}
                >
                  <Text
                    style={[
                      styles.voucherStatusText,
                      v.status === 'issued' ? { color: '#4CAF50' } : { color: '#9E9E9E' },
                    ]}
                  >
                    {v.status}
                  </Text>
                </View>
              </View>
            ))
          )}
        </KeyboardAwareScrollView>
      )}
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
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  pointsCard: {
    backgroundColor: Colors.primary, borderRadius: s(BorderRadius.lg),
    padding: s(Spacing.lg), marginTop: vs(Spacing.md),
  },
  pointsTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  pointsLabel: { fontFamily: 'Inter-Regular', fontSize: fs(13), color: 'rgba(255,255,255,0.85)' },
  pointsValue: { fontFamily: 'Inter-ExtraBold', fontSize: fs(34), color: '#fff', marginTop: vs(2) },
  tierBadge: {
    flexDirection: 'row', alignItems: 'center', gap: s(4),
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: s(14),
    paddingHorizontal: s(10), paddingVertical: vs(5),
  },
  tierBadgeText: { fontFamily: 'Inter-Bold', fontSize: fs(13), color: '#fff' },
  progressWrap: { marginTop: vs(Spacing.lg) },
  progressText: { fontFamily: 'Inter-Regular', fontSize: fs(13), color: 'rgba(255,255,255,0.9)', marginBottom: vs(6) },
  progressTrack: {
    height: vs(6), borderRadius: s(3), backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden',
  },
  progressFill: { height: vs(6), borderRadius: s(3), backgroundColor: '#fff' },

  sectionTitle: { fontFamily: 'Inter-Bold', fontSize: fs(18), color: Colors.black, marginTop: vs(Spacing.xl), marginBottom: vs(Spacing.md) },
  emptyText: { fontFamily: 'Inter-Regular', fontSize: fs(14), color: '#B0B0B0', paddingVertical: vs(Spacing.md) },

  rewardRow: {
    flexDirection: 'row', alignItems: 'center', gap: s(Spacing.md),
    paddingVertical: vs(14), borderBottomWidth: 1, borderBottomColor: '#F5F5F5',
  },
  rewardIcon: {
    width: s(44), height: s(44), borderRadius: s(22),
    backgroundColor: Colors.primary + '18', alignItems: 'center', justifyContent: 'center',
  },
  rewardInfo: { flex: 1 },
  rewardName: { fontFamily: 'Inter-SemiBold', fontSize: fs(16), color: Colors.black },
  rewardDesc: { fontFamily: 'Inter-Regular', fontSize: fs(13), color: '#7D8A95', marginTop: vs(2) },
  rewardCost: { fontFamily: 'Inter-Bold', fontSize: fs(13), color: Colors.primary, marginTop: vs(4) },
  redeemBtn: {
    backgroundColor: Colors.primary, borderRadius: s(BorderRadius.base),
    paddingHorizontal: s(16), paddingVertical: vs(9),
  },
  redeemBtnDisabled: { backgroundColor: '#C7CDD2' },
  redeemBtnText: { fontFamily: 'Inter-Bold', fontSize: fs(14), color: '#fff' },

  voucherRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: vs(14), borderBottomWidth: 1, borderBottomColor: '#F5F5F5',
  },
  voucherInfo: { flex: 1 },
  voucherName: { fontFamily: 'Inter-SemiBold', fontSize: fs(15), color: Colors.black },
  voucherCode: { fontFamily: 'Inter-Regular', fontSize: fs(13), color: '#7D8A95', marginTop: vs(2), letterSpacing: 0.5 },
  voucherStatus: { borderRadius: s(12), paddingHorizontal: s(10), paddingVertical: vs(4) },
  voucherActive: { backgroundColor: '#E8F5E9' },
  voucherInactive: { backgroundColor: '#F0F0F0' },
  voucherStatusText: { fontFamily: 'Inter-Bold', fontSize: fs(12), textTransform: 'capitalize' },
});
