import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
  TextInput,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons, FontAwesome } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { COLORS } from '../constants/theme';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

WebBrowser.maybeCompleteAuthSession();

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function AddToPlaylistModal({
  visible,
  track,
  onClose,
  onSuccess,
}) {
  const { user, refreshUser } = useAuth();

  const [playlists, setPlaylists] = useState([]);
  const [selectedPlaylists, setSelectedPlaylists] = useState(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [notConnected, setNotConnected] = useState(false);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [isConnectingSpotify, setIsConnectingSpotify] = useState(false);

  // Inline "Create New Spotify Playlist" state
  const [showCreateInput, setShowCreateInput] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Animation controllers for smooth bottom sheet appearance without native Modal collision
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT * 0.75)).current;
  const [isRendered, setIsRendered] = useState(false);

  // Handle animate in/out
  useEffect(() => {
    if (visible) {
      setIsRendered(true);
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          damping: 24,
          stiffness: 280,
          useNativeDriver: true,
        }),
      ]).start();
    } else if (isRendered) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: SCREEN_HEIGHT * 0.75,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setIsRendered(false);
      });
    }
  }, [visible, fadeAnim, slideAnim, isRendered]);

  const handleDismiss = useCallback(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: SCREEN_HEIGHT * 0.75,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsRendered(false);
      onClose && onClose();
    });
  }, [fadeAnim, slideAnim, onClose]);

  // Load playlists created on user's own Spotify account
  const loadSpotifyPlaylists = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg('');
    setNotConnected(false);
    setNeedsReauth(false);

    try {
      const res = await api.getSpotifyPlaylists();
      if (res.notConnected) {
        setNotConnected(true);
        setPlaylists([]);
      } else if (res.needsReauth) {
        setNeedsReauth(true);
        setPlaylists([]);
      } else if (res.success && Array.isArray(res.playlists)) {
        setPlaylists(res.playlists);
      } else {
        setPlaylists([]);
      }
    } catch (err) {
      console.warn('Error loading Spotify playlists:', err.message);
      setErrorMsg(err.message || 'Could not load Spotify playlists');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible && track) {
      setSelectedPlaylists(new Set());
      setErrorMsg('');
      setSuccessMsg('');
      setShowCreateInput(false);
      setNewPlaylistName('');
      loadSpotifyPlaylists();
    }
  }, [visible, track, loadSpotifyPlaylists]);

  // Handle Spotify Connect / Re-auth directly inside popup
  const handleConnectSpotify = async () => {
    setIsConnectingSpotify(true);
    setErrorMsg('');
    try {
      const appReturnUrl = Linking.createURL('spotify-connected');
      const authUrl = await api.getSpotifyAuthUrl(appReturnUrl);

      const result = await WebBrowser.openAuthSessionAsync(authUrl, appReturnUrl);

      if (result.type === 'success' && result.url) {
        if (refreshUser) {
          await refreshUser();
        }
        await loadSpotifyPlaylists();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    } catch (err) {
      setErrorMsg(err.message || 'Spotify authorization failed');
    } finally {
      setIsConnectingSpotify(false);
    }
  };

  // Toggle selection of Spotify playlist
  const toggleSelect = (playlistId) => {
    Haptics.selectionAsync().catch(() => {});
    setErrorMsg('');
    setSelectedPlaylists((prev) => {
      const next = new Set(prev);
      if (next.has(playlistId)) {
        next.delete(playlistId);
      } else {
        next.add(playlistId);
      }
      return next;
    });
  };

  // Create playlist on Spotify inline
  const handleCreateSpotifyPlaylist = async () => {
    const clean = newPlaylistName.trim();
    if (!clean) return;

    setIsCreating(true);
    setErrorMsg('');
    try {
      const created = await api.createSpotifyPlaylist(clean, false);
      setNewPlaylistName('');
      setShowCreateInput(false);
      setPlaylists((prev) => [created, ...prev]);
      setSelectedPlaylists((prev) => new Set(prev).add(created.id));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (err) {
      setErrorMsg(err.message || 'Failed to create playlist on Spotify');
    } finally {
      setIsCreating(false);
    }
  };

  // Submit adding song to selected Spotify playlists
  const handleConfirm = async () => {
    if (selectedPlaylists.size === 0) return;

    setIsSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const playlistIds = Array.from(selectedPlaylists);
      const res = await api.addTrackToSpotifyPlaylists({ track, playlistIds });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setSuccessMsg(
        `Added "${track.name}" to ${playlistIds.length} Spotify playlist${
          playlistIds.length > 1 ? 's' : ''
        }!`
      );

      setTimeout(() => {
        onSuccess && onSuccess(playlistIds);
        handleDismiss();
      }, 700);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to add song to Spotify playlists');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isRendered || !track) return null;

  const selectedCount = selectedPlaylists.size;
  const albumArt =
    track.album_art_url ||
    track.albumArtUrl ||
    'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400';

  return (
    <View style={styles.absoluteOverlay} pointerEvents={visible ? 'auto' : 'none'}>
      {/* Animated Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={handleDismiss}
        />
      </Animated.View>

      {/* Animated Bottom Sheet */}
      <Animated.View
        style={[
          styles.sheetContainer,
          {
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerIndicator} />
          <View style={styles.headerTitleRow}>
            <View style={styles.headerIconCircle}>
              <FontAwesome name="spotify" size={20} color="#1DB954" />
            </View>
            <View style={styles.headerTitlesBox}>
              <Text style={styles.headerTitle}>Add to Spotify Playlists</Text>
              <Text style={styles.headerSubtitle}>Playlists created on your Spotify account</Text>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={handleDismiss}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
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

        {/* Spotify Account Not Connected State */}
        {notConnected ? (
          <View style={styles.emptyContainer}>
            <View style={styles.spotifyLargeCircle}>
              <FontAwesome name="spotify" size={36} color="#000" />
            </View>
            <Text style={styles.emptyTitle}>Spotify Account Not Connected</Text>
            <Text style={styles.emptySubtitle}>
              Link your Spotify account to choose from playlists you've created on Spotify and add this song directly.
            </Text>
            <TouchableOpacity
              style={[styles.connectSpotifyBtn, isConnectingSpotify && { opacity: 0.7 }]}
              onPress={handleConnectSpotify}
              disabled={isConnectingSpotify}
              activeOpacity={0.85}
            >
              {isConnectingSpotify ? (
                <ActivityIndicator color="#000" />
              ) : (
                <View style={styles.btnRow}>
                  <FontAwesome name="spotify" size={18} color="#000" />
                  <Text style={styles.connectSpotifyBtnText}>Connect Spotify Account</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        ) : needsReauth ? (
          /* Spotify Re-auth Required for Playlist Permissions */
          <View style={styles.emptyContainer}>
            <Ionicons name="shield-checkmark-outline" size={36} color={COLORS.primary} />
            <Text style={styles.emptyTitle}>Playlist Permissions Needed</Text>
            <Text style={styles.emptySubtitle}>
              SongSwipe needs permission to read and add songs to your personal Spotify playlists.
            </Text>
            <TouchableOpacity
              style={[styles.connectSpotifyBtn, isConnectingSpotify && { opacity: 0.7 }]}
              onPress={handleConnectSpotify}
              disabled={isConnectingSpotify}
              activeOpacity={0.85}
            >
              {isConnectingSpotify ? (
                <ActivityIndicator color="#000" />
              ) : (
                <View style={styles.btnRow}>
                  <FontAwesome name="spotify" size={18} color="#000" />
                  <Text style={styles.connectSpotifyBtnText}>Grant Playlist Permissions</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Inline Create Spotify Playlist Box */}
            {showCreateInput ? (
              <View style={styles.createBox}>
                <TextInput
                  style={styles.createInput}
                  placeholder="New Spotify playlist name..."
                  placeholderTextColor={COLORS.textMuted}
                  value={newPlaylistName}
                  onChangeText={setNewPlaylistName}
                  autoFocus={true}
                  maxLength={60}
                />
                <TouchableOpacity
                  style={[
                    styles.createConfirmBtn,
                    (!newPlaylistName.trim() || isCreating) && { opacity: 0.5 },
                  ]}
                  onPress={handleCreateSpotifyPlaylist}
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
                <Text style={styles.newPlaylistTriggerText}>Create New Spotify Playlist</Text>
              </TouchableOpacity>
            )}

            {/* Playlists List */}
            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator color={COLORS.primary} />
                <Text style={styles.loadingText}>Loading your Spotify playlists...</Text>
              </View>
            ) : playlists.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="musical-notes-outline" size={36} color={COLORS.textMuted} />
                <Text style={styles.emptyTitle}>No created playlists found</Text>
                <Text style={styles.emptySubtitle}>
                  You don't have any playlists created on your Spotify account yet. Create one above to get started!
                </Text>
              </View>
            ) : (
              <FlatList
                data={playlists}
                keyExtractor={(item) => String(item.id)}
                contentContainerStyle={styles.listContent}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const isSelected = selectedPlaylists.has(item.id);
                  return (
                    <TouchableOpacity
                      style={[styles.playlistRow, isSelected && styles.playlistRowSelected]}
                      onPress={() => toggleSelect(item.id)}
                      activeOpacity={0.7}
                    >
                      {/* Playlist Artwork or Default Icon */}
                      {item.image_url ? (
                        <Image source={{ uri: item.image_url }} style={styles.playlistThumb} />
                      ) : (
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
                      )}

                      <View style={styles.playlistRowInfo}>
                        <Text
                          style={[
                            styles.playlistName,
                            isSelected && styles.playlistNameSelected,
                          ]}
                          numberOfLines={1}
                        >
                          {item.name}
                        </Text>
                        <Text style={styles.playlistCount}>
                          {item.track_count || 0} track{(item.track_count || 0) === 1 ? '' : 's'} • Created by you
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
                    <FontAwesome
                      name="spotify"
                      size={18}
                      color={selectedCount > 0 ? '#000' : COLORS.textMuted}
                    />
                    <Text
                      style={[
                        styles.confirmBtnText,
                        selectedCount === 0 && styles.confirmBtnTextDisabled,
                      ]}
                    >
                      {selectedCount === 0
                        ? 'Select Spotify Playlists'
                        : `Add to ${selectedCount} Spotify Playlist${selectedCount > 1 ? 's' : ''}`}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  absoluteOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
  },
  sheetContainer: {
    backgroundColor: '#161616',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: SCREEN_HEIGHT * 0.78,
    minHeight: 440,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingBottom: Platform.OS === 'ios' ? 28 : 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 20,
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
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignSelf: 'center',
    marginBottom: 12,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(29, 185, 84, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  headerTitlesBox: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  headerSubtitle: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  trackCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
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
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  playlistRowSelected: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(29, 185, 84, 0.08)',
  },
  playlistThumb: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: '#282828',
    marginRight: 12,
  },
  playlistIconBox: {
    width: 42,
    height: 42,
    borderRadius: 8,
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
  playlistName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  playlistNameSelected: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  playlistCount: {
    fontSize: 11,
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
    padding: 36,
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
    gap: 12,
  },
  spotifyLargeCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  emptySubtitle: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 20,
  },
  connectSpotifyBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 8,
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  connectSpotifyBtnText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '700',
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
