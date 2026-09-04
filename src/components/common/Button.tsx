import React from 'react';
import {
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import PressableScale from './PressableScale';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
  textStyle?: TextStyle;
  fullWidth?: boolean;
}

export default function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  style,
  textStyle,
  fullWidth = true,
}: ButtonProps) {
  const { colors, radius, fontSize } = useTheme();

  const getContainerStyle = (): ViewStyle => {
    const base: ViewStyle = {
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
    };

    const sizeMap = {
      sm: { paddingVertical: 10, paddingHorizontal: 16, minHeight: 40 },
      md: { paddingVertical: 14, paddingHorizontal: 20, minHeight: 50 },
      lg: { paddingVertical: 18, paddingHorizontal: 24, minHeight: 56 },
    };

    const variantMap: Record<string, ViewStyle> = {
      primary: {
        backgroundColor: colors.primary,
      },
      secondary: {
        backgroundColor: colors.secondary,
      },
      outline: {
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderColor: colors.primary,
      },
      ghost: {
        backgroundColor: 'transparent',
      },
      danger: {
        backgroundColor: colors.error,
      },
    };

    return {
      ...base,
      ...sizeMap[size],
      ...variantMap[variant],
      opacity: disabled ? 0.5 : 1,
      width: fullWidth ? '100%' : undefined,
    };
  };

  const getTextStyle = (): TextStyle => {
    const sizeMap = {
      sm: { fontSize: fontSize.sm },
      md: { fontSize: fontSize.md },
      lg: { fontSize: fontSize.lg },
    };

    const variantMap: Record<string, TextStyle> = {
      primary: { color: colors.white },
      secondary: { color: colors.white },
      outline: { color: colors.primary },
      ghost: { color: colors.primary },
      danger: { color: colors.white },
    };

    return {
      fontWeight: '600',
      ...sizeMap[size],
      ...variantMap[variant],
    };
  };

  return (
    <PressableScale
      style={[getContainerStyle(), style]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'outline' || variant === 'ghost' ? colors.primary : colors.white}
          size="small"
        />
      ) : (
        <>
          {icon}
          <Text style={[getTextStyle(), icon ? { marginLeft: 8 } : {}, textStyle]}>
            {title}
          </Text>
        </>
      )}
    </PressableScale>
  );
}
