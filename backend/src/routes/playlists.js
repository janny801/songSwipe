const express = require('express');
const router = express.Router();
const { pool, getIsConnected } = require('../config/db');
const { optionalAuth } = require('../middleware/auth');

// In-memory fallback store when PostgreSQL is not yet running
const inMemoryStore = {
  defaultUserId: '00000000-0000-0000-0000-000000000001',
  users: [
    {
      id: '00000000-0000-0000-0000-000000000001',
      display_name: 'Guest Listener',
      email: 'guest@songswipe.local',
      spotify_id: null,
    },
  ],
  tracks: new Map(),
  playlists: [],
};

const DEFAULT_GUEST_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Helper to ensure a guest user exists in the PostgreSQL users table
 */
async function ensureDefaultUser(client) {
  const result = await client.query(
    `INSERT INTO users (id, display_name, email)
     VALUES ($1, 'Guest Listener', 'guest@songswipe.local')
     ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name
     RETURNING id, display_name, email`,
    [DEFAULT_GUEST_ID]
  );
  return result.rows[0];
}

/**
 * POST /api/playlists/swipe
 * Handles right-swipe (like) and left-swipe (pass) actions
 * When direction is 'right' (or action is 'like'), saves track to DB and links to user's playlist
 */
router.post('/swipe', optionalAuth, async (req, res) => {
  const targetUserId = req.user?.userId || req.body.userId || DEFAULT_GUEST_ID;
  const {
    direction = 'right',
    playlistName = 'Liked Songs',
    track,
  } = req.body;
  const userId = targetUserId;

  if (!track || (!track.spotify_track_id && !track.id)) {
    return res.status(400).json({
      success: false,
      error: 'Missing track data in request body',
    });
  }

  // Normalize track fields
  const trackData = {
    spotify_track_id: track.spotify_track_id || track.id,
    name: track.name || 'Untitled Track',
    artist: track.artist || 'Unknown Artist',
    album: track.album || '',
    album_art_url: track.album_art_url || track.albumArtUrl || '',
    preview_url: track.preview_url || track.previewUrl || null,
    duration_ms: track.duration_ms || track.durationMs || 0,
  };

  // If swiped left (pass), simply acknowledge without saving to playlist
  if (direction === 'left') {
    return res.status(200).json({
      success: true,
      action: 'passed',
      message: `Track "${trackData.name}" passed.`,
      track: trackData,
    });
  }

  // Right-swipe: Save to database (or in-memory fallback if DB not yet connected)
  const isPostgresReady = getIsConnected();

  if (!isPostgresReady) {
    // In-memory fallback
    inMemoryStore.tracks.set(trackData.spotify_track_id, trackData);
    const existingIndex = inMemoryStore.playlists.findIndex(
      (item) => item.spotify_track_id === trackData.spotify_track_id && item.userId === userId
    );

    let playlistEntry;
    if (existingIndex === -1) {
      playlistEntry = {
        id: `local-${Date.now()}`,
        userId,
        playlistName,
        ...trackData,
        swiped_at: new Date().toISOString(),
      };
      inMemoryStore.playlists.unshift(playlistEntry);
    } else {
      playlistEntry = inMemoryStore.playlists[existingIndex];
    }

    return res.status(201).json({
      success: true,
      action: 'liked',
      storage: 'in-memory (PostgreSQL setup pending)',
      message: `Saved "${trackData.name}" by ${trackData.artist} to "${playlistName}"!`,
      data: playlistEntry,
    });
  }

  // PostgreSQL execution
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Ensure user exists
    await ensureDefaultUser(client);

    // 2. Upsert track record
    const trackResult = await client.query(
      `INSERT INTO tracks (spotify_track_id, name, artist, album, album_art_url, preview_url, duration_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (spotify_track_id)
       DO UPDATE SET
         name = EXCLUDED.name,
         artist = EXCLUDED.artist,
         album = EXCLUDED.album,
         album_art_url = EXCLUDED.album_art_url,
         preview_url = COALESCE(EXCLUDED.preview_url, tracks.preview_url)
       RETURNING id, spotify_track_id, name, artist, album, album_art_url, preview_url, duration_ms`,
      [
        trackData.spotify_track_id,
        trackData.name,
        trackData.artist,
        trackData.album,
        trackData.album_art_url,
        trackData.preview_url,
        trackData.duration_ms,
      ]
    );

    const savedTrack = trackResult.rows[0];

    // 3. Link track to user's playlist
    const playlistResult = await client.query(
      `INSERT INTO playlists (user_id, track_id, playlist_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, track_id, playlist_name)
       DO UPDATE SET swiped_at = CURRENT_TIMESTAMP
       RETURNING id, user_id, track_id, playlist_name, swiped_at`,
      [userId, savedTrack.id, playlistName]
    );

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      action: 'liked',
      storage: 'postgresql',
      message: `Saved "${savedTrack.name}" by ${savedTrack.artist} to "${playlistName}"!`,
      data: {
        playlist_id: playlistResult.rows[0].id,
        user_id: userId,
        playlist_name: playlistName,
        swiped_at: playlistResult.rows[0].swiped_at,
        track: savedTrack,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error saving swiped track to PostgreSQL:', error);
    return res.status(500).json({
      success: false,
      error: 'Database error saving track',
      details: error.message,
    });
  } finally {
    client.release();
  }
});

