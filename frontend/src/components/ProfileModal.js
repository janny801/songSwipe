import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function ProfileModal({ visible, onClose }) {
  const { user, updateUser, logout } = useAuth();

  const [username, setUsername] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Sync username whenever modal opens
  useEffect(() => {
    if (visible && user) {
      setUsername(user.display_name || user.email?.split('@')[0] || '');
      setErrorMessage('');
      setSuccessMessage('');
    }
  }, [visible, user]);

  const handleSaveUsername = async () => {
    setErrorMessage('');
    setSuccessMessage('');
    const clean = username.trim();

    if (!clean) {
      setErrorMessage('Username cannot be empty.');
      return;
    }

    if (clean.length < 3 || clean.length > 30) {
      setErrorMessage('Username must be between 3 and 30 characters.');
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(clean)) {
      setErrorMessage('Username can only contain letters, numbers, and underscores.');
      return;
    }

    if (clean === user?.display_name) {
      setSuccessMessage('Username is already up to date.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await api.updateUsername(clean);
      if (res.success && res.user) {
        updateUser(res.user);
        setSuccessMessage('Username updated successfully!');
      } else {
        setErrorMessage(res.error || 'Failed to update username.');
      }
    } catch (err) {
      setErrorMessage(err.message || 'Username is already taken. Please choose another.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out of SongSwipe?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: () => {
            onClose();
            logout();
          },
        },
      ]
    );
  };

  if (!user) return null;

  const isGoogle = user.auth_provider === 'google';
  const initial = (user.display_name || user.email || 'U').charAt(0).toUpperCase();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Account & Profile</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                <Ionicons name="close" size={22} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            {/* Profile Avatar Card */}
            <View style={styles.avatarSection}>
              <View style={styles.avatarWrapper}>
                <View style={[styles.avatarCircle, isGoogle && styles.avatarCircleGoogle]}>
                  <Text style={styles.avatarInitial}>{initial}</Text>
                </View>
                {isGoogle && (
                  <View style={styles.providerBadge}>
                    <Ionicons name="logo-google" size={14} color="#FFF" />
                  </View>
                )}
              </View>

              <Text style={styles.profileName}>@{user.display_name || 'username'}</Text>
              <Text style={styles.profileEmail}>{user.email || 'No email registered'}</Text>

              <View style={styles.badgeRow}>
                <View style={styles.authBadge}>
                  <Ionicons
                    name={isGoogle ? 'logo-google' : 'mail'}
                    size={12}
                    color={isGoogle ? '#EA4335' : COLORS.primary}
                  />
                  <Text style={styles.authBadgeText}>
                    {isGoogle ? 'Google Account' : 'Email Account'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Feedback Banners */}
            {errorMessage ? (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={18} color={COLORS.nopeRed} />
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            {successMessage ? (
              <View style={styles.successBanner}>
                <Ionicons name="checkmark-circle" size={18} color={COLORS.primary} />
                <Text style={styles.successText}>{successMessage}</Text>
              </View>
            ) : null}

            {/* Edit Username Section */}
            <View style={styles.editSection}>
              <Text style={styles.sectionTitle}>Modify Unique Username</Text>
              <Text style={styles.sectionSubtitle}>
                Your username is unique across SongSwipe and identifies your profile.
              </Text>

              <View style={styles.inputWrapper}>
                <Text style={styles.atPrefix}>@</Text>
                <TextInput
                  style={styles.textInput}
                  value={username}
                  onChangeText={(text) => {
                    setUsername(text.toLowerCase());
                    setErrorMessage('');
                    setSuccessMessage('');
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={30}
                  placeholder="new_username"
                  placeholderTextColor={COLORS.textMuted}
                />
              </View>

              <Text style={styles.hintText}>
                3–30 characters • Letters, numbers, and underscores only
              </Text>

              <TouchableOpacity
                style={[styles.saveBtn, isLoading && { opacity: 0.7 }]}
                onPress={handleSaveUsername}
                disabled={isLoading}
                activeOpacity={0.8}
              >
                {isLoading ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <View style={styles.saveBtnRow}>
                    <Ionicons name="checkmark-sharp" size={18} color="#000" />
                    <Text style={styles.saveBtnText}>Save Changes</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {/* Divider */}
            <View style={styles.divider} />

            {/* Sign Out Action */}
            <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut} activeOpacity={0.8}>
              <Ionicons name="log-out-outline" size={20} color={COLORS.nopeRed} />
              <Text style={styles.signOutText}>Sign Out</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  headerTitle: {
    color: COLORS.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginBottom: 20,
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 12,
  },
  avatarCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: COLORS.surface,
    borderWidth: 2,
    borderColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCircleGoogle: {
    borderColor: '#EA4335',
  },
  avatarInitial: {
    color: COLORS.textPrimary,
    fontSize: 32,
    fontWeight: '800',
  },
  providerBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#EA4335',
    borderWidth: 2,
    borderColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileName: {
    color: COLORS.textPrimary,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 4,
  },
  profileEmail: {
    color: COLORS.textSecondary,
    fontSize: 14,
    marginBottom: 10,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  authBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  authBadgeText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(233, 20, 41, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(233, 20, 41, 0.3)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: COLORS.nopeRed,
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(29, 185, 84, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(29, 185, 84, 0.3)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  successText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  editSection: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sectionTitle: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  sectionSubtitle: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 52,
    marginBottom: 6,
  },
  atPrefix: {
    color: COLORS.primary,
    fontSize: 18,
    fontWeight: '800',
    marginRight: 4,
  },
  textInput: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  hintText: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginBottom: 16,
    paddingHorizontal: 2,
  },
  saveBtn: {
    backgroundColor: COLORS.primary,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  saveBtnText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '800',
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 24,
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(233, 20, 41, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(233, 20, 41, 0.3)',
    borderRadius: 24,
    height: 50,
  },
  signOutText: {
    color: COLORS.nopeRed,
    fontSize: 15,
    fontWeight: '700',
  },
});
