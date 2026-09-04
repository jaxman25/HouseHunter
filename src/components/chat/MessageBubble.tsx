import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { Message } from '../../types';
import { formatTime } from '../../utils/formatters';

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
}

export default function MessageBubble({ message, isOwn }: MessageBubbleProps) {
  const { colors, radius, fontSize } = useTheme();

  return (
    <View
      style={[
        styles.container,
        isOwn ? styles.ownContainer : styles.otherContainer,
      ]}
    >
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: isOwn ? colors.primary : colors.surface,
            borderRadius: isOwn ? radius.lg : radius.lg,
            borderBottomRightRadius: isOwn ? 4 : radius.lg,
            borderBottomLeftRadius: isOwn ? radius.lg : 4,
          },
        ]}
      >
        {message.image && (
          <Image
            source={{ uri: message.image }}
            style={styles.messageImage}
          />
        )}
        {message.text ? (
          <Text
            style={[
              styles.text,
              {
                color: isOwn ? colors.white : colors.text,
                fontSize: fontSize.md,
              },
            ]}
          >
            {message.text}
          </Text>
        ) : null}
        <View style={styles.meta}>
          <Text
            style={[
              styles.time,
              {
                color: isOwn ? 'rgba(255,255,255,0.7)' : colors.textLight,
                fontSize: fontSize.xs,
              },
            ]}
          >
            {formatTime(message.createdAt)}
          </Text>
          {isOwn && (
            <MaterialCommunityIcons
              name={message.read ? 'check-all' : 'check'}
              size={14}
              color={message.read ? '#90EE90' : 'rgba(255,255,255,0.5)'}
              style={{ marginLeft: 4 }}
            />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    marginVertical: 2,
  },
  ownContainer: {
    alignItems: 'flex-end',
  },
  otherContainer: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    boxShadow: '0px 1px 2px rgba(0,0,0,0.05)',
  },
  text: {
    lineHeight: 20,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  time: {},
  messageImage: {
    width: 200,
    height: 150,
    borderRadius: 10,
    marginBottom: 4,
  },
});
