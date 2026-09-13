import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  FlatList,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Animated,
  PanResponder,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { createAudioPlayer } from 'expo-audio';
import { COLORS } from '../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = 50;

// Swipeable track row supporting left swipe (Delete) and right swipe (Spotify Playlist action)
function SwipeableTrackRow({
  item,
  isPlaying,
  onPlayPreview,
  onDeleteTrack,
  onSpotifyPlaylistPress,
}) {
  const translateX = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gesture) => {
        return Math.abs(gesture.dx) > 10 && Math.abs(gesture.dx) > Math.abs(gesture.dy);
      },
      onMoveShouldSetPanResponderCapture: (_, gesture) => {
        return Math.abs(gesture.dx) > 14 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2;
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        translateX.extractOffset();
      },
      onPanResponderMove: (_, gesture) => {
        // Clamp swipe movement
        if (gesture.dx > 140) {
          translateX.setValue(140);
        } else if (gesture.dx < -140) {
          translateX.setValue(-140);
        } else {
          translateX.setValue(gesture.dx);
        }
      },
      onPanResponderRelease: (_, gesture) => {
        translateX.flattenOffset();
        if (gesture.dx > SWIPE_THRESHOLD) {
          // Swiped Right -> Trigger Spotify playlist action
          Animated.spring(translateX, {
            toValue: 0,
            friction: 7,
            tension: 40,
            useNativeDriver: true,
          }).start();
          onSpotifyPlaylistPress(item);
        } else if (gesture.dx < -SWIPE_THRESHOLD) {
          // Swiped Left -> Trigger Delete confirmation dialog
          Animated.spring(translateX, {
            toValue: 0,
            friction: 7,
            tension: 40,
            useNativeDriver: true,
          }).start();
          onDeleteTrack(item);
        } else {
          // Reset to center
          Animated.spring(translateX, {
            toValue: 0,
            friction: 7,
            tension: 40,
            useNativeDriver: true,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        translateX.flattenOffset();
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
    })
  ).current;

  const dateFormatted = item.swiped_at
    ? new Date(item.swiped_at).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      })
    : null;

  return (
    <View style={styles.rowContainer}>
      {/* Background Actions revealed on swipe */}
      <View style={styles.backgroundActions}>
        {/* Left background: Green Spotify Hamburger action (revealed on right swipe) */}
        <View style={styles.actionLeft}>
          <Ionicons name="menu" size={24} color="#000" />
          <Text style={styles.actionLeftText}>Spotify Playlist</Text>
        </View>

        {/* Right background: Red Delete action (revealed on left swipe) */}
        <View style={styles.actionRight}>
          <Ionicons name="trash" size={22} color="#FFF" />
          <Text style={styles.actionRightText}>Delete</Text>
        </View>
      </View>

      {/* Foreground Swipeable Item */}
      <Animated.View
        style={[
          styles.trackRow,
          { transform: [{ translateX }] },
        ]}
        {...panResponder.panHandlers}
      >
        <Image
          source={{
            uri:
              item.album_art_url ||
              item.albumArtUrl ||
              'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400',
          }}
          style={styles.artworkThumb}
        />

        <View style={styles.trackDetails}>
          <Text style={styles.trackTitle} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.trackArtist} numberOfLines={1}>
            {item.artist}
          </Text>
          {dateFormatted && <Text style={styles.trackDate}>Saved {dateFormatted}</Text>}
        </View>

        {/* Play/Pause 30s Audio Preview */}
        {(item.preview_url || item.previewUrl) && (
          <TouchableOpacity
            style={[styles.playBtn, isPlaying && styles.playingBtn]}
            onPress={() => onPlayPreview(item)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={16}
              color={isPlaying ? '#000' : COLORS.textPrimary}
              style={!isPlaying ? { marginLeft: 2 } : null}
            />
          </TouchableOpacity>
        )}
      </Animated.View>
    </View>
  );
}

