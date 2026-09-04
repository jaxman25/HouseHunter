import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
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
import Avatar from '../../components/common/Avatar';
import { formatPhoneNumber } from '../../utils/formatters';
import { getUserProperties } from '../../services/propertyService';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface MenuItem {
  icon: string;
  label: string;
  subtitle?: string;
  onPress: () => void;
  color?: string;
  showArrow?: boolean;
}

export default function ProfileScreen() {
  const { colors, fontSize, spacing, radius, shadow } = useTheme();
  const { user, logout } = useAuthContext();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const [listingCount, setListingCount] = useState<number | null>(null);

  // Live count of the user's own listings (distinct from saved favorites).
  useEffect(() => {
    const uid = user?.uid;
    if (!uid) return;
    let active = true;
    getUserProperties(uid)
      .then((listings) => {
        if (active) setListingCount(listings.length);
      })
      .catch(() => {
        // Non-blocking: the stat just shows a placeholder.
      });
    return () => {
      active = false;
    };
  }, [user?.uid]);

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

  const menuItems: MenuItem[] = [
    {
      icon: 'account-edit',
      label: 'Edit Profile',
      subtitle: 'Update your name, photo, and bio',
      onPress: () => navigation.navigate('EditProfile'),
    },
    {
      icon: 'home-edit',
      label: 'My Listings',
      subtitle: 'Manage your property listings',
      onPress: () => navigation.navigate('MyListings'),
    },
    {
      icon: 'message-text',
      label: 'Messages',
      subtitle: 'View your conversations',
      onPress: () => navigation.navigate('Conversations'),
    },
    {
      icon: 'shield-lock',
      label: 'Settings',
      subtitle: 'Security, notifications, and preferences',
      onPress: () => navigation.navigate('Settings'),
    },
    {
      icon: 'key-change',
      label: 'Change Password',
      subtitle: 'Update your account password',
      onPress: () => navigation.navigate('ChangePassword'),
    },
    {
      icon: 'logout',
      label: 'Sign Out',
      subtitle: 'Sign out of your account',
      onPress: handleLogout,
      color: colors.error,
    },
  ];

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background },
        { width: '100%', maxWidth: 820, alignSelf: 'center' },
      ]}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* Header */}
        <View
          style={[
            styles.headerBg,
            {
              paddingTop: insets.top + spacing.lg,
              backgroundColor: colors.primary,
            },
          ]}
        >
          <View style={styles.headerContent}>
            <Avatar
              uri={user?.photoURL}
              name={user?.displayName || 'User'}
              size={80}
            />
            <Text style={[styles.name, { color: colors.white, fontSize: fontSize.xxl }]}>
              {user?.displayName || 'User'}
            </Text>
            <Text style={[styles.email, { color: 'rgba(255,255,255,0.8)', fontSize: fontSize.md }]}>
              {user?.email}
            </Text>
            {user?.phoneNumber ? (
              <Text style={[styles.phone, { color: 'rgba(255,255,255,0.7)', fontSize: fontSize.sm }]}>
                {formatPhoneNumber(user.phoneNumber)}
              </Text>
            ) : null}
            <View
              style={[
                styles.roleBadge,
                {
                  backgroundColor: 'rgba(255,255,255,0.2)',
                  borderRadius: radius.round,
                },
              ]}
            >
              <Text
                style={[
                  styles.roleText,
                  { color: colors.white, fontSize: fontSize.sm },
                ]}
              >
                {user?.role === 'agent'
                  ? 'Real Estate Agent'
                  : user?.role === 'seller'
                  ? 'Seller'
                  : 'Buyer'}
              </Text>
            </View>
          </View>
        </View>

        {/* Stats */}
        <View
          style={[
            styles.statsRow,
            {
              backgroundColor: colors.surface,
              marginHorizontal: spacing.lg,
              marginTop: -20,
              borderRadius: radius.xl,
            },
            shadow.md,
          ]}
        >
          <StatItem
            label="Listings"
            value={listingCount !== null ? String(listingCount) : '—'}
            colors={colors}
            fontSize={fontSize}
          />
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <StatItem
            label="Favorites"
            value={String(user?.favorites?.length || 0)}
            colors={colors}
            fontSize={fontSize}
          />
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <StatItem
            label="Member"
            value="Since '24"
            colors={colors}
            fontSize={fontSize}
          />
        </View>

        {/* Bio */}
        {user?.bio ? (
          <View
            style={[
              styles.bioCard,
              {
                backgroundColor: colors.surface,
                marginHorizontal: spacing.lg,
                marginTop: spacing.lg,
                borderRadius: radius.lg,
              },
              shadow.sm,
            ]}
          >
            <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm }}>
              {user.bio}
            </Text>
          </View>
        ) : null}

        {/* Menu Items */}
        <View
          style={[
            styles.menuCard,
            {
              backgroundColor: colors.surface,
              marginHorizontal: spacing.lg,
              marginTop: spacing.lg,
              borderRadius: radius.xl,
            },
            shadow.sm,
          ]}
        >
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={item.label}
              style={[
                styles.menuItem,
                {
                  borderBottomWidth: index < menuItems.length - 1 ? 0.5 : 0,
                  borderBottomColor: colors.border,
                },
              ]}
              onPress={item.onPress}
              activeOpacity={0.6}
            >
              <View
                style={[
                  styles.menuIcon,
                  {
                    backgroundColor: (item.color || colors.primary) + '12',
                  },
                ]}
              >
                <MaterialCommunityIcons
                  name={item.icon as any}
                  size={20}
                  color={item.color || colors.primary}
                />
              </View>
              <View style={styles.menuContent}>
                <Text
                  style={[
                    styles.menuLabel,
                    {
                      color: item.color || colors.text,
                      fontSize: fontSize.md,
                    },
                  ]}
                >
                  {item.label}
                </Text>
                {item.subtitle && (
                  <Text
                    style={[
                      styles.menuSubtitle,
                      { color: colors.textSecondary, fontSize: fontSize.xs },
                    ]}
                  >
                    {item.subtitle}
                  </Text>
                )}
              </View>
              {item.showArrow !== false && (
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={20}
                  color={colors.gray400}
                />
              )}
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function StatItem({
  label,
  value,
  colors,
  fontSize,
}: {
  label: string;
  value: string;
  colors: any;
  fontSize: any;
}) {
  return (
    <View style={styles.statItem}>
      <Text style={[styles.statValue, { color: colors.primary, fontSize: fontSize.xl }]}>
        {value}
      </Text>
      <Text style={[styles.statLabel, { color: colors.textSecondary, fontSize: fontSize.xs }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerBg: {
    paddingBottom: 40,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  headerContent: {
    alignItems: 'center',
    paddingTop: 16,
  },
  name: {
    fontWeight: '800',
    marginTop: 12,
  },
  email: {
    marginTop: 4,
  },
  phone: {
    marginTop: 2,
  },
  roleBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginTop: 12,
  },
  roleText: {
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 20,
    marginHorizontal: 20,
    paddingHorizontal: 16,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontWeight: '800',
  },
  statLabel: {
    marginTop: 4,
    fontWeight: '500',
  },
  statDivider: {
    width: 1,
    height: 30,
  },
  bioCard: {
    padding: 16,
  },
  menuCard: {
    paddingTop: 8,
    paddingBottom: 8,
    marginBottom: 20,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuContent: {
    flex: 1,
  },
  menuLabel: {
    fontWeight: '600',
  },
  menuSubtitle: {
    marginTop: 2,
  },
});
