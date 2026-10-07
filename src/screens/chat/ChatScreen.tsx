import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { useAuthContext } from '../../context/AuthContext';
import { RootStackParamList, Message } from '../../types';
import MessageBubble from '../../components/chat/MessageBubble';
import ChatInput from '../../components/chat/ChatInput';
import Avatar from '../../components/common/Avatar';
import {
  subscribeToMessages,
  subscribeToReadReceipt,
  getMessagesPage,
  sendMessage,
  uploadChatImage,
  recordReadReceipt,
  MESSAGE_WINDOW,
} from '../../services/chatService';
import {
  appendOlder,
  droppedFromWindow,
  mergeMessages,
} from '../../services/messagePagination';
import type { DocumentSnapshot, DocumentData } from 'firebase/firestore';
import ReportUserModal from '../../components/moderation/ReportUserModal';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'Chat'>;

export default function ChatScreen() {
  const { colors, fontSize, spacing, radius } = useTheme();
  const { user } = useAuthContext();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);

  const { conversationId, recipientId, recipientName } = route.params;

  const [liveWindow, setLiveWindow] = useState<Message[]>([]);
  const [older, setOlder] = useState<Message[]>([]);
  const [cursor, setCursor] = useState<DocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [otherLastReadAt, setOtherLastReadAt] = useState(0);
  const [menuVisible, setMenuVisible] = useState(false);
  const [showReportUser, setShowReportUser] = useState(false);
  const [sending, setSending] = useState(false);

  // Reset thread state when the route switches to a different conversation.
  // Render-time reset (guarded prev-value compare) — the documented pattern;
  // calling these setStates inside the subscription effect trips
  // react-hooks/set-state-in-effect.
  const [prevConversationId, setPrevConversationId] = useState(conversationId);
  if (prevConversationId !== conversationId) {
    setPrevConversationId(conversationId);
    setLiveWindow([]);
    setOlder([]);
    setCursor(null);
    setHasMore(true);
    setOtherLastReadAt(0);
  }

  // Previous live window — detects messages that slid out of the top-30
  // window as it moves up, so they get absorbed into `older` (no holes).
  const prevWindowRef = useRef<Message[]>([]);
  // Only start loading older history once the user has actually scrolled
  // (contentOffset starts at 0 and must not auto-fetch on mount).
  const scrolledRef = useRef(false);

  useEffect(() => {
    const uid = user?.uid;
    if (!uid) return;

    // Reset window bookkeeping for the (possibly new) thread; the state
    // itself is reset at render time above.
    prevWindowRef.current = [];
    scrolledRef.current = false;

    // Batched receipt (≤1 write / 5s): open + arrival-driven, see effects.
    void recordReadReceipt(conversationId, uid);

    // Live window: newest 30 messages + the cursor for older pages.
    const unsubscribe = subscribeToMessages(conversationId, (windowMessages, oldestSnap) => {
      const dropped = droppedFromWindow(prevWindowRef.current, windowMessages);
      prevWindowRef.current = windowMessages;
      if (dropped.length > 0) setOlder((o) => appendOlder(o, dropped));
      setLiveWindow(windowMessages);
      setCursor((c) => c ?? oldestSnap);
    });

    // The other participant's receipt — drives live read checkmarks (1 read
    // per change, one doc) instead of per-message `read` writes.
    const unsubscribeReceipt = recipientId
      ? subscribeToReadReceipt(conversationId, recipientId, setOtherLastReadAt)
      : () => {};

    return () => {
      unsubscribe();
      unsubscribeReceipt();
    };
  }, [conversationId, user?.uid, recipientId]);

  // Merge both slices: deduped, gapless, ascending (pure helper — unit-tested).
  const messages = React.useMemo(
    () => mergeMessages(older, liveWindow),
    [older, liveWindow]
  );

  // Rendered thread: own messages flip to "read" once the OTHER participant's
  // batched lastReadAt covers their createdAt (legacy stored `read` kept as-is).
  const displayMessages = React.useMemo(() => {
    if (!user || otherLastReadAt <= 0) return messages;
    return messages.map((m) =>
      m.senderId === user.uid && !m.read && Date.parse(m.createdAt) <= otherLastReadAt
        ? { ...m, read: true }
        : m
    );
  }, [messages, otherLastReadAt, user]);

  const newestId = displayMessages.length > 0
    ? displayMessages[displayMessages.length - 1].id
    : '';

  // Load older history on scroll-up (30 at a time) — gated on first scroll,
  // in-flight, and hasMore so a short page ends pagination.
  const loadOlder = React.useCallback(async () => {
    if (loadingOlder || !hasMore || !cursor) return;
    setLoadingOlder(true);
    try {
      const page = await getMessagesPage(conversationId, cursor, MESSAGE_WINDOW);
      setOlder((o) => appendOlder(o, page.items));
      setCursor(page.cursor ?? cursor);
      setHasMore(page.hasMore);
    } catch (error) {
      console.warn('Failed to load older messages:', error);
    } finally {
      setLoadingOlder(false);
    }
  }, [conversationId, cursor, hasMore, loadingOlder]);

  // Receipt on open + whenever the newest message changes (throttled to at
  // most one write per 5s inside recordReadReceipt).
  useEffect(() => {
    const uid = user?.uid;
    if (!uid || !newestId) return;
    void recordReadReceipt(conversationId, uid);
  }, [newestId, conversationId, user?.uid]);

  useEffect(() => {
    // Scroll to bottom only when the NEWEST message changes (first load or a
    // fresh arrival) — never when older history is prepended above.
    if (!newestId) return;
    const timer = setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: false });
    }, 100);
    return () => clearTimeout(timer);
  }, [newestId]);

  const handleSend = async (text: string) => {
    if (!user) return;
    setSending(true);
    try {
      await sendMessage(conversationId, user.uid, text, undefined, recipientId);
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setSending(false);
    }
  };

  const handleSendImage = async (uri: string) => {
    if (!user) return;
    setSending(true);
    try {
      const imageUrl = await uploadChatImage(uri, conversationId);
      await sendMessage(conversationId, user.uid, '', imageUrl, recipientId);
    } catch (error) {
      console.error('Error sending image:', error);
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[
        styles.container,
        { backgroundColor: colors.background },
        // Center the thread in a comfortable column on large screens.
        { width: '100%', maxWidth: 780, alignSelf: 'center' },
      ]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + spacing.sm,
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[styles.backBtn, { backgroundColor: colors.gray100 }]}
        >
          <MaterialCommunityIcons name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerLeft}>
          <Avatar name={recipientName} size={36} />
          <View style={{ marginLeft: 10 }}>
            <Text style={[styles.headerName, { color: colors.text, fontSize: fontSize.md }]}>
              {recipientName}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => setMenuVisible(!menuVisible)}
          style={[styles.backBtn, { backgroundColor: colors.gray100 }]}
          accessibilityRole="button"
          accessibilityLabel="Conversation options"
        >
          <MaterialCommunityIcons name="dots-vertical" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Overflow menu */}
      {menuVisible && (
        <TouchableOpacity
          activeOpacity={1}
          style={styles.menuBackdrop}
          onPress={() => setMenuVisible(false)}
        >
          <View style={[styles.menuCard, { backgroundColor: colors.surface, borderRadius: radius.md, borderColor: colors.border }]}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                setShowReportUser(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Report ${recipientName}`}
            >
              <MaterialCommunityIcons name="flag-outline" size={18} color={colors.error} />
              <Text style={{ color: colors.error, fontSize: fontSize.sm, marginLeft: 10, fontWeight: '600' }}>
                Report User
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      )}

      {/* Report User modal */}
      <ReportUserModal
        visible={showReportUser}
        onClose={() => setShowReportUser(false)}
        reportedUserId={recipientId}
        reportedUserName={recipientName}
      />

      {/* Messages — live window (newest 30) + older pages on scroll-up */}
      <FlatList
        ref={flatListRef}
        data={displayMessages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <MessageBubble message={item} isOwn={item.senderId === user?.uid} />
        )}
        contentContainerStyle={[
          styles.messagesList,
          { paddingTop: spacing.md, paddingBottom: spacing.sm },
        ]}
        showsVerticalScrollIndicator={false}
        // Keeps the viewport anchored when older pages are prepended above.
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        onScroll={(event) => {
          const y = event.nativeEvent.contentOffset.y;
          if (!scrolledRef.current) {
            if (y > 20) scrolledRef.current = true;
            else return; // never auto-fetch older history before user scrolls
          }
          if (y < 150 && hasMore && !loadingOlder) void loadOlder();
        }}
        scrollEventThrottle={16}
      />

      {/* Chat Input */}
      <ChatInput
        onSend={handleSend}
        onSendImage={handleSendImage}
        sending={sending}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
  },
  menuBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
  },
  menuCard: {
    position: 'absolute',
    top: 100,
    right: 16,
    minWidth: 170,
    borderWidth: 1,
    paddingVertical: 6,
    zIndex: 21,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerName: {
    fontWeight: '600',
  },
  messagesList: {
    paddingHorizontal: 0,
  },
});