export default function LikedPlaylistModal({
  visible,
  onClose,
  tracks = [],
  isLoading = false,
  onRefresh,
  onDeleteTrack,
}) {
  const [playingTrackId, setPlayingTrackId] = useState(null);
  const [modalSound, setModalSound] = useState(null);

  const stopModalAudio = () => {
    if (modalSound) {
      try {
        modalSound.pause();
        modalSound.remove();
      } catch (e) {}
      setModalSound(null);
    }
    setPlayingTrackId(null);
  };

  const handlePlayPreview = (item) => {
    const previewUrl = item.preview_url || item.previewUrl;
    if (!previewUrl) return;

    const trackId = item.spotify_track_id || item.id || item.track_id;

    if (playingTrackId === trackId) {
      stopModalAudio();
      return;
    }

    stopModalAudio();

    try {
      const player = createAudioPlayer(previewUrl);
      player.play();
      player.addListener('playbackStatusUpdate', (status) => {
        if (status?.didJustFinish) {
          stopModalAudio();
        }
      });
      setModalSound(player);
      setPlayingTrackId(trackId);
    } catch (e) {
      console.warn('Could not play playlist preview:', e.message);
    }
  };

  // Popup when swiping right
  const handleSpotifyPlaylistPress = (item) => {
    Alert.alert(
      'Spotify Playlist',
      `This feature is not yet implemented. We're planning for this to allow you to add "${item.name}" to a specific playlist on Spotify.`,
      [{ text: 'OK', style: 'default' }]
    );
  };

  // Confirm before deleting track from playlist (swiping left)
  const handleDeleteConfirmation = (item) => {
    Alert.alert(
      'Delete Track',
      `Are you sure you want to remove "${item.name}" from your liked songs?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const trackId = item.spotify_track_id || item.id || item.track_id;
            if (playingTrackId === trackId) {
              stopModalAudio();
            }
            onDeleteTrack && onDeleteTrack(item);
          },
        },
      ]
    );
  };

  const handleClose = () => {
    stopModalAudio();
    onClose();
  };

  const renderTrackItem = ({ item }) => {
    const trackId = item.spotify_track_id || item.id || item.track_id;
    const isThisPlaying = playingTrackId === trackId;
    return (
      <SwipeableTrackRow
        item={item}
        isPlaying={isThisPlaying}
        onPlayPreview={handlePlayPreview}
        onDeleteTrack={handleDeleteConfirmation}
        onSpotifyPlaylistPress={handleSpotifyPlaylistPress}
      />
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <View style={styles.heartCircle}>
              <Ionicons name="heart" size={18} color="#000" />
            </View>
            <View>
              <Text style={styles.headerTitle}>Liked Songs</Text>
              <Text style={styles.headerSubtitle}>{tracks.length} tracks saved</Text>
            </View>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.iconBtn} onPress={onRefresh} activeOpacity={0.7}>
              <Ionicons name="sync-outline" size={20} color={COLORS.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeBtn} onPress={handleClose} activeOpacity={0.7}>
              <Ionicons name="close" size={22} color={COLORS.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Swipe Instructions Banner */}
        {tracks.length > 0 && (
          <View style={styles.swipeGuide}>
            <View style={styles.guideItem}>
              <Ionicons name="arrow-forward-circle" size={16} color={COLORS.primary} />
              <Text style={styles.guideText}>Swipe right for Spotify</Text>
            </View>
            <Text style={styles.guideDot}>•</Text>
            <View style={styles.guideItem}>
              <Ionicons name="arrow-back-circle" size={16} color={COLORS.nopeRed} />
              <Text style={styles.guideText}>Swipe left to delete</Text>
            </View>
          </View>
        )}

        {/* Content */}
        {isLoading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.emptySubtitle}>Loading your liked songs...</Text>
          </View>
        ) : tracks.length === 0 ? (
          <View style={styles.centerContainer}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="musical-notes-outline" size={40} color={COLORS.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>No liked songs yet</Text>
            <Text style={styles.emptySubtitle}>
              Swipe right on tracks in the discovery feed to save them here!
            </Text>
          </View>
        ) : (
          <FlatList
            data={tracks}
            keyExtractor={(item, index) =>
              item.playlist_entry_id ||
              item.spotify_track_id ||
              item.id ||
              item.track_id ||
              String(index)
            }
            renderItem={renderTrackItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}
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
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heartCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: COLORS.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  headerSubtitle: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swipeGuide: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.cardBackground,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 10,
  },
  guideItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  guideText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  guideDot: {
    color: COLORS.textMuted,
    fontSize: 12,
  },
  listContent: {
    paddingVertical: 8,
  },
  rowContainer: {
    position: 'relative',
    marginVertical: 4,
    marginHorizontal: 14,
    borderRadius: 12,
    overflow: 'hidden',
  },
  backgroundActions: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 12,
  },
  actionLeft: {
    flex: 1,
    height: '100%',
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 18,
    gap: 8,
  },
  actionLeftText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 14,
  },
  actionRight: {
    flex: 1,
    height: '100%',
    backgroundColor: COLORS.nopeRed,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingRight: 18,
    gap: 8,
  },
  actionRightText: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 14,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardBackground,
    padding: 12,
    borderRadius: 12,
  },
  artworkThumb: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
  },
  trackDetails: {
    flex: 1,
    marginLeft: 14,
    marginRight: 10,
  },
  trackTitle: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 3,
  },
  trackArtist: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  trackDate: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 4,
  },
  playBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  playingBtn: {
    backgroundColor: COLORS.primary,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptySubtitle: {
    color: COLORS.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
