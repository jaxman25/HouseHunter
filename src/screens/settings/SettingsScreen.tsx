import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  StyleSheet,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { useAuthContext } from '../../context/AuthContext';
import { RootStackParamList } from '../../types';
import { checkFirebaseHealth, HealthStatus } from '../../utils/network/healthCheck';
import { firestoreCircuitBreaker } from '../../utils/network/circuitBreaker';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface SettingItem {
  icon: string;
  label: string;
  subtitle?: string;
  type: 'toggle' | 'action' | 'link';
  value?: boolean;
  onToggle?: (val: boolean) => void;
  onPress?: () => void;
  color?: string;
}

export default function SettingsScreen() {
  const { colors, fontSize, spacing, radius } = useTheme();
  const { logout } = useAuthContext();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const [pushNotifications, setPushNotifications] = useState(true);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [messageNotifications, setMessageNotifications] = useState(true);
  const [showOnlineStatus, setShowOnlineStatus] = useState(true);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(true);

  const runHealthCheck = async () => {
    setCheckingHealth(true);
    const result = await checkFirebaseHealth();
    setHealth(result);
    setCheckingHealth(false);
  };

  useEffect(() => {
    // The initial state already reads "checking…", so the mount check defers
    // its state updates instead of setting them synchronously in the effect.
    checkFirebaseHealth()
      .then(setHealth)
      .finally(() => setCheckingHealth(false));
  }, []);

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await logout();
          } catch (error) {
            console.error('Logout error:', error);
          }
        },
      },
    ]);
  };

  const sections = [
    {
      title: 'Notifications',
      items: [
        {
          icon: 'bell',
          label: 'Push Notifications',
          subtitle: 'Receive push notifications',
          type: 'toggle' as const,
          value: pushNotifications,
          onToggle: setPushNotifications,
        },
        {
          icon: 'email',
          label: 'Email Notifications',
          subtitle: 'Receive email updates',
          type: 'toggle' as const,
          value: emailNotifications,
          onToggle: setEmailNotifications,
        },
        {
          icon: 'message-text',
          label: 'Message Alerts',
          subtitle: 'Get notified for new messages',
          type: 'toggle' as const,
          value: messageNotifications,
          onToggle: setMessageNotifications,
        },
      ],
    },
    {
      title: 'Privacy',
      items: [
        {
          icon: 'eye',
          label: 'Show Online Status',
          subtitle: 'Others can see when you\'re online',
          type: 'toggle' as const,
          value: showOnlineStatus,
          onToggle: setShowOnlineStatus,
        },
        {
          icon: 'shield-lock',
          label: 'Privacy Policy',
          subtitle: 'How we collect and use your data',
          type: 'link' as const,
          onPress: () => navigation.navigate('PrivacyPolicy'),
        },
        {
          icon: 'file-document',
          label: 'Terms of Service',
          subtitle: 'The rules for using House Hunter',
          type: 'link' as const,
          onPress: () => navigation.navigate('Terms'),
        },
      ],
    },
    {
      title: 'Support',
      items: [
        {
          icon: 'help-circle',
          label: 'Help Center',
          subtitle: 'FAQ and support articles',
          type: 'link' as const,
          onPress: () => Alert.alert('Help', 'Help center would open here.'),
        },
        {
          icon: 'email-send-outline',
          label: 'Contact Support',
          subtitle: 'Get help from our team',
          type: 'link' as const,
          onPress: () => Alert.alert('Support', 'support@househunter.com'),
        },
        {
          icon: 'star',
          label: 'Rate App',
          subtitle: 'Rate us on the App Store',
          type: 'link' as const,
          onPress: () => Alert.alert('Thank you!', 'Rate us on the store'),
        },
      ],
    },
    {
      title: 'System',
      items: [
        {
          icon:
            checkingHealth || !health
              ? 'cloud-sync'
              : health.healthy
              ? 'cloud-check'
              : 'cloud-alert',
          label: 'Firebase Status',
          subtitle: checkingHealth
            ? 'Checking connection…'
            : !health
            ? 'Tap to check'
            : health.healthy
            ? `All systems operational · ${health.latencyMs}ms`
            : firestoreCircuitBreaker.currentState === 'open'
            ? 'Unreachable — circuit open, tap to retry'
            : 'Unreachable, tap to retry',
          type: 'action' as const,
          onPress: runHealthCheck,
          color:
            checkingHealth || !health
              ? colors.textSecondary
              : health.healthy
              ? colors.success
              : colors.error,
        },
      ],
    },
    {
      title: 'Account',
      items: [
        {
          icon: 'logout',
          label: 'Sign Out',
          type: 'action' as const,
          onPress: handleLogout,
          color: colors.error,
        },
        {
          icon: 'delete-forever',
          label: 'Delete Account',
          subtitle: 'Erase your profile, listings, and data',
          type: 'link' as const,
          onPress: () => navigation.navigate('DeleteAccount'),
          color: colors.error,
        },
      ],
    },
  ];

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background },
        { width: '100%', maxWidth: 720, alignSelf: 'center' },
      ]}
    >
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
        <Text style={[styles.headerTitle, { color: colors.text, fontSize: fontSize.xl }]}>
          Settings
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {sections.map((section) => (
          <View key={section.title} style={{ marginTop: spacing.lg }}>
            <Text
              style={[
                styles.sectionTitle,
                {
                  color: colors.textSecondary,
                  fontSize: fontSize.xs,
                  marginHorizontal: spacing.xl,
                  marginBottom: spacing.sm,
                },
              ]}
            >
              {section.title.toUpperCase()}
            </Text>
            <View
              style={[
                styles.sectionCard,
                {
                  backgroundColor: colors.surface,
                  marginHorizontal: spacing.lg,
                  borderRadius: radius.xl,
                },
              ]}
            >
              {section.items.map((item, index) => {
                const settingItem = item as SettingItem;
                return (
                  <TouchableOpacity
                    key={settingItem.label}
                    style={[
                      styles.settingItem,
                      {
                        borderBottomWidth: index < section.items.length - 1 ? 0.5 : 0,
                        borderBottomColor: colors.border,
                        opacity: settingItem.type === 'toggle' ? 1 : 0.9,
                      },
                    ]}
                    onPress={settingItem.type === 'toggle' ? undefined : settingItem.onPress}
                    activeOpacity={settingItem.type === 'toggle' ? 1 : 0.6}
                    disabled={settingItem.type === 'toggle'}
                  >
                    <View style={[styles.settingIcon, { backgroundColor: (settingItem.color || colors.primary) + '12' }]}>
                      <MaterialCommunityIcons
                        name={settingItem.icon as any}
                        size={20}
                        color={settingItem.color || colors.primary}
                      />
                    </View>
                    <View style={styles.settingContent}>
                      <Text
                        style={{
                          color: settingItem.color || colors.text,
                          fontSize: fontSize.md,
                          fontWeight: '600',
                        }}
                      >
                        {settingItem.label}
                      </Text>
                      {settingItem.subtitle && (
                        <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs, marginTop: 2 }}>
                          {settingItem.subtitle}
                        </Text>
                      )}
                    </View>
                    {settingItem.type === 'toggle' && (
                      <Switch
                        value={settingItem.value}
                        onValueChange={settingItem.onToggle}
                        trackColor={{ false: colors.gray300, true: colors.primary + '40' }}
                        thumbColor={settingItem.value ? colors.primary : colors.gray400}
                      />
                    )}
                    {settingItem.type === 'link' && (
                      <MaterialCommunityIcons name="chevron-right" size={20} color={colors.gray400} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}

        <Text style={[styles.version, { color: colors.textLight, fontSize: fontSize.xs }]}>
          House Hunter v1.0.0
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 0.5 },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontWeight: '700' },
  sectionTitle: { fontWeight: '700', letterSpacing: 0.5 },
  sectionCard: { paddingVertical: 4 },
  settingItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16 },
  settingIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  settingContent: { flex: 1 },
  version: { textAlign: 'center', marginTop: 30, marginBottom: 20 },
});
