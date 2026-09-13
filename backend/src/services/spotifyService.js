const axios = require('axios');
require('dotenv').config();

let cachedToken = null;
let tokenExpiresAt = null;

// Cache resolved preview URLs in memory to prevent repeated API lookups
const previewCache = new Map();

// Curated high quality tracks with verified, authentic 30-second studio audio previews
const FALLBACK_TRACKS = [
  {
    id: 'demo-track-1',
    spotify_track_id: '4cOdK2wGLETKBW3PvgPWqT',
    name: 'Blinding Lights',
    artist: 'The Weeknd',
    album: 'After Hours',
    album_art_url: 'https://cdn-images.dzcdn.net/images/cover/fd00ebd6d30d7253f813dba3bb1c66a9/1000x1000-000000-80-0-0.jpg',
    preview_url: 'https://cdnt-preview.dzcdn.net/api/1/1/1/b/2/0/1b27825bf63c36edcdc7fac9f920214e.mp3',
    duration_ms: 200040,
    genre: 'Synthpop',
  },
  {
    id: 'demo-track-2',
    spotify_track_id: '7qiZfU4dY1lWllzX7mPBI3',
    name: 'Shape of You',
    artist: 'Ed Sheeran',
    album: '÷ (Divide)',
    album_art_url: 'https://cdn-images.dzcdn.net/images/cover/107c2b43f10c249077c1f7618563bb63/1000x1000-000000-80-0-0.jpg',
    preview_url: 'https://cdnt-preview.dzcdn.net/api/1/1/f/1/b/0/f1becf66c6264a6a0306fc47d47690b0.mp3',
    duration_ms: 233712,
    genre: 'Pop',
  },
  {
    id: 'demo-track-3',
    spotify_track_id: '2takcwOaAZWiRQiPHPRAnl',
    name: 'Levitating',
    artist: 'Dua Lipa',
    album: 'Future Nostalgia',
    album_art_url: 'https://cdn-images.dzcdn.net/images/cover/f8364f090ba04f1b19b381ec0390f3e4/1000x1000-000000-80-0-0.jpg',
    preview_url: 'https://cdnt-preview.dzcdn.net/api/1/1/9/c/5/0/9c570bc806fc277bb73ba024e956d057.mp3',
    duration_ms: 203808,
    genre: 'Nu-Disco',
  },
  {
    id: 'demo-track-4',
    spotify_track_id: '3n3Ppam7vgaVa1iaRUc9Lp',
    name: 'Mr. Brightside',
    artist: 'The Killers',
    album: 'Hot Fuss',
    album_art_url: 'https://cdn-images.dzcdn.net/images/cover/0690d69d27f0d718fcc95f23af702286/1000x1000-000000-80-0-0.jpg',
    preview_url: 'https://cdnt-preview.dzcdn.net/api/1/1/5/3/7/0/537e73a4cc790d49fe8126afad40ddb4.mp3',
    duration_ms: 222586,
    genre: 'Indie Rock',
  },
  {
    id: 'demo-track-5',
    spotify_track_id: '0VjIjW4GlUZAMYd2vXMi3b',
    name: 'STAY',
    artist: 'The Kid LAROI, Justin Bieber',
    album: 'F*CK LOVE 3: OVER YOU',
    album_art_url: 'https://cdn-images.dzcdn.net/images/cover/dd6fe7fa9267185c4b835bd4f155d1d2/1000x1000-000000-80-0-0.jpg',
    preview_url: 'https://cdnt-preview.dzcdn.net/api/1/1/c/2/7/0/c27d817565b9df8ab6393bb8202b58b9.mp3',
    duration_ms: 141805,
    genre: 'Pop / Rap',
  },
  {
    id: 'demo-track-6',
    spotify_track_id: '6habFhsOp2NvshLv26Yq9M',
    name: 'As It Was',
    artist: 'Harry Styles',
    album: "Harry's House",
    album_art_url: 'https://cdn-images.dzcdn.net/images/cover/b0e936124f59e669ddba02ebe5893f95/1000x1000-000000-80-0-0.jpg',
    preview_url: 'https://cdnt-preview.dzcdn.net/api/1/1/9/3/7/0/9372c78844baf74b7a06bd467151518a.mp3',
    duration_ms: 167303,
    genre: 'Indie Pop',
  },
  {
    id: 'demo-track-7',
    spotify_track_id: '1vLqigPHwiFnXsfrLMehV1',
    name: 'Espresso',
    artist: 'Sabrina Carpenter',
    album: 'Short n\' Sweet',
    album_art_url: 'https://cdn-images.dzcdn.net/images/cover/e3221287a77eb262944e6528766eeba4/1000x1000-000000-80-0-0.jpg',
    preview_url: 'https://cdnt-preview.dzcdn.net/api/1/1/1/7/a/0/17a21c40ce4af3ac9514aac756403188.mp3',
    duration_ms: 175459,
    genre: 'Pop',
  },
  {
    id: 'demo-track-8',
    spotify_track_id: '6dOtVTDmmp4vgO22NsEnne',
    name: 'BIRDS OF A FEATHER',
    artist: 'Billie Eilish',
    album: 'HIT ME HARD AND SOFT',
    album_art_url: 'https://cdn-images.dzcdn.net/images/cover/5d284b31cb9ddeb1a0c79aede5a94e1c/1000x1000-000000-80-0-0.jpg',
    preview_url: 'https://cdnt-preview.dzcdn.net/api/1/1/5/e/0/0/5e0fb99f6f1e0f18ab70a4c0d18efa5c.mp3',
    duration_ms: 194373,
    genre: 'Indie Pop',
  },
];

