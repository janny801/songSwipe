const express = require('express');
const router = express.Router();
const { fetchSpotifyTracks } = require('../services/spotifyService');

/**
 * GET /api/tracks
 * Fetches tracks from Spotify Web API using client credentials, extracts 30-second preview URLs
 * Query params:
 *   - query: search term (default 'top hits 2024')
 *   - genre: optional genre filter
 *   - limit: number of tracks (default 20, max 50)
 */
router.get('/', async (req, res) => {
  try {
    const { query = 'top hits', limit = 20, genre = '' } = req.query;
    const result = await fetchSpotifyTracks({ query, limit, genre });
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
