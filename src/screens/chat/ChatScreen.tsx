import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Image,
  Linking,
  Alert,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/theme';
import { useAppSelector } from '@/store/hooks';
import {
  joinRideRoom,
  leaveRideRoom,
  sendChatMessage,
  setSocketListeners,
} from '@/services/socketService';
import { api } from '@/services/api';

interface ChatScreenProps {
  navigation: any;
  route: {
    params?: {
      rideId?: string;
      driver?: {
        id?: string;
        name?: string;
        phone?: string;
        avatar?: string | null;
      };
    };
  };
}

interface Message {
  id: string;
  text: string;
  /** 'me' = current user (customer), 'them' = the driver. */
  sender: 'me' | 'them';
  time: string;
}

const formatTime = (d: Date) =>
  d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

export const ChatScreen: React.FC<ChatScreenProps> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const driver = route?.params?.driver || { name: 'Driver' };
  const rideId = route?.params?.rideId;

  // The current user's id — used to decide whether an incoming chat
  // message was sent by us (echo from the server after we emitted) or
  // by the other party.
  const myUserId = useAppSelector(s => s.auth.user?._id);

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const flatListRef = useRef<FlatList>(null);

  // Load history from the backend once on mount. Server returns the full
  // Chat doc (messages array) — we map into the local shape. Falls back
  // to an empty thread if the chat hasn't been created yet (first send
  // creates it server-side).
  useEffect(() => {
    if (!rideId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(`/chat/${rideId}`);
        if (cancelled) return;
        const chat = data?.data?.chat;
        const msgs = (chat?.messages ?? []) as Array<{
          _id?: string;
          sender: any;
          content: string;
          createdAt: string;
        }>;
        setMessages(
          msgs.map((m, idx) => ({
            id: m._id ?? `h-${idx}`,
            text: m.content,
            sender:
              String((m.sender && m.sender._id) || m.sender) === String(myUserId)
                ? 'me'
                : 'them',
            time: formatTime(new Date(m.createdAt)),
          })),
        );
      } catch {
        /* fresh chat — leave empty */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rideId, myUserId]);

  // Subscribe to live messages. The socket bridge in App.tsx already keeps
  // the connection open; we just need to be in the ride room and install
  // an onChatMessage listener. setSocketListeners merges so this doesn't
  // clobber the screen-level listeners on RideTracking — but the listener
  // does get replaced if both screens are mounted at once (RideTracking
  // doesn't subscribe to chat anyway, so it's a non-issue today).
  useEffect(() => {
    if (!rideId) return;
    joinRideRoom(rideId);
    setSocketListeners({
      onChatMessage: payload => {
        if (payload.rideId !== rideId) return;
        const fromMe = String(payload.sender) === String(myUserId);
        setMessages(prev => [
          ...prev,
          {
            id: `${payload.timestamp}-${payload.sender}`,
            text: payload.message,
            sender: fromMe ? 'me' : 'them',
            time: formatTime(new Date(payload.timestamp)),
          },
        ]);
      },
    });
    return () => {
      // Don't leave the room — RideTracking is also listening on it for
      // driver:location:update. Tear-down is fine because the listener
      // bails on rideId mismatch.
    };
  }, [rideId, myUserId]);

  useEffect(() => {
    const t = setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100);
    return () => clearTimeout(t);
  }, []);

  const sendMessage = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !rideId) return;

    // Optimistic insert — the socket echo for our own emit will be
    // de-duplicated by id below (the echo arrives with a sender that
    // matches us; the rendered list will end up with one of each).
    // For now we accept a transient double-render if the echo is fast,
    // since the test app's expected behaviour is "see what I just sent
    // immediately".
    setInputText('');
    sendChatMessage(rideId, trimmed);
  };

  const callDriver = async () => {
    const phone = (driver.phone || '').replace(/\s+/g, '');
    if (!phone) {
      Alert.alert('Phone not available', "We don't have this driver's number yet.");
      return;
    }
    const url = `tel:${phone}`;
    if (!(await Linking.canOpenURL(url))) {
      Alert.alert('Cannot place call', 'This device cannot make phone calls.');
      return;
    }
    Linking.openURL(url);
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.sender === 'me';
    return (
      <View style={[styles.bubbleRow, isMe ? styles.bubbleRowUser : styles.bubbleRowDriver]}>
        <View style={[styles.bubble, isMe ? styles.userBubble : styles.driverBubble]}>
          <Text style={[styles.bubbleText, isMe && styles.userBubbleText]}>{item.text}</Text>
          <View style={[styles.bubbleFooter, isMe && styles.bubbleFooterUser]}>
            <Text style={[styles.timeText, isMe && styles.timeTextUser]}>{item.time}</Text>
          </View>
        </View>
      </View>
    );
  };

  const initials = useMemo(
    () =>
      (driver.name || 'D')
        .split(' ')
        .map(s => s[0])
        .join('')
        .slice(0, 2)
        .toUpperCase(),
    [driver.name],
  );

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      {/* Title bar */}
      <View style={[styles.titleBar, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.iconBtn} activeOpacity={0.8} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#0D1217" />
        </TouchableOpacity>
        <Text style={styles.titleText}>Message</Text>
        <View style={{ width: 42 }} />
      </View>

      {/* User info row */}
      <View style={styles.userRow}>
        <View style={styles.userInfo}>
          {driver.avatar ? (
            <Image source={{ uri: driver.avatar }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          )}
          <View style={styles.userMeta}>
            <Text style={styles.userName}>{driver.name}</Text>
            {!!driver.phone && <Text style={styles.userPhone}>{driver.phone}</Text>}
          </View>
        </View>
        <TouchableOpacity style={styles.iconBtn} activeOpacity={0.8} onPress={callDriver}>
          <Ionicons name="call-outline" size={22} color="#0D1217" />
        </TouchableOpacity>
      </View>

      {/* Chat container */}
      <KeyboardAvoidingView
        style={styles.chatFlex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 10 : 0}
      >
        <View style={styles.chatContainer}>
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.chatList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                Say hi! Messages here are private between you and {driver.name || 'your driver'}.
              </Text>
            }
          />
        </View>

        {/* Input bar */}
        <View style={[styles.inputBar, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.textInput}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Type a message ..."
              placeholderTextColor="rgba(44, 45, 58, 0.3)"
              selectionColor={Colors.primary}
              multiline
              onSubmitEditing={() => sendMessage(inputText)}
            />
          </View>
          <TouchableOpacity style={styles.sendBtn} activeOpacity={0.85} onPress={() => sendMessage(inputText)}>
            <Ionicons name="send" size={20} color={Colors.white} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

const NEUTRAL_900 = '#2C2D3A';
const NEUTRAL_500 = '#686A8A';
const NEUTRAL_100 = '#D0D1DB';
const NEUTRAL_50 = '#E9EAEB';
const CHAT_BG = '#F0F0F3';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  titleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: Colors.white,
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0D0A2C',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  titleText: { fontFamily: 'Inter-SemiBold', fontSize: 22, color: '#0D1217' },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 16,
    backgroundColor: Colors.white,
  },
  userInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  avatarFallback: {
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: 'Inter-SemiBold', fontSize: 16, color: Colors.white },
  userMeta: { gap: 4 },
  userName: { fontFamily: 'Inter-SemiBold', fontSize: 16, color: '#0D1217' },
  userPhone: { fontFamily: 'Inter-Regular', fontSize: 12, color: NEUTRAL_500 },
  chatFlex: { flex: 1 },
  chatContainer: {
    flex: 1,
    backgroundColor: CHAT_BG,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: NEUTRAL_50,
  },
  chatList: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 16, gap: 16 },
  emptyText: {
    textAlign: 'center',
    color: NEUTRAL_500,
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    marginTop: 40,
    paddingHorizontal: 24,
  },
  bubbleRow: { flexDirection: 'row', width: '100%' },
  bubbleRowDriver: { paddingRight: 40, justifyContent: 'flex-start' },
  bubbleRowUser: { paddingLeft: 40, justifyContent: 'flex-end' },
  bubble: { paddingHorizontal: 16, paddingVertical: 12, maxWidth: '100%' },
  driverBubble: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
    borderBottomLeftRadius: 0,
  },
  userBubble: {
    backgroundColor: Colors.primary,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 0,
  },
  bubbleText: { fontFamily: 'Inter-Regular', fontSize: 16, color: NEUTRAL_900, lineHeight: 20 },
  userBubbleText: { color: Colors.white },
  bubbleFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  bubbleFooterUser: { justifyContent: 'flex-end' },
  timeText: { fontFamily: 'Inter-Medium', fontSize: 12, color: NEUTRAL_100 },
  timeTextUser: { color: NEUTRAL_50 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 16,
    backgroundColor: Colors.white,
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 51,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: NEUTRAL_100,
    borderRadius: 8,
    gap: 12,
  },
  textInput: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: 16,
    color: NEUTRAL_900,
    paddingVertical: Platform.OS === 'ios' ? 14 : 8,
    maxHeight: 100,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0D0A2C',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
});
