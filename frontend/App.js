import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Text,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
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

function MainApp() {
  const { user, logout } = useAuth();

  const [tracks, setTracks] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [likedPlaylist, setLikedPlaylist] = useState([]);
  const [isLoadingTracks, setIsLoadingTracks] = useState(true);
  const [isLoadingPlaylist, setIsLoadingPlaylist] = useState(false);
  const [healthInfo, setHealthInfo] = useState(null);
  const [isPlaylistVisible, setIsPlaylistVisible] = useState(false);
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);
  const [isAuthModalVisible, setIsAuthModalVisible] = useState(false);

  const deckRef = useRef(null);

  // Active track preview url for audio player
  const currentTrack = tracks[currentIndex];
  const activePreviewUrl = currentTrack?.preview_url || currentTrack?.previewUrl || null;

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
      const fetched = await api.fetchTracks();
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
  }, [stopAudio]);

  // Load liked tracks (passes user.id if logged in)
  const loadLikedPlaylist = useCallback(async () => {
    setIsLoadingPlaylist(true);
    try {
      const playlist = await api.getLikedPlaylist(user?.id);
      setLikedPlaylist(playlist);
    } catch (error) {
      console.warn('Error loading playlist:', error.message);
    } finally {
      setIsLoadingPlaylist(false);
    }
  }, [user?.id]);

  useEffect(() => {
    checkBackend();
    loadTracks();
  }, [checkBackend, loadTracks]);

  // Reload playlist when user signs in or out
  useEffect(() => {
    loadLikedPlaylist();
  }, [user?.id, loadLikedPlaylist]);

  // Handle Right Swipe (LIKE track)
  const handleSwipeRight = async (track) => {
    if (!track) return;
    setCurrentIndex((prev) => prev + 1);

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

  const handleOpenPlaylist = () => {
    loadLikedPlaylist();
    setIsPlaylistVisible(true);
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
        onSignOut={logout}
      />

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
        likedCount={likedPlaylist.length}
        disabled={isLoadingTracks || currentIndex >= tracks.length}
      />

      {/* Liked Songs Modal */}
      <LikedPlaylistModal
        visible={isPlaylistVisible}
        onClose={() => setIsPlaylistVisible(false)}
        tracks={likedPlaylist}
        isLoading={isLoadingPlaylist}
        onRefresh={loadLikedPlaylist}
      />

      {/* Sign In & Google Authentication Modal */}
      <SignInModal
        visible={isAuthModalVisible}
        onClose={() => setIsAuthModalVisible(false)}
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
});
