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
let activeUserId = null;

export function setBackendUrl(url) {
  if (url && url.trim().length > 0) {
    activeBaseUrl = url.trim().replace(/\/+$/, '');
  }
}

export function getBackendUrl() {
  return activeBaseUrl;
}

export function setAuthToken(token, user = null) {
  activeAuthToken = token;
  if (user && user.id) {
    activeUserId = user.id;
  } else if (!token) {
    activeUserId = null;
  }
}

export function setAuthUserId(userId) {
  activeUserId = userId;
}

export function getAuthUserId() {
  return activeUserId;
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
  if (activeUserId) {
    headers['X-User-Id'] = activeUserId;
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
  async fetchTracks(query = '', limit = 10, genre = '', userId = null) {
    const params = new URLSearchParams();
    if (query) params.append('query', query);
    if (limit) params.append('limit', limit);
    if (genre) params.append('genre', genre);
    if (userId) params.append('userId', userId);
    params.append('_t', Date.now().toString());

    const url = `${activeBaseUrl}/api/tracks?${params.toString()}`;
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
    params.append('_t', Date.now().toString());

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

  /**
   * Update favorite genres for the authenticated user
   */
  async updateGenres(genres) {
    const response = await fetchWithTimeout(`${activeBaseUrl}/api/users/genres`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ genres }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to update genres');
    }
    return data;
  },

  /**
   * Get Spotify OAuth URL to link account
   */
  async getSpotifyAuthUrl(returnUri = null) {
    const params = new URLSearchParams();
    if (returnUri) params.append('return_uri', returnUri);
    const query = params.toString() ? `?${params.toString()}` : '';

    const response = await fetchWithTimeout(`${activeBaseUrl}/api/users/spotify/login${query}`, {
      method: 'GET',
      headers: getHeaders(),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Failed to initiate Spotify login');
    }
    return data.authUrl;
  },

  /**
   * Disconnect / unlink Spotify account
   */
  async disconnectSpotify() {
    const response = await fetchWithTimeout(`${activeBaseUrl}/api/users/spotify/disconnect`, {
      method: 'POST',
      headers: getHeaders(),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Failed to disconnect Spotify account');
    }
    return data;
  },

  /**
   * Fetch custom playlists created by user on profile
   */
  async getCustomPlaylists(trackId = null, userId = null) {
    const targetUserId = userId || activeUserId;
    const params = new URLSearchParams();
    if (trackId) params.append('trackId', trackId);
    if (targetUserId) params.append('userId', targetUserId);
    const query = params.toString() ? `?${params.toString()}` : '';

    const response = await fetchWithTimeout(`${activeBaseUrl}/api/playlists/custom${query}`, {
      method: 'GET',
      headers: getHeaders(),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to fetch custom playlists');
    }
    return data.playlists || [];
  },

  /**
   * Create a new custom playlist on user's profile
   */
  async createCustomPlaylist(name, userId = null) {
    const targetUserId = userId || activeUserId;
    const response = await fetchWithTimeout(`${activeBaseUrl}/api/playlists/custom`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ name, userId: targetUserId }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to create custom playlist');
    }
    return data.playlist;
  },

  /**
   * Delete a custom playlist created on user's profile
   */
  async deleteCustomPlaylist(name, userId = null) {
    const targetUserId = userId || activeUserId;
    const query = targetUserId ? `?userId=${encodeURIComponent(targetUserId)}` : '';
    const response = await fetchWithTimeout(
      `${activeBaseUrl}/api/playlists/custom/${encodeURIComponent(name)}${query}`,
      {
        method: 'DELETE',
        headers: getHeaders(),
      }
    );

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to delete custom playlist');
    }
    return data;
  },

  /**
   * Add a song to multiple user-created playlists (multiselect)
   */
  async addToPlaylists({ track, playlistNames, userId = null }) {
    const targetUserId = userId || activeUserId;
    const response = await fetchWithTimeout(`${activeBaseUrl}/api/playlists/add-to-playlists`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ track, playlistNames, userId: targetUserId }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to add song to playlists');
    }
    return data;
  },

  /**
   * Get tracks for a specific custom playlist
   */
  async getPlaylistTracks(userId, playlistName) {
    const targetUserId = userId || activeUserId;
    const params = new URLSearchParams();
    if (targetUserId) params.append('userId', targetUserId);
    if (playlistName) params.append('playlistName', playlistName);

    const response = await fetchWithTimeout(
      `${activeBaseUrl}/api/playlists?${params.toString()}`,
      {
        method: 'GET',
        headers: getHeaders(),
      }
    );

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to load playlist tracks');
    }
    return data.tracks || [];
  },

  /**
   * Fetch playlists that user created on their Spotify account
   */
  async getSpotifyPlaylists(userId = null) {
    const targetUserId = userId || activeUserId;
    const query = targetUserId ? `?userId=${encodeURIComponent(targetUserId)}` : '';
    const response = await fetchWithTimeout(`${activeBaseUrl}/api/playlists/spotify${query}`, {
      method: 'GET',
      headers: getHeaders(),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to load Spotify playlists');
    }
    return data;
  },

  /**
   * Add a track to one or more user-created Spotify playlists
   */
  async addTrackToSpotifyPlaylists({ track, playlistIds, userId = null }) {
    const targetUserId = userId || activeUserId;
    const response = await fetchWithTimeout(`${activeBaseUrl}/api/playlists/spotify/add`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ track, playlistIds, userId: targetUserId }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to add song to Spotify playlists');
    }
    return data;
  },

  /**
   * Create a new playlist on user's Spotify account
   */
  async createSpotifyPlaylist(name, isPublic = false, userId = null) {
    const targetUserId = userId || activeUserId;
    const response = await fetchWithTimeout(`${activeBaseUrl}/api/playlists/spotify/create`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ name, isPublic, userId: targetUserId }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to create playlist on Spotify');
    }
    return data.playlist;
  },

  /**
   * Update Spotify auto-sync settings (e.g. auto-save liked songs to Spotify)
   */
  async updateSpotifySyncSettings(autoSaveSpotifyLikes, userId = null) {
    const targetUserId = userId || activeUserId;
    const response = await fetchWithTimeout(`${activeBaseUrl}/api/users/spotify/sync-settings`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ autoSaveSpotifyLikes, userId: targetUserId }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to update Spotify sync setting');
    }
    return data;
  },

  /**
   * Delete / Unfollow a playlist on user's Spotify account
   */
  async deleteSpotifyPlaylist(playlistId, userId = null) {
    const targetUserId = userId || activeUserId;
    const query = targetUserId ? `?userId=${encodeURIComponent(targetUserId)}` : '';
    const response = await fetchWithTimeout(`${activeBaseUrl}/api/playlists/spotify/${playlistId}${query}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to delete playlist from Spotify');
    }
    return data;
  },

  /**
   * Permanently delete user account and associated data (Apple Guideline 5.1.1v)
   */
  async deleteAccount({ password, userId = null }) {
    const targetUserId = userId || activeUserId;
    const query = targetUserId ? `?userId=${encodeURIComponent(targetUserId)}` : '';
    const response = await fetchWithTimeout(`${activeBaseUrl}/api/users/account${query}`, {
      method: 'DELETE',
      headers: getHeaders(),
      body: JSON.stringify({ password, userId: targetUserId }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to delete account');
    }
    setAuthToken(null);
    return data;
  },
};

