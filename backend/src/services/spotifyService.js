const axios = require('axios');
require('dotenv').config();

let cachedToken = null;
let tokenExpiresAt = null;

// Curated high quality tracks with guaranteed working 30-second preview URLs
// Used when Spotify credentials are not yet configured or when preview_url is null
const FALLBACK_TRACKS = [
  {
    id: 'demo-track-1',
    spotify_track_id: '4cOdK2wGLETKBW3PvgPWqT',
    name: 'Blinding Lights',
    artist: 'The Weeknd',
    album: 'After Hours',
    album_art_url: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&auto=format&fit=crop&q=80',
    preview_url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    duration_ms: 200040,
    genre: 'Synthpop',
  },
  {
    id: 'demo-track-2',
    spotify_track_id: '7qiZfU4dY1lWllzX7mPBI3',
    name: 'Shape of You',
    artist: 'Ed Sheeran',
    album: '÷ (Divide)',
    album_art_url: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800&auto=format&fit=crop&q=80',
    preview_url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    duration_ms: 233712,
    genre: 'Pop',
  },
  {
    id: 'demo-track-3',
    spotify_track_id: '2takcwOaAZWiRQiPHPRAnl',
    name: 'Levitating',
    artist: 'Dua Lipa',
    album: 'Future Nostalgia',
    album_art_url: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&auto=format&fit=crop&q=80',
    preview_url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
    duration_ms: 203808,
    genre: 'Nu-Disco',
  },
  {
    id: 'demo-track-4',
    spotify_track_id: '3n3Ppam7vgaVa1iaRUc9Lp',
    name: 'Mr. Brightside',
    artist: 'The Killers',
    album: 'Hot Fuss',
    album_art_url: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&auto=format&fit=crop&q=80',
    preview_url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
    duration_ms: 222586,
    genre: 'Indie Rock',
  },
  {
    id: 'demo-track-5',
    spotify_track_id: '0VjIjW4GlUZAMYd2vXMi3b',
    name: 'Stay',
    artist: 'The Kid LAROI, Justin Bieber',
    album: 'F*CK LOVE 3: OVER YOU',
    album_art_url: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=800&auto=format&fit=crop&q=80',
    preview_url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3',
    duration_ms: 141805,
    genre: 'Pop / Rap',
  },
  {
    id: 'demo-track-6',
    spotify_track_id: '6habFhsOp2NvshLv26Yq9M',
    name: 'As It Was',
    artist: 'Harry Styles',
    album: "Harry's House",
    album_art_url: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=800&auto=format&fit=crop&q=80',
    preview_url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3',
    duration_ms: 167303,
    genre: 'Indie Pop',
  },
];

/**
 * Obtains an app access token from Spotify Web API using the Client Credentials Flow
 */
async function getClientCredentialsToken() {
  const clientId = process.env.CLIENT_ID || process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.CLIENT_SECRET || process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret || clientId === 'your_spotify_client_id_here') {
    return null;
  }

  // Use cached token if valid with 60s buffer
  if (cachedToken && tokenExpiresAt && Date.now() < tokenExpiresAt - 60000) {
    return cachedToken;
  }

  try {
    const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const response = await axios.post(
      'https://accounts.spotify.com/api/token',
      'grant_type=client_credentials',
      {
        headers: {
          Authorization: `Basic ${authHeader}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const { access_token, expires_in } = response.data;
    cachedToken = access_token;
    tokenExpiresAt = Date.now() + expires_in * 1000;
    return cachedToken;
  } catch (err) {
    console.error('⚠️ Failed to authenticate with Spotify Web API:', err.response?.data || err.message);
    return null;
  }
}

/**
 * Fetches tracks from Spotify Web API and extracts 30s preview URLs and metadata.
 * Gracefully falls back to curated sample tracks if credentials are missing or preview_urls are unavailable.
 */
async function fetchSpotifyTracks({ query = 'top hits 2024', limit = 10, genre = '' } = {}) {
  const token = await getClientCredentialsToken();

  if (!token) {
    console.log('ℹ️ Spotify credentials not detected or invalid. Returning sample tracks with valid audio previews.');
    return {
      source: 'fallback',
      message: 'Using demo tracks. Configure CLIENT_ID and CLIENT_SECRET in backend/.env for live Spotify tracks.',
      tracks: FALLBACK_TRACKS,
    };
  }

  try {
    const searchQuery = genre ? `genre:"${genre}"` : query;
    const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 10);
    const response = await axios.get('https://api.spotify.com/v1/search', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      params: {
        q: searchQuery,
        type: 'track',
        limit: safeLimit,
      },
    });

    const rawTracks = response.data.tracks?.items || [];

    // Map and extract relevant fields
    const formattedTracks = rawTracks.map((item, index) => {
      // If Spotify didn't return preview_url, attach a fallback preview for audio demo
      const previewUrl = item.preview_url || FALLBACK_TRACKS[index % FALLBACK_TRACKS.length].preview_url;

      return {
        id: item.id,
        spotify_track_id: item.id,
        name: item.name,
        artist: item.artists.map((a) => a.name).join(', '),
        album: item.album?.name || 'Unknown Album',
        album_art_url: item.album?.images?.[0]?.url || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800',
        preview_url: previewUrl,
        duration_ms: item.duration_ms,
        external_url: item.external_urls?.spotify || `https://open.spotify.com/track/${item.id}`,
        has_official_preview: Boolean(item.preview_url),
      };
    });

    return {
      source: 'spotify',
      total: formattedTracks.length,
      tracks: formattedTracks,
    };
  } catch (error) {
    console.error('⚠️ Error fetching tracks from Spotify:', error.response?.data || error.message);
    return {
      source: 'fallback_on_error',
      message: error.response?.data?.error?.message || error.message,
      tracks: FALLBACK_TRACKS,
    };
  }
}

module.exports = {
  getClientCredentialsToken,
  fetchSpotifyTracks,
  FALLBACK_TRACKS,
};
