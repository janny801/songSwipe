import React, { useRef, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Dimensions,
  Animated,
  PanResponder,
  Text,
  TouchableOpacity,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import TrackCard from './TrackCard';
import { COLORS } from '../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = Math.min(SCREEN_WIDTH * 0.28, 110);
const SWIPE_OUT_DURATION = 250;

const CardDeck = React.forwardRef(function CardDeck(
  {
    tracks = [],
    currentIndex = 0,
    onSwipeLeft,
    onSwipeRight,
    onReset,
    isPlaying = false,
    progress = 0,
    onAddToPlaylist,
  },
  ref
) {
  const position = useRef(new Animated.ValueXY()).current;
  const hapticFiredRef = useRef(false);

  const currentIndexRef = useRef(currentIndex);
  const tracksRef = useRef(tracks);
  const onSwipeRightRef = useRef(onSwipeRight);
  const onSwipeLeftRef = useRef(onSwipeLeft);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);

  useEffect(() => {
    onSwipeRightRef.current = onSwipeRight;
  }, [onSwipeRight]);

  useEffect(() => {
    onSwipeLeftRef.current = onSwipeLeft;
  }, [onSwipeLeft]);

  const onSwipeComplete = useCallback(
    (direction) => {
      const idx = currentIndexRef.current;
      const currentTrack = tracksRef.current[idx];
      position.setValue({ x: 0, y: 0 });
      hapticFiredRef.current = false;

      if (direction === 'right') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        onSwipeRightRef.current && onSwipeRightRef.current(currentTrack);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        onSwipeLeftRef.current && onSwipeLeftRef.current(currentTrack);
      }
    },
    [position]
  );

  const forceSwipe = useCallback(
    (direction) => {
      const x = direction === 'right' ? SCREEN_WIDTH + 100 : -SCREEN_WIDTH - 100;
      Animated.timing(position, {
        toValue: { x, y: 0 },
        duration: SWIPE_OUT_DURATION,
        useNativeDriver: false,
      }).start(() => onSwipeComplete(direction));
    },
    [position, onSwipeComplete]
  );

  const forceSwipeRef = useRef(forceSwipe);
  useEffect(() => {
    forceSwipeRef.current = forceSwipe;
  }, [forceSwipe]);

  // Expose swipeLeft and swipeRight methods to parent via ref
  React.useImperativeHandle(ref, () => ({
    swipeLeft: () => forceSwipe('left'),
    swipeRight: () => forceSwipe('right'),
  }));

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gesture) => {
        position.setValue({ x: gesture.dx, y: gesture.dy });

        // Trigger light haptic feedback once threshold is crossed
        if (Math.abs(gesture.dx) > SWIPE_THRESHOLD && !hapticFiredRef.current) {
          hapticFiredRef.current = true;
          Haptics.selectionAsync().catch(() => {});
        } else if (Math.abs(gesture.dx) < SWIPE_THRESHOLD && hapticFiredRef.current) {
          hapticFiredRef.current = false;
        }
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > SWIPE_THRESHOLD || gesture.vx > 0.8) {
          forceSwipeRef.current('right');
        } else if (gesture.dx < -SWIPE_THRESHOLD || gesture.vx < -0.8) {
          forceSwipeRef.current('left');
        } else {
          // Spring back to center
          Animated.spring(position, {
            toValue: { x: 0, y: 0 },
            friction: 5,
            tension: 40,
            useNativeDriver: false,
          }).start();
        }
      },
    })
  ).current;

  // Reset position if index resets
  useEffect(() => {
    position.setValue({ x: 0, y: 0 });
  }, [currentIndex, position]);

  // Interpolations for card animation
  const rotate = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH * 1.5, 0, SCREEN_WIDTH * 1.5],
    outputRange: ['-20deg', '0deg', '20deg'],
  });

  const animatedCardStyle = {
    transform: [{ translateX: position.x }, { translateY: position.y }, { rotate }],
  };

  const nextCardScale = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
    outputRange: [1, 0.94, 1],
    extrapolate: 'clamp',
  });

  const nextCardOpacity = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
    outputRange: [1, 0.65, 1],
    extrapolate: 'clamp',
  });

  const likeOpacity = position.x.interpolate({
    inputRange: [10, SCREEN_WIDTH / 4],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const nopeOpacity = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH / 4, -10],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  // Empty state when all tracks have been swiped
  if (currentIndex >= tracks.length) {
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconCircle}>
          <Ionicons name="sparkles" size={44} color={COLORS.primary} />
        </View>
        <Text style={styles.emptyTitle}>You've swiped all songs!</Text>
        <Text style={styles.emptySubtitle}>
          Check your saved playlist or reload new music discoveries.
        </Text>
        <TouchableOpacity style={styles.resetButton} onPress={onReset} activeOpacity={0.8}>
          <Ionicons name="reload" size={18} color="#000" />
          <Text style={styles.resetButtonText}>Refresh Songs</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const currentTrack = tracks[currentIndex];
  const nextTrack = tracks[currentIndex + 1];

  return (
    <View style={styles.deckContainer}>
      {/* Background Peeking Card */}
      {nextTrack && (
        <Animated.View
          style={[
            styles.cardWrapper,
            {
              transform: [{ scale: nextCardScale }],
              opacity: nextCardOpacity,
              zIndex: 1,
            },
          ]}
        >
          <TrackCard track={nextTrack} isTopCard={false} />
        </Animated.View>
      )}

      {/* Foreground Interactive Card */}
      <Animated.View
        style={[styles.cardWrapper, animatedCardStyle, { zIndex: 2 }]}
        {...panResponder.panHandlers}
      >
        <TrackCard
          track={currentTrack}
          isTopCard={true}
          isPlaying={isPlaying}
          progress={progress}
          likeOpacity={likeOpacity}
          nopeOpacity={nopeOpacity}
          onAddToPlaylist={onAddToPlaylist}
        />
      </Animated.View>
    </View>
  );
});

export default CardDeck;

const styles = StyleSheet.create({
  deckContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardWrapper: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
  },
  emptyIconCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(29, 185, 84, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    color: COLORS.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtitle: {
    color: COLORS.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 30,
  },
  resetButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '700',
  },
});