/**
 * GET /api/playlists
 * Retrieve saved tracks for a user (defaults to default guest user)
 */
router.get('/', optionalAuth, async (req, res) => {
  const userId = req.user?.userId || req.query.userId || DEFAULT_GUEST_ID;
  const playlistName = req.query.playlistName || 'Liked Songs';

  if (!getIsConnected()) {
    const userLikes = inMemoryStore.playlists.filter(
      (item) => item.userId === userId && item.playlistName === playlistName
    );
    return res.status(200).json({
      success: true,
      storage: 'in-memory (PostgreSQL setup pending)',
      playlist_name: playlistName,
      total: userLikes.length,
      tracks: userLikes,
    });
  }

  try {
    const result = await pool.query(
      `SELECT
         p.id as playlist_entry_id,
         p.playlist_name,
         p.swiped_at,
         t.id as track_id,
         t.spotify_track_id,
         t.name,
         t.artist,
         t.album,
         t.album_art_url,
         t.preview_url,
         t.duration_ms
       FROM playlists p
       JOIN tracks t ON p.track_id = t.id
       WHERE p.user_id = $1 AND p.playlist_name = $2
       ORDER BY p.swiped_at DESC`,
      [userId, playlistName]
    );

    return res.status(200).json({
      success: true,
      storage: 'postgresql',
      playlist_name: playlistName,
      total: result.rows.length,
      tracks: result.rows,
    });
  } catch (error) {
    console.error('Error fetching playlist from PostgreSQL:', error);
    return res.status(500).json({
      success: false,
      error: 'Database error fetching playlist',
      details: error.message,
    });
  }
});

/**
 * DELETE /api/playlists/:trackId
 * Remove a track from user's playlist
 */
router.delete('/:trackId', optionalAuth, async (req, res) => {
  const userId = req.user?.userId || req.query.userId || DEFAULT_GUEST_ID;
  const { trackId } = req.params;
  const playlistName = req.query.playlistName || 'Liked Songs';

  if (!getIsConnected()) {
    inMemoryStore.playlists = inMemoryStore.playlists.filter(
      (item) => !(item.userId === userId && (item.spotify_track_id === trackId || item.id === trackId))
    );
    return res.status(200).json({
      success: true,
      message: 'Track removed from playlist (in-memory mode)',
    });
  }

  try {
    const result = await pool.query(
      `DELETE FROM playlists
       WHERE user_id = $1 AND playlist_name = $2 AND track_id IN (
         SELECT id FROM tracks WHERE id::text = $3 OR spotify_track_id = $3
       )
       RETURNING id`,
      [userId, playlistName, trackId]
    );

    return res.status(200).json({
      success: true,
      message: 'Track removed from playlist successfully',
      deletedCount: result.rowCount,
    });
  } catch (error) {
    console.error('Error removing track from playlist:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete track from playlist',
      details: error.message,
    });
  }
});

module.exports = router;
