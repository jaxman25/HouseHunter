import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { useAuthContext } from '../../context/AuthContext';
import { RootStackParamList } from '../../types';
import { useAdmin } from '../../hooks/useAdmin';
import Button from '../../components/common/Button';

/**
 * Admin access screen. Reached from the Profile menu; shows the dashboard when
 * the signed-in user holds an admin role and an access-denied state otherwise.
 * (Sign-in itself uses the standard Login flow — there is no separate admin
 * credential system; access is decided by the admin/roles collection.)
 */
export default function AdminLoginScreen() {
  const { colors, fontSize, spacing, radius } = useTheme();
  const { user } = useAuthContext();
  const { isAdmin, loading } = useAdmin();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
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
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <MaterialCommunityIcons name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text, fontSize: fontSize.lg }]}>
          Admin Access
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={[styles.content, { padding: spacing.xl }]}>
        <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight, borderRadius: 44 }]}>
          <MaterialCommunityIcons name="shield-account" size={44} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: colors.text, fontSize: fontSize.xl }]}>
          House Hunter Admin
        </Text>
        <Text style={[styles.body, { color: colors.textSecondary, fontSize: fontSize.sm }]}>
          Admin tools cover platform moderation: user management, reported
          listings, announcements, and analytics. Access is granted to accounts
          provisioned with an admin role — it cannot be self-assigned.
        </Text>

        {loading ? (
          <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm, marginTop: spacing.xl }}>
            Checking access…
          </Text>
        ) : isAdmin ? (
          <View style={[styles.accessCard, { backgroundColor: colors.success, borderRadius: radius.md, marginTop: spacing.xl }]}>
            <MaterialCommunityIcons name="check-circle" size={18} color={colors.white} />
            <Text style={{ color: colors.white, fontSize: fontSize.sm, fontWeight: '700', marginLeft: 8, flex: 1 }}>
              Signed in as administrator
            </Text>
          </View>
        ) : (
          <View style={[styles.accessCard, { backgroundColor: colors.gray100, borderRadius: radius.md, marginTop: spacing.xl }]}>
            <MaterialCommunityIcons name="lock-outline" size={18} color={colors.gray500} />
            <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm, marginLeft: 8, flex: 1 }}>
              {user
                ? 'Your account does not have admin access.'
                : 'Sign in to check your access.'}
            </Text>
          </View>
        )}

        {isAdmin && (
          <View style={{ width: '100%', marginTop: spacing.xl }}>
            <Button
              title="Open Admin Dashboard"
              onPress={() => navigation.navigate('AdminDashboard')}
            />
          </View>
        )}
      </View>
    </View>
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
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontWeight: '700' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  iconCircle: { width: 88, height: 88, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { fontWeight: '800' },
  body: { marginTop: 10, textAlign: 'center', lineHeight: 20 },
  accessCard: { flexDirection: 'row', alignItems: 'center', padding: 14, alignSelf: 'stretch' },
});