import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../../context/ThemeContext';
import { RootStackParamList, PropertyStatus } from '../../types';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import LoadingOverlay from '../../components/common/LoadingOverlay';
import { updateProperty, uploadPropertyImage, deletePropertyImage } from '../../services/propertyService';
import { PROPERTY_FEATURES } from '../../config/theme';
import { MAX_IMAGES_PER_PROPERTY } from '../../utils/constants';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'EditProperty'>;

export default function EditPropertyScreen() {
  const { colors, fontSize, spacing, radius } = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const prop = route.params.property;

  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState(prop.title);
  const [description, setDescription] = useState(prop.description);
  const [price, setPrice] = useState(String(prop.price));
  // Type/listing type are set when the listing was created and have no edit
  // affordance here, so they stay fixed for the lifetime of this screen.
  const listingType = prop.listingType;
  const propertyType = prop.propertyType;
  const [status, setStatus] = useState<PropertyStatus>(prop.status);
  const [address, setAddress] = useState(prop.address);
  const [city, setCity] = useState(prop.city);
  const [stateVal, setStateVal] = useState(prop.state);
  const [zipCode, setZipCode] = useState(prop.zipCode);
  const [bedrooms, setBedrooms] = useState(String(prop.bedrooms));
  const [bathrooms, setBathrooms] = useState(String(prop.bathrooms));
  const [area, setArea] = useState(String(prop.area));
  const [yearBuilt, setYearBuilt] = useState(String(prop.yearBuilt));
  const [features, setFeatures] = useState<string[]>(prop.features || []);
  const [images, setImages] = useState<string[]>(prop.images || []);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const clearError = (key: string) =>
    setErrors((prev) => (prev[key] ? { ...prev, [key]: '' } : prev));

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    const currentYear = new Date().getFullYear();

    if (!title.trim()) next.title = 'Title is required';
    else if (title.trim().length > 120) next.title = 'Title must be under 120 characters';
    const priceNum = parseFloat(price);
    if (!price.trim()) next.price = 'Price is required';
    else if (isNaN(priceNum) || priceNum <= 0) next.price = 'Enter a valid price';
    else if (priceNum > 100000000) next.price = 'Price looks too high — please double-check it';
    if (!description.trim()) next.description = 'Description is required';
    else if (description.trim().length > 4000) next.description = 'Description must be under 4000 characters';
    if (!address.trim()) next.address = 'Address is required';
    if (!city.trim()) next.city = 'City is required';
    if (!stateVal.trim()) next.state = 'State is required';
    if (!zipCode.trim()) next.zipCode = 'ZIP code is required';
    else if (!/^\d{5}(-\d{4})?$/.test(zipCode.trim())) next.zipCode = 'Enter a valid 5-digit ZIP code';

    const bedNum = parseFloat(bedrooms);
    const bathNum = parseFloat(bathrooms);
    const areaNum = parseFloat(area);
    const yearNum = parseFloat(yearBuilt);
    if (listingType === 'sale' && !bedrooms.trim()) next.bedrooms = 'Bedrooms is required';
    else if (bedrooms.trim() && (isNaN(bedNum) || bedNum < 0 || bedNum > 50 || bedNum % 1 !== 0)) {
      next.bedrooms = 'Enter a whole number from 0-50';
    }
    if (!bathrooms.trim()) next.bathrooms = 'Bathrooms is required';
    else if (isNaN(bathNum) || bathNum < 0 || bathNum > 50) next.bathrooms = 'Enter a number from 0-50';
    if (!area.trim()) next.area = 'Area is required';
    else if (isNaN(areaNum) || areaNum <= 0 || areaNum > 10000000) next.area = 'Enter a valid area in sqft';
    if (yearBuilt.trim() && (isNaN(yearNum) || yearNum < 1800 || yearNum > currentYear + 1)) {
      next.yearBuilt = 'Enter a valid year (1800-' + (currentYear + 1) + ')';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const toggleFeature = (f: string) => {
    setFeatures((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  };

  const pickImage = async () => {
    if (images.length >= MAX_IMAGES_PER_PROPERTY) return;
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: MAX_IMAGES_PER_PROPERTY - images.length,
    });
    if (!result.canceled) {
      setImages((prev) => [...prev, ...result.assets.map((a) => a.uri)].slice(0, MAX_IMAGES_PER_PROPERTY));
    }
  };

  const removeImage = async (index: number) => {
    const img = images[index];
    if (img.startsWith('http')) {
      await deletePropertyImage(img);
    }
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const uploadedImages: string[] = [];
      const existingImages: string[] = [];

      for (const img of images) {
        if (img.startsWith('http')) {
          existingImages.push(img);
        } else {
          const url = await uploadPropertyImage(img, prop.id, uploadedImages.length);
          uploadedImages.push(url);
        }
      }

      await updateProperty(prop.id, {
        title,
        description,
        price: Number(price),
        listingType,
        propertyType,
        status,
        address,
        city,
        state: stateVal,
        zipCode,
        bedrooms: Number(bedrooms) || 0,
        bathrooms: Number(bathrooms) || 0,
        area: Number(area) || 0,
        yearBuilt: Number(yearBuilt) || new Date().getFullYear(),
        features,
        images: [...existingImages, ...uploadedImages],
      });

      Alert.alert('Success', 'Property updated successfully', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      // Optimistic-lock conflicts carry a user-facing message (modified
      // elsewhere) — show it, otherwise fall back to the generic error.
      const message =
        error instanceof Error && error.message.includes('modified elsewhere')
          ? error.message
          : 'Failed to update property';
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[
        styles.container,
        { backgroundColor: colors.background },
        { width: '100%', maxWidth: 640, alignSelf: 'center' },
      ]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <LoadingOverlay visible={loading} />
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
          style={[styles.headerBtn, { backgroundColor: colors.gray100 }]}
        >
          <MaterialCommunityIcons name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text, fontSize: fontSize.lg }]}>
          Edit Listing
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 100 }}
      >
        {/* Status */}
        <Text style={[styles.label, { color: colors.text, fontSize: fontSize.sm }]}>Status</Text>
        <View style={styles.statusRow}>
          {(['active', 'pending', 'inactive'] as PropertyStatus[]).map((s) => (
            <TouchableOpacity
              key={s}
              style={[
                styles.statusBtn,
                {
                  backgroundColor: status === s ? colors.primary : colors.surface,
                  borderColor: status === s ? colors.primary : colors.border,
                  borderRadius: radius.md,
                },
              ]}
              onPress={() => setStatus(s)}
            >
              <Text style={{ color: status === s ? colors.white : colors.text, fontSize: fontSize.sm, fontWeight: '600' }}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Input label="Title" value={title} onChangeText={(t) => { setTitle(t); clearError('title'); }} error={errors.title} />
        <Input label="Price ($)" value={price} onChangeText={(t) => { setPrice(t); clearError('price'); }} keyboardType="numeric" error={errors.price} />
        <Input label="Description" value={description} onChangeText={(t) => { setDescription(t); clearError('description'); }} multiline numberOfLines={4} style={{ minHeight: 100 }} error={errors.description} />
        <Input label="Address" value={address} onChangeText={(t) => { setAddress(t); clearError('address'); }} error={errors.address} />
        <Input label="City" value={city} onChangeText={(t) => { setCity(t); clearError('city'); }} error={errors.city} />
        <Input label="State" value={stateVal} onChangeText={(t) => { setStateVal(t); clearError('state'); }} error={errors.state} />
        <Input label="ZIP Code" value={zipCode} onChangeText={(t) => { setZipCode(t); clearError('zipCode'); }} keyboardType="numeric" error={errors.zipCode} />

        <View style={styles.halfRow}>
          <View style={{ flex: 1 }}>
            <Input label="Beds" value={bedrooms} onChangeText={(t) => { setBedrooms(t); clearError('bedrooms'); }} keyboardType="numeric" error={errors.bedrooms} />
          </View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}>
            <Input label="Baths" value={bathrooms} onChangeText={(t) => { setBathrooms(t); clearError('bathrooms'); }} keyboardType="numeric" error={errors.bathrooms} />
          </View>
        </View>

        <View style={styles.halfRow}>
          <View style={{ flex: 1 }}>
            <Input label="Area (sqft)" value={area} onChangeText={(t) => { setArea(t); clearError('area'); }} keyboardType="numeric" error={errors.area} />
          </View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}>
            <Input label="Year Built" value={yearBuilt} onChangeText={(t) => { setYearBuilt(t); clearError('yearBuilt'); }} keyboardType="numeric" error={errors.yearBuilt} />
          </View>
        </View>

        {/* Features */}
        <Text style={[styles.label, { color: colors.text, fontSize: fontSize.sm }]}>Features</Text>
        <View style={styles.featureGrid}>
          {PROPERTY_FEATURES.slice(0, 12).map((f) => (
            <TouchableOpacity
              key={f.key}
              style={[
                styles.featureChip,
                {
                  backgroundColor: features.includes(f.key) ? colors.primary : colors.surface,
                  borderColor: features.includes(f.key) ? colors.primary : colors.border,
                  borderRadius: radius.round,
                },
              ]}
              onPress={() => toggleFeature(f.key)}
            >
              <Text style={{ color: features.includes(f.key) ? colors.white : colors.text, fontSize: fontSize.xs }}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Images */}
        <Text style={[styles.label, { color: colors.text, fontSize: fontSize.sm }]}>Photos ({images.length})</Text>
        <TouchableOpacity
          style={[styles.addPhotoBtn, { borderColor: colors.border, borderRadius: radius.lg }]}
          onPress={pickImage}
        >
          <MaterialCommunityIcons name="camera-plus" size={28} color={colors.primary} />
          <Text style={{ color: colors.primary, fontSize: fontSize.sm, fontWeight: '600', marginTop: 4 }}>Add More</Text>
        </TouchableOpacity>
        <View style={styles.imageGrid}>
          {images.map((uri, idx) => (
            <View key={idx} style={[styles.imageItem, { borderRadius: radius.md }]}>
              <Image source={{ uri }} style={[styles.image, { borderRadius: radius.md }]} />
              <TouchableOpacity
                style={[styles.removeBtn, { backgroundColor: colors.error }]}
                onPress={() => removeImage(idx)}
              >
                <MaterialCommunityIcons name="close" size={12} color={colors.white} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { backgroundColor: colors.surface, paddingBottom: insets.bottom + spacing.md, borderTopColor: colors.border }]}>
        <Button title="Save Changes" onPress={handleSave} loading={loading} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 0.5 },
  headerBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontWeight: '700' },
  label: { fontWeight: '600', marginBottom: 8, marginTop: 8 },
  statusRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statusBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderWidth: 1 },
  halfRow: { flexDirection: 'row' },
  featureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  featureChip: { paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1 },
  addPhotoBtn: { alignItems: 'center', paddingVertical: 20, borderWidth: 2, borderStyle: 'dashed', marginBottom: 12 },
  imageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  imageItem: { width: '30%', aspectRatio: 1, position: 'relative' },
  image: { width: '100%', height: '100%', backgroundColor: '#E5E7EB' },
  removeBtn: { position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  bottomBar: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 0.5 },
});
