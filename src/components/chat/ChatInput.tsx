import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, Keyboard, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import * as ImagePicker from 'expo-image-picker';

interface ChatInputProps {
  onSend: (text: string) => void;
  onSendImage?: (uri: string) => void;
  sending?: boolean;
}

export default function ChatInput({ onSend, onSendImage, sending }: ChatInputProps) {
  const { colors, radius, fontSize, spacing } = useTheme();
  const [text, setText] = useState('');

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
    Keyboard.dismiss();
  };

  const handlePickImage = async () => {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: true,
    });

    if (!result.canceled && result.assets[0] && onSendImage) {
      onSendImage(result.assets[0].uri);
    }
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
      ]}
    >
      {onSendImage && (
        <TouchableOpacity
          onPress={handlePickImage}
          style={styles.iconButton}
        >
          <MaterialCommunityIcons
            name="image-plus"
            size={24}
            color={colors.primary}
          />
        </TouchableOpacity>
      )}

      <View
        style={[
          styles.inputContainer,
          {
            backgroundColor: colors.gray100,
            borderRadius: radius.round,
          },
        ]}
      >
        <TextInput
          style={[styles.input, { color: colors.text, fontSize: fontSize.md }]}
          placeholder="Type a message..."
          placeholderTextColor={colors.gray400}
          value={text}
          onChangeText={setText}
          multiline
          maxLength={1000}
        />
      </View>

      <TouchableOpacity
        onPress={handleSend}
        style={[
          styles.sendButton,
          {
            backgroundColor: text.trim() ? colors.primary : colors.gray300,
            opacity: sending ? 0.6 : 1,
          },
        ]}
        disabled={!text.trim() || sending}
      >
        <MaterialCommunityIcons
          name="send"
          size={20}
          color={colors.white}
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 0.5,
  },
  iconButton: {
    padding: 8,
    marginRight: 4,
  },
  inputContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 4,
    maxHeight: 100,
  },
  input: {
    paddingVertical: 8,
    maxHeight: 80,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
});
