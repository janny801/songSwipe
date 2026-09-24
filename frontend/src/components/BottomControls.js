import React from 'react';
import { StyleSheet, View, TouchableOpacity, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOWS } from '../constants/theme';

export default function BottomControls({
  onPass,
  onLike,
  isPlaying,
  onTogglePlayPause,
  onOpenPlaylist,
  onUndo,
  canUndo = false,
  likedCount = 0,
  disabled = false,
}) {
  return (
    <View style={styles.controlsContainer}>
      {/* Pass / Dislike (Swipe Left) */}
      <TouchableOpacity
        style={[styles.actionBtn, styles.passBtn, disabled && styles.btnDisabled]}
        onPress={onPass}
        disabled={disabled}
        activeOpacity={0.7}
      >
        <Ionicons name="close" size={30} color={COLORS.nopeRed} />
      </TouchableOpacity>

      {/* Play / Pause Audio Preview */}
      <TouchableOpacity
        style={[
          styles.actionBtn,
          styles.playPauseBtn,
          isPlaying && styles.playingBtn,
          disabled && styles.btnDisabled,
        ]}
        onPress={onTogglePlayPause}
        disabled={disabled}
        activeOpacity={0.8}
      >
        <Ionicons
          name={isPlaying ? 'pause' : 'play'}
          size={26}
          color={isPlaying ? '#000' : COLORS.textPrimary}
          style={!isPlaying ? { marginLeft: 3 } : null}
        />
      </TouchableOpacity>

      {/* Like (Swipe Right) */}
      <TouchableOpacity
        style={[styles.actionBtn, styles.likeBtn, disabled && styles.btnDisabled]}
        onPress={onLike}
        disabled={disabled}
        activeOpacity={0.7}
      >
        <Ionicons name="heart" size={30} color={COLORS.likeGreen} />
      </TouchableOpacity>

      {/* Undo the most recent swipe */}
      <TouchableOpacity
        style={[styles.actionBtn, styles.undoBtn, !canUndo && styles.btnDisabled]}
        onPress={onUndo}
        disabled={!canUndo}
        activeOpacity={0.8}
        accessibilityLabel="Undo last swipe"
      >
        <Ionicons name="arrow-undo" size={22} color={canUndo ? COLORS.textPrimary : COLORS.textMuted} />
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.actionBtn, styles.playlistBtn]}
        onPress={onOpenPlaylist}
        activeOpacity={0.8}
      >
        <Ionicons name="musical-notes" size={24} color={COLORS.textPrimary} />
        {likedCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{likedCount > 99 ? '99+' : likedCount}</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  controlsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  actionBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.cardBackground,
    borderWidth: 1,
    ...SHADOWS.button,
  },
  passBtn: {
    borderColor: 'rgba(233, 20, 41, 0.3)',
  },
  playPauseBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: COLORS.surface,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  playingBtn: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  likeBtn: {
    borderColor: 'rgba(29, 185, 84, 0.3)',
  },
  playlistBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    position: 'relative',
  },
  undoBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  btnDisabled: {
    opacity: 0.4,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 2,
    borderColor: COLORS.background,
  },
  badgeText: {
    color: '#000',
    fontSize: 10,
    fontWeight: '800',
  },
});
