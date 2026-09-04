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
import { validateEmail } from '../../utils/validators';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Login'>;
};

export default function LoginScreen({ navigation }: Props) {
  const { colors, fontSize, spacing, radius } = useTheme();
  const { login } = useAuthContext();
  const { signInWithGoogle, loading: googleLoading } = useGoogleSignIn();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);
  const [generalError, setGeneralError] = useState('');

  const validate = (): boolean => {
    const newErrors: { email?: string; password?: string } = {};
    const emailError = validateEmail(email);
    if (emailError) newErrors.email = emailError;
    if (!password) newErrors.password = 'Password is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (error: any) {
      Alert.alert(
        'Google Sign In',
        error?.message || 'Google sign-in failed. Please try again.'
      );
    }
  };

  const handleLogin = async () => {
    if (!validate()) return;
    setLoading(true);
    setGeneralError('');
    try {
      await login(email, password);
    } catch (error: any) {
      let message = 'An error occurred. Please try again.';
      if (error.code === 'auth/user-not-found') {
        message = 'No account found with this email.';
      } else if (error.code === 'auth/wrong-password') {
        message = 'Incorrect password.';
      } else if (error.code === 'auth/too-many-requests') {
        message = 'Too many attempts. Please try again later.';
      } else if (error.code === 'auth/invalid-email') {
        message = 'Invalid email address.';
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
          { paddingTop: insets.top + 40, paddingHorizontal: spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo & Welcome */}
        <View style={styles.logoSection}>
          <View style={[styles.logoIcon, { backgroundColor: colors.primary }]}>
            <MaterialCommunityIcons name="home-search" size={40} color={colors.white} />
          </View>
          <Text style={[styles.title, { color: colors.text, fontSize: fontSize.title }]}>
            House Hunter
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: fontSize.lg }]}>
            Find your perfect home
          </Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {generalError ? (
            <View style={[styles.errorBanner, { backgroundColor: '#FEF2F2', borderRadius: radius.md }]}>
              <MaterialCommunityIcons name="alert-circle" size={20} color={colors.error} />
              <Text style={[styles.errorText, { color: colors.error, fontSize: fontSize.sm }]}>
                {generalError}
              </Text>
            </View>
          ) : null}

          <Input
            label="Email"
            placeholder="Enter your email"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
            }}
            error={errors.email}
            leftIcon="email-outline"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Input
            label="Password"
            placeholder="Enter your password"
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
            }}
            error={errors.password}
            leftIcon="lock-outline"
            isPassword
          />

          <TouchableOpacity
            onPress={() => navigation.navigate('ForgotPassword')}
            style={styles.forgotPassword}
          >
            <Text style={{ color: colors.primary, fontSize: fontSize.sm, fontWeight: '600' }}>
              Forgot Password?
            </Text>
          </TouchableOpacity>

          <View style={{ marginTop: spacing.md }}>
            <Button title="Sign In" onPress={handleLogin} loading={loading} />
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
        </View>

        {/* Register Link */}
        <View style={styles.registerSection}>
          <Text style={{ color: colors.textSecondary, fontSize: fontSize.md }}>
            Don't have an account?{' '}
          </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Register')}>
            <Text style={{ color: colors.primary, fontSize: fontSize.md, fontWeight: '700' }}>
              Sign Up
            </Text>
          </TouchableOpacity>
        </View>
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
  logoSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: 4,
  },
  form: {},
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    flex: 1,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: 8,
  },
  registerSection: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingBottom: 40,
  },
});
