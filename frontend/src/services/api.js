import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Helper to determine the best default backend URL based on platform & environment
function getDefaultBackendUrl() {
  // If running in Expo Go on a physical device, expo-constants gives us the dev machine IP
  const debuggerHost = Constants.expoConfig?.hostUri;
  if (debuggerHost) {
    const ip = debuggerHost.split(':')[0];
    return `http://${ip}:3001`;
  }

  // iOS simulator can always reach localhost
  if (Platform.OS === 'ios') {
    return 'http://localhost:3001';
  }

  // Android emulator loopback
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3001';
  }

  return 'http://localhost:3001';
}

let activeBaseUrl = getDefaultBackendUrl();

export function setBackendUrl(url) {
  if (url && url.trim().length > 0) {
    activeBaseUrl = url.trim().replace(/\/+$/, '');
  }
}

export function getBackendUrl() {
  return activeBaseUrl;
}

export const api = {
  /**
   * Healthcheck to verify connectivity with the Express backend
   */
  async checkHealth() {
    try {
      const response = await fetch(`${activeBaseUrl}/api/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      return await response.json();
    } catch (error) {
      console.warn('API health check error:', error.message);
      return { status: 'offline', error: error.message };
    }
  },

  /**
   * Fetches tracks from the backend (which proxies Spotify Web API with client credentials)
   */
  async fetchTracks(query = 'top hits 2024', limit = 20) {
    const url = `${activeBaseUrl}/api/tracks?query=${encodeURIComponent(query)}&limit=${limit}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch tracks: ${response.statusText}`);
    }

    const data = await response.json();
    return data.tracks || [];
  },

  /**
   * Posts swipe action to backend (right-swipe saves track to user's playlist)
   */
  async swipeTrack({ track, direction = 'right', userId, playlistName = 'Liked Songs' }) {
    const response = await fetch(`${activeBaseUrl}/api/playlists/swipe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        track,
        direction,
        userId,
        playlistName,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to record swipe: ${response.statusText}`);
    }

    return await response.json();
  },

  /**
   * Fetches saved/liked tracks from backend
   */
  async getLikedPlaylist(userId, playlistName = 'Liked Songs') {
    const params = new URLSearchParams();
    if (userId) params.append('userId', userId);
    if (playlistName) params.append('playlistName', playlistName);

    const response = await fetch(`${activeBaseUrl}/api/playlists?${params.toString()}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Failed to get playlist: ${response.statusText}`);
    }

    const data = await response.json();
    return data.tracks || [];
  },
};
