import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { PropertyFilter, PropertyType } from '../../types';
import Button from '../common/Button';
import { PROPERTY_TYPES, SORT_OPTIONS } from '../../config/theme';

interface FilterModalProps {
  visible: boolean;
  onClose: () => void;
  onApply: (filter: PropertyFilter) => void;
  currentFilter: PropertyFilter;
}

export default function FilterModal({
  visible,
  onClose,
  onApply,
  currentFilter,
}: FilterModalProps) {
  const { colors, fontSize } = useTheme();

  const [filter, setFilter] = useState<PropertyFilter>(currentFilter);

  const priceRanges = filter.listingType === 'rent'
    ? [
        { label: 'Any', min: 0, max: undefined },
        { label: 'Under $500', min: 0, max: 500 },
        { label: '$500-$1K', min: 500, max: 1000 },
        { label: '$1K-$2K', min: 1000, max: 2000 },
        { label: '$2K-$3K', min: 2000, max: 3000 },
        { label: '$3K-$5K', min: 3000, max: 5000 },
        { label: '$5K+', min: 5000, max: undefined },
      ]
    : [
        { label: 'Any', min: 0, max: undefined },
        { label: 'Under $100K', min: 0, max: 100000 },
        { label: '$100K-$250K', min: 100000, max: 250000 },
        { label: '$250K-$500K', min: 250000, max: 500000 },
        { label: '$500K-$750K', min: 500000, max: 750000 },
        { label: '$750K-$1M', min: 750000, max: 1000000 },
        { label: '$1M-$2M', min: 1000000, max: 2000000 },
        { label: '$2M+', min: 2000000, max: undefined },
      ];

  const bedroomOptions = [
    { label: 'Any', value: undefined },
    { label: '0 (Studio)', value: 0 },
    { label: '1+', value: 1 },
    { label: '2+', value: 2 },
    { label: '3+', value: 3 },
    { label: '4+', value: 4 },
    { label: '5+', value: 5 },
  ];

  const selectedPriceIndex = priceRanges.findIndex(
    (r) =>
      r.min === (filter.minPrice || 0) && r.max === filter.maxPrice
  );

  const selectedBedroomIndex = bedroomOptions.findIndex(
    (b) => b.value === filter.minBedrooms
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View
          style={[
            styles.header,
            {
              backgroundColor: colors.surface,
              borderBottomColor: colors.border,
            },
          ]}
        >
          <TouchableOpacity onPress={onClose}>
            <MaterialCommunityIcons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text
            style={[styles.headerTitle, { color: colors.text, fontSize: fontSize.lg }]}
          >
            Filters
          </Text>
          <TouchableOpacity
            onPress={() => {
              setFilter({
                listingType: currentFilter.listingType,
                sortBy: 'newest',
              });
            }}
          >
            <Text style={[styles.resetText, { color: colors.primary, fontSize: fontSize.sm }]}>
              Reset
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Price Range */}
          <Section title="Price Range" colors={colors} fontSize={fontSize}>
            <View style={styles.chipGrid}>
              {priceRanges.map((range, index) => (
                <Chip
                  key={index}
                  label={range.label}
                  selected={selectedPriceIndex === index}
                  colors={colors}
                  fontSize={fontSize}
                  onPress={() =>
                    setFilter((prev) => ({
                      ...prev,
                      minPrice: range.min || undefined,
                      maxPrice: range.max,
                    }))
                  }
                />
              ))}
            </View>
          </Section>

          {/* Bedrooms */}
          <Section title="Bedrooms" colors={colors} fontSize={fontSize}>
            <View style={styles.chipGrid}>
              {bedroomOptions.map((option, index) => (
                <Chip
                  key={index}
                  label={option.label}
                  selected={selectedBedroomIndex === index}
                  colors={colors}
                  fontSize={fontSize}
                  onPress={() =>
                    setFilter((prev) => ({
                      ...prev,
                      minBedrooms: option.value,
                    }))
                  }
                />
              ))}
            </View>
          </Section>

          {/* Property Type */}
          <Section title="Property Type" colors={colors} fontSize={fontSize}>
            <View style={styles.chipGrid}>
              {PROPERTY_TYPES.map((type) => (
                <Chip
                  key={type.key}
                  label={type.label}
                  selected={filter.propertyType?.includes(type.key as PropertyType) || false}
                  colors={colors}
                  fontSize={fontSize}
                  onPress={() => {
                    setFilter((prev) => {
                      const types = prev.propertyType || [];
                      const newTypes = types.includes(type.key as PropertyType)
                        ? types.filter((t) => t !== type.key)
                        : [...types, type.key as PropertyType];
                      return { ...prev, propertyType: newTypes.length > 0 ? newTypes : undefined };
                    });
                  }}
                />
              ))}
            </View>
          </Section>

          {/* Sort By */}
          <Section title="Sort By" colors={colors} fontSize={fontSize}>
            <View style={styles.chipGrid}>
              {SORT_OPTIONS.map((option) => (
                <Chip
                  key={option.key}
                  label={option.label}
                  selected={filter.sortBy === option.key}
                  colors={colors}
                  fontSize={fontSize}
                  onPress={() =>
                    setFilter((prev) => ({
                      ...prev,
                      sortBy: option.key as any,
                    }))
                  }
                />
              ))}
            </View>
          </Section>

          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Apply Button */}
        <View
          style={[
            styles.footer,
            {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
            },
          ]}
        >
          <View style={{ flex: 1, marginRight: 12 }}>
            <Button
              title="Show Results"
              onPress={() => {
                onApply(filter);
                onClose();
              }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Section({
  title,
  children,
  colors,
  fontSize,
}: {
  title: string;
  children: React.ReactNode;
  colors: any;
  fontSize: any;
}) {
  return (
    <View style={[styles.section, { borderBottomColor: colors.border }]}>
      <Text
        style={[
          styles.sectionTitle,
          { color: colors.text, fontSize: fontSize.lg },
        ]}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

function Chip({
  label,
  selected,
  colors,
  fontSize,
  onPress,
}: {
  label: string;
  selected: boolean;
  colors: any;
  fontSize: any;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colors.primary : colors.surface,
          borderColor: selected ? colors.primary : colors.border,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text
        style={[
          styles.chipText,
          {
            color: selected ? colors.white : colors.text,
            fontSize: fontSize.sm,
          },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontWeight: '700',
  },
  resetText: {
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
    paddingHorizontal: 16,
  },
  section: {
    paddingVertical: 20,
    borderBottomWidth: 1,
  },
  sectionTitle: {
    fontWeight: '700',
    marginBottom: 12,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
  },
});
