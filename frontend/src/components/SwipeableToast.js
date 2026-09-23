import React, { useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Animated,
  PanResponder,
  Platform,
} from 'react-native';
import { Ionicons, FontAwesome } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

export default function SwipeableToast({
  toastMessage,
  onDismiss,
  topOffset,
}) {
  const slideAnim = useRef(new Animated.Value(-70)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const panY = useRef(new Animated.Value(0)).current;
  const dismissTimerRef = useRef(null);
  const isDismissingRef = useRef(false);
  const wasVisibleRef = useRef(false);

  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  const clearTimer = () => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  };

  const dismissToast = (velocity = 0) => {
    if (isDismissingRef.current) return;
    isDismissingRef.current = true;
    clearTimer();

    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: -90,
        duration: 160,
        useNativeDriver: true,
      }),
    ]).start(() => {
      panY.setValue(0);
      slideAnim.setValue(-70);
      wasVisibleRef.current = false;
      isDismissingRef.current = false;
      onDismissRef.current && onDismissRef.current();
    });
  };

  const dismissToastRef = useRef(dismissToast);
  dismissToastRef.current = dismissToast;

  const startAutoDismissTimer = () => {
    clearTimer();
    dismissTimerRef.current = setTimeout(() => {
      dismissToastRef.current && dismissToastRef.current();
    }, 2600);
  };

  const startAutoDismissTimerRef = useRef(startAutoDismissTimer);
  startAutoDismissTimerRef.current = startAutoDismissTimer;

  // PanResponder to handle swipe up to dismiss
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only capture vertical gestures with meaningful upward movement
        return (
          Math.abs(gestureState.dy) > 4 &&
          Math.abs(gestureState.dy) > Math.abs(gestureState.dx)
        );
      },
      onPanResponderGrant: () => {
        clearTimer();
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy <= 0) {
          // Dragging up: follow finger
          panY.setValue(gestureState.dy);
        } else {
          // Dragging down: apply subtle rubber-band resistance
          panY.setValue(gestureState.dy * 0.2);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        // If swiped up beyond 18px or flicked upward with velocity
        if (
          gestureState.dy < -18 ||
          (gestureState.dy < -5 && gestureState.vy < -0.25)
        ) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          dismissToastRef.current && dismissToastRef.current(gestureState.vy);
        } else {
          // Spring back to resting position
          Animated.spring(panY, {
            toValue: 0,
            friction: 8,
            tension: 50,
            useNativeDriver: true,
          }).start();
          startAutoDismissTimerRef.current && startAutoDismissTimerRef.current();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(panY, {
          toValue: 0,
          friction: 8,
          tension: 50,
          useNativeDriver: true,
        }).start();
        startAutoDismissTimerRef.current && startAutoDismissTimerRef.current();
      },
    })
  ).current;

  // Watch toastMessage changes
  useEffect(() => {
    if (toastMessage) {
      isDismissingRef.current = false;
      panY.setValue(0);
      clearTimer();

      if (!wasVisibleRef.current) {
        slideAnim.setValue(-70);
        fadeAnim.setValue(0);
      }
      wasVisibleRef.current = true;

      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          friction: 8,
          tension: 50,
          useNativeDriver: true,
        }),
      ]).start();

      startAutoDismissTimer();
    } else {
      wasVisibleRef.current = false;
      clearTimer();
    }

    return () => {
      clearTimer();
    };
  }, [toastMessage]);

  if (!toastMessage) return null;

  const combinedTranslateY = Animated.add(slideAnim, panY);

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        styles.toastContainer,
        topOffset !== undefined && { top: topOffset },
        {
          opacity: fadeAnim,
          transform: [{ translateY: combinedTranslateY }],
        },
      ]}
    >
      <View style={styles.toastIconWrapper}>
        <FontAwesome name={toastMessage.icon || 'spotify'} size={20} color="#1DB954" />
      </View>
      <View style={styles.toastTextWrapper}>
        <Text style={styles.toastTitle} numberOfLines={1}>
          {toastMessage.title || 'Added to Spotify'}
        </Text>
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
  );
}

const styles = StyleSheet.create({
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
