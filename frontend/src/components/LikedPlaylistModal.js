import React, { useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { createAudioPlayer } from 'expo-audio';
import { COLORS } from '../constants/theme';

function TrackRow({
  item,
  isPlaying,
  onPlayPreview,
  onDeleteTrack,
  onSpotifyPlaylistPress,
}) {
  const dateFormatted = item.swiped_at
    ? new Date(item.swiped_at).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      })
    : null;

  return (
    <View style={styles.trackRow}>
      {/* Artwork */}
      <Image
        source={{
          uri:
            item.album_art_url ||
            item.albumArtUrl ||
            'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400',
        }}
        style={styles.artworkThumb}
      />

      {/* Track Details */}
      <View style={styles.trackDetails}>
        <Text style={styles.trackTitle} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.trackArtist} numberOfLines={1}>
          {item.artist}
        </Text>
        {dateFormatted && <Text style={styles.trackDate}>Saved {dateFormatted}</Text>}
      </View>

      {/* Action Buttons Row */}
      <View style={styles.actionsGroup}>
        {/* 1. Hamburger Icon Button (Add to Spotify playlist) */}
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => onSpotifyPlaylistPress(item)}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="menu" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>

        {/* 2. Play / Pause 30s Audio Preview */}
        {(item.preview_url || item.previewUrl) && (
          <TouchableOpacity
            style={[styles.playBtn, isPlaying && styles.playingBtn]}
            onPress={() => onPlayPreview(item)}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={15}
              color={isPlaying ? '#000' : COLORS.textPrimary}
              style={!isPlaying ? { marginLeft: 2 } : null}
            />
          </TouchableOpacity>
        )}

        {/* 3. Delete Track Button */}
        <TouchableOpacity
          style={[styles.actionBtn, styles.deleteBtn]}
          onPress={() => onDeleteTrack(item)}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="trash-outline" size={19} color={COLORS.nopeRed} />
        </TouchableOpacity>
      </View>
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

  // Popup when clicking the hamburger icon
  const handleSpotifyPlaylistPress = (item) => {
    Alert.alert(
      'Add to Spotify Playlist',
      `This feature is not yet implemented.\n\nWe're planning for this to allow you to add "${item.name}" to a specific playlist on Spotify.`,
      [{ text: 'OK', style: 'default' }]
    );
  };

  // Confirm before deleting track from playlist
  const handleDeleteConfirmation = (item) => {
    Alert.alert(
      'Remove from Playlist',
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
      <TrackRow
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
  listContent: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 8,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardBackground,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  artworkThumb: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
  },
  trackDetails: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
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
  actionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  deleteBtn: {
    backgroundColor: 'rgba(233, 20, 41, 0.1)',
    borderColor: 'rgba(233, 20, 41, 0.3)',
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
    borderColor: COLORS.primary,
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
