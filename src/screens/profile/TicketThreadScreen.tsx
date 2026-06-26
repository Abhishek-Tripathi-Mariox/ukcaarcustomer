import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius } from '@/theme';
import { supportService, type SupportTicket } from '@/services/supportService';

interface TicketThreadScreenProps {
  navigation: any;
  route: { params: { ticketId: string } };
}

export const TicketThreadScreen: React.FC<TicketThreadScreenProps> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { ticketId } = route.params;
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const load = async () => {
    try {
      const t = await supportService.getTicket(ticketId);
      setTicket(t);
    } catch {
      Alert.alert('Error', 'Could not load this ticket.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // Light polling so admin replies show up without leaving the screen.
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  // Admin-closed tickets are terminal — a reply can't reopen them.
  const lockedByAdmin = ticket?.status === 'closed' && ticket?.closedByRole === 'admin';

  const handleSend = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const updated = await supportService.replyToTicket(ticketId, body);
      setTicket(updated);
      setDraft('');
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    } catch (err: any) {
      Alert.alert(
        'Could not send',
        err?.response?.data?.message || 'Please try again.',
      );
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    Alert.alert('Close ticket', 'Mark this ticket as resolved?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Close',
        style: 'destructive',
        onPress: async () => {
          try {
            const updated = await supportService.closeTicket(ticketId);
            setTicket(updated);
          } catch {
            Alert.alert('Error', 'Could not close the ticket.');
          }
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.black} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {ticket?.subject || 'Ticket'}
          </Text>
          {!!ticket && (
            <Text style={styles.headerSub}>
              #{ticket.ticketNumber} · {ticket.status.replace('_', ' ')}
            </Text>
          )}
        </View>
        {ticket && ticket.status !== 'closed' ? (
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
            <Ionicons name="checkmark-done" size={22} color={Colors.primary} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 32 }} />
        )}
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.messages}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {(ticket?.messages ?? []).map((m, i) => {
            const mine = m.senderRole === 'customer' || m.senderRole === 'driver';
            return (
              <View key={m._id ?? i} style={[styles.bubbleRow, mine ? styles.rowRight : styles.rowLeft]}>
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleAdmin]}>
                  {!mine && <Text style={styles.adminLabel}>Support</Text>}
                  <Text style={[styles.bubbleText, mine && { color: '#fff' }]}>{m.body}</Text>
                  <Text style={[styles.bubbleTime, mine && { color: 'rgba(255,255,255,0.7)' }]}>
                    {new Date(m.createdAt).toLocaleString()}
                  </Text>
                </View>
              </View>
            );
          })}
          {(ticket?.messages ?? []).length === 0 && (
            <Text style={styles.emptyText}>No messages yet.</Text>
          )}
        </ScrollView>
      )}

      {/* Composer */}
      {lockedByAdmin ? (
        <View style={[styles.lockedBar, { paddingBottom: insets.bottom + 10 }]}>
          <Text style={styles.lockedText}>
            This ticket was closed by support. Please raise a new ticket if you still need help.
          </Text>
        </View>
      ) : (
        <View style={[styles.composer, { paddingBottom: insets.bottom + 8 }]}>
          <TextInput
            style={styles.input}
            placeholder="Type a reply..."
            placeholderTextColor="#B0B0B0"
            value={draft}
            onChangeText={setDraft}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!draft.trim() || sending) && { opacity: 0.5 }]}
            onPress={handleSend}
            disabled={!draft.trim() || sending}
          >
            <Ionicons name="send" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.black },
  headerSub: { fontSize: 12, color: '#7D8A95', marginTop: 2, textTransform: 'capitalize' },
  closeBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  messages: { padding: Spacing.base, flexGrow: 1 },
  bubbleRow: { marginBottom: Spacing.md, flexDirection: 'row' },
  rowLeft: { justifyContent: 'flex-start' },
  rowRight: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '80%', borderRadius: 14, padding: 12 },
  bubbleMine: { backgroundColor: Colors.primary, borderBottomRightRadius: 4 },
  bubbleAdmin: { backgroundColor: '#F2F4F5', borderBottomLeftRadius: 4 },
  adminLabel: { fontSize: 11, fontWeight: '700', color: Colors.primary, marginBottom: 3 },
  bubbleText: { fontSize: 15, color: Colors.black, lineHeight: 21 },
  bubbleTime: { fontSize: 10, color: '#9AA5AD', marginTop: 5 },
  emptyText: { textAlign: 'center', color: '#B0B0B0', marginTop: 40 },

  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: Spacing.base, paddingTop: 8,
    borderTopWidth: 1, borderTopColor: '#F0F0F0',
  },
  input: {
    flex: 1, maxHeight: 120, minHeight: 44,
    borderWidth: 1, borderColor: '#E0E0E0', borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.base, paddingTop: 11, paddingBottom: 11,
    fontSize: 15, color: Colors.black,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  lockedBar: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  lockedText: { fontSize: 13, color: '#7D8A95', textAlign: 'center', lineHeight: 19 },
});
