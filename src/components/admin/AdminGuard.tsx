import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useAdmin } from '../../hooks/useAdmin';
import Button from '../common/Button';
import { useNavigation } from '@react-navigation/native';

/**
 * Wraps admin screens: shows the dashboard only for role-gated admins and an
 * access-denied state for everyone else (including signed-out users).
 */
export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const { colors, fontSize, spacing } = useTheme();
  const { isAdmin, loading } = useAdmin();
  const navigation = useNavigation();

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm }}>Checking access…</Text>
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, padding: spacing.xl }]}>
        <View style={[styles.iconCircle, { backgroundColor: colors.gray100, borderRadius: 40 }]}>
          <MaterialCommunityIcons name="shield-lock-outline" size={36} color={colors.gray500} />
        </View>
        <Text style={[styles.title, { color: colors.text, fontSize: fontSize.xl }]}>
          Admin access required
        </Text>
        <Text style={[styles.body, { color: colors.textSecondary, fontSize: fontSize.sm, textAlign: 'center' }]}>
          This area is restricted to House Hunter administrators. If you believe
          this is a mistake, contact support@househunter.com.
        </Text>
        <View style={{ width: '100%', marginTop: spacing.xl }}>
          <Button
            title="Go back"
            onPress={() => navigation.goBack()}
            variant="secondary"
          />
        </View>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontWeight: '800',
  },
  body: {
    marginTop: 8,
    lineHeight: 20,
  },
});