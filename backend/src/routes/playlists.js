const express = require('express');
const router = express.Router();
const { pool, getIsConnected } = require('../config/db');
const { optionalAuth, requireAuth } = require('../middleware/auth');
const sharedInMemoryStore = require('../config/inMemoryStore');

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

/**
 * GET /api/playlists/custom
 * Fetch all custom playlists created by the authenticated user
 * Optional query: ?trackId=... to check if each playlist contains this track
 */
router.get('/custom', requireAuth, async (req, res) => {
  const userId = req.user.userId;
  const { trackId } = req.query;

  if (!getIsConnected()) {
    const list = sharedInMemoryStore.getCustomPlaylists(userId, trackId);
    return res.status(200).json({
      success: true,
      storage: 'in-memory',
      playlists: list,
    });
  }

  try {
    const query = `
      SELECT 
        ucp.id,
        ucp.name,
        ucp.created_at,
        COUNT(p.id)::int AS track_count,
        CASE 
          WHEN $2::text IS NOT NULL THEN EXISTS (
            SELECT 1 FROM playlists p2
            JOIN tracks t ON p2.track_id = t.id
            WHERE p2.user_id = ucp.user_id
              AND p2.playlist_name = ucp.name
              AND (t.id::text = $2 OR t.spotify_track_id = $2)
          )
          ELSE false
        END AS has_track
      FROM user_custom_playlists ucp
      LEFT JOIN playlists p ON p.user_id = ucp.user_id AND p.playlist_name = ucp.name
      WHERE ucp.user_id = $1
      GROUP BY ucp.id, ucp.name, ucp.created_at, ucp.user_id
      ORDER BY ucp.created_at DESC
    `;
    const result = await pool.query(query, [userId, trackId || null]);

    return res.status(200).json({
      success: true,
      storage: 'postgresql',
      playlists: result.rows,
    });
  } catch (error) {
    console.error('Error fetching custom playlists:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch custom playlists',
      details: error.message,
    });
  }
});

/**
 * POST /api/playlists/custom
 * Create a new custom playlist for the authenticated user
 */
router.post('/custom', requireAuth, async (req, res) => {
  const userId = req.user.userId;
  const { name } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({
      success: false,
      error: 'Playlist name cannot be empty',
    });
  }

  const cleanName = name.trim();
  if (cleanName.length > 100) {
    return res.status(400).json({
      success: false,
      error: 'Playlist name must be 100 characters or fewer',
    });
  }

  // Prevent reserved name
  if (cleanName.toLowerCase() === 'liked songs') {
    return res.status(400).json({
      success: false,
      error: '"Liked Songs" is a default playlist and cannot be created as a custom playlist.',
    });
  }

  if (!getIsConnected()) {
    try {
      const playlist = sharedInMemoryStore.createCustomPlaylist(userId, cleanName);
      return res.status(201).json({
        success: true,
        storage: 'in-memory',
        playlist,
      });
    } catch (err) {
      return res.status(409).json({
        success: false,
        error: err.message,
      });
    }
  }

  try {
    const result = await pool.query(
      `INSERT INTO user_custom_playlists (user_id, name)
       VALUES ($1, $2)
       RETURNING id, name, created_at`,
      [userId, cleanName]
    );

    return res.status(201).json({
      success: true,
      storage: 'postgresql',
      playlist: {
        ...result.rows[0],
        track_count: 0,
        has_track: false,
      },
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        error: `A playlist named "${cleanName}" already exists on your profile.`,
      });
    }
    console.error('Error creating custom playlist:', error);
    return res.status(500).json({
      success: false,
      error: 'Database error creating custom playlist',
      details: error.message,
    });
  }
});

/**
 * DELETE /api/playlists/custom/:name
 * Delete a custom playlist created by the authenticated user (and its entries in playlists table)
 */
