import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { useAuthContext } from '../../context/AuthContext';
import { RootStackParamList, Property } from '../../types';
import PropertyCard from '../../components/property/PropertyCard';
import PropertyCardSkeleton from '../../components/common/PropertyCardSkeleton';
import EmptyState from '../../components/common/EmptyState';
import Badge from '../../components/common/Badge';
import { getUserProperties, deleteProperty } from '../../services/propertyService';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function MyListingsScreen() {
  const { colors, fontSize, spacing } = useTheme();
  const { user } = useAuthContext();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadProperties = useCallback(async () => {
    if (!user) return;
    try {
      const result = await getUserProperties(user.uid);
      setProperties(result);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    loadProperties();
  }, [loadProperties]);

  const handleDelete = (property: Property) => {
    Alert.alert(
      'Delete Listing',
      `Are you sure you want to delete "${property.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteProperty(property.id);
              setProperties((prev) => prev.filter((p) => p.id !== property.id));
            } catch (error) {
              Alert.alert('Error', 'Failed to delete listing');
            }
          },
        },
      ]
    );
  };

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
        >
          <MaterialCommunityIcons name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text, fontSize: fontSize.xl }]}>
          My Listings
        </Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('AddProperty')}
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
        >
          <MaterialCommunityIcons name="plus" size={20} color={colors.white} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={properties}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.list, { paddingHorizontal: spacing.lg, paddingTop: spacing.md }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadProperties(); }} tintColor={colors.primary} />}
        renderItem={({ item }) => (
          <View>
            <PropertyCard
              property={item}
              onPress={() => navigation.navigate('PropertyDetail', { propertyId: item.id })}
            />
            <View style={styles.actions}>
              <Badge
                label={item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                variant={item.status === 'active' ? 'success' : item.status === 'pending' ? 'warning' : 'info'}
              />
              <View style={styles.actionBtns}>
                <TouchableOpacity
                  onPress={() => navigation.navigate('EditProperty', { property: item })}
                  style={[styles.actionBtn, { backgroundColor: colors.primaryLight }]}
                >
                  <MaterialCommunityIcons name="pencil" size={16} color={colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDelete(item)}
                  style={[styles.actionBtn, { backgroundColor: '#FEE2E2' }]}
                >
                  <MaterialCommunityIcons name="delete-outline" size={16} color={colors.error} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
        ListEmptyComponent={
          loading ? (
            <View>
              {[0, 1, 2].map((i) => <PropertyCardSkeleton key={i} />)}
            </View>
          ) : (
            <EmptyState
              icon="home-plus"
              title="No listings yet"
              description="Create your first property listing"
              actionLabel="List Property"
              onAction={() => navigation.navigate('AddProperty')}
            />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 0.5 },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontWeight: '700' },
  addBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  list: { paddingBottom: 100 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: -8, marginBottom: 16 },
  actionBtns: { flexDirection: 'row', gap: 8 },
  actionBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
