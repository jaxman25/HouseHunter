import React, { useRef, useState } from 'react';
import { Platform, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import QRCode from 'qrcode';
import { useTheme } from '../../context/ThemeContext';
import { Property } from '../../types';
import {
  formatPrice,
  formatBedrooms,
  formatBathrooms,
  formatArea,
} from '../../utils/helpers';
import { getPropertyDeepLink, shareProperty } from '../../utils/share';
import { showToast } from '../../utils/ui/toast';

/**
 * "Share as image" (prompt4 #1).
 *
 * Renders an off-screen poster (hero photo + price + address + QR code
 * pointing at the property deep link), snapshots it to a PNG with
 * react-native-view-shot, and hands it to the platform share sheet:
 *   - native: expo-sharing (image/png)
 *   - web:    navigator.share with files where supported, otherwise a
 *             direct download of the generated PNG
 *
 * The QR matrix is generated locally with the pure-JS `qrcode` package and
 * rendered as views — no third-party image hot-linking. Any failure falls
 * back to the regular link share so the button never dead-ends.
 */
export default function PropertyPosterShare({ property }: { property: Property }) {
  const { colors } = useTheme();
  const posterRef = useRef<View>(null);
  const [rendering, setRendering] = useState(false);
  const [qrModules, setQrModules] = useState<{ size: number; data: Uint8Array } | null>(null);

  const sharePoster = async () => {
    setRendering(true);
    try {
      // Build the QR matrix for the deep link before mounting the poster.
      const link = getPropertyDeepLink(property.id);
      const qr = QRCode.create(link, { errorCorrectionLevel: 'M' });
      setQrModules({ size: qr.modules.size, data: qr.modules.data as Uint8Array });

      // Give the freshly-mounted poster a couple of frames to lay out
      // (images start loading async; a short settle avoids blank tiles).
      await new Promise((resolve) => setTimeout(resolve, 350));

      const isWeb = Platform.OS === 'web';
      const uri = await captureRef(posterRef, {
        format: 'png',
        quality: 1,
        result: isWeb ? 'data-uri' : 'tmpfile',
      });

      if (isWeb) {
        await sharePosterWeb(uri as string, property);
      } else {
        if (!(await Sharing.isAvailableAsync())) {
          throw new Error('Sharing not available');
        }
        await Sharing.shareAsync(uri as string, {
          mimeType: 'image/png',
          dialogTitle: 'Share listing poster',
        });
      }
    } catch (error) {
      console.warn('Poster share failed, falling back to link share:', error);
      showToast('Could not create the poster — sharing the link instead');
      void shareProperty(property);
    } finally {
      setRendering(false);
      setQrModules(null);
    }
  };

  return (
    <>
      <TouchableOpacity
        onPress={() => void sharePoster()}
        disabled={rendering}
        style={[styles.posterBtn, { backgroundColor: 'rgba(0,0,0,0.4)', marginLeft: 8 }]}
        accessibilityRole="button"
        accessibilityLabel="Share listing as a poster image"
      >
        <MaterialCommunityIcons
          name={rendering ? 'loading' : 'image-multiple-outline'}
          size={20}
          color="#fff"
        />
      </TouchableOpacity>

      {/* Off-screen poster — mounted only while generating the snapshot. */}
      {rendering && (
        <View ref={posterRef} collapsable={false} style={styles.poster}>
          <Image
            source={property.images?.[0] ? { uri: property.images[0] } : undefined}
            style={styles.hero}
            contentFit="cover"
          />
          <View style={styles.body}>
            <Text style={styles.price}>
              {formatPrice(property.price, property.listingType)}
            </Text>
            <Text style={styles.address} numberOfLines={2}>
              {property.address}, {property.city}, {property.state}
            </Text>
            <Text style={styles.meta}>
              {formatBedrooms(property.bedrooms)}  ·  {formatBathrooms(property.bathrooms)}  · {' '}
              {formatArea(property.area, property.areaUnit)}
            </Text>

            <View style={styles.qrRow}>
              <View style={styles.qrPanel}>
                {qrModules && <QrMatrix size={qrModules.size} data={qrModules.data} cell={116 / qrModules.size} />}
              </View>
              <View style={styles.qrTextWrap}>
                <Text style={styles.qrTitle}>Scan to view</Text>
                <Text style={styles.qrSubtitle}>this listing in the{'\n'}House Hunter app</Text>
              </View>
            </View>
          </View>
        </View>
      )}
    </>
  );
}

/** Renders a pre-computed QR module matrix as plain views. */
function QrMatrix({ size, data, cell }: { size: number; data: Uint8Array; cell: number }) {
  const rows: React.ReactNode[] = [];
  for (let y = 0; y < size; y++) {
    const cells: React.ReactNode[] = [];
    for (let x = 0; x < size; x++) {
      cells.push(
        <View
          key={x}
          style={{
            width: cell,
            height: cell,
            backgroundColor: data[y * size + x] ? '#111827' : '#FFFFFF',
          }}
        />
      );
    }
    rows.push(
      <View key={y} style={{ flexDirection: 'row' }}>
        {cells}
      </View>
    );
  }
  return <>{rows}</>;
}

/** Web hand-off: native share with files, else download the PNG. */
async function sharePosterWeb(dataUrl: string, property: Property): Promise<void> {
  const blob = await (await fetch(dataUrl)).blob();
  const file = new File([blob], 'house-hunter-listing.png', { type: 'image/png' });

  const nav = navigator as Navigator & {
    canShare?: (data: { files?: File[] }) => boolean;
  };
  if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    await nav.share({ files: [file], title: property.title });
    return;
  }
  // Download fallback.
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = 'house-hunter-listing.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
  showToast('Poster saved to your downloads');
}

const styles = StyleSheet.create({
  posterBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Off-screen but still laid out so view-shot can snapshot it.
  poster: {
    position: 'absolute',
    top: 0,
    left: -10000,
    width: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    overflow: 'hidden',
  },
  hero: {
    width: '100%',
    height: 200,
    backgroundColor: '#E5E7EB',
  },
  body: {
    padding: 16,
  },
  price: {
    fontSize: 26,
    fontWeight: '800',
    color: '#00843D',
  },
  address: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginTop: 6,
  },
  meta: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  qrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    gap: 14,
  },
  qrPanel: {
    padding: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  qrTextWrap: {
    flex: 1,
  },
  qrTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  qrSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
});
