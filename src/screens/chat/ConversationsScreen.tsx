import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { useAuthContext } from '../../context/AuthContext';
import { RootStackParamList, Conversation } from '../../types';
import ConversationItem from '../../components/chat/ConversationItem';
import EmptyState from '../../components/common/EmptyState';
import {
  subscribeToChatMeta,
  getConversationsPage,
} from '../../services/chatService';
import { usePaginatedQuery } from '../../hooks/usePaginatedQuery';
import { PAGE_SIZE_DEFAULT } from '../../utils/constants';
import type { DocumentSnapshot, DocumentData } from 'firebase/firestore';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * Conversations list — hybrid pagination with a CHEAP change signal: the
 * real-time layer is a single doc (`users/{uid}/meta/chat`, 1 read per
 * change) instead of an onSnapshot over the whole first page (N reads per
 * change). Page-1 data loads via getDocs (the paged hook on mount, plus a
 * refetch whenever the meta's lastMessageAt/unreadCount signature changes);
 * older pages load from getDocs on scroll via usePaginatedQuery.
 */
export default function ConversationsScreen() {
  const { colors, fontSize, spacing } = useTheme();
  const { user } = useAuthContext();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const [realtime, setRealtime] = useState<Conversation[]>([]);

  // Page 1 loads via getDocs on mount (and pull-to-refresh); older pages
  // load on scroll via cursor getDocs. The real-time layer below only
  // watches the meta doc and refetches page 1 when its signature changes.
  const pages = usePaginatedQuery<Conversation>({
    key: user?.uid ?? null,
    fetchPage: (cursor: DocumentSnapshot<DocumentData> | null, pageSize) =>
      getConversationsPage(user!.uid, cursor, pageSize),
  });

  // Change signal: ONE meta doc (1 read per change). On every signature
  // change after the first snapshot, refetch the first page via getDocs and
  // merge it OVER the paged list (realtime-wins semantics, as before). The
  // first snapshot is skipped — the paged hook just loaded page 1 on mount —
  // so opening the list while nothing changed costs exactly 1 read for the
  // real-time layer. The signature includes unreadCount so badge resets
  // (read receipts) refresh the list too.
  const uidForSubscription = user?.uid;
  // Clear live data whenever the account changes (signed out or switched) —
  // render-time reset (guarded prev-value compare), which avoids a
  // set-state-in-effect lint hit; the paged hook resets itself via its key.
  const [prevSubscriptionUid, setPrevSubscriptionUid] = useState(uidForSubscription);
  if (prevSubscriptionUid !== uidForSubscription) {
    setPrevSubscriptionUid(uidForSubscription);
    setRealtime([]);
  }
  React.useEffect(() => {
    if (!uidForSubscription) return;
    let previousSignature: string | null = null;
    const unsubscribe = subscribeToChatMeta(uidForSubscription, (meta) => {
      const signature = `${meta.lastMessageAt}|${meta.unreadCount}`;
      if (previousSignature === null) {
        previousSignature = signature;
        return;
      }
      if (signature === previousSignature) return;
      previousSignature = signature;
      void getConversationsPage(uidForSubscription, null, PAGE_SIZE_DEFAULT)
        .then((page) => setRealtime(page.items))
        .catch((error) => console.warn('Failed to refresh conversations:', error));
    });
    return () => unsubscribe();
  }, [uidForSubscription]);

  const conversations = React.useMemo(() => {
    const byId = new Map<string, Conversation>();
    for (const c of pages.items) byId.set(c.id, c);
    // Realtime wins per id; then newest-first by lastMessageTime.
    for (const c of realtime) byId.set(c.id, c);
    return [...byId.values()].sort((a, b) =>
      String(b.lastMessageTime ?? '').localeCompare(String(a.lastMessageTime ?? ''))
    );
  }, [pages.items, realtime]);

  const handleRefresh = useCallback(() => {
    pages.refresh();
  }, [pages]);

  const loading = !uidForSubscription || pages.loading;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background },
        // Center the list in a comfortable column on large screens.
        { width: '100%', maxWidth: 720, alignSelf: 'center' },
      ]}
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
          accessibilityRole="button"
          accessibilityLabel="Go back to the previous screen"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialCommunityIcons name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitle}>
          <Text style={[styles.title, { color: colors.text, fontSize: fontSize.xxl }]}>
            Messages
          </Text>
          {conversations.length > 0 && (
            <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm }}>
              {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
            </Text>
          )}
        </View>
      </View>

      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ConversationItem
            conversation={item}
            currentUserId={user?.uid || ''}
            onPress={() => {
              const otherId = item.participants.find((id) => id !== user?.uid) || '';
              const otherName = item.participantNames?.[otherId] || 'Unknown';
              navigation.navigate('Chat', {
                conversationId: item.id,
                recipientId: otherId,
                recipientName: otherName,
              });
            }}
          />
        )}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
        onEndReached={() => pages.loadMore()}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl
            refreshing={pages.loadingMore}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
        ListFooterComponent={
          pages.loadingMore ? (
            <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm, textAlign: 'center', padding: 12 }}>
              Loading…
            </Text>
          ) : null
        }
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon="message-text-outline"
              title="No conversations yet"
              description="Start a conversation by contacting a property seller"
            />
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
  },

  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, alignItems: 'center', marginRight: 36 },
  title: { fontWeight: '700' },
});
