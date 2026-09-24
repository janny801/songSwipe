const axios = require('axios');
const { pool, getIsConnected } = require('../config/db');
const sharedInMemoryStore = require('../config/inMemoryStore');
const {
  getClientCredentialsToken,
  resolveAudioPreview,
  FALLBACK_TRACKS,
} = require('./spotifyService');

/**
 * Curated Artist Proximity Matrix (Cluster Mapping)
 * Maps popular artists to musically adjacent/similar artists for the 20% Explore recommendation tier.
 */
const RELATED_ARTISTS_MAP = {
  // Pop / Dance / Synthpop
  'the weeknd': ['SZA', 'Brent Faiyaz', 'Frank Ocean', 'Daft Punk', 'Childish Gambino', 'Metro Boomin'],
  'dua lipa': ['Chappell Roan', 'Sabrina Carpenter', 'Charli xcx', 'Troye Sivan', 'Olivia Rodrigo'],
  'sabrina carpenter': ['Chappell Roan', 'Olivia Rodrigo', 'Gracie Abrams', 'Tate McRae', 'Billie Eilish'],
  'chappell roan': ['Sabrina Carpenter', 'Charli xcx', 'Reneé Rapp', 'Lorde', 'Boygenius'],
  'taylor swift': ['Gracie Abrams', 'Phoebe Bridgers', 'Kacey Musgraves', 'Maisie Peters', 'Lana Del Rey'],
  'harry styles': ['Niall Horan', 'Shawn Mendes', 'Conan Gray', 'Lauv', 'Benson Boone'],
  'ed sheeran': ['Lewis Capaldi', 'James Arthur', 'Sam Smith', 'Calum Scott', 'Vance Joy'],
  'billie eilish': ['Lorde', 'Finneas', 'Clairo', 'Phoebe Bridgers', 'Lana Del Rey', 'Girl in Red'],
  'olivia rodrigo': ['Conan Gray', 'Tate McRae', 'Avril Lavigne', 'Paramore', 'Fletcher'],

  // Hip-Hop / Rap / R&B
  'kendrick lamar': ['J. Cole', 'Travis Scott', 'Baby Keem', 'Tyler, The Creator', 'A$AP Rocky', 'Metro Boomin'],
  'drake': ['21 Savage', 'Future', 'PartyNextDoor', 'Lil Baby', 'Gunna', 'Travis Scott'],
  'travis scott': ['Don Toliver', 'Playboi Carti', 'Sheck Wes', 'Metro Boomin', 'Future'],
  'sza': ['Summer Walker', 'Jhené Aiko', 'Kehlani', 'Ari Lennox', 'Snoh Aalegra', 'Kali Uchis'],
  'post malone': ['The Kid LAROI', 'Noah Kahan', 'Morgan Wallen', 'Juice WRLD', 'Khalid'],

  // Rock / Indie / Alternative
  'the killers': ['Arctic Monkeys', 'The Strokes', 'Kings of Leon', 'Franz Ferdinand', 'Phoenix'],
  'arctic monkeys': ['The Strokes', 'The Black Keys', 'Foals', 'Cage The Elephant', 'Wallows'],
  'hozier': ['Noah Kahan', 'Lord Huron', 'Florence + The Machine', 'The Lumineers', 'Mumford & Sons'],

  // Latin / Reggaeton
  'bad bunny': ['Rauw Alejandro', 'Feid', 'J Balvin', 'Myke Towers', 'Ozuna', 'Mora'],
  'karol g': ['Becky G', 'Rosalía', 'Anitta', 'Natti Natasha', 'Shakira'],

  // Country
  'morgan wallen': ['Luke Combs', 'Zach Bryan', 'Jordan Davis', 'Bailey Zimmerman', 'Cole Swindell'],
  'zach bryan': ['Noah Kahan', 'Tyler Childers', 'Colter Wall', 'Chris Stapleton', 'Kacey Musgraves'],
};

const TRENDING_WILDCARDS = [
  'Benson Boone',
  'Teddy Swims',
  'Shaboozey',
  'Tommy Richman',
  'Artemas',
  'Myles Smith',
  'Djo',
  'Hozier',
];

/**
 * 1. Fetch User Taste Profile from swipe history and playlists
 */
