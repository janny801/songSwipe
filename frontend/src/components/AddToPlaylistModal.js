import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS } from '../constants/theme';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function AddToPlaylistModal({
  visible,
  track,
  onClose,
  onSuccess,
}) {
  const { isAuthenticated } = useAuth();

  const [playlists, setPlaylists] = useState([]);
  const [selectedPlaylists, setSelectedPlaylists] = useState(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Inline "Create New Playlist" input state
  const [showCreateInput, setShowCreateInput] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const trackId = track?.spotify_track_id || track?.id || track?.track_id || null;

  // Load user's custom playlists whenever modal opens
  const loadPlaylists = useCallback(async () => {
    if (!isAuthenticated) return;
    setIsLoading(true);
    setErrorMsg('');
    try {
      const data = await api.getCustomPlaylists(trackId);
      setPlaylists(data);

      // Pre-select playlists that already have the track or keep fresh set
      const alreadyIn = new Set();
      data.forEach((pl) => {
        if (pl.has_track) {
          alreadyIn.add(pl.name);
        }
      });
      setSelectedPlaylists(alreadyIn);
    } catch (err) {
      console.warn('Error fetching custom playlists:', err.message);
      setErrorMsg('Could not load your playlists. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, trackId]);

  useEffect(() => {
    if (visible && track) {
      setSelectedPlaylists(new Set());
      setErrorMsg('');
      setSuccessMsg('');
      setShowCreateInput(false);
      setNewPlaylistName('');
      loadPlaylists();
    }
  }, [visible, track, loadPlaylists]);

  // Toggle playlist selection
  const toggleSelect = (name) => {
    Haptics.selectionAsync().catch(() => {});
    setErrorMsg('');
    setSelectedPlaylists((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  // Create playlist inline
  const handleCreatePlaylist = async () => {
    const clean = newPlaylistName.trim();
    if (!clean) return;

    setIsCreating(true);
    setErrorMsg('');
    try {
      const created = await api.createCustomPlaylist(clean);
      setNewPlaylistName('');
      setShowCreateInput(false);
      // Add to list and select it
      setPlaylists((prev) => [created, ...prev]);
      setSelectedPlaylists((prev) => new Set(prev).add(created.name));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (err) {
      setErrorMsg(err.message || 'Failed to create playlist');
    } finally {
      setIsCreating(false);
    }
  };

  // Submit adding to selected playlists
  const handleConfirm = async () => {
    if (selectedPlaylists.size === 0) return;

    setIsSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const playlistNames = Array.from(selectedPlaylists);
      const res = await api.addToPlaylists({ track, playlistNames });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setSuccessMsg(
        `Added "${track.name}" to ${playlistNames.length} playlist${
          playlistNames.length > 1 ? 's' : ''
        }!`
      );

      setTimeout(() => {
        onSuccess && onSuccess(playlistNames);
        onClose();
      }, 700);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to add to playlists');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!visible || !track) return null;

  const selectedCount = selectedPlaylists.size;
  const albumArt =
    track.album_art_url ||
    track.albumArtUrl ||
    'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400';

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

        <View style={styles.sheetContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerIndicator} />
            <View style={styles.headerTitleRow}>
              <View style={styles.headerIconCircle}>
                <Ionicons name="folder-open" size={18} color={COLORS.primary} />
              </View>
              <Text style={styles.headerTitle}>Add to Playlists</Text>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={onClose}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Selected Track Pill / Preview */}
          <View style={styles.trackCard}>
            <Image source={{ uri: albumArt }} style={styles.trackThumb} />
            <View style={styles.trackInfo}>
              <Text style={styles.trackTitle} numberOfLines={1}>
                {track.name}
              </Text>
              <Text style={styles.trackArtist} numberOfLines={1}>
                {track.artist}
              </Text>
            </View>
            <View style={styles.multiselectBadge}>
              <Text style={styles.multiselectBadgeText}>Multiselect</Text>
            </View>
          </View>

          {/* Status Banners */}
          {errorMsg ? (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={16} color={COLORS.nopeRed} />
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          ) : null}

          {successMsg ? (
            <View style={styles.successBanner}>
              <Ionicons name="checkmark-circle" size={16} color={COLORS.primary} />
              <Text style={styles.successText}>{successMsg}</Text>
            </View>
          ) : null}

          {/* Inline Create Playlist Box */}
          {showCreateInput ? (
            <View style={styles.createBox}>
              <TextInput
                style={styles.createInput}
                placeholder="Playlist name (e.g. Chill Beats)"
                placeholderTextColor={COLORS.textMuted}
                value={newPlaylistName}
                onChangeText={setNewPlaylistName}
                autoFocus={true}
                maxLength={50}
              />
              <TouchableOpacity
                style={[
                  styles.createConfirmBtn,
                  (!newPlaylistName.trim() || isCreating) && { opacity: 0.5 },
                ]}
                onPress={handleCreatePlaylist}
                disabled={!newPlaylistName.trim() || isCreating}
              >
                {isCreating ? (
                  <ActivityIndicator size="small" color="#000" />
                ) : (
                  <Text style={styles.createConfirmBtnText}>Create</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.createCancelBtn}
                onPress={() => {
                  setShowCreateInput(false);
                  setNewPlaylistName('');
                }}
              >
                <Ionicons name="close" size={18} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.newPlaylistTrigger}
              onPress={() => setShowCreateInput(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="add-circle" size={20} color={COLORS.primary} />
              <Text style={styles.newPlaylistTriggerText}>Create New Playlist</Text>
            </TouchableOpacity>
          )}

          {/* Playlists List */}
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color={COLORS.primary} />
              <Text style={styles.loadingText}>Loading your playlists...</Text>
            </View>
          ) : playlists.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="albums-outline" size={38} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>No custom playlists yet</Text>
              <Text style={styles.emptySubtitle}>
                Create a playlist using the button above to start organizing your favorite songs.
              </Text>
            </View>
          ) : (
            <FlatList
              data={playlists}
              keyExtractor={(item) => item.id || item.name}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const isSelected = selectedPlaylists.has(item.name);
                return (
                  <TouchableOpacity
                    style={[styles.playlistRow, isSelected && styles.playlistRowSelected]}
                    onPress={() => toggleSelect(item.name)}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.playlistIconBox,
                        isSelected && styles.playlistIconBoxSelected,
                      ]}
                    >
                      <Ionicons
                        name="musical-notes"
                        size={18}
                        color={isSelected ? '#000' : COLORS.textSecondary}
                      />
                    </View>

                    <View style={styles.playlistRowInfo}>
                      <View style={styles.playlistNameRow}>
                        <Text
                          style={[
                            styles.playlistName,
                            isSelected && styles.playlistNameSelected,
                          ]}
                          numberOfLines={1}
                        >
                          {item.name}
                        </Text>
                        {item.has_track && (
                          <View style={styles.hasTrackBadge}>
                            <Text style={styles.hasTrackBadgeText}>Added</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.playlistCount}>
                        {item.track_count || 0} song{(item.track_count || 0) === 1 ? '' : 's'}
                      </Text>
                    </View>

                    {/* Multiselect Checkbox */}
                    <View
                      style={[
                        styles.checkbox,
                        isSelected && styles.checkboxSelected,
                      ]}
                    >
                      {isSelected && (
                        <Ionicons name="checkmark" size={16} color="#000" />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          )}

          {/* Bottom Confirmation Button */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[
                styles.confirmBtn,
                (selectedCount === 0 || isSubmitting) && styles.confirmBtnDisabled,
              ]}
              onPress={handleConfirm}
              disabled={selectedCount === 0 || isSubmitting}
              activeOpacity={0.8}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#000" />
              ) : (
                <View style={styles.confirmBtnRow}>
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color={selectedCount > 0 ? '#000' : COLORS.textMuted}
                  />
                  <Text
                    style={[
                      styles.confirmBtnText,
                      selectedCount === 0 && styles.confirmBtnTextDisabled,
                    ]}
                  >
                    {selectedCount === 0
                      ? 'Select Playlists'
                      : `Add to ${selectedCount} Playlist${selectedCount > 1 ? 's' : ''}`}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetContainer: {
    backgroundColor: '#161616',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '80%',
    minHeight: 420,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  headerIndicator: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignSelf: 'center',
    marginBottom: 12,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(29, 185, 84, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  closeBtn: {
    padding: 4,
  },
  trackCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 10,
    padding: 10,
    backgroundColor: '#1F1F1F',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  trackThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#2A2A2A',
  },
  trackInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  trackTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  trackArtist: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  multiselectBadge: {
    backgroundColor: 'rgba(29, 185, 84, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(29, 185, 84, 0.3)',
  },
  multiselectBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.primary,
    textTransform: 'uppercase',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(233, 20, 41, 0.12)',
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 10,
    borderRadius: 10,
    gap: 8,
  },
  errorText: {
    color: COLORS.nopeRed,
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(29, 185, 84, 0.12)',
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 10,
    borderRadius: 10,
    gap: 8,
  },
  successText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  newPlaylistTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 10,
    paddingVertical: 8,
    gap: 8,
  },
  newPlaylistTriggerText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  createBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: '#222',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: COLORS.primary,
    gap: 8,
  },
  createInput: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 13,
    paddingVertical: 8,
  },
  createConfirmBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  createConfirmBtnText: {
    color: '#000',
    fontWeight: '700',
    fontSize: 12,
  },
  createCancelBtn: {
    padding: 4,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  playlistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  playlistRowSelected: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(29, 185, 84, 0.08)',
  },
  playlistIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#282828',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  playlistIconBoxSelected: {
    backgroundColor: COLORS.primary,
  },
  playlistRowInfo: {
    flex: 1,
    marginRight: 10,
  },
  playlistNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  playlistName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    flexShrink: 1,
  },
  playlistNameSelected: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  hasTrackBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  hasTrackBadgeText: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
  playlistCount: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  loadingContainer: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    color: COLORS.textSecondary,
    fontSize: 13,
  },
  emptyContainer: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyTitle: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 4,
  },
  emptySubtitle: {
    color: COLORS.textSecondary,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 20,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  confirmBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnDisabled: {
    backgroundColor: '#282828',
  },
  confirmBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  confirmBtnText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '700',
  },
  confirmBtnTextDisabled: {
    color: COLORS.textMuted,
  },
});
