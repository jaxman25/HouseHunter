import React from 'react';
import { Platform, View, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import { useTheme } from '../../context/ThemeContext';

/**
 * Reorderable photo grid for the listing editors (prompt4 #3).
 *
 * Native: react-native-draggable-flatlist — long-press the drag handle and
 * drop to reorder (3 columns to match the previous grid).
 * Web: draggable-flatlist's pan gestures are unreliable with a mouse, so
 * the same handle doubles as a "move earlier" button plus an explicit
 * move-back button, which covers every reachable position.
 *
 * `onReorder` receives the new array; callers own their images state.
 */
export default function SortableImageGrid({
  images,
  onReorder,
  onRemove,
}: {
  images: string[];
  onReorder: (next: string[]) => void;
  onRemove: (index: number) => void;
}) {
  const { colors, radius } = useTheme();

  if (Platform.OS === 'web') {
    return (
      <View style={styles.grid}>
        {images.map((uri, index) => (
          <View key={`${uri}-${index}`} style={[styles.item, { borderRadius: radius.md }]}>
            <Image source={{ uri }} style={[styles.image, { backgroundColor: colors.gray200, borderRadius: radius.md }]} />
            {index === 0 && (
              <View style={[styles.coverBadge, { backgroundColor: colors.primary, borderRadius: radius.sm }]}>
                <MaterialCommunityIcons name="star" size={10} color={colors.white} />
              </View>
            )}
            <TouchableOpacity
              style={[styles.handleBtn, { backgroundColor: colors.primary, left: 4 }]}
              disabled={index === 0}
              onPress={() => {
                const next = [...images];
                [next[index - 1], next[index]] = [next[index], next[index - 1]];
                onReorder(next);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Move photo ${index + 1} earlier`}
            >
              <MaterialCommunityIcons name="arrow-left" size={14} color={colors.white} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.handleBtn, { backgroundColor: colors.gray500, right: 4, top: 28 }]}
              disabled={index === images.length - 1}
              onPress={() => {
                const next = [...images];
                [next[index + 1], next[index]] = [next[index], next[index + 1]];
                onReorder(next);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Move photo ${index + 1} later`}
            >
              <MaterialCommunityIcons name="arrow-right" size={14} color={colors.white} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.removeBtn, { backgroundColor: colors.error }]}
              onPress={() => onRemove(index)}
              accessibilityRole="button"
              accessibilityLabel={`Remove photo ${index + 1}`}
            >
              <MaterialCommunityIcons name="close" size={14} color={colors.white} />
            </TouchableOpacity>
          </View>
        ))}
      </View>
    );
  }

  const renderItem = ({ item, getIndex, drag, isActive }: RenderItemParams<string>) => {
    const index = getIndex() ?? 0;
    return (
      <ScaleDecorator>
        <View
          style={[
            styles.item,
            { borderRadius: radius.md, opacity: isActive ? 0.8 : 1 },
          ]}
        >
          <Image source={{ uri: item }} style={[styles.image, { backgroundColor: colors.gray200, borderRadius: radius.md }]} />
          {index === 0 && (
            <View style={[styles.coverBadge, { backgroundColor: colors.primary, borderRadius: radius.sm }]}>
              <MaterialCommunityIcons name="star" size={10} color={colors.white} />
            </View>
          )}
          <TouchableOpacity
            onLongPress={drag}
            onPressIn={drag}
            disabled={isActive}
            style={[styles.handleBtn, { backgroundColor: colors.primary, left: 4 }]}
            accessibilityRole="button"
            accessibilityLabel={`Drag to reorder photo ${index + 1}`}
          >
            <MaterialCommunityIcons name="drag" size={14} color={colors.white} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.removeBtn, { backgroundColor: colors.error }]}
            onPress={() => onRemove(index)}
            accessibilityRole="button"
            accessibilityLabel={`Remove photo ${index + 1}`}
          >
            <MaterialCommunityIcons name="close" size={14} color={colors.white} />
          </TouchableOpacity>
        </View>
      </ScaleDecorator>
    );
  };

  return (
    <DraggableFlatList
      data={images}
      numColumns={3}
      scrollEnabled={false}
      keyExtractor={(item, index) => `${item}-${index}`}
      onDragEnd={({ data }) => onReorder(data)}
      renderItem={renderItem}
      activationDistance={6}
    />
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  item: {
    width: '30%',
    aspectRatio: 1,
    position: 'relative',
    margin: 5,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  coverBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  handleBtn: {
    position: 'absolute',
    top: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
