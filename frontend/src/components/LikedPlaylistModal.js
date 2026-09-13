import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  FlatList,
  ScrollView,
  Dimensions,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { createAudioPlayer } from 'expo-audio';
import { COLORS } from '../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ACTION_WIDTH = 80;
const CARD_WIDTH = SCREEN_WIDTH - 28;

function SwipeableTrackRow({
  item,
  isPlaying,
  onPlayPreview,
  onDeleteTrack,
  onSpotifyPlaylistPress,
}) {
  const scrollRef = useRef(null);

  // Position at ACTION_WIDTH initial offset so only the center card is visible
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({ x: ACTION_WIDTH, animated: false });
    }, 40);
    return () => clearTimeout(timer);
  }, []);

  const handleScrollEndDrag = (e) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    if (offsetX <= 15) {
      // Swiped right fully -> Trigger Spotify Playlist
      Haptics.selectionAsync().catch(() => {});
      setTimeout(() => {
        scrollRef.current?.scrollTo({ x: ACTION_WIDTH, animated: true });
        onSpotifyPlaylistPress(item);
      }, 150);
    } else if (offsetX >= ACTION_WIDTH * 2 - 15) {
      // Swiped left fully -> Trigger Delete
      Haptics.selectionAsync().catch(() => {});
      setTimeout(() => {
        scrollRef.current?.scrollTo({ x: ACTION_WIDTH, animated: true });
        onDeleteTrack(item);
      }, 150);
    }
  };

  const handleSpotifyTap = () => {
    scrollRef.current?.scrollTo({ x: ACTION_WIDTH, animated: true });
    onSpotifyPlaylistPress(item);
  };

  const handleDeleteTap = () => {
    scrollRef.current?.scrollTo({ x: ACTION_WIDTH, animated: true });
    onDeleteTrack(item);
  };

  const dateFormatted = item.swiped_at
    ? new Date(item.swiped_at).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      })
    : null;

  return (
    <View style={styles.rowContainer}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        bounces={false}
        decelerationRate="fast"
        snapToOffsets={[0, ACTION_WIDTH, ACTION_WIDTH * 2]}
        contentOffset={{ x: ACTION_WIDTH, y: 0 }}
        onScrollEndDrag={handleScrollEndDrag}
        style={styles.horizontalScrollView}
        contentContainerStyle={{ width: CARD_WIDTH + ACTION_WIDTH * 2 }}
      >
        {/* Left Action: Spotify Playlist (Revealed on Swipe Right) */}
        <TouchableOpacity
          style={[styles.scrollAction, styles.scrollActionSpotify]}
          activeOpacity={0.8}
          onPress={handleSpotifyTap}
        >
          <Ionicons name="menu" size={24} color="#000" />
          <Text style={styles.scrollActionSpotifyText}>Spotify</Text>
        </TouchableOpacity>

        {/* Center Main Card */}
        <View style={[styles.trackRow, { width: CARD_WIDTH }]}>
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

          {/* Play / Pause 30s Audio Preview Button */}
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
        </View>

        {/* Right Action: Delete Track (Revealed on Swipe Left) */}
        <TouchableOpacity
          style={[styles.scrollAction, styles.scrollActionDelete]}
          activeOpacity={0.8}
          onPress={handleDeleteTap}
        >
          <Ionicons name="trash-outline" size={22} color="#FFF" />
          <Text style={styles.scrollActionDeleteText}>Delete</Text>
        </TouchableOpacity>
      </ScrollView>
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

  // Popup when clicking/sliding for Spotify
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
              <Ionicons name="arrow-forward-circle" size={15} color={COLORS.primary} />
              <Text style={styles.guideText}>Slide right for Spotify</Text>
            </View>
            <Text style={styles.guideDot}>•</Text>
            <View style={styles.guideItem}>
              <Ionicons name="arrow-back-circle" size={15} color={COLORS.nopeRed} />
              <Text style={styles.guideText}>Slide left to delete</Text>
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
            keyboardShouldPersistTaps="handled"
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
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    paddingVertical: 9,
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
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 8,
  },
  rowContainer: {
    borderRadius: 14,
    overflow: 'hidden',
    marginVertical: 4,
    backgroundColor: COLORS.cardBackground,
  },
  horizontalScrollView: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  scrollAction: {
    width: ACTION_WIDTH,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  scrollActionSpotify: {
    backgroundColor: COLORS.primary,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
  },
  scrollActionSpotifyText: {
    color: '#000',
    fontSize: 12,
    fontWeight: '800',
  },
  scrollActionDelete: {
    backgroundColor: COLORS.nopeRed,
    borderTopRightRadius: 14,
    borderBottomRightRadius: 14,
  },
  scrollActionDeleteText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '800',
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
