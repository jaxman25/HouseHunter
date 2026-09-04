import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';

interface HeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  rightAction?: string;
  onRightAction?: () => void;
  rightIcon?: string;
}

export default function Header({
  title,
  subtitle,
  showBack = false,
  onBack,
  rightAction,
  onRightAction,
  rightIcon = 'dots-vertical',
}: HeaderProps) {
  const { colors, fontSize, spacing } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top + spacing.sm,
          backgroundColor: colors.surface,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />
      <View style={styles.content}>
        <View style={styles.leftSection}>
          {showBack && (
            <TouchableOpacity
              onPress={onBack}
              style={[styles.iconButton, { backgroundColor: colors.gray100 }]}
            >
              <MaterialCommunityIcons
                name="arrow-left"
                size={22}
                color={colors.text}
              />
            </TouchableOpacity>
          )}
          <View style={showBack ? { marginLeft: spacing.md } : {}}>
            <Text
              style={[
                styles.title,
                { color: colors.text, fontSize: fontSize.xl },
              ]}
            >
              {title}
            </Text>
            {subtitle && (
              <Text
                style={[
                  styles.subtitle,
                  { color: colors.textSecondary, fontSize: fontSize.xs },
                ]}
              >
                {subtitle}
              </Text>
            )}
          </View>
        </View>
        {rightAction && (
          <TouchableOpacity
            onPress={onRightAction}
            style={[styles.iconButton, { backgroundColor: colors.gray100 }]}
          >
            <MaterialCommunityIcons
              name={rightIcon as any}
              size={20}
              color={colors.text}
            />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: 1,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  title: {
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 2,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
