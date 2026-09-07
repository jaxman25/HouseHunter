import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../types';
import { useTheme } from '../../context/ThemeContext';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import LoadingOverlay from '../../components/common/LoadingOverlay';
import { validateEmail } from '../../utils/validators';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'ForgotPassword'>;
};

export default function ForgotPasswordScreen({ navigation }: Props) {
  const { colors, fontSize, spacing } = useTheme();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleReset = async () => {
    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { resetPassword } = await import('../../services/authService');
      await resetPassword(email);
      setSent(true);
    } catch (error: any) {
      let message = 'Failed to send reset email. Try again.';
      if (error.code === 'auth/user-not-found') {
        message = 'No account found with this email.';
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.centerContent, { paddingTop: insets.top + 80, paddingHorizontal: spacing.xl }]}>
          <View style={[styles.successIcon, { backgroundColor: colors.success + '15' }]}>
            <MaterialCommunityIcons name="email-check" size={60} color={colors.success} />
          </View>
          <Text style={[styles.title, { color: colors.text, fontSize: fontSize.xxl }]}>
            Check Your Email
          </Text>
          <Text style={[styles.message, { color: colors.textSecondary, fontSize: fontSize.md }]}>
            We&apos;ve sent a password reset link to{'\n'}
            <Text style={{ fontWeight: '600', color: colors.text }}>{email}</Text>
          </Text>
          <Text style={[styles.hint, { color: colors.textLight, fontSize: fontSize.sm }]}>
            Didn&apos;t receive the email? Check your spam folder or try again.
          </Text>
          <View style={{ marginTop: spacing.xxxl, width: '100%' }}>
            <Button
              title="Back to Sign In"
              onPress={() => navigation.navigate('Login')}
            />
          </View>
          <TouchableOpacity
            onPress={() => {
              setSent(false);
              setEmail('');
            }}
            style={{ marginTop: spacing.lg }}
          >
            <Text style={{ color: colors.primary, fontSize: fontSize.md, fontWeight: '600' }}>
              Try another email
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <LoadingOverlay visible={loading} />
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 20, paddingHorizontal: spacing.xl },
          { width: '100%', maxWidth: 520, alignSelf: 'center' },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[styles.backButton, { backgroundColor: colors.gray100 }]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.iconSection}>
          <View style={[styles.iconContainer, { backgroundColor: colors.primaryLight }]}>
            <MaterialCommunityIcons name="lock-reset" size={48} color={colors.primary} />
          </View>
        </View>

        <Text style={[styles.title, { color: colors.text, fontSize: fontSize.xxl }]}>
          Forgot Password?
        </Text>
        <Text style={[styles.message, { color: colors.textSecondary, fontSize: fontSize.md }]}>
          No worries! Enter your email address and we&apos;ll send you a link to reset your password.
        </Text>

        <View style={{ marginTop: spacing.xl }}>
          <Input
            label="Email Address"
            placeholder="Enter your email"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              if (error) setError('');
            }}
            error={error}
            leftIcon="email-outline"
            keyboardType="email-address"
            autoCapitalize="none"
            returnKeyType="done"
            onSubmitEditing={handleReset}
          />
        </View>

        <View style={{ marginTop: spacing.md }}>
          <Button
            title="Send Reset Link"
            onPress={handleReset}
            loading={loading}
          />
        </View>

        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backLink}
        >
          <MaterialCommunityIcons name="arrow-left" size={16} color={colors.primary} />
          <Text style={{ color: colors.primary, fontSize: fontSize.md, fontWeight: '600', marginLeft: 4 }}>
            Back to Sign In
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
  },
  centerContent: {
    alignItems: 'center',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30,
  },
  iconSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successIcon: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12,
  },
  message: {
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 8,
  },
  hint: {
    textAlign: 'center',
    marginTop: 8,
  },
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
});
