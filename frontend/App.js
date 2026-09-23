import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  StatusBar,
  ActivityIndicator,
  Text,
  TouchableOpacity,
  Alert,
  Animated,
  Platform,
  LogBox,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, FontAwesome } from '@expo/vector-icons';

// Suppress non-critical development warnings in Expo Go
LogBox.ignoreLogs([
  'Encountered two children with the same key',
  'logo-spotify',
]);
import { COLORS } from './src/constants/theme';
import { api, getBackendUrl } from './src/services/api';
import { useAudioPlayer } from './src/hooks/useAudioPlayer';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import AppHeader from './src/components/AppHeader';
import CardDeck from './src/components/CardDeck';
import BottomControls from './src/components/BottomControls';
import LikedPlaylistModal from './src/components/LikedPlaylistModal';
import SettingsModal from './src/components/SettingsModal';
import SignInModal from './src/components/SignInModal';
import ChooseUsernameModal from './src/components/ChooseUsernameModal';
import ProfileModal from './src/components/ProfileModal';
import AddToPlaylistModal from './src/components/AddToPlaylistModal';

function MainApp() {
  const { user, logout, isAuthenticated } = useAuth();

  const [tracks, setTracks] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [likedPlaylist, setLikedPlaylist] = useState([]);
  const [isLoadingTracks, setIsLoadingTracks] = useState(true);
  const [isLoadingPlaylist, setIsLoadingPlaylist] = useState(false);
  const [healthInfo, setHealthInfo] = useState(null);
  const [isPlaylistVisible, setIsPlaylistVisible] = useState(false);
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);
  const [isAuthModalVisible, setIsAuthModalVisible] = useState(false);
  const [isChooseUsernameVisible, setIsChooseUsernameVisible] = useState(false);
  const [isProfileVisible, setIsProfileVisible] = useState(false);
  const [selectedTrackForPlaylists, setSelectedTrackForPlaylists] = useState(null);
  const [isAddToPlaylistVisible, setIsAddToPlaylistVisible] = useState(false);

  // Toast notification state for right-swipe feedback
  const [toastMessage, setToastMessage] = useState(null);
  const toastFadeAnim = useRef(new Animated.Value(0)).current;
  const toastSlideAnim = useRef(new Animated.Value(-60)).current;
  const toastTimeoutRef = useRef(null);

  const showToast = useCallback((msg) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToastMessage(msg);

    Animated.parallel([
      Animated.timing(toastFadeAnim, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.spring(toastSlideAnim, {
        toValue: 0,
        friction: 8,
        tension: 50,
        useNativeDriver: true,
      }),
    ]).start();

    toastTimeoutRef.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(toastFadeAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(toastSlideAnim, {
          toValue: -60,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setToastMessage(null);
      });
    }, 2500);
  }, [toastFadeAnim, toastSlideAnim]);

  const deckRef = useRef(null);

  // Active track preview url for audio player
  const currentTrack = tracks[currentIndex];
  const activePreviewUrl = currentTrack?.preview_url || currentTrack?.previewUrl || null;

  const handleOpenAddToPlaylists = (track) => {
    if (!isAuthenticated) {
      setIsAuthModalVisible(true);
      return;
    }
    setSelectedTrackForPlaylists(track || currentTrack);
    setIsAddToPlaylistVisible(true);
  };

  const {
    isPlaying,
    progress,
    togglePlayPause,
    stopAudio,
  } = useAudioPlayer(activePreviewUrl);

  // Check backend health
  const checkBackend = useCallback(async () => {
    try {
      const health = await api.checkHealth();
      setHealthInfo(health);
    } catch (e) {
      setHealthInfo({ status: 'offline' });
    }
  }, []);

  // Fetch tracks from backend
  const loadTracks = useCallback(async () => {
    setIsLoadingTracks(true);
    await stopAudio();
    try {
      const fetched = await api.fetchTracks('', 10, '', user?.id);
      setTracks(fetched);
      setCurrentIndex(0);
    } catch (error) {
      console.warn('Error loading tracks:', error.message);
      Alert.alert(
        'Backend Connection Error',
        `Could not reach Express server at ${getBackendUrl()}. Make sure the backend is running and your IP is reachable.`,
        [{ text: 'Settings', onPress: () => setIsSettingsVisible(true) }, { text: 'Retry', onPress: loadTracks }]
      );
    } finally {
      setIsLoadingTracks(false);
    }
  }, [stopAudio, user?.id]);

  // Load liked tracks (only for authenticated users)
  const loadLikedPlaylist = useCallback(async () => {
    if (!isAuthenticated) {
      setLikedPlaylist([]);
      return;
    }
    setIsLoadingPlaylist(true);
    try {
      const playlist = await api.getLikedPlaylist(user?.id);
      setLikedPlaylist(playlist);
    } catch (error) {
      console.warn('Error loading playlist:', error.message);
    } finally {
      setIsLoadingPlaylist(false);
    }
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    checkBackend();
    loadTracks();
  }, [checkBackend, loadTracks]);

  // Reload playlist when authentication status changes
  useEffect(() => {
    if (isAuthenticated) {
      loadLikedPlaylist();
    } else {
      setLikedPlaylist([]);
    }
  }, [isAuthenticated, loadLikedPlaylist]);

  // Handle Right Swipe (LIKE track)
  const handleSwipeRight = async (track) => {
    if (!track) return;
    setCurrentIndex((prev) => prev + 1);

    // Check if auto-save to Spotify Liked Songs is enabled
    const isAutoSaveSpotifyEnabled = Boolean(
      user?.spotify_id && user?.auto_save_spotify_likes !== false
    );

    if (isAutoSaveSpotifyEnabled) {
      showToast({
        title: 'Added to Liked Songs',
        subtitle: `${track.name || 'Song'} • Spotify`,
      });
    }

    if (isAuthenticated) {
      // Optimistically update liked list
      setLikedPlaylist((prev) => [
        {
          ...track,
          swiped_at: new Date().toISOString(),
        },
        ...prev,
      ]);

      try {
        await api.swipeTrack({
          track,
          direction: 'right',
          userId: user?.id,
          playlistName: 'Liked Songs',
        });
      } catch (error) {
        console.warn('Failed to save liked track to backend:', error.message);
      }
    } else {
      // Guest interaction without saving to a persistent playlist
      try {
        await api.swipeTrack({
          track,
          direction: 'right',
          userId: user?.id,
        });
      } catch (error) {
        // silent
      }
    }
  };

  // Handle Left Swipe (PASS track)
  const handleSwipeLeft = async (track) => {
    if (!track) return;
    setCurrentIndex((prev) => prev + 1);

    try {
      await api.swipeTrack({
        track,
        direction: 'left',
        userId: user?.id,
      });
    } catch (error) {
      console.warn('Failed to post pass action:', error.message);
    }
  };

  // Programmatic swipe via buttons
  const triggerLike = () => {
    if (deckRef.current && currentIndex < tracks.length) {
      deckRef.current.swipeRight();
    }
  };

  const triggerPass = () => {
    if (deckRef.current && currentIndex < tracks.length) {
      deckRef.current.swipeLeft();
    }
  };

  // Open Playlist Drawer - only allowed when user is logged in
  const handleOpenPlaylist = () => {
    if (!isAuthenticated) {
      Alert.alert(
        'Sign In Required',
        'Please sign in to view and manage your saved songs playlist.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Sign In',
            style: 'default',
            onPress: () => setIsAuthModalVisible(true),
          },
        ]
      );
      return;
    }
    loadLikedPlaylist();
    setIsPlaylistVisible(true);
  };

  // Delete a track from liked playlist (swipe-to-delete or trash icon)
  const handleDeleteTrack = async (track) => {
    const trackId = track.spotify_track_id || track.id || track.track_id;
    if (!trackId) return;

    // Optimistically remove from state
    setLikedPlaylist((prev) =>
      prev.filter((t) => (t.spotify_track_id || t.id || t.track_id) !== trackId)
    );

    try {
      await api.deleteFromPlaylist(trackId, user?.id);
    } catch (error) {
      console.warn('Failed to delete track from playlist:', error.message);
      loadLikedPlaylist();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />

      {/* Top Header with User Sign In / Profile */}
      <AppHeader
        isConnected={healthInfo?.status === 'ok'}
        onOpenSettings={() => setIsSettingsVisible(true)}
        onRefresh={loadTracks}
        user={user}
        onOpenSignIn={() => setIsAuthModalVisible(true)}
        onOpenProfile={() => setIsProfileVisible(true)}
      />

      {/* Toast Notification for Auto-Save to Liked Songs */}
      {toastMessage && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.toastContainer,
            {
              opacity: toastFadeAnim,
              transform: [{ translateY: toastSlideAnim }],
            },
          ]}
        >
          <View style={styles.toastIconWrapper}>
            <FontAwesome name="spotify" size={20} color="#1DB954" />
          </View>
          <View style={styles.toastTextWrapper}>
            <Text style={styles.toastTitle}>{toastMessage.title || 'Added to Liked Songs'}</Text>
            {toastMessage.subtitle ? (
              <Text style={styles.toastSubtitle} numberOfLines={1}>
                {toastMessage.subtitle}
              </Text>
            ) : null}
          </View>
          <View style={styles.toastCheckmark}>
            <Ionicons name="checkmark-circle" size={18} color="#1DB954" />
          </View>
        </Animated.View>
      )}

      {/* Main Swipeable Card Deck */}
      <View style={styles.contentArea}>
        {isLoadingTracks ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading Spotify Tracks...</Text>
          </View>
        ) : tracks.length === 0 ? (
          <View style={styles.loadingContainer}>
            <Ionicons name="cloud-offline-outline" size={54} color={COLORS.textMuted} />
            <Text style={styles.errorTitle}>No Tracks Found</Text>
            <Text style={styles.errorSubtitle}>
              Could not connect to backend server at {getBackendUrl()}
            </Text>
            <TouchableOpacity style={styles.retryBtn} onPress={loadTracks}>
              <Text style={styles.retryBtnText}>Retry Connection</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <CardDeck
            ref={deckRef}
            tracks={tracks}
            currentIndex={currentIndex}
            onSwipeLeft={handleSwipeLeft}
            onSwipeRight={handleSwipeRight}
            onReset={() => setCurrentIndex(0)}
            isPlaying={isPlaying}
            progress={progress}
            onAddToPlaylist={handleOpenAddToPlaylists}
          />
        )}
      </View>

      {/* Bottom Interactive Controls */}
      <BottomControls
        onPass={triggerPass}
        onLike={triggerLike}
        isPlaying={isPlaying}
        onTogglePlayPause={togglePlayPause}
        onOpenPlaylist={handleOpenPlaylist}
        likedCount={isAuthenticated ? likedPlaylist.length : 0}
        disabled={isLoadingTracks || currentIndex >= tracks.length}
      />

      {/* Liked Songs Modal */}
      <LikedPlaylistModal
        visible={isPlaylistVisible}
        onClose={() => setIsPlaylistVisible(false)}
        tracks={likedPlaylist}
        isLoading={isLoadingPlaylist}
        onRefresh={loadLikedPlaylist}
        onDeleteTrack={handleDeleteTrack}
        onAddToPlaylist={handleOpenAddToPlaylists}
      />

      {/* Sign In & Google Authentication Modal */}
      <SignInModal
        visible={isAuthModalVisible}
        onClose={() => setIsAuthModalVisible(false)}
        onGoogleSuccess={(userObj, isNewUser) => {
          // After Google sign in completes, reload playlist
          loadLikedPlaylist();
        }}
      />

      {/* Mandatory Unique Username Prompt for First Login (Google or any account without chosen handle) */}
      <ChooseUsernameModal
        visible={Boolean(
          !isAuthModalVisible &&
          isAuthenticated &&
          user &&
          (user.has_chosen_username === false || user.needsUsername === true || user.needs_username === true)
        )}
        onClose={() => {}}
        onSwitchAccount={() => {
          setIsAuthModalVisible(true);
        }}
      />

      {/* User Account & Profile Modal (modify unique username, select favorite genres & sign out) */}
      <ProfileModal
        visible={isProfileVisible}
        onClose={() => setIsProfileVisible(false)}
        onGenresUpdated={() => {
          loadTracks();
        }}
      />

      {/* Add to Custom Playlists Modal (Multiselect) */}
      <AddToPlaylistModal
        visible={isAddToPlaylistVisible}
        track={selectedTrackForPlaylists}
        onClose={() => {
          setIsAddToPlaylistVisible(false);
          setSelectedTrackForPlaylists(null);
        }}
        onSuccess={(playlistNames) => {
          setIsAddToPlaylistVisible(false);
          setSelectedTrackForPlaylists(null);
        }}
      />

      {/* Backend & Diagnostics Settings Modal */}
      <SettingsModal
        visible={isSettingsVisible}
        onClose={() => setIsSettingsVisible(false)}
        healthInfo={healthInfo}
        onServerUrlChange={() => {
          checkBackend();
          loadTracks();
          loadLikedPlaylist();
        }}
      />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <MainApp />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  contentArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    color: COLORS.textSecondary,
    fontSize: 15,
    fontWeight: '600',
    marginTop: 14,
  },
  errorTitle: {
    color: COLORS.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 6,
  },
  errorSubtitle: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 18,
    paddingHorizontal: 20,
  },
  retryBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  retryBtnText: {
    color: '#000',
    fontWeight: '700',
    fontSize: 14,
  },
  toastContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 62 : 50,
    left: 18,
    right: 18,
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 99999,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(29, 185, 84, 0.4)',
  },
  toastIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(29, 185, 84, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  toastTextWrapper: {
    flex: 1,
  },
  toastTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  toastSubtitle: {
    color: '#A0A0A0',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  toastCheckmark: {
    marginLeft: 8,
  },
});
