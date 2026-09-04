import React from 'react';
import { Platform, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { MainTabParamList } from '../types';
import { useTheme } from '../context/ThemeContext';
import HomeScreen from '../screens/main/HomeScreen';
import ExploreScreen from '../screens/main/ExploreScreen';
import MapScreen from '../screens/main/MapScreen';
import FavoritesScreen from '../screens/main/FavoritesScreen';
import ProfileScreen from '../screens/main/ProfileScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();

export default function MainTabNavigator() {
  const { colors } = useTheme();

  const getTabBarIcon = (route: string, focused: boolean) => {
    let iconName: string;
    let color = focused ? colors.primary : colors.gray500;
    let size = 24;

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
      case 'ProfileTab':
        iconName = focused ? 'account' : 'account-outline';
        break;
      default:
        iconName = 'circle';
    }

    return (
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        <MaterialCommunityIcons name={iconName as any} size={size} color={color} />
        {focused && (
          <View
            style={{
              width: 5,
              height: 5,
              borderRadius: 2.5,
              backgroundColor: colors.primary,
              marginTop: 2,
            }}
          />
        )}
      </View>
    );
  };

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused }) => getTabBarIcon(route.name, focused),
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.gray500,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 0.5,
          height: Platform.OS === 'ios' ? 88 : 65,
          paddingBottom: Platform.OS === 'ios' ? 28 : 8,
          paddingTop: 8,
        },
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
