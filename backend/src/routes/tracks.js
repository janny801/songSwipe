const express = require('express');
const router = express.Router();
const { fetchSpotifyTracks } = require('../services/spotifyService');
const { pool, getIsConnected } = require('../config/db');
const inMemoryStore = require('../config/inMemoryStore');

/**
 * GET /api/tracks
 * Fetches tracks from Spotify Web API using client credentials, extracts 30-second preview URLs
 * Query params:
 *   - query: search term
 *   - genre: optional genre filter
 *   - userId: optional user ID to personalize by user's favorite genres
 *   - limit: number of tracks (default 10)
 */
router.get('/', async (req, res) => {
  try {
    const { query = '', limit = 10, genre = '', userId = '' } = req.query;

    let userGenres = [];
    if (userId) {
      try {
        if (getIsConnected()) {
          const userRes = await pool.query('SELECT favorite_genres FROM users WHERE id = $1', [userId]);
          if (userRes.rows.length > 0 && Array.isArray(userRes.rows[0].favorite_genres)) {
            userGenres = userRes.rows[0].favorite_genres;
          }
        } else {
          const inMemUser = inMemoryStore.findUserById(userId);
          if (inMemUser && Array.isArray(inMemUser.favorite_genres)) {
            userGenres = inMemUser.favorite_genres;
          }
        }
      } catch (e) {
        console.warn('Failed to load user genres:', e.message);
      }
    }

    const result = await fetchSpotifyTracks({ query, limit, genre, userGenres });
    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Error in GET /api/tracks:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve tracks',
      message: error.message,
    });
  }
});

module.exports = router;
