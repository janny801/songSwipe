import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  Image,
  Dimensions,
  Animated,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOWS } from '../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = Math.min(SCREEN_WIDTH * 0.9, 390);
const CARD_HEIGHT = CARD_WIDTH * 1.45;

export default function TrackCard({
  track,
  isTopCard = false,
  isPlaying = false,
  progress = 0,
  likeOpacity = 0,
  nopeOpacity = 0,
  onAddToPlaylist,
}) {
  if (!track) return null;

  return (
    <View style={styles.cardContainer}>
      {/* Background Album Image */}
      <Image
        source={{
          uri:
            track.album_art_url ||
            track.albumArtUrl ||
            'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800',
        }}
        style={styles.artwork}
        resizeMode="cover"
      />

      {/* Subtle Top Gradient for status and badges */}
      <LinearGradient
        colors={['rgba(0,0,0,0.6)', 'transparent']}
        style={styles.topGradient}
      />

      {/* Deep Bottom Gradient for readability of song title & metadata */}
      <LinearGradient
        colors={['transparent', 'rgba(18, 18, 18, 0.85)', '#121212']}
        style={styles.bottomGradient}
      />

      {/* Audio Status Pill */}
      <View style={styles.audioBadge}>
        <Ionicons
          name={isPlaying ? 'musical-notes' : 'play-circle-outline'}
          size={16}
          color={isPlaying ? COLORS.primary : COLORS.textSecondary}
        />
        <Text
          style={[
            styles.audioBadgeText,
            isPlaying && { color: COLORS.primary, fontWeight: '700' },
          ]}
        >
          {isPlaying ? 'Playing 30s Preview' : 'Preview Paused'}
        </Text>
      </View>

      {/* Add to Playlist button on top right of active card */}
      {isTopCard && onAddToPlaylist && (
        <TouchableOpacity
          style={styles.cardAddToPlaylistBtn}
          onPress={() => onAddToPlaylist(track)}
          activeOpacity={0.8}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="folder-open-outline" size={17} color={COLORS.primary} />
        </TouchableOpacity>
      )}

      {/* Swipe Badges (Visible on Drag) */}
      {isTopCard && (
        <>
          <Animated.View
            style={[
              styles.choiceBadge,
              styles.likeBadge,
              { opacity: likeOpacity },
            ]}
          >
            <Text style={[styles.choiceText, styles.likeText]}>LIKE</Text>
          </Animated.View>

          <Animated.View
            style={[
              styles.choiceBadge,
              styles.nopeBadge,
              { opacity: nopeOpacity },
            ]}
          >
            <Text style={[styles.choiceText, styles.nopeText]}>PASS</Text>
          </Animated.View>
        </>
      )}

      {/* Track Info Overlay */}
      <View style={styles.infoContainer}>
        <View style={styles.genreRow}>
          {track.genre ? (
            <View style={styles.genreTag}>
              <Text style={styles.genreText}>{track.genre}</Text>
            </View>
          ) : (
            <View style={styles.genreTag}>
              <Ionicons name="disc-outline" size={13} color={COLORS.primary} />
              <Text style={styles.genreText}>Spotify Preview</Text>
            </View>
          )}
        </View>

        <Text style={styles.trackName} numberOfLines={2}>
          {track.name}
        </Text>

        <Text style={styles.artistName} numberOfLines={1}>
          {track.artist}
        </Text>

        {track.album ? (
          <Text style={styles.albumName} numberOfLines={1}>
            <Ionicons name="albums-outline" size={13} color={COLORS.textMuted} />{' '}
            {track.album}
          </Text>
        ) : null}

        {/* Audio Progress Bar at bottom of active card */}
        {isTopCard && (
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressBar,
                { width: `${Math.min(Math.max(progress * 100, 0), 100)}%` },
              ]}
            />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 24,
    backgroundColor: COLORS.cardBackground,
    overflow: 'hidden',
    position: 'relative',
    ...SHADOWS.card,
  },
  artwork: {
    width: '100%',
    height: '100%',
  },
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 100,
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 240,
  },
  audioBadge: {
    position: 'absolute',
    top: 18,
    left: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  audioBadgeText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  cardAddToPlaylistBtn: {
    position: 'absolute',
    top: 18,
    right: 18,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    zIndex: 10,
  },
  choiceBadge: {
    position: 'absolute',
    top: 50,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 3.5,
    zIndex: 99,
  },
  likeBadge: {
    left: 24,
    borderColor: COLORS.likeGreen,
    transform: [{ rotate: '-18deg' }],
  },
  nopeBadge: {
    right: 24,
    borderColor: COLORS.nopeRed,
    transform: [{ rotate: '18deg' }],
  },
  choiceText: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  likeText: {
    color: COLORS.likeGreen,
  },
  nopeText: {
    color: COLORS.nopeRed,
  },
  infoContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
  },
  genreRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  genreTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  genreText: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  trackName: {
    color: COLORS.textPrimary,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  artistName: {
    color: COLORS.textSecondary,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  albumName: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 12,
  },
  progressTrack: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 4,
  },
  progressBar: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 2,
  },
});
