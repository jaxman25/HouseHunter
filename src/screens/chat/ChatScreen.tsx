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
  sendMessage,
  uploadChatImage,
  markAsRead,
} from '../../services/chatService';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'Chat'>;

export default function ChatScreen() {
  const { colors, fontSize, spacing } = useTheme();
  const { user } = useAuthContext();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);

  const { conversationId, recipientId, recipientName } = route.params;

  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!user) return;

    // Mark messages as read
    markAsRead(conversationId, user.uid);

    const unsubscribe = subscribeToMessages(conversationId, (data) => {
      setMessages(data);
    });

    return () => unsubscribe();
  }, [conversationId, user?.uid]);

  useEffect(() => {
    // Scroll to bottom when new messages arrive
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

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
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <MessageBubble message={item} isOwn={item.senderId === user?.uid} />
        )}
        contentContainerStyle={[
          styles.messagesList,
          { paddingTop: spacing.md, paddingBottom: spacing.sm },
        ]}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
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
