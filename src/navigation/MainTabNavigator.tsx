import React, { useState } from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { MainTabParamList } from '../types';
import { useTheme } from '../context/ThemeContext';
import { useAuthContext } from '../context/AuthContext';
import HomeScreen from '../screens/main/HomeScreen';
import ExploreScreen from '../screens/main/ExploreScreen';
import MapScreen from '../screens/main/MapScreen';
import FavoritesScreen from '../screens/main/FavoritesScreen';
import ProfileScreen from '../screens/main/ProfileScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();

/** The brand mark, shown on the Profile tab until the user uploads a photo. */
const APP_LOGO = require('../../assets/loader.png');

/**
 * Profile tab icon.
 *
 * Default: the app logo. Once the user saves a profile photo, `photoURL`
 * becomes non-empty and AuthContext's Firestore snapshot updates, so this
 * switches to their picture automatically. `DEFAULT_AVATAR` is empty, which
 * is what keeps the logo in place for users who have not set a photo yet.
 */
function ProfileTabIcon({ focused }: { focused: boolean }) {
  const { colors } = useTheme();
  const { user } = useAuthContext();
  const photoURL = user?.photoURL?.trim() ?? '';
  // Remember which URL failed rather than a boolean: a newly saved photo has
  // a different URL, so it automatically gets a fresh chance to load without
  // a state-resetting effect.
  const [failedPhotoURL, setFailedPhotoURL] = useState<string | null>(null);
  const showPhoto = photoURL.length > 0 && failedPhotoURL !== photoURL;

  return (
    <View style={styles.iconWrap}>
      {showPhoto ? (
        <Image
          source={{ uri: photoURL }}
          style={[
            styles.profilePhoto,
            {
              borderColor: focused ? colors.primary : colors.gray400,
              backgroundColor: colors.gray200,
            },
          ]}
          contentFit="cover"
          transition={150}
          onError={() => setFailedPhotoURL(photoURL)}
        />
      ) : (
        <Image
          source={APP_LOGO}
          style={[styles.appLogo, { opacity: focused ? 1 : 0.7 }]}
          contentFit="contain"
        />
      )}
      {/* Active indicator dot, matching the other tab icons. */}
      <View
        style={{
          width: 5,
          height: 5,
          borderRadius: 2.5,
          marginTop: 3,
          backgroundColor: focused ? colors.primary : 'transparent',
        }}
      />
    </View>
  );
}

export default function MainTabNavigator() {
  const { colors } = useTheme();

  const getTabBarIcon = (route: string, focused: boolean) => {
    if (route === 'ProfileTab') {
      return <ProfileTabIcon focused={focused} />;
    }

    let iconName: string;
    let color = focused ? colors.primary : colors.gray400;
    let size = 23;

    switch (route) {
      case 'HomeTab':
        iconName = focused ? 'home' : 'home-outline';
        break;
      case 'ExploreTab':
        iconName = focused ? 'magnify' : 'magnify';
        break;
      case 'MapTab':
        iconName = focused ? 'map' : 'map-outline';
        break;
      case 'FavoritesTab':
        iconName = focused ? 'heart' : 'heart-outline';
        break;
      default:
        iconName = 'circle';
    }

    return (
      <View style={styles.iconWrap}>
        <MaterialCommunityIcons name={iconName as any} size={size} color={color} />
        {/* Active indicator dot */}
        <View
          style={{
            width: 5,
            height: 5,
            borderRadius: 2.5,
            marginTop: 3,
            backgroundColor: focused ? colors.primary : 'transparent',
          }}
        />
      </View>
    );
  };

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused }) => getTabBarIcon(route.name, focused),
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.gray400,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 0.5,
          height: Platform.OS === 'ios' ? 88 : 65,
          paddingBottom: Platform.OS === 'ios' ? 28 : 8,
          paddingTop: 8,
          ...(Platform.OS === 'web'
            ? { width: '100%', maxWidth: 480, alignSelf: 'center' }
            : {}),
        },
        tabBarLabelPosition: 'below-icon',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      })}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{ tabBarLabel: 'Home' }}
      />
      <Tab.Screen
        name="ExploreTab"
        component={ExploreScreen}
        options={{ tabBarLabel: 'Explore' }}
      />
      <Tab.Screen
        name="MapTab"
        component={MapScreen}
        options={{ tabBarLabel: 'Map' }}
      />
      <Tab.Screen
        name="FavoritesTab"
        component={FavoritesScreen}
        options={{ tabBarLabel: 'Saved' }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{ tabBarLabel: 'Profile' }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  /**
   * The loader artwork has ~20% transparent padding on every side. Scaling
   * the 23px box by 1.7 makes the visible badge ~23px, matching the other
   * tab icons without changing the source asset; the transparent padding
   * does not affect layout.
   */
  appLogo: {
    width: 23,
    height: 23,
    transform: [{ scale: 1.7 }],
  },
  profilePhoto: {
    width: 23,
    height: 23,
    borderRadius: 11.5,
    borderWidth: 2,
  },
});
