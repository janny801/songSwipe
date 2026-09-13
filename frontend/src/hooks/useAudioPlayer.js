import { useState, useEffect, useRef, useCallback } from 'react';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

export function useAudioPlayer(activePreviewUrl) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(30);
  const playerRef = useRef(null);

  // Configure iOS audio session once
  useEffect(() => {
    async function initAudioMode() {
      try {
        await setAudioModeAsync({
          playsInSilentMode: true,
          shouldPlayInBackground: false,
        });
      } catch (e) {
        console.warn('Error setting iOS audio mode:', e.message);
      }
    }
    initAudioMode();
  }, []);

  const stopAudio = useCallback(() => {
    if (playerRef.current) {
      try {
        playerRef.current.pause();
        playerRef.current.remove();
      } catch (e) {}
      playerRef.current = null;
    }
    setIsPlaying(false);
    setProgress(0);
  }, []);

  useEffect(() => {
    stopAudio();

    if (!activePreviewUrl) {
      return;
    }

    try {
      const player = createAudioPlayer(activePreviewUrl, {
        updateInterval: 250,
      });
      playerRef.current = player;
      player.loop = true;
      player.play();
      setIsPlaying(true);

      const subscription = player.addListener('playbackStatusUpdate', (status) => {
        if (status) {
          if (status.playing !== undefined) {
            setIsPlaying(status.playing);
          }
          if (status.duration && status.currentTime !== undefined) {
            setDuration(status.duration);
            setProgress(status.currentTime / status.duration);
          }
        }
      });

      return () => {
        try {
          subscription?.remove();
        } catch (e) {}
        stopAudio();
      };
    } catch (err) {
      console.warn('Failed to load audio preview:', err.message);
      setIsPlaying(false);
    }
  }, [activePreviewUrl, stopAudio]);

  const togglePlayPause = useCallback(() => {
    if (!playerRef.current) return;
    try {
      if (isPlaying) {
        playerRef.current.pause();
        setIsPlaying(false);
      } else {
        playerRef.current.play();
        setIsPlaying(true);
      }
    } catch (e) {
      console.warn('Error toggling play/pause:', e.message);
    }
  }, [isPlaying]);

  return {
    isPlaying,
    progress,
    duration,
    togglePlayPause,
    stopAudio,
  };
}