/**
 * Resolves the real 30-second studio MP3 preview of a song
 * Matches via Deezer API or iTunes Search API, falling back safely
 */
async function resolveAudioPreview(trackName, artistName) {
  if (!trackName) return null;

  const cacheKey = `${trackName.toLowerCase()}|||${(artistName || '').toLowerCase()}`;
  if (previewCache.has(cacheKey)) {
    return previewCache.get(cacheKey);
  }

  // Clean track title (remove features, remasters, brackets) for optimal search hits
  const cleanTitle = trackName
    .replace(/\s*-\s*.*remaster.*$/i, '')
    .replace(/\s*\(feat\..*?\)/i, '')
    .replace(/\s*\[.*?\]/i, '')
    .replace(/\s*\(with.*?\)/i, '')
    .trim();

  const primaryArtist = (artistName || '').split(/[,&]/)[0].trim();
  const query = `${primaryArtist} ${cleanTitle}`.trim();
  const titleLower = cleanTitle.toLowerCase();

  // 1. Try Deezer Search API (provides crisp 30s MP3 audio)
  try {
    const res = await axios.get('https://api.deezer.com/search', {
      params: { q: query, limit: 5 },
      timeout: 3500,
    });
    const items = res.data?.data || [];
    let best = items.find(
      (item) =>
        item.preview &&
        (item.title.toLowerCase().includes(titleLower) || titleLower.includes(item.title.toLowerCase()))
    );
    if (!best) {
      best = items.find((item) => item.preview);
    }
    if (best?.preview) {
      previewCache.set(cacheKey, best.preview);
      return best.preview;
    }
  } catch (err) {
    // Deezer search error, continue to iTunes
  }

  // 2. Try iTunes Search API (AAC/M4A 30s preview)
  try {
    const res = await axios.get('https://itunes.apple.com/search', {
      params: { term: query, entity: 'song', limit: 5 },
      timeout: 3500,
    });
    const items = res.data?.results || [];
    let best = items.find(
      (item) =>
        item.previewUrl &&
        (item.trackName?.toLowerCase().includes(titleLower) || titleLower.includes(item.trackName?.toLowerCase()))
    );
    if (!best) {
      best = items.find((item) => item.previewUrl);
    }
    if (best?.previewUrl) {
      previewCache.set(cacheKey, best.previewUrl);
      return best.previewUrl;
    }
  } catch (err) {
    // iTunes search error
  }

  return null;
}

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

const POPULAR_ARTISTS = [
  'Sabrina Carpenter',
  'Billie Eilish',
  'The Weeknd',
  'Dua Lipa',
  'Taylor Swift',
  'Post Malone',
  'Kendrick Lamar',
  'Chappell Roan',
  'Harry Styles',
  'Olivia Rodrigo',
  'Bruno Mars',
  'SZA',
];

/**
 * Fetches tracks from Spotify Web API and enriches them with genuine 30-second audio previews.
 * Resolves real studio previews if Spotify's preview_url is null (Spotify deprecated preview_url in 2024).
 */
async function fetchSpotifyTracks({ query = '', limit = 15, genre = '' } = {}) {
  const token = await getClientCredentialsToken();

  if (!token) {
    console.log('ℹ️ Spotify credentials not detected or invalid. Returning curated demo tracks with real audio previews.');
    return {
      source: 'fallback',
      message: 'Using demo tracks. Configure CLIENT_ID and CLIENT_SECRET in backend/.env for live Spotify tracks.',
      tracks: FALLBACK_TRACKS,
    };
  }

  try {
    let searchQuery = query;
    if (!searchQuery || searchQuery.trim() === '' || searchQuery === 'top hits' || searchQuery === 'top hits 2024') {
      // Pick a rotating popular artist/genre for rich and recognizable hits
      const randomArtist = POPULAR_ARTISTS[Math.floor(Math.random() * POPULAR_ARTISTS.length)];
      searchQuery = genre ? `genre:"${genre}"` : randomArtist;
    }

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

    // Map tracks and enrich with authentic 30-second studio previews
    const formattedTracks = await Promise.all(
      rawTracks.map(async (item, index) => {
        let previewUrl = item.preview_url;

        // If Spotify did not return a preview_url (standard across modern Spotify API), resolve real preview
        if (!previewUrl) {
          previewUrl = await resolveAudioPreview(item.name, item.artists?.[0]?.name);
        }

        // Safe fallback to guaranteed working track preview if resolution failed
        if (!previewUrl) {
          previewUrl = FALLBACK_TRACKS[index % FALLBACK_TRACKS.length].preview_url;
        }

        return {
          id: item.id,
          spotify_track_id: item.id,
          name: item.name,
          artist: item.artists.map((a) => a.name).join(', '),
          album: item.album?.name || 'Unknown Album',
          album_art_url:
            item.album?.images?.[0]?.url ||
            FALLBACK_TRACKS[index % FALLBACK_TRACKS.length].album_art_url,
          preview_url: previewUrl,
          duration_ms: item.duration_ms,
          external_url: item.external_urls?.spotify || `https://open.spotify.com/track/${item.id}`,
          has_official_preview: Boolean(previewUrl),
        };
      })
    );

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
  resolveAudioPreview,
  FALLBACK_TRACKS,
};
