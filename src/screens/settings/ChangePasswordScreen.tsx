import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { RootStackParamList } from '../../types';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import LoadingOverlay from '../../components/common/LoadingOverlay';
import { changePassword } from '../../services/authService';
import { validatePassword } from '../../utils/validators';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function ChangePasswordScreen() {
  const { colors, fontSize, spacing, radius } = useTheme();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!currentPassword) {
      newErrors.currentPassword = 'Current password is required';
    }
    const passErr = validatePassword(newPassword);
    if (passErr) {
      newErrors.newPassword = passErr;
    }
    if (newPassword !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }
    if (currentPassword === newPassword) {
      newErrors.newPassword = 'New password must be different';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChangePassword = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      await changePassword(currentPassword, newPassword);
      Alert.alert('Success', 'Password changed successfully', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error: any) {
      let message = 'Failed to change password';
      if (error.code === 'auth/wrong-password') {
        message = 'Current password is incorrect';
      } else if (error.code === 'auth/weak-password') {
        message = 'New password is too weak';
      } else if (error.code === 'auth/requires-recent-login') {
        message = 'Please log out and log back in before changing your password';
      }
      setErrors({ general: message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[
        styles.container,
        { backgroundColor: colors.background },
        { width: '100%', maxWidth: 640, alignSelf: 'center' },
      ]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <LoadingOverlay visible={loading} />

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
        <Text style={[styles.headerTitle, { color: colors.text, fontSize: fontSize.lg }]}>
          Change Password
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: spacing.xl }}
      >
        {/* Icon */}
        <View style={styles.iconSection}>
          <View style={[styles.iconContainer, { backgroundColor: colors.primaryLight, borderRadius: 24 }]}>
            <MaterialCommunityIcons name="shield-lock" size={40} color={colors.primary} />
          </View>
        </View>

        <Text style={[styles.description, { color: colors.textSecondary, fontSize: fontSize.md }]}>
          Enter your current password and choose a new one.
        </Text>

        {errors.general && (
          <View style={[styles.errorBanner, { backgroundColor: '#FEF2F2', borderRadius: radius.md }]}>
            <MaterialCommunityIcons name="alert-circle" size={20} color={colors.error} />
            <Text style={{ color: colors.error, fontSize: fontSize.sm, flex: 1, marginLeft: 8 }}>
              {errors.general}
            </Text>
          </View>
        )}

        <Input
          label="Current Password"
          value={currentPassword}
          onChangeText={(t) => {
            setCurrentPassword(t);
            setErrors((prev) => ({ ...prev, currentPassword: '', general: '' }));
          }}
          error={errors.currentPassword}
          leftIcon="lock-outline"
          isPassword
        />

        <Input
          label="New Password"
          value={newPassword}
          onChangeText={(t) => {
            setNewPassword(t);
            setErrors((prev) => ({ ...prev, newPassword: '', general: '' }));
          }}
          error={errors.newPassword}
          leftIcon="lock-plus-outline"
          isPassword
          placeholder="Min 8 characters"
        />

        <Input
          label="Confirm New Password"
          value={confirmPassword}
          onChangeText={(t) => {
            setConfirmPassword(t);
            setErrors((prev) => ({ ...prev, confirmPassword: '', general: '' }));
          }}
          error={errors.confirmPassword}
          leftIcon="lock-check-outline"
          isPassword
        />

        <View style={{ marginTop: spacing.xl }}>
          <Button title="Update Password" onPress={handleChangePassword} loading={loading} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 0.5 },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontWeight: '700' },
  iconSection: { alignItems: 'center', marginBottom: 20 },
  iconContainer: { width: 80, height: 80, alignItems: 'center', justifyContent: 'center' },
  description: { textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  errorBanner: { flexDirection: 'row', alignItems: 'center', padding: 12, marginBottom: 16 },
});
