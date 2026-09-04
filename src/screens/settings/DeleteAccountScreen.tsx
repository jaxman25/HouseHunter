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
import { useAuthContext } from '../../context/AuthContext';
import { RootStackParamList } from '../../types';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import LoadingOverlay from '../../components/common/LoadingOverlay';
import { deleteAccountData } from '../../services/accountService';
import { deleteAuthAccount } from '../../services/authService';
import { sendAccountDeletionConfirmationEmail } from '../../services/emailService';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function DeleteAccountScreen() {
  const { colors, fontSize, spacing, radius } = useTheme();
  const { user } = useAuthContext();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [loading, setLoading] = useState(false);

  const isEmailAccount = Boolean(user?.email);
  const confirmDisabled = isEmailAccount && !password.trim();

  const handleDelete = () => {
    if (!user) return;
    Alert.alert(
      'Delete Account',
      'This permanently deletes your profile, listings, photos, messages, and notifications. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Everything',
          style: 'destructive',
          onPress: runDeletion,
        },
      ]
    );
  };

  const runDeletion = async () => {
    if (!user) return;
    if (isEmailAccount && !password.trim()) {
      setPasswordError('Enter your password to confirm deletion');
      return;
    }
    setLoading(true);
    setPasswordError('');
    try {
      // Data first (needs the auth token), auth account last.
      await deleteAccountData(user.uid);
      // Best-effort confirmation email — sent while the auth token still
      // validates. If the Cloud Function isn't deployed this fails silently
      // and deletion still completes.
      try {
        await sendAccountDeletionConfirmationEmail();
      } catch (error) {
        console.warn('Deletion confirmation email not sent:', error);
      }
      await deleteAuthAccount(isEmailAccount ? password : undefined);
      // Auth state change unmounts the signed-in tree automatically.
      navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
    } catch (error: any) {
      console.error('Delete account error:', error);
      let message = 'Failed to delete account. Please try again.';
      if (error?.code === 'auth/requires-recent-login') {
        message =
          'For security, please sign out and sign back in, then try deleting again.';
      } else if (error?.message?.includes('could not be fully removed')) {
        message = error.message;
      } else if (error?.code === 'auth/wrong-password') {
        message = 'Incorrect password.';
      }
      Alert.alert('Error', message);
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
          Delete Account
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: spacing.xl }}
      >
        <View style={[styles.warningCard, { backgroundColor: '#FEF2F2', borderRadius: radius.lg }]}>
          <MaterialCommunityIcons name="alert-octagon" size={22} color={colors.error} />
          <Text style={{ color: colors.error, fontSize: fontSize.sm, marginLeft: 10, flex: 1, lineHeight: 20 }}>
            This action is permanent. Your account, listings, photos, saved
            favorites, messages, and notifications will be deleted from our
            servers, and your local cache will be cleared. There is no undo.
          </Text>
        </View>

        {isEmailAccount && (
          <View style={{ marginTop: spacing.lg }}>
            <Input
              label="Password"
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                if (passwordError) setPasswordError('');
              }}
              error={passwordError}
              leftIcon="lock-outline"
              isPassword
              placeholder="Enter your password to confirm"
            />
          </View>
        )}

        <View style={{ marginTop: spacing.xl }}>
          <Button
            title="Delete My Account"
            onPress={handleDelete}
            loading={loading}
            disabled={confirmDisabled}
            variant="danger"
          />
        </View>
      </ScrollView>
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
  headerTitle: { fontWeight: '700' },
  warningCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
  },
});
