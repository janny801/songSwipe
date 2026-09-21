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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function ChooseUsernameModal({ visible, onClose }) {
  const { user, updateUser } = useAuth();

  const [username, setUsername] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Pre-populate with current user display name if available
  useEffect(() => {
    if (visible && user) {
      const initial = (user.display_name || user.email?.split('@')[0] || '').replace(/\s+/g, '').toLowerCase();
      setUsername(initial);
      setErrorMessage('');
    }
  }, [visible, user]);

  const handleSave = async () => {
    setErrorMessage('');
    const cleanUsername = username.trim();

    if (!cleanUsername) {
      setErrorMessage('Please enter a username.');
      return;
    }

    if (cleanUsername.length < 3 || cleanUsername.length > 30) {
      setErrorMessage('Username must be between 3 and 30 characters.');
      return;
    }

    // Allow alphanumeric and underscores only
    if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) {
      setErrorMessage('Username can only contain letters, numbers, and underscores.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await api.updateUsername(cleanUsername);
      if (res.success && res.user) {
        updateUser(res.user);
        onClose();
      } else {
        setErrorMessage(res.error || 'Failed to set username. Please try another.');
      }
    } catch (err) {
      setErrorMessage(err.message || 'Username already taken or network error.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => {
        setErrorMessage('A unique username is required to continue.');
      }}
    >
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            {/* Header badge */}
            <View style={styles.badgeRow}>
              <View style={styles.iconCircle}>
                <Ionicons name="at" size={32} color={COLORS.primary} />
              </View>
            </View>

            <Text style={styles.title}>Choose Your Unique Username</Text>
            <Text style={styles.subtitle}>
              Welcome to SongSwipe! Your unique handle will identify your profile and playlists across the app.
            </Text>

            {/* Error Banner */}
            {errorMessage ? (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={18} color={COLORS.nopeRed} />
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            {/* Username Input with prefix */}
            <View style={styles.inputWrapper}>
              <Text style={styles.atSymbol}>@</Text>
              <TextInput
                style={styles.textInput}
                placeholder="username"
                placeholderTextColor={COLORS.textMuted}
                value={username}
                onChangeText={(text) => {
                  setUsername(text.toLowerCase());
                  setErrorMessage('');
                }}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={30}
              />
            </View>

            <Text style={styles.hintText}>
              Letters, numbers, and underscores only. 3–30 characters.
            </Text>

            {/* Submit Button */}
            <TouchableOpacity
              style={[styles.saveBtn, isLoading && { opacity: 0.75 }]}
              onPress={handleSave}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.saveBtnText}>Save Username & Continue</Text>
              )}
            </TouchableOpacity>

            <View style={styles.requiredNoticeRow}>
              <Ionicons name="shield-checkmark-outline" size={16} color={COLORS.primary} />
              <Text style={styles.requiredNoticeText}>
                A unique username is required for all SongSwipe accounts.
              </Text>
            </View>
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
    paddingHorizontal: 24,
    paddingVertical: 32,
    alignItems: 'center',
  },
  badgeRow: {
    marginBottom: 20,
    alignItems: 'center',
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(29, 185, 84, 0.12)',
    borderWidth: 2,
    borderColor: 'rgba(29, 185, 84, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: COLORS.textPrimary,
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 24,
    maxWidth: 320,
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
    width: '100%',
  },
  errorText: {
    color: COLORS.nopeRed,
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardBackground,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 56,
    width: '100%',
    marginBottom: 8,
  },
  atSymbol: {
    color: COLORS.primary,
    fontSize: 20,
    fontWeight: '800',
    marginRight: 4,
  },
  textInput: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  hintText: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginBottom: 28,
    textAlign: 'left',
    width: '100%',
    paddingHorizontal: 4,
  },
  saveBtn: {
    backgroundColor: COLORS.primary,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 14,
  },
  saveBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '800',
  },
  requiredNoticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  requiredNoticeText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
});
