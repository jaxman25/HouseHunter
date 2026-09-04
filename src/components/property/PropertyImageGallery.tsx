import React, { useState, useRef } from 'react';
import {
  View,
  FlatList,
  Dimensions,
  Text,
  StyleSheet,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '../../context/ThemeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface PropertyImageGalleryProps {
  images: string[];
  height?: number;
}

export default function PropertyImageGallery({
  images,
  height = 300,
}: PropertyImageGalleryProps) {
  const { colors, radius, fontSize } = useTheme();
  const [activeIndex, setActiveIndex] = useState(0);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const contentOffset = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffset / SCREEN_WIDTH);
    setActiveIndex(index);
  };

  if (!images || images.length === 0) {
    return (
      <View style={[styles.container, { height, backgroundColor: colors.gray200 }]}>
        <Text style={{ color: colors.textSecondary }}>No images</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { height }]}>
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
            style={[styles.image, { width: SCREEN_WIDTH, height }]}
          />
        )}
      />
      {images.length > 1 && (
        <View style={styles.pagination}>
          <View
            style={[
              styles.paginationBadge,
              { backgroundColor: 'rgba(0,0,0,0.6)' },
            ]}
          >
            <Text style={[styles.paginationText, { color: colors.white, fontSize: fontSize.xs }]}>
              {activeIndex + 1} / {images.length}
            </Text>
          </View>
        </View>
      )}
      {images.length > 1 && (
        <View style={styles.dots}>
          {images.map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                {
                  backgroundColor:
                    index === activeIndex ? colors.white : 'rgba(255,255,255,0.4)',
                  width: index === activeIndex ? 20 : 6,
                },
              ]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    overflow: 'hidden',
  },
  image: {
    backgroundColor: '#E5E7EB',
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
