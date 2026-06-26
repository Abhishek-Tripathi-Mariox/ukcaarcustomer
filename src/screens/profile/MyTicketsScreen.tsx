import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius } from '@/theme';
import { supportService, type SupportTicket, type TicketStatus } from '@/services/supportService';

interface MyTicketsScreenProps {
  navigation: any;
}

const STATUS_COLOR: Record<TicketStatus, string> = {
  open: '#0097B3',
  in_progress: '#FF9800',
  pending_user: '#FF9800',
  resolved: '#4CAF50',
  closed: '#9E9E9E',
};

const STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  pending_user: 'Awaiting You',
  resolved: 'Resolved',
  closed: 'Closed',
};

export const MyTicketsScreen: React.FC<MyTicketsScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setTickets(await supportService.listMyTickets());
    } catch {
      /* empty state handles it */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Reload every time the screen regains focus so a reply/close on the thread
  // screen is reflected when the user comes back.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const renderItem = ({ item }: { item: SupportTicket }) => (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.7}
      onPress={() => navigation.navigate('TicketThread', { ticketId: item._id })}
    >
      <View style={styles.cardTop}>
        <Text style={styles.subject} numberOfLines={1}>
          {item.subject}
        </Text>
        <View style={[styles.badge, { backgroundColor: (STATUS_COLOR[item.status] || '#9E9E9E') + '18' }]}>
          <Text style={[styles.badgeText, { color: STATUS_COLOR[item.status] || '#9E9E9E' }]}>
            {STATUS_LABEL[item.status] || item.status}
          </Text>
        </View>
      </View>
      <Text style={styles.ticketNo}>#{item.ticketNumber}</Text>
      <Text style={styles.desc} numberOfLines={2}>
        {item.description}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.black} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Tickets</Text>
        <View style={{ width: 32 }} />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={(t) => t._id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="chatbubbles-outline" size={48} color="#C7CDD2" />
              <Text style={styles.emptyText}>No support tickets yet</Text>
              <Text style={styles.emptySub}>
                Raise an issue from Help &amp; Support and your conversation will appear here.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: Colors.black },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: Spacing.xl, paddingTop: Spacing.md, flexGrow: 1 },

  card: {
    borderWidth: 1, borderColor: '#EEE', borderRadius: BorderRadius.lg,
    padding: Spacing.base, marginBottom: Spacing.md,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  subject: { flex: 1, fontSize: 16, fontWeight: '600', color: Colors.black },
  badge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  ticketNo: { fontSize: 12, color: '#7D8A95', marginTop: 4, letterSpacing: 0.5 },
  desc: { fontSize: 14, color: '#7D8A95', marginTop: 6, lineHeight: 20 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 8 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#7D8A95' },
  emptySub: { fontSize: 13, color: '#B0B0B0', textAlign: 'center', paddingHorizontal: 40, lineHeight: 19 },
});
