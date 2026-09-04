import React, { useState } from 'react';
import {
  View,
  FlatList,
  Text,
  StyleSheet,
  NativeSyntheticEvent,
  NativeScrollEvent,
  LayoutChangeEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '../../context/ThemeContext';

interface PropertyImageGalleryProps {
  images: string[];
  height?: number;
}

export default function PropertyImageGallery({
  images,
  height = 300,
}: PropertyImageGalleryProps) {
  const { colors, fontSize } = useTheme();
  const [activeIndex, setActiveIndex] = useState(0);
  // The gallery measures its own width so paging is correct in any layout
  // (rotated devices, two-column / capped-width containers on large screens).
  const [width, setWidth] = useState(0);

  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    if (next > 0 && next !== width) {
      setWidth(next);
    }
  };

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width <= 0) return;
    const contentOffset = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffset / width);
    if (index !== activeIndex) {
      setActiveIndex(index);
    }
  };

  if (!images || images.length === 0) {
    return (
      <View
        style={[styles.container, { height, backgroundColor: colors.gray200 }]}
        onLayout={onLayout}
      >
        <Text style={{ color: colors.textSecondary }}>No images</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { height }]} onLayout={onLayout}>
      {width > 0 ? (
        <FlatList
          data={images}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          keyExtractor={(item, index) => `${index}`}
          renderItem={({ item }) => (
            <Image
              source={{ uri: item }}
              contentFit="cover"
              style={{ width, height, backgroundColor: '#E5E7EB' }}
            />
          )}
        />
      ) : null}
      {images.length > 1 && (
        <>
          <View style={styles.pagination}>
            <View
              style={[
                styles.paginationBadge,
                { backgroundColor: 'rgba(0,0,0,0.6)' },
              ]}
            >
              <Text
                style={[styles.paginationText, { color: colors.white, fontSize: fontSize.xs }]}
              >
                {activeIndex + 1} / {images.length}
              </Text>
            </View>
          </View>
          <View style={styles.dots}>
            {images.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.dot,
                  {
                    backgroundColor:
                      index === activeIndex
                        ? colors.white
                        : 'rgba(255,255,255,0.4)',
                    width: index === activeIndex ? 20 : 6,
                  },
                ]}
              />
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    overflow: 'hidden',
  },
  pagination: {
    position: 'absolute',
    top: 16,
    right: 16,
  },
  paginationBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  paginationText: {
    fontWeight: '600',
  },
  dots: {
    position: 'absolute',
    bottom: 16,
    flexDirection: 'row',
    alignSelf: 'center',
    gap: 4,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
});
