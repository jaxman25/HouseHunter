import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { RootStackParamList } from '../../types';
import { useAuthContext } from '../../context/AuthContext';
import { useUserTours } from '../../hooks/useTours';
import TourCard from '../../components/tours/TourCard';
import { updateTourStatus } from '../../services/tourService';
import { Alert } from 'react-native';

type Tab = 'upcoming' | 'past';

export default function ToursScreen() {
  const { colors, fontSize, spacing } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuthContext();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<Tab>('upcoming');

  const { upcomingTours, pastTours, loading } = useUserTours(user?.uid || '', 'buyer');

  const handleConfirm = async (tourId: string) => {
    try {
      await updateTourStatus(tourId, 'confirmed');
      Alert.alert('Confirmed', 'Tour has been confirmed');
    } catch {
      Alert.alert('Error', 'Failed to confirm tour');
    }
  };

  const handleDecline = async (tourId: string) => {
    Alert.alert('Decline Tour', 'Are you sure you want to decline this tour?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Decline',
        style: 'destructive',
        onPress: async () => {
          try {
            await updateTourStatus(tourId, 'canceled', user?.uid);
          } catch {
            Alert.alert('Error', 'Failed to decline tour');
          }
        },
      },
    ]);
  };

  const tours = activeTab === 'upcoming' ? upcomingTours : pastTours;

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
        <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backBtn, { backgroundColor: colors.gray100 }]}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text, fontSize: fontSize.lg }]}>
          My Tours
        </Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Tab Selector */}
      <View style={styles.tabRow}>
        {(['upcoming', 'past'] as Tab[]).map((tab) => {
          const selected = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={[
                styles.tab,
                {
                  backgroundColor: selected ? colors.primary : colors.gray100,
                  borderRadius: 8,
                },
              ]}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: selected ? colors.white : colors.textSecondary, fontSize: fontSize.sm },
                ]}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <Text style={[styles.loadingText, { color: colors.gray500, fontSize: fontSize.md }]}>
            Loading...
          </Text>
        ) : tours.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="calendar-blank" size={48} color={colors.gray300} />
            <Text style={[styles.emptyText, { color: colors.gray500, fontSize: fontSize.md }]}>
              No {activeTab} tours
            </Text>
          </View>
        ) : (
          tours.map((tour) => (
            <TourCard
              key={tour.id}
              tour={tour}
              onPress={() => navigation.navigate('TourDetails', { tourId: tour.id })}
              onConfirm={activeTab === 'upcoming' && tour.status === 'pending' ? () => handleConfirm(tour.id) : undefined}
              onDecline={activeTab === 'upcoming' && tour.status === 'pending' ? () => handleDecline(tour.id) : undefined}
            />
          ))
        )}
      </ScrollView>
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
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    padding: 16,
    paddingBottom: 0,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tabText: { fontWeight: '600' },
  content: { padding: 16, paddingBottom: 40 },
  loadingText: { textAlign: 'center', marginTop: 20 },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  emptyText: { fontWeight: '500' },
});
