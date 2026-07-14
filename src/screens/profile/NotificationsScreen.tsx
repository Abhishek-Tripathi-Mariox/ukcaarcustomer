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
  RefreshControl,
} from 'react-native';
import { fs, s, vs } from '@/theme/responsive';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius } from '@/theme';
import { notificationService, AppNotification } from '@/services/notificationService';
import { useAppDispatch } from '@/store/hooks';
import { setNotificationCount } from '@/store/slices/appSlice';

interface NotificationsScreenProps {
  navigation: any;
}

const TYPE_CONFIG: Record<string, { icon: string; color: string }> = {
  ride: { icon: 'car', color: Colors.primary },
  payment: { icon: 'card', color: '#4CAF50' },
  promo: { icon: 'pricetag', color: '#FF9800' },
  safety: { icon: 'shield-checkmark', color: '#F44336' },
  system: { icon: 'notifications', color: '#2196F3' },
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const diff = now - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export const NotificationsScreen: React.FC<NotificationsScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Mirror the local unread count into the store so the Home bell badge stays
  // in sync the moment the user reads, marks-all or clears notifications here.
  useEffect(() => {
    dispatch(setNotificationCount(unreadCount));
  }, [unreadCount, dispatch]);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await notificationService.getNotifications();
      if (res.success) {
        setNotifications(res.data.notifications || []);
        setUnreadCount(res.data.unreadCount || 0);
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchNotifications();
  };

  const handleMarkAsRead = async (id: string) => {
    await notificationService.markAsRead(id);
    setNotifications(prev =>
      prev.map(n => n._id === id ? { ...n, isRead: true } : n)
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const handleMarkAllRead = async () => {
    await notificationService.markAllAsRead();
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    setUnreadCount(0);
  };

  const handleDelete = (id: string) => {
    Alert.alert('Delete', 'Remove this notification?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await notificationService.deleteNotification(id);
          setNotifications(prev => prev.filter(n => n._id !== id));
        },
      },
    ]);
  };

  const handleClearAll = () => {
    Alert.alert('Clear All', 'Remove all notifications?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear All', style: 'destructive',
        onPress: async () => {
          await notificationService.clearAll();
          setNotifications([]);
          setUnreadCount(0);
        },
      },
    ]);
  };

  const renderNotification = ({ item }: { item: AppNotification }) => {
    const config = TYPE_CONFIG[item.type] || TYPE_CONFIG.system;
    return (
      <TouchableOpacity
        style={[styles.notifRow, !item.isRead && styles.notifUnread]}
        onPress={() => !item.isRead && handleMarkAsRead(item._id)}
        onLongPress={() => handleDelete(item._id)}
        activeOpacity={0.7}
      >
        <View style={[styles.notifIcon, { backgroundColor: config.color + '18' }]}>
          <Ionicons name={config.icon as any} size={22} color={config.color} />
        </View>
        <View style={styles.notifContent}>
          <View style={styles.notifHeader}>
            <Text style={[styles.notifTitle, !item.isRead && styles.notifTitleUnread]} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.notifTime}>{timeAgo(item.createdAt)}</Text>
          </View>
          <Text style={styles.notifBody} numberOfLines={2}>{item.body}</Text>
        </View>
        {!item.isRead && <View style={styles.unreadDot} />}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.black} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        {notifications.length > 0 ? (
          <TouchableOpacity onPress={handleClearAll}>
            <Ionicons name="trash-outline" size={22} color="#7D8A95" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 32 }} />
        )}
      </View>

      {/* Unread count & Mark all read */}
      {unreadCount > 0 && (
        <View style={styles.unreadBar}>
          <Text style={styles.unreadText}>{unreadCount} unread</Text>
          <TouchableOpacity onPress={handleMarkAllRead}>
            <Text style={styles.markAllText}>Mark all as read</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={notifications}
        renderItem={renderNotification}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[Colors.primary]} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="notifications-off-outline" size={48} color="#B0B0B0" />
            </View>
            <Text style={styles.emptyTitle}>No notifications yet</Text>
            <Text style={styles.emptyDesc}>
              You'll see ride updates, payment alerts, and promotions here
            </Text>
          </View>
        }
      />
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
  list: { paddingBottom: vs(Spacing['3xl']) },

  // Unread bar
  unreadBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: s(Spacing.xl), paddingVertical: vs(10),
    backgroundColor: '#F8F9FA', borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  unreadText: { fontFamily: 'Inter-SemiBold', fontSize: fs(14), color: '#7D8A95' },
  markAllText: { fontFamily: 'Inter-SemiBold', fontSize: fs(14), color: Colors.primary },

  // Notification row
  notifRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: s(Spacing.md),
    paddingHorizontal: s(Spacing.xl), paddingVertical: vs(16),
    borderBottomWidth: 1, borderBottomColor: '#F5F5F5',
  },
  notifUnread: { backgroundColor: 'rgba(0,151,179,0.04)' },
  notifIcon: {
    width: s(44), height: s(44), borderRadius: s(22),
    alignItems: 'center', justifyContent: 'center', marginTop: vs(2),
  },
  notifContent: { flex: 1 },
  notifHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: vs(4),
  },
  notifTitle: { fontFamily: 'Inter-Medium', fontSize: fs(15), color: Colors.black, flex: 1, marginRight: s(8) },
  notifTitleUnread: { fontFamily: 'Inter-Bold' },
  notifTime: { fontFamily: 'Inter-Regular', fontSize: fs(12), color: '#B0B0B0' },
  notifBody: { fontFamily: 'Inter-Regular', fontSize: fs(14), color: '#7D8A95', lineHeight: fs(20) },
  unreadDot: {
    width: s(8), height: s(8), borderRadius: s(4),
    backgroundColor: Colors.primary, marginTop: vs(6),
  },

  // Empty
  empty: { alignItems: 'center', paddingTop: vs(80), paddingHorizontal: s(Spacing.xl) },
  emptyIconWrap: {
    width: s(80), height: s(80), borderRadius: s(40),
    backgroundColor: '#F5F5F5', alignItems: 'center', justifyContent: 'center',
    marginBottom: vs(Spacing.lg),
  },
  emptyTitle: { fontFamily: 'Inter-SemiBold', fontSize: fs(18), color: '#7D8A95', marginBottom: vs(8) },
  emptyDesc: { fontFamily: 'Inter-Regular', fontSize: fs(14), color: '#B0B0B0', textAlign: 'center', lineHeight: fs(20) },
});