async function getUserTasteProfile(userId) {
  if (!userId) {
    return {
      topArtists: [],
      swipedTrackIds: new Set(),
      favoriteGenres: [],
      hasHistory: false,
    };
  }

  const isPostgresReady = getIsConnected();

  if (isPostgresReady) {
    try {
      // 1. Get all swiped track IDs (to guarantee deduplication)
      const swipesRes = await pool.query(
        `SELECT spotify_track_id, artist_name, direction
         FROM user_swipes
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [userId]
      );

      const swipedTrackIds = new Set(swipesRes.rows.map((r) => r.spotify_track_id));

      // 2. Count likes per artist
      const artistScores = new Map();
      for (const row of swipesRes.rows) {
        if (!row.artist_name) continue;
        const mainArtist = row.artist_name.split(',')[0].trim();
        const score = artistScores.get(mainArtist) || 0;
        // Right-swipe gives +1.0, left-swipe gives -0.5 penalty
        const delta = row.direction === 'right' ? 1.0 : -0.5;
        artistScores.set(mainArtist, score + delta);
      }

      // 3. User favorite genres
      const userRes = await pool.query(
        `SELECT favorite_genres FROM users WHERE id = $1`,
        [userId]
      );
      const favoriteGenres = Array.isArray(userRes.rows[0]?.favorite_genres)
        ? userRes.rows[0].favorite_genres
        : [];

      // Sort artists by net affinity
      const topArtists = Array.from(artistScores.entries())
        .filter(([_, score]) => score > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([artist]) => artist);

      return {
        topArtists,
        swipedTrackIds,
        favoriteGenres,
        hasHistory: swipedTrackIds.size > 0,
      };
    } catch (e) {
      console.warn('⚠️ Error building user taste profile from PostgreSQL:', e.message);
    }
  }

  // Fallback: In-memory store
  const memSwipes = sharedInMemoryStore.getUserSwipes(userId);
  const swipedTrackIds = new Set(memSwipes.map((s) => s.spotify_track_id));
  const artistCounts = new Map();
  for (const s of memSwipes) {
    if (s.direction === 'right' && s.artist_name) {
      const a = s.artist_name.split(',')[0].trim();
      artistCounts.set(a, (artistCounts.get(a) || 0) + 1);
    }
  }

  const memUser = sharedInMemoryStore.findUserById(userId);
  const topArtists = Array.from(artistCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([artist]) => artist);

  return {
    topArtists,
    swipedTrackIds,
    favoriteGenres: memUser?.favorite_genres || [],
    hasHistory: swipedTrackIds.size > 0,
  };
}

/**
 * 2. Generate 70/20/10 Query Buckets based on user profile
 */
function buildRecommendationQueries({ topArtists, favoriteGenres, selectedGenre = '' }) {
  const exploitQueries = [];
  const exploreQueries = [];
  const serendipityQueries = [];

  // If user selected a specific genre filter in the feed, prioritize that
  if (selectedGenre && selectedGenre.trim() !== '') {
    exploitQueries.push(`genre:"${selectedGenre.toLowerCase()}"`);
    return {
      exploitQueries,
      exploreQueries: [`genre:"${selectedGenre.toLowerCase()}"`],
      serendipityQueries: [`genre:"${selectedGenre.toLowerCase()}"`],
    };
  }

  // 1. EXPLOIT (70%): User's top liked artists and favorite genres
  if (topArtists.length > 0) {
    topArtists.slice(0, 5).forEach((artist) => {
      exploitQueries.push(`artist:"${artist}"`);
    });
  }

  if (favoriteGenres.length > 0) {
    favoriteGenres.forEach((g) => {
      exploitQueries.push(`genre:"${g.toLowerCase()}"`);
    });
  }

  // Fallback exploit if user is new with no history
  if (exploitQueries.length === 0) {
    exploitQueries.push('artist:"The Weeknd"', 'artist:"Dua Lipa"', 'artist:"Sabrina Carpenter"', 'genre:"pop"');
  }

  // 2. EXPLORE (20%): Musically related artists from proximity matrix
  for (const artist of topArtists.slice(0, 4)) {
    const key = artist.toLowerCase();
    const related = RELATED_ARTISTS_MAP[key];
    if (related && related.length > 0) {
      const pick = related[Math.floor(Math.random() * related.length)];
      exploreQueries.push(`artist:"${pick}"`);
    }
  }

  if (exploreQueries.length === 0) {
    if (favoriteGenres.length > 0) {
      favoriteGenres.forEach((g) => {
        exploreQueries.push(`genre:"${g.toLowerCase()}"`);
      });
    } else {
      exploreQueries.push('artist:"Billie Eilish"', 'artist:"Chappell Roan"', 'artist:"Post Malone"');
    }
  }

  // 3. SERENDIPITY (10%): Fresh trending wildcards
  const randomWildcard = TRENDING_WILDCARDS[Math.floor(Math.random() * TRENDING_WILDCARDS.length)];
  serendipityQueries.push(`artist:"${randomWildcard}"`);

  return {
    exploitQueries,
    exploreQueries,
    serendipityQueries,
  };
}

/**
 * 3. Fetch Candidate Tracks from Spotify Search
 */
async function fetchCandidatesForQuery(query, token, limit = 5) {
  try {
    const res = await axios.get('https://api.spotify.com/v1/search', {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        q: query,
        type: 'track',
        limit,
      },
      timeout: 4000,
    });
    return res.data?.tracks?.items || [];
  } catch (err) {
    console.warn(`Spotify query failed for "${query}":`, err.message);
    return [];
  }
}

/**
 * 4. Main Recommendation Pipeline
 * Returns a personalized, deduplicated batch of tracks adhering to the 70/20/10 framework.
 */
async function getPersonalizedTracks({
  userId = null,
  genre = '',
  query = '',
  limit = 10,
} = {}) {
  // If user searched for a specific query directly in the search bar, handle directly
  if (query && query.trim() !== '' && query !== 'top hits' && query !== 'top hits 2024') {
    const token = await getClientCredentialsToken();
    if (!token) return { source: 'fallback', tracks: FALLBACK_TRACKS };
    const raw = await fetchCandidatesForQuery(query, token, limit);
    const enriched = await enrichTracks(raw);
    return {
      source: 'search',
      total: enriched.length,
      tracks: enriched,
    };
  }

  const token = await getClientCredentialsToken();
  if (!token) {
    return {
      source: 'fallback',
      message: 'Spotify credentials unavailable. Serving curated demo tracks.',
      tracks: FALLBACK_TRACKS,
    };
  }

  // Step A: Load User Taste Profile & History
  const { topArtists, swipedTrackIds, favoriteGenres, hasHistory } =
    await getUserTasteProfile(userId);

  // Step B: Build 70/20/10 Queries
  const { exploitQueries, exploreQueries, serendipityQueries } = buildRecommendationQueries({
    topArtists,
    favoriteGenres,
    selectedGenre: genre,
  });

  // Calculate target breakdown for batch
  const countExploit = Math.max(1, Math.round(limit * 0.7)); // e.g. 7
  const countExplore = Math.max(1, Math.round(limit * 0.2)); // e.g. 2
  const countSerendipity = Math.max(1, limit - countExploit - countExplore); // e.g. 1

  // Step C: Execute Spotify Queries in Parallel
  const fetchPromises = [];

  // Pick queries from exploit pool
  const chosenExploit = exploitQueries.sort(() => 0.5 - Math.random()).slice(0, 3);
  chosenExploit.forEach((q) => fetchPromises.push(fetchCandidatesForQuery(q, token, 6)));

  // Pick queries from explore pool
  const chosenExplore = exploreQueries.sort(() => 0.5 - Math.random()).slice(0, 2);
  chosenExplore.forEach((q) => fetchPromises.push(fetchCandidatesForQuery(q, token, 4)));

  // Pick from serendipity pool
  serendipityQueries.forEach((q) => fetchPromises.push(fetchCandidatesForQuery(q, token, 3)));

  const queryResults = await Promise.all(fetchPromises);
  const rawCandidates = queryResults.flat();

  // Step D: Deduplication (Filter out previously swiped tracks & intra-batch duplicates)
  const seenIds = new Set();
  const filteredCandidates = [];

  for (const item of rawCandidates) {
    if (!item?.id) continue;
    // Skip if user has already swiped on this track (left or right)
    if (swipedTrackIds.has(item.id)) continue;
    // Skip if duplicate within this batch
    if (seenIds.has(item.id)) continue;

    seenIds.add(item.id);
    filteredCandidates.push(item);
  }

  // Shuffle candidates slightly to mix exploit/explore organically
  const shuffled = filteredCandidates.sort(() => 0.5 - Math.random());
  const selectedRaw = shuffled.slice(0, limit);

  // If not enough unique tracks found, pad from FALLBACK_TRACKS avoiding duplicates
  if (selectedRaw.length < limit) {
    for (const fb of FALLBACK_TRACKS) {
      if (selectedRaw.length >= limit) break;
      if (!swipedTrackIds.has(fb.spotify_track_id) && !seenIds.has(fb.spotify_track_id)) {
        seenIds.add(fb.spotify_track_id);
        selectedRaw.push(fb);
      }
    }
  }

  // Step E: Audio Preview Enrichment
  const enrichedTracks = await enrichTracks(selectedRaw);

  return {
    source: 'recommendation_engine',
    algorithm: '70_20_10_taste_profile',
    personalized: hasHistory,
    total: enrichedTracks.length,
    userTopArtists: topArtists.slice(0, 3),
    tracks: enrichedTracks,
  };
}

/**
 * 5. Audio Preview Enrichment Helper
 */
async function enrichTracks(rawItems) {
  return await Promise.all(
    rawItems.map(async (item, index) => {
      // If item is already formatted fallback
      if (item.album_art_url && item.preview_url && item.artist) {
        return item;
      }

      let previewUrl = item.preview_url;
      const primaryArtist = item.artists?.[0]?.name || 'Unknown Artist';

      if (!previewUrl) {
        previewUrl = await resolveAudioPreview(item.name, primaryArtist);
      }

      if (!previewUrl) {
        previewUrl = FALLBACK_TRACKS[index % FALLBACK_TRACKS.length].preview_url;
      }

      return {
        id: item.id,
        spotify_track_id: item.id,
        name: item.name,
        artist: item.artists ? item.artists.map((a) => a.name).join(', ') : primaryArtist,
        album: item.album?.name || 'Single',
        album_art_url:
          item.album?.images?.[0]?.url ||
          FALLBACK_TRACKS[index % FALLBACK_TRACKS.length].album_art_url,
        preview_url: previewUrl,
        duration_ms: item.duration_ms || 180000,
        external_url: item.external_urls?.spotify || `https://open.spotify.com/track/${item.id}`,
        has_official_preview: Boolean(previewUrl),
      };
    })
  );
}

module.exports = {
  getPersonalizedTracks,
  getUserTasteProfile,
  RELATED_ARTISTS_MAP,
};