router.delete('/custom/:name', requireAuth, async (req, res) => {
  const userId = req.user.userId;
  const playlistName = decodeURIComponent(req.params.name).trim();

  if (!playlistName) {
    return res.status(400).json({
      success: false,
      error: 'Playlist name is required',
    });
  }

  if (!getIsConnected()) {
    sharedInMemoryStore.deleteCustomPlaylist(userId, playlistName);
    return res.status(200).json({
      success: true,
      message: `Playlist "${playlistName}" deleted successfully`,
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Delete all playlist track relations for this custom playlist
    await client.query(
      `DELETE FROM playlists
       WHERE user_id = $1 AND LOWER(playlist_name) = LOWER($2)`,
      [userId, playlistName]
    );

    // 2. Delete the custom playlist entry
    const result = await client.query(
      `DELETE FROM user_custom_playlists
       WHERE user_id = $1 AND LOWER(name) = LOWER($2)
       RETURNING id, name`,
      [userId, playlistName]
    );

    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        error: `Playlist "${playlistName}" not found on your profile.`,
      });
    }

    await client.query('COMMIT');
    return res.status(200).json({
      success: true,
      message: `Playlist "${result.rows[0].name}" deleted successfully.`,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting custom playlist:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete playlist',
      details: error.message,
    });
  } finally {
    client.release();
  }
});

/**
 * POST /api/playlists/add-to-playlists
 * Add a song to one or multiple playlists that the user created on their profile.
 * Multi-select support with server-side validation ensuring only user-created playlists are allowed.
 */
router.post('/add-to-playlists', requireAuth, async (req, res) => {
  const userId = req.user.userId;
  const { track, playlistNames } = req.body;

  if (!track || (!track.spotify_track_id && !track.id)) {
    return res.status(400).json({
      success: false,
      error: 'Missing track data in request body',
    });
  }

  if (!Array.isArray(playlistNames) || playlistNames.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Please select at least one playlist to add to',
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

  if (!getIsConnected()) {
    const addedCount = sharedInMemoryStore.addTrackToCustomPlaylists(userId, trackData, playlistNames);
    return res.status(200).json({
      success: true,
      storage: 'in-memory',
      addedCount,
      playlistNames,
      message: `Track added to ${addedCount} playlist(s)!`,
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Verify user-created playlists: ONLY allow playlists created by this user on their profile
    const customPlaylistsResult = await client.query(
      `SELECT name FROM user_custom_playlists WHERE user_id = $1`,
      [userId]
    );

    const userCreatedPlaylistNames = new Set(
      customPlaylistsResult.rows.map((r) => r.name.toLowerCase())
    );

    // Filter requested playlists to only those belonging to user
    const allowedPlaylists = playlistNames.filter((name) =>
      userCreatedPlaylistNames.has(name.trim().toLowerCase())
    );

    if (allowedPlaylists.length === 0) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        success: false,
        error: 'Songs can only be added to playlists you have created on your profile.',
      });
    }

    // 2. Ensure track exists in tracks table
    const trackResult = await client.query(
      `INSERT INTO tracks (
         spotify_track_id, name, artist, album, album_art_url, preview_url, duration_ms
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (spotify_track_id) DO UPDATE SET
         name = EXCLUDED.name,
         artist = EXCLUDED.artist,
         album = EXCLUDED.album,
         album_art_url = EXCLUDED.album_art_url,
         preview_url = COALESCE(EXCLUDED.preview_url, tracks.preview_url),
         duration_ms = EXCLUDED.duration_ms
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

    // 3. Insert into playlists table for each allowed custom playlist
    let addedCount = 0;
    for (const plName of allowedPlaylists) {
      const originalRow = customPlaylistsResult.rows.find(
        (r) => r.name.toLowerCase() === plName.trim().toLowerCase()
      );
      const exactName = originalRow ? originalRow.name : plName;

      await client.query(
        `INSERT INTO playlists (user_id, track_id, playlist_name)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, track_id, playlist_name)
         DO UPDATE SET swiped_at = CURRENT_TIMESTAMP`,
        [userId, savedTrack.id, exactName]
      );
      addedCount++;
    }

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      storage: 'postgresql',
      addedCount,
      playlistNames: allowedPlaylists,
      track: savedTrack,
      message: `Added "${savedTrack.name}" to ${addedCount} playlist${addedCount > 1 ? 's' : ''}!`,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error adding track to custom playlists:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to add track to playlists',
      details: error.message,
    });
  } finally {
    client.release();
  }
});

module.exports = router;
