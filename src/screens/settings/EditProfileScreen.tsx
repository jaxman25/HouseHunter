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
import { useTheme } from '../../context/ThemeContext';
import { useAuthContext } from '../../context/AuthContext';
import { RootStackParamList } from '../../types';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import Avatar from '../../components/common/Avatar';
import LoadingOverlay from '../../components/common/LoadingOverlay';
import { uploadProfileImage } from '../../services/storageService';
import { validateName, validatePhone } from '../../utils/validators';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function EditProfileScreen() {
  const { colors, fontSize, spacing, radius } = useTheme();
  const { user, updateProfile } = useAuthContext();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [photoURL, setPhotoURL] = useState(user?.photoURL || '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const pickImage = async () => {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow photo access');
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoURL(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    const nameErr = validateName(displayName);
    if (nameErr) {
      setErrors({ displayName: nameErr });
      return;
    }
    if (phoneNumber) {
      const phoneErr = validatePhone(phoneNumber);
      if (phoneErr) {
        setErrors({ phoneNumber: phoneErr });
        return;
      }
    }

    setLoading(true);
    try {
      let finalPhotoURL = photoURL;
      if (photoURL && !photoURL.startsWith('http')) {
        finalPhotoURL = await uploadProfileImage(user!.uid, photoURL);
      }

      await updateProfile({
        displayName,
        phoneNumber,
        bio,
        photoURL: finalPhotoURL,
      });

      Alert.alert('Success', 'Profile updated successfully', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      Alert.alert('Error', 'Failed to update profile');
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
          onPress={() => navigation.goBack()}
          style={[styles.backBtn, { backgroundColor: colors.gray100 }]}
        >
          <MaterialCommunityIcons name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text, fontSize: fontSize.lg }]}>
          Edit Profile
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: spacing.xl }}
      >
        {/* Photo */}
        <View style={styles.photoSection}>
          <TouchableOpacity onPress={pickImage} style={styles.photoContainer}>
            {photoURL ? (
              <Image source={{ uri: photoURL }} style={[styles.photo, { borderRadius: 60 }]} />
            ) : (
              <Avatar uri={user?.photoURL} name={user?.displayName || 'U'} size={120} />
            )}
            <View style={[styles.cameraIcon, { backgroundColor: colors.primary, borderRadius: 20 }]}>
              <MaterialCommunityIcons name="camera" size={16} color={colors.white} />
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={pickImage} style={{ marginTop: 8 }}>
            <Text style={{ color: colors.primary, fontSize: fontSize.sm, fontWeight: '600' }}>
              Change Photo
            </Text>
          </TouchableOpacity>
        </View>

        <Input
          label="Full Name"
          value={displayName}
          onChangeText={setDisplayName}
          error={errors.displayName}
          leftIcon="account-outline"
          autoCapitalize="words"
        />

        <Input
          label="Phone Number"
          value={phoneNumber}
          onChangeText={setPhoneNumber}
          error={errors.phoneNumber}
          leftIcon="phone-outline"
          keyboardType="phone-pad"
          placeholder="(123) 456-7890"
        />

        <Input
          label="Bio"
          value={bio}
          onChangeText={setBio}
          leftIcon="text-box-outline"
          multiline
          numberOfLines={4}
          placeholder="Tell us about yourself..."
          style={{ minHeight: 100 }}
        />

        <View style={{ marginTop: spacing.lg }}>
          <Button title="Save Changes" onPress={handleSave} loading={loading} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 0.5 },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontWeight: '700' },
  photoSection: { alignItems: 'center', marginBottom: 24 },
  photoContainer: { position: 'relative' },
  photo: { width: 120, height: 120, backgroundColor: '#E5E7EB' },
  cameraIcon: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
});
