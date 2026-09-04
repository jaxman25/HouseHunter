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
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useTheme } from '../../context/ThemeContext';
import { useAuthContext } from '../../context/AuthContext';
import { RootStackParamList, PropertyType, ListingType } from '../../types';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import LoadingOverlay from '../../components/common/LoadingOverlay';
import { createProperty, uploadPropertyImage } from '../../services/propertyService';
import { PROPERTY_FEATURES, PROPERTY_TYPES } from '../../config/theme';
import { generateId } from '../../utils/helpers';
import { MAX_IMAGES_PER_PROPERTY } from '../../utils/constants';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function AddPropertyScreen() {
  const { colors, fontSize, spacing, radius } = useTheme();
  const { user } = useAuthContext();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const totalSteps = 4;

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [listingType, setListingType] = useState<ListingType>('sale');
  const [propertyType, setPropertyType] = useState<PropertyType>('house');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [bedrooms, setBedrooms] = useState('');
  const [bathrooms, setBathrooms] = useState('');
  const [area, setArea] = useState('');
  const [yearBuilt, setYearBuilt] = useState('');
  const [features, setFeatures] = useState<string[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [latitude, setLatitude] = useState(0);
  const [longitude, setLongitude] = useState(0);

  const [errors, setErrors] = useState<Record<string, string>>({});

  const pickImage = async () => {
    if (images.length >= MAX_IMAGES_PER_PROPERTY) {
      Alert.alert('Limit Reached', `Maximum ${MAX_IMAGES_PER_PROPERTY} images allowed`);
      return;
    }
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow photo access in settings');
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: MAX_IMAGES_PER_PROPERTY - images.length,
    });
    if (!result.canceled) {
      const newImages = result.assets.map((a) => a.uri);
      setImages((prev) => [...prev, ...newImages].slice(0, MAX_IMAGES_PER_PROPERTY));
    }
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const getCurrentLocation = async () => {
    if (Platform.OS === 'web') {
      Alert.alert(
        'Not Available',
        'Current location detection is not available on web. Please enter the address manually.'
      );
      return;
    }
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    const location = await Location.getCurrentPositionAsync({});
    setLatitude(location.coords.latitude);
    setLongitude(location.coords.longitude);

    const [addr] = await Location.reverseGeocodeAsync({
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    });
    if (addr) {
      setAddress(`${addr.street || ''} ${addr.name || ''}`.trim());
      setCity(addr.city || '');
      setState(addr.region || '');
      setZipCode(addr.postalCode || '');
    }
  };

  const toggleFeature = (feature: string) => {
    setFeatures((prev) =>
      prev.includes(feature) ? prev.filter((f) => f !== feature) : [...prev, feature]
    );
  };

  const validateStep = (stepNum: number): boolean => {
    const newErrors: Record<string, string> = {};
    const currentYear = new Date().getFullYear();

    if (stepNum === 1) {
      if (!title.trim()) newErrors.title = 'Title is required';
      else if (title.trim().length > 120) newErrors.title = 'Title must be under 120 characters';
      const priceNum = parseFloat(price);
      if (!price.trim()) newErrors.price = 'Price is required';
      else if (isNaN(priceNum) || priceNum <= 0) newErrors.price = 'Enter a valid price';
      else if (priceNum > 100000000) newErrors.price = 'Price looks too high — please double-check it';
      if (!description.trim()) newErrors.description = 'Description is required';
      else if (description.trim().length > 4000) newErrors.description = 'Description must be under 4000 characters';
    } else if (stepNum === 2) {
      if (!address.trim()) newErrors.address = 'Address is required';
      if (!city.trim()) newErrors.city = 'City is required';
      if (!state.trim()) newErrors.state = 'State is required';
      if (!zipCode.trim()) newErrors.zipCode = 'ZIP code is required';
      else if (!/^\d{5}(-\d{4})?$/.test(zipCode.trim())) newErrors.zipCode = 'Enter a valid 5-digit ZIP code';
    } else if (stepNum === 3) {
      const bedNum = parseFloat(bedrooms);
      const bathNum = parseFloat(bathrooms);
      const areaNum = parseFloat(area);
      const yearNum = parseFloat(yearBuilt);
      if (listingType === 'sale' && !bedrooms.trim()) newErrors.bedrooms = 'Bedrooms is required';
      else if (bedrooms.trim() && (isNaN(bedNum) || bedNum < 0 || bedNum > 50 || bedNum % 1 !== 0)) {
        newErrors.bedrooms = 'Enter a whole number from 0-50';
      }
      if (!bathrooms.trim()) newErrors.bathrooms = 'Bathrooms is required';
      else if (isNaN(bathNum) || bathNum < 0 || bathNum > 50) newErrors.bathrooms = 'Enter a number from 0-50';
      if (!area.trim()) newErrors.area = 'Area is required';
      else if (isNaN(areaNum) || areaNum <= 0 || areaNum > 10000000) newErrors.area = 'Enter a valid area in sqft';
      if (yearBuilt.trim() && (isNaN(yearNum) || yearNum < 1800 || yearNum > currentYear + 1)) {
        newErrors.yearBuilt = 'Enter a valid year (1800-' + (currentYear + 1) + ')';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(step)) {
      setStep((prev) => Math.min(prev + 1, totalSteps));
    }
  };

  const handleSubmit = async () => {
    if (!user) return;
    if (images.length === 0) {
      Alert.alert('Images Required', 'Please add at least one property image');
      return;
    }

    setLoading(true);
    try {
      const propertyId = generateId();

      // Upload images
      const imageUrls: string[] = [];
      for (let i = 0; i < images.length; i++) {
        const url = await uploadPropertyImage(images[i], propertyId, i);
        imageUrls.push(url);
      }

      // The doc is created under the SAME id used as the image storage folder
      // so storage.rules can lock writes to the owner once the doc exists.
      await createProperty(
        {
          title: title.trim(),
          description: description.trim(),
          price: Number(price),
          listingType,
          propertyType,
          status: 'active',
          address: address.trim(),
          city: city.trim(),
          state: state.trim(),
          zipCode: zipCode.trim(),
          country: 'US',
          latitude: latitude || 39.8283,
          longitude: longitude || -98.5795,
          bedrooms: Number(bedrooms) || 0,
          bathrooms: Number(bathrooms) || 0,
          area: Number(area) || 0,
          areaUnit: 'sqft',
          yearBuilt: Number(yearBuilt) || new Date().getFullYear(),
          images: imageUrls,
          features,
          amenities: [],
          userId: user.uid,
          userName: user.displayName,
          userPhoto: user.photoURL,
          userPhone: user.phoneNumber || '',
        },
        propertyId
      );

      Alert.alert('Success', 'Your property has been listed successfully', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      console.error('Error creating property:', error);
      Alert.alert('Error', 'Failed to create listing. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <>
            <Text style={[styles.stepTitle, { color: colors.text, fontSize: fontSize.xl }]}>
              Basic Info
            </Text>
            <Text style={[styles.stepSubtitle, { color: colors.textSecondary, fontSize: fontSize.sm }]}>
              Tell us about your property
            </Text>

            {/* Listing Type */}
            <View style={styles.typeRow}>
              {(['sale', 'rent'] as ListingType[]).map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.typeBtn,
                    {
                      backgroundColor: listingType === type ? colors.primary : colors.surface,
                      borderColor: listingType === type ? colors.primary : colors.border,
                      borderRadius: radius.md,
                    },
                  ]}
                  onPress={() => setListingType(type)}
                >
                  <Text
                    style={{
                      color: listingType === type ? colors.white : colors.text,
                      fontSize: fontSize.md,
                      fontWeight: '600',
                    }}
                  >
                    {type === 'sale' ? 'For Sale' : 'For Rent'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Property Type */}
            <Text style={[styles.fieldLabel, { color: colors.text, fontSize: fontSize.sm }]}>
              Property Type
            </Text>
            <View style={styles.chipRow}>
              {PROPERTY_TYPES.map((type) => (
                <TouchableOpacity
                  key={type.key}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: propertyType === type.key ? colors.primary : colors.surface,
                      borderColor: propertyType === type.key ? colors.primary : colors.border,
                      borderRadius: radius.round,
                    },
                  ]}
                  onPress={() => setPropertyType(type.key as PropertyType)}
                >
                  <Text
                    style={{
                      color: propertyType === type.key ? colors.white : colors.text,
                      fontSize: fontSize.xs,
                      fontWeight: '600',
                    }}
                  >
                    {type.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Input
              label="Title"
              placeholder="e.g., Beautiful 3BR Home in Downtown"
              value={title}
              onChangeText={setTitle}
              error={errors.title}
            />

            <Input
              label="Price ($)"
              placeholder={listingType === 'rent' ? 'Monthly rent' : 'Asking price'}
              value={price}
              onChangeText={setPrice}
              error={errors.price}
              keyboardType="numeric"
            />

            <Input
              label="Description"
              placeholder="Describe your property..."
              value={description}
              onChangeText={setDescription}
              error={errors.description}
              multiline
              numberOfLines={5}
              style={{ minHeight: 120 }}
            />
          </>
        );

      case 2:
        return (
          <>
            <Text style={[styles.stepTitle, { color: colors.text, fontSize: fontSize.xl }]}>
              Location
            </Text>
            <Text style={[styles.stepSubtitle, { color: colors.textSecondary, fontSize: fontSize.sm }]}>
              Where is the property located?
            </Text>

            {Platform.OS !== 'web' && (
            <TouchableOpacity
              style={[styles.locationBtn, { backgroundColor: colors.primaryLight, borderRadius: radius.md }]}
              onPress={getCurrentLocation}
            >
              <MaterialCommunityIcons name="crosshairs-gps" size={20} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: fontSize.sm, fontWeight: '600', marginLeft: 8 }}>
                Use Current Location
              </Text>
            </TouchableOpacity>
            )}

            <View style={{ marginTop: spacing.lg }}>
              <Input
                label="Address"
                placeholder="Street address"
                value={address}
                onChangeText={setAddress}
                error={errors.address}
                leftIcon="map-marker-outline"
              />
              <Input
                label="City"
                placeholder="City"
                value={city}
                onChangeText={setCity}
                error={errors.city}
                leftIcon="city"
              />
              <View style={styles.halfRow}>
                <View style={{ flex: 1 }}>
                  <Input
                    label="State"
                    placeholder="State"
                    value={state}
                    onChangeText={setState}
                    error={errors.state}
                  />
                </View>
                <View style={{ width: 12 }} />
                <View style={{ flex: 1 }}>
                  <Input
                    label="ZIP Code"
                    placeholder="ZIP"
                    value={zipCode}
                    onChangeText={setZipCode}
                    error={errors.zipCode}
                    keyboardType="numeric"
                  />
                </View>
              </View>
            </View>
          </>
        );

      case 3:
        return (
          <>
            <Text style={[styles.stepTitle, { color: colors.text, fontSize: fontSize.xl }]}>
              Details
            </Text>
            <Text style={[styles.stepSubtitle, { color: colors.textSecondary, fontSize: fontSize.sm }]}>
              Property specifications
            </Text>

            <View style={styles.halfRow}>
              <View style={{ flex: 1 }}>                  <Input
                    label="Bedrooms"
                    placeholder="0"
                    value={bedrooms}
                    onChangeText={setBedrooms}
                    error={errors.bedrooms}
                    keyboardType="numeric"
                    leftIcon="bed-outline"
                  />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Input
                  label="Bathrooms"
                  placeholder="0"
                  value={bathrooms}
                  onChangeText={setBathrooms}
                  error={errors.bathrooms}
                  keyboardType="numeric"
                  leftIcon="bathtub-outline"
                />
              </View>
            </View>

            <View style={styles.halfRow}>
              <View style={{ flex: 1 }}>                  <Input
                    label="Area (sqft)"
                    placeholder="0"
                    value={area}
                    onChangeText={setArea}
                    error={errors.area}
                    keyboardType="numeric"
                    leftIcon="resize"
                  />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>                  <Input
                    label="Year Built"
                    placeholder="YYYY"
                    value={yearBuilt}
                    onChangeText={setYearBuilt}
                    error={errors.yearBuilt}
                    keyboardType="numeric"
                    leftIcon="calendar"
                  />
              </View>
            </View>

            {/* Features */}
            <Text style={[styles.fieldLabel, { color: colors.text, fontSize: fontSize.sm }]}>
              Features & Amenities
            </Text>
            <View style={styles.featureGrid}>
              {PROPERTY_FEATURES.slice(0, 16).map((feature) => (
                <TouchableOpacity
                  key={feature.key}
                  style={[
                    styles.featureChip,
                    {
                      backgroundColor: features.includes(feature.key) ? colors.primary : colors.surface,
                      borderColor: features.includes(feature.key) ? colors.primary : colors.border,
                      borderRadius: radius.round,
                    },
                  ]}
                  onPress={() => toggleFeature(feature.key)}
                >
                  <MaterialCommunityIcons
                    name={feature.icon as any}
                    size={14}
                    color={features.includes(feature.key) ? colors.white : colors.gray500}
                  />
                  <Text
                    style={{
                      color: features.includes(feature.key) ? colors.white : colors.text,
                      fontSize: fontSize.xs,
                      fontWeight: '600',
                    }}
                  >
                    {feature.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        );

      case 4:
        return (
          <>
            <Text style={[styles.stepTitle, { color: colors.text, fontSize: fontSize.xl }]}>
              Photos
            </Text>
            <Text style={[styles.stepSubtitle, { color: colors.textSecondary, fontSize: fontSize.sm }]}>
              Add up to {MAX_IMAGES_PER_PROPERTY} photos of your property
            </Text>

            <TouchableOpacity
              style={[
                styles.addPhotoBtn,
                {
                  borderColor: colors.border,
                  borderStyle: 'dashed',
                  borderRadius: radius.lg,
                },
              ]}
              onPress={pickImage}
            >
              <MaterialCommunityIcons name="camera-plus" size={32} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: fontSize.md, fontWeight: '600', marginTop: 8 }}>
                Add Photos
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs, marginTop: 4 }}>
                {images.length}/{MAX_IMAGES_PER_PROPERTY} photos
              </Text>
            </TouchableOpacity>

            {images.length > 0 && (
              <View style={styles.imageGrid}>
                {images.map((uri, index) => (
                  <View key={index} style={[styles.imageItem, { borderRadius: radius.md }]}>
                    <Image source={{ uri }} style={[styles.previewImage, { borderRadius: radius.md }]} />
                    {index === 0 && (
                      <View style={[styles.coverBadge, { backgroundColor: colors.primary, borderRadius: radius.sm }]}>
                        <Text style={{ color: colors.white, fontSize: 10, fontWeight: '700' }}>COVER</Text>
                      </View>
                    )}
                    <TouchableOpacity
                      style={[styles.removeImageBtn, { backgroundColor: colors.error }]}
                      onPress={() => removeImage(index)}
                    >
                      <MaterialCommunityIcons name="close" size={14} color={colors.white} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {images.length === 0 && (
              <View style={[styles.imageWarning, { backgroundColor: '#FEF3C7', borderRadius: radius.md }]}>
                <MaterialCommunityIcons name="information-outline" size={18} color="#D97706" />
                <Text style={{ color: '#92400E', fontSize: fontSize.sm, flex: 1, marginLeft: 8 }}>
                  Properties with photos get 3x more views
                </Text>
              </View>
            )}
          </>
        );
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

      {/* Header */}
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
          onPress={() => (step > 1 ? setStep(step - 1) : navigation.goBack())}
          style={[styles.headerBtn, { backgroundColor: colors.gray100 }]}
        >
          <MaterialCommunityIcons
            name={step > 1 ? 'arrow-left' : 'close'}
            size={20}
            color={colors.text}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text, fontSize: fontSize.lg }]}>
          List Property
        </Text>
        <Text style={{ color: colors.primary, fontSize: fontSize.sm, fontWeight: '600' }}>
          {step}/{totalSteps}
        </Text>
      </View>

      {/* Progress Bar */}
      <View style={[styles.progressBar, { backgroundColor: colors.gray200 }]}>
        <View
          style={[
            styles.progressFill,
            {
              backgroundColor: colors.primary,
              width: `${(step / totalSteps) * 100}%`,
            },
          ]}
        />
      </View>

      <ScrollView
        style={styles.form}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: spacing.xl }}
      >
        {renderStep()}
        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Bottom Action */}
      <View
        style={[
          styles.bottomAction,
          {
            backgroundColor: colors.surface,
            paddingBottom: insets.bottom + spacing.md,
            borderTopColor: colors.border,
          },
        ]}
      >
        {step < totalSteps ? (
          <Button title="Continue" onPress={handleNext} />
        ) : (
          <Button
            title="Publish Listing"
            onPress={handleSubmit}
            loading={loading}
            icon={<MaterialCommunityIcons name="check-circle" size={20} color={colors.white} />}
          />
        )}
      </View>
    </KeyboardAvoidingView>
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
    paddingBottom: 12,
    borderBottomWidth: 0.5,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontWeight: '700',
  },
  progressBar: {
    height: 3,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  form: {
    flex: 1,
  },
  stepTitle: {
    fontWeight: '700',
    marginBottom: 4,
  },
  stepSubtitle: {
    marginBottom: 20,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
  },
  fieldLabel: {
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
  },
  halfRow: {
    flexDirection: 'row',
  },
  locationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginTop: 8,
  },
  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  featureChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 4,
    borderWidth: 1,
  },
  addPhotoBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    borderWidth: 2,
    marginBottom: 16,
  },
  imageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  imageItem: {
    width: '30%',
    aspectRatio: 1,
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#E5E7EB',
  },
  coverBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  removeImageBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  bottomAction: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 0.5,
  },
});
