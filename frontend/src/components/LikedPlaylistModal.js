import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  FlatList,
  Image,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createAudioPlayer } from 'expo-audio';
import { COLORS } from '../constants/theme';

export default function LikedPlaylistModal({
  visible,
  onClose,
  tracks = [],
  isLoading = false,
  onRefresh,
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

  const handleClose = async () => {
    await stopModalAudio();
    onClose();
  };

  const renderTrackItem = ({ item }) => {
    const isThisPlaying = playingTrackId === (item.spotify_track_id || item.id);
    const dateFormatted = item.swiped_at
      ? new Date(item.swiped_at).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
        })
      : null;

    return (
      <View style={styles.trackRow}>
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

        {/* Play preview button */}
        {(item.preview_url || item.previewUrl) && (
          <TouchableOpacity
            style={[styles.playBtn, isThisPlaying && styles.playingBtn]}
            onPress={() => handlePlayPreview(item)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={isThisPlaying ? 'pause' : 'play'}
              size={18}
              color={isThisPlaying ? '#000' : COLORS.textPrimary}
              style={!isThisPlaying ? { marginLeft: 2 } : null}
            />
          </TouchableOpacity>
        )}
      </View>
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
    paddingVertical: 18,
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
  listContent: {
    padding: 16,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  artworkThumb: {
    width: 52,
    height: 52,
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
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  trackArtist: {
    color: COLORS.textSecondary,
    fontSize: 14,
    marginBottom: 2,
  },
  trackDate: {
    color: COLORS.textMuted,
    fontSize: 11,
  },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
