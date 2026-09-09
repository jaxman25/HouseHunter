import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../types';
import { useTheme } from '../../context/ThemeContext';
import { useAuthContext } from '../../context/AuthContext';
import { useGoogleSignIn } from '../../hooks/useGoogleSignIn';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import LoadingOverlay from '../../components/common/LoadingOverlay';
import {
  validateEmail,
  validatePassword,
  validateConfirmPassword,
  validateName,
} from '../../utils/validators';
import { TERMS_VERSION } from '../../utils/constants';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Register'>;
};

type Role = 'buyer' | 'seller' | 'agent';

export default function RegisterScreen({ navigation }: Props) {
  const { colors, fontSize, spacing, radius } = useTheme();
  const { register } = useAuthContext();
  const { signInWithGoogle, loading: googleLoading } = useGoogleSignIn();
  const insets = useSafeAreaInsets();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<Role>('buyer');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsError, setTermsError] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [generalError, setGeneralError] = useState('');

  const roles: { key: Role; label: string; icon: string; description: string }[] = [
    { key: 'buyer', label: 'Buyer', icon: 'home-search', description: 'Looking for properties' },
    { key: 'seller', label: 'Seller', icon: 'home-edit', description: 'Selling properties' },
    { key: 'agent', label: 'Agent', icon: 'badge-account', description: 'Real estate agent' },
  ];

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    const nameErr = validateName(displayName);
    if (nameErr) newErrors.displayName = nameErr;
    const emailErr = validateEmail(email);
    if (emailErr) newErrors.email = emailErr;
    const passErr = validatePassword(password);
    if (passErr) newErrors.password = passErr;
    const confirmErr = validateConfirmPassword(password, confirmPassword);
    if (confirmErr) newErrors.confirmPassword = confirmErr;
    setErrors(newErrors);

    if (!termsAccepted) {
      setTermsError('You must accept the Terms of Service to create an account');
    }

    return (
      Object.keys(newErrors).length === 0 && termsAccepted
    );
  };

  const handleGoogleSignIn = async () => {
    if (!termsAccepted) {
      setTermsError('You must accept the Terms of Service to create an account');
      return;
    }
    setTermsError('');
    try {
      await signInWithGoogle();
    } catch (error: any) {
      Alert.alert(
        'Google Sign In',
        error?.message || 'Google sign-in failed. Please try again.'
      );
    }
  };

  const handleRegister = async () => {
    if (!validate()) return;
    setLoading(true);
    setGeneralError('');
    try {
      await register(email, password, displayName, role, TERMS_VERSION);
    } catch (error: any) {
      let message = 'Registration failed. Please try again.';
      if (error.code === 'auth/email-already-in-use') {
        message = 'An account with this email already exists.';
      } else if (error.code === 'auth/weak-password') {
        message = 'Password is too weak.';
      } else if (error.code === 'auth/invalid-email') {
        message = 'Invalid email address.';
      } else if (error.code === 'auth/operation-not-allowed') {
        message =
          'Email sign-up is temporarily disabled. Please try again later or sign in with Google.';
      }
      setGeneralError(message);
    } finally {
      setLoading(false);
    }
  };

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
        {/* Back Button */}
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[styles.backButton, { backgroundColor: colors.gray100 }]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>

        <Text style={[styles.title, { color: colors.text, fontSize: fontSize.title }]}>
          Create Account
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: fontSize.md }]}>
          Create your account to start searching
        </Text>

        {generalError ? (
          <View style={[styles.errorBanner, { backgroundColor: '#FEF2F2', borderRadius: radius.md }]}>
            <MaterialCommunityIcons name="alert-circle" size={20} color={colors.error} />
            <Text style={{ color: colors.error, fontSize: fontSize.sm, flex: 1 }}>
              {generalError}
            </Text>
          </View>
        ) : null}

        {/* Role Selection */}
        <Text style={[styles.sectionLabel, { color: colors.text, fontSize: fontSize.sm }]}>
          I am a...
        </Text>
        <View style={styles.roleRow}>
          {roles.map((r) => (
            <TouchableOpacity
              key={r.key}
              style={[
                styles.roleCard,
                {
                  backgroundColor: role === r.key ? colors.primaryLight : colors.surface,
                  borderColor: role === r.key ? colors.primary : colors.border,
                  borderRadius: radius.md,
                },
              ]}
              onPress={() => setRole(r.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: role === r.key }}
            >
              <MaterialCommunityIcons
                name={r.icon as any}
                size={24}
                color={role === r.key ? colors.primary : colors.gray500}
              />
              <Text
                style={[
                  styles.roleLabel,
                  {
                    color: role === r.key ? colors.primary : colors.text,
                    fontSize: fontSize.sm,
                  },
                ]}
              >
                {r.label}
              </Text>
              <Text
                style={[
                  styles.roleDesc,
                  { color: colors.textSecondary, fontSize: fontSize.xs },
                ]}
              >
                {r.description}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Form Fields */}
        <View style={{ marginTop: spacing.lg }}>
          <Input
            label="Full Name"
            placeholder="Enter your full name"
            value={displayName}
            onChangeText={(t) => {
              setDisplayName(t);
              if (errors.displayName) setErrors((p) => ({ ...p, displayName: '' }));
            }}
            error={errors.displayName}
            leftIcon="account-outline"
            autoCapitalize="words"
          />

          <Input
            label="Email"
            placeholder="Enter your email"
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              if (errors.email) setErrors((p) => ({ ...p, email: '' }));
            }}
            error={errors.email}
            leftIcon="email-outline"
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Input
            label="Password"
            placeholder="Min 8 characters"
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              if (errors.password) setErrors((p) => ({ ...p, password: '' }));
            }}
            error={errors.password}
            leftIcon="lock-outline"
            isPassword
          />

          <Input
            label="Confirm Password"
            placeholder="Re-enter your password"
            value={confirmPassword}
            onChangeText={(t) => {
              setConfirmPassword(t);
              if (errors.confirmPassword) setErrors((p) => ({ ...p, confirmPassword: '' }));
            }}
            error={errors.confirmPassword}
            leftIcon="lock-check-outline"
            isPassword
            returnKeyType="done"
            onSubmitEditing={handleRegister}
          />
        </View>

        {/* Terms agreement */}
        <View style={[styles.termsRow, { marginTop: spacing.md }]}>
          <TouchableOpacity
            onPress={() => {
              setTermsAccepted((prev) => !prev);
              if (termsError) setTermsError('');
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="checkbox"
            accessibilityLabel="I agree to the Terms of Service and Privacy Policy"
            accessibilityState={{ checked: termsAccepted }}
          >
            <MaterialCommunityIcons
              name={termsAccepted ? 'checkbox-marked' : 'checkbox-blank-outline'}
              size={22}
              color={termsAccepted ? colors.primary : colors.gray500}
            />
          </TouchableOpacity>
          <Text style={{ flex: 1, color: colors.textSecondary, fontSize: fontSize.sm, marginLeft: 8, lineHeight: 18 }}>
            I agree to the{' '}
            <Text
              style={{ color: colors.primary, fontWeight: '700' }}
              onPress={() => navigation.navigate('Terms')}
            >
              Terms of Service
            </Text>{' '}
            and{' '}
            <Text
              style={{ color: colors.primary, fontWeight: '700' }}
              onPress={() => navigation.navigate('PrivacyPolicy')}
            >
              Privacy Policy
            </Text>
          </Text>
        </View>
        {termsError ? (
          <Text style={{ color: colors.error, fontSize: fontSize.xs, marginTop: 4, marginLeft: 30 }}>
            {termsError}
          </Text>
        ) : null}

        <View style={{ marginTop: spacing.md }}>
          <Button title="Create Account" onPress={handleRegister} loading={loading} />
        </View>

        <View style={{ marginTop: spacing.lg }}>
          <Button
            title="Continue with Google"
            onPress={handleGoogleSignIn}
            loading={googleLoading}
            variant="outline"
            icon={
              <MaterialCommunityIcons name="google" size={20} color={colors.primary} />
            }
          />
        </View>

        <View style={styles.loginLink}>
          <Text style={{ color: colors.textSecondary, fontSize: fontSize.md }}>
            Already have an account?{' '}
          </Text>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={{ color: colors.primary, fontSize: fontSize.md, fontWeight: '700' }}>
              Sign In
            </Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
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
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 24,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  sectionLabel: {
    fontWeight: '600',
    marginBottom: 10,
  },
  roleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  roleCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderWidth: 1.5,
  },
  roleLabel: {
    fontWeight: '700',
    marginTop: 6,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  roleDesc: {
    marginTop: 2,
    textAlign: 'center',
  },
  loginLink: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
  },
});
