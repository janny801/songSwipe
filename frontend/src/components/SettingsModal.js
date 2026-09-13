import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { getBackendUrl, setBackendUrl } from '../services/api';

export default function SettingsModal({
  visible,
  onClose,
  healthInfo,
  onServerUrlChange,
}) {
  const [urlInput, setUrlInput] = useState(getBackendUrl());

  const handleSave = () => {
    if (!urlInput.trim()) {
      Alert.alert('Invalid URL', 'Please provide a valid backend URL.');
      return;
    }
    setBackendUrl(urlInput.trim());
    onServerUrlChange && onServerUrlChange(urlInput.trim());
    onClose();
  };

  const isConnected = healthInfo?.status === 'ok';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Backend & Spotify Settings</Text>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
        </View>

        <View style={styles.body}>
          {/* Server Status Pill */}
          <View style={styles.statusCard}>
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: isConnected ? COLORS.primary : COLORS.nopeRed },
                ]}
              />
              <Text style={styles.statusTitle}>
                Express Server: {isConnected ? 'Connected' : 'Offline / Unreachable'}
              </Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Database:</Text>
              <Text style={styles.metaValue}>
                {healthInfo?.database?.status || 'Checking...'}
              </Text>
            </View>

            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Spotify Mode:</Text>
              <Text style={styles.metaValue}>
                {healthInfo?.spotify?.mode || 'Demo Tracks Mode'}
              </Text>
            </View>
          </View>

          {/* Backend URL configuration */}
          <Text style={styles.sectionLabel}>EXPRESS BACKEND URL</Text>
          <Text style={styles.sectionHint}>
            Use localhost for iOS Simulator or your Mac's LAN IP (e.g. http://192.168.1.36:3001) for physical iPhone testing.
          </Text>

          <View style={styles.inputContainer}>
            <Ionicons name="server-outline" size={20} color={COLORS.textSecondary} />
            <TextInput
              value={urlInput}
              onChangeText={setUrlInput}
              placeholder="http://localhost:3001"
              placeholderTextColor={COLORS.textMuted}
              style={styles.textInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.8}>
            <Text style={styles.saveBtnText}>Save Backend URL</Text>
          </TouchableOpacity>

          {/* Spotify OAuth Future Architecture Note */}
          <View style={styles.oauthNoteCard}>
            <View style={styles.oauthTitleRow}>
              <Ionicons name="logo-spotify" size={20} color={COLORS.primary} />
              <Text style={styles.oauthTitle}>Spotify Account Linking</Text>
            </View>
            <Text style={styles.oauthText}>
              SongSwipe is architected for full Spotify User OAuth. The backend users table and endpoints are ready to link Spotify tokens to automatically export your liked songs directly to your personal Spotify account.
            </Text>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
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
  body: {
    padding: 20,
  },
  statusCard: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 24,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusTitle: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginVertical: 12,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 4,
  },
  metaLabel: {
    color: COLORS.textMuted,
    fontSize: 13,
  },
  metaValue: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  sectionLabel: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 6,
  },
  sectionHint: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
  },
  textInput: {
    flex: 1,
    marginLeft: 10,
    color: COLORS.textPrimary,
    fontSize: 15,
  },
  saveBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  saveBtnText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '700',
  },
  oauthNoteCard: {
    backgroundColor: 'rgba(29, 185, 84, 0.08)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(29, 185, 84, 0.25)',
  },
  oauthTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  oauthTitle: {
    color: COLORS.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  oauthText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
});
