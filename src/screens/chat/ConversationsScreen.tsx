import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
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
import { subscribeToConversations } from '../../services/chatService';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function ConversationsScreen() {
  const { colors, fontSize, spacing } = useTheme();
  const { user } = useAuthContext();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const [conversations, setConversations] = useState<Conversation[]>([]);

  useEffect(() => {
    const uid = user?.uid;
    if (!uid) return;
    const unsubscribe = subscribeToConversations(uid, (data) => {
      setConversations(data);
    });
    return () => unsubscribe();
  }, [user?.uid]);

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
        ListEmptyComponent={
          <EmptyState
            icon="message-text-outline"
            title="No conversations yet"
            description="Start a conversation by contacting a property seller"
          />
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
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerTitle: {
    flex: 1,
  },
  title: { fontWeight: '800' },
});
