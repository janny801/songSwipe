import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Helper to determine the best default backend URL based on platform & environment
function getDefaultBackendUrl() {
  // If running in Expo Go on a physical device, expo-constants gives us the dev machine IP
  const debuggerHost =
    Constants.expoConfig?.hostUri ||
    Constants.manifest2?.extra?.expoGo?.debuggerHost ||
    Constants.manifest?.debuggerHost ||
    Constants.linkingUri;

  if (debuggerHost) {
    const cleanHost = String(debuggerHost).replace(/^[a-z]+:\/\//, '');
    const ip = cleanHost.split(':')[0].split('/')[0];

    // If running via Expo Tunnel, route backend to our active tunnel
    if (cleanHost.includes('exp.direct') || cleanHost.includes('ngrok')) {
      return 'https://unsolar-shirl-enquiringly.ngrok-free.dev';
    }

    if (ip && ip !== 'localhost' && ip !== '127.0.0.1') {
      return `http://${ip}:3001`;
    }
  }

  // Fallback to active backend tunnel
  return 'https://unsolar-shirl-enquiringly.ngrok-free.dev';
}

let activeBaseUrl = getDefaultBackendUrl();
let activeAuthToken = null;

export function setBackendUrl(url) {
  if (url && url.trim().length > 0) {
    activeBaseUrl = url.trim().replace(/\/+$/, '');
  }
}

export function getBackendUrl() {
  return activeBaseUrl;
}

export function setAuthToken(token) {
  activeAuthToken = token;
}

export function getAuthToken() {
  return activeAuthToken;
}

function getHeaders(extraHeaders = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...extraHeaders,
  };
  if (activeAuthToken) {
    headers['Authorization'] = `Bearer ${activeAuthToken}`;
  }
  return headers;
}

// Resilient fetch with a timeout to prevent infinite UI loading spinners
async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Connection timed out after ${timeoutMs / 1000}s. Make sure backend is running.`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  /**
   * Healthcheck to verify connectivity with the Express backend
   */
  async checkHealth() {
    try {
      const response = await fetchWithTimeout(`${activeBaseUrl}/api/health`, {
        method: 'GET',
        headers: getHeaders(),
      }, 5000);
      return await response.json();
    } catch (error) {
      console.warn('API health check error:', error.message);
      return { status: 'offline', error: error.message };
    }
  },

  // ==================== AUTHENTICATION ====================

  /**
   * Register with Email, Username & Password
   */
  async register({ email, password, displayName }) {
    const response = await fetchWithTimeout(`${activeBaseUrl}/api/auth/register`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ email, password, displayName }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Registration failed');
    }
    if (data.token) {
      setAuthToken(data.token);
    }
    return data;
  },

  /**
   * Sign in with Email or Username & Password
   */
  async login({ email, password }) {
    const response = await fetchWithTimeout(`${activeBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Login failed');
    }
    if (data.token) {
      setAuthToken(data.token);
    }
    return data;
  },

  /**
   * Sign in / Sign up with Google OAuth
   */
  async googleAuth({ idToken, userProfile }) {
    const response = await fetchWithTimeout(`${activeBaseUrl}/api/auth/google`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ idToken, userProfile }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Google authentication failed');
    }
    if (data.token) {
      setAuthToken(data.token);
    }
    return data;
  },

  /**
   * Get current authenticated user profile
   */
  async getMe() {
    if (!activeAuthToken) return null;
    try {
      const response = await fetchWithTimeout(`${activeBaseUrl}/api/auth/me`, {
        method: 'GET',
        headers: getHeaders(),
      }, 5000);

      if (!response.ok) return null;
      const data = await response.json();
      return data.user;
    } catch (e) {
      return null;
    }
  },

  // ==================== TRACKS & PLAYLISTS ====================

  /**
   * Fetches tracks from the backend
   */
  async fetchTracks(query = '', limit = 10) {
    const url = `${activeBaseUrl}/api/tracks?query=${encodeURIComponent(query)}&limit=${limit}`;
    const response = await fetchWithTimeout(url, {
      method: 'GET',
      headers: getHeaders(),
    }, 8000);

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
    const response = await fetchWithTimeout(`${activeBaseUrl}/api/playlists/swipe`, {
      method: 'POST',
      headers: getHeaders(),
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

    const response = await fetchWithTimeout(`${activeBaseUrl}/api/playlists?${params.toString()}`, {
      method: 'GET',
      headers: getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to get playlist: ${response.statusText}`);
    }

    const data = await response.json();
    return data.tracks || [];
  },

  /**
   * Delete a track from user's playlist
   */
  async deleteFromPlaylist(trackId, userId, playlistName = 'Liked Songs') {
    const params = new URLSearchParams();
    if (userId) params.append('userId', userId);
    if (playlistName) params.append('playlistName', playlistName);

    const response = await fetchWithTimeout(
      `${activeBaseUrl}/api/playlists/${encodeURIComponent(trackId)}?${params.toString()}`,
      {
        method: 'DELETE',
        headers: getHeaders(),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to remove track: ${response.statusText}`);
    }

    return await response.json();
  },

  /**
   * Update unique username (display_name) for the authenticated user
   */
  async updateUsername(username) {
    const response = await fetchWithTimeout(`${activeBaseUrl}/api/users/username`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ username }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to update username');
    }
    return data;
  },
};
