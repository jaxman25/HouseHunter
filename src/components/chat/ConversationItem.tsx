import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { Conversation } from '../../types';
import Avatar from '../common/Avatar';
import Badge from '../common/Badge';
import { formatChatDate } from '../../utils/formatters';

interface ConversationItemProps {
  conversation: Conversation;
  currentUserId: string;
  onPress: () => void;
}

export default function ConversationItem({
  conversation,
  currentUserId,
  onPress,
}: ConversationItemProps) {
  const { colors, fontSize } = useTheme();

  const otherUserId = conversation.participants.find((id) => id !== currentUserId) || '';
  const otherUserName = conversation.participantNames?.[otherUserId] || 'Unknown';
  const otherUserPhoto = conversation.participantPhotos?.[otherUserId] || '';
  const unreadCount = conversation.unreadCount?.[currentUserId] || 0;

  return (
    <TouchableOpacity
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderBottomColor: colors.border,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.avatarSection}>
        <Avatar
          uri={otherUserPhoto}
          name={otherUserName}
          size={52}
          online={unreadCount > 0}
        />
        {unreadCount > 0 && (
          <Badge
            count={unreadCount}
            variant="primary"
            size="sm"
            style={styles.badge}
          />
        )}
      </View>

      <View style={[styles.content, { borderBottomColor: colors.border }]}>
        <View style={styles.topRow}>
          <Text
            style={[
              styles.name,
              {
                color: colors.text,
                fontSize: fontSize.md,
                fontWeight: unreadCount > 0 ? '700' : '600',
              },
            ]}
            numberOfLines={1}
          >
            {otherUserName}
          </Text>
          <Text
            style={[
              styles.time,
              {
                color: unreadCount > 0 ? colors.primary : colors.textLight,
                fontSize: fontSize.xs,
              },
            ]}
          >
            {conversation.lastMessageTime
              ? formatChatDate(conversation.lastMessageTime)
              : ''}
          </Text>
        </View>

        {conversation.propertyTitle && (
          <Text
            style={[
              styles.property,
              { color: colors.textSecondary, fontSize: fontSize.xs },
            ]}
            numberOfLines={1}
          >
            {conversation.propertyTitle}
          </Text>
        )}

        <Text
          style={[
            styles.message,
            {
              color: unreadCount > 0 ? colors.text : colors.textSecondary,
              fontSize: fontSize.sm,
              fontWeight: unreadCount > 0 ? '600' : '400',
            },
          ]}
          numberOfLines={1}
        >
          {conversation.lastMessage || 'Start a conversation...'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  avatarSection: {
    marginRight: 12,
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
  },
  content: {
    flex: 1,
    paddingBottom: 0,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  name: {},
  time: {},
  property: {
    marginTop: 2,
  },
  message: {
    marginTop: 2,
  },
});
