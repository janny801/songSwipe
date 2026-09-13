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
const SWIPE_THRESHOLD = 75;

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
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 12,
      onPanResponderMove: (_, gesture) => {
        // Limit swipe range
        if (gesture.dx > 120) {
          translateX.setValue(120);
        } else if (gesture.dx < -120) {
          translateX.setValue(-120);
        } else {
          translateX.setValue(gesture.dx);
        }
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > SWIPE_THRESHOLD) {
          // Swiped Right -> Trigger Spotify playlist action
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
          onSpotifyPlaylistPress(item);
        } else if (gesture.dx < -SWIPE_THRESHOLD) {
          // Swiped Left -> Trigger Delete action
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
          onDeleteTrack(item);
        } else {
          // Reset to center
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
        }
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
      {/* Background Actions */}
      <View style={styles.backgroundActions}>
        {/* Left Side: Green Hamburger / Add to Spotify Playlist */}
        <TouchableOpacity
          style={styles.actionLeft}
          onPress={() => onSpotifyPlaylistPress(item)}
          activeOpacity={0.8}
        >
          <Ionicons name="menu" size={24} color="#000" />
          <Text style={styles.actionLeftText}>Spotify</Text>
        </TouchableOpacity>

        {/* Right Side: Red Delete / Trash */}
        <TouchableOpacity
          style={styles.actionRight}
          onPress={() => onDeleteTrack(item)}
          activeOpacity={0.8}
        >
          <Ionicons name="trash-outline" size={22} color="#FFF" />
          <Text style={styles.actionRightText}>Delete</Text>
        </TouchableOpacity>
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
          {dateFormatted && <Text style={styles.trackDate}>Liked on {dateFormatted}</Text>}
        </View>

        {/* Quick Action Buttons on right */}
        <View style={styles.actionButtonsRow}>
          {/* Hamburger / Add to Spotify icon */}
          <TouchableOpacity
            style={styles.iconActionBtn}
            onPress={() => onSpotifyPlaylistPress(item)}
            activeOpacity={0.7}
          >
            <Ionicons name="menu" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>

          {/* Play / Pause Preview */}
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

          {/* Delete / Trash Button */}
          <TouchableOpacity
            style={styles.iconActionBtn}
            onPress={() => onDeleteTrack(item)}
            activeOpacity={0.7}
          >
            <Ionicons name="trash-outline" size={18} color={COLORS.nopeRed} />
          </TouchableOpacity>
        </View>
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

    if (playingTrackId === (item.spotify_track_id || item.id)) {
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
      setPlayingTrackId(item.spotify_track_id || item.id);
    } catch (e) {
      console.warn('Could not play playlist preview:', e.message);
    }
  };

  // Popup when tapping or swiping right on hamburger icon
  const handleSpotifyPlaylistPress = (item) => {
    Alert.alert(
      'Add to Spotify Playlist',
      `This feature is not yet implemented.\n\nWe're planning for this to allow you to add "${item.name}" directly to a specific playlist on Spotify once your Spotify user account is linked!`,
      [{ text: 'Got it', style: 'default' }]
    );
  };

  // Confirm and delete track from playlist
  const handleDeleteConfirmation = (item) => {
    Alert.alert(
      'Remove from Playlist',
      `Are you sure you want to remove "${item.name}" from your Liked Songs?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            if (playingTrackId === (item.spotify_track_id || item.id)) {
              stopModalAudio();
            }
            onDeleteTrack && onDeleteTrack(item);
          },
        },
      ]
    );
  };

  const handleClose = async () => {
    stopModalAudio();
    onClose();
  };

  const renderTrackItem = ({ item }) => {
    const isThisPlaying = playingTrackId === (item.spotify_track_id || item.id);

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
      <SafeAreaView style={styles.modalSafeContainer}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Liked Songs</Text>
            <Text style={styles.headerSubtitle}>
              {tracks.length} {tracks.length === 1 ? 'track' : 'tracks'} saved to your playlist
            </Text>
          </View>
          <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
            <Ionicons name="close" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Hint Banner */}
        <View style={styles.swipeHintBar}>
          <Ionicons name="swap-horizontal" size={14} color={COLORS.primary} />
          <Text style={styles.swipeHintText}>
            Swipe left to Delete · Swipe right to Add to Spotify
          </Text>
        </View>

        {/* Content */}
        {isLoading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        ) : tracks.length === 0 ? (
          <View style={styles.centerContainer}>
            <Ionicons name="heart-dislike-outline" size={56} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>No liked tracks yet</Text>
            <Text style={styles.emptySubtitle}>
              Swipe right on tracks you enjoy to build your custom playlist!
            </Text>
          </View>
        ) : (
          <FlatList
            data={tracks}
            keyExtractor={(item, index) => item.id || item.spotify_track_id || String(index)}
            renderItem={renderTrackItem}
            contentContainerStyle={styles.listContent}
            onRefresh={onRefresh}
            refreshing={isLoading}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalSafeContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    color: COLORS.textPrimary,
    fontSize: 22,
    fontWeight: '800',
  },
  headerSubtitle: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swipeHintBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    backgroundColor: 'rgba(29, 185, 84, 0.08)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(29, 185, 84, 0.15)',
  },
  swipeHintText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  listContent: {
    paddingVertical: 8,
  },
  rowContainer: {
    position: 'relative',
    overflow: 'hidden',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  backgroundActions: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    height: '100%',
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  actionLeftText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 13,
  },
  actionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.nopeRed,
    height: '100%',
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  actionRightText: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 13,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: COLORS.background,
  },
  artworkThumb: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: COLORS.cardBackground,
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
    marginBottom: 2,
  },
  trackArtist: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginBottom: 2,
  },
  trackDate: {
    color: COLORS.textMuted,
    fontSize: 11,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
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
  emptyTitle: {
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 14,
    marginBottom: 6,
  },
  emptySubtitle: {
    color: COLORS.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
