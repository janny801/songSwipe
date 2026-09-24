const express = require('express');
const router = express.Router();
const { getPersonalizedTracks } = require('../services/recommendationEngine');
const { fetchSpotifyTracks } = require('../services/spotifyService');

/**
 * GET /api/tracks
 * Fetches personalized tracks for the swipe deck using the 70/20/10 recommendation engine.
 * Query params:
 *   - query: optional manual search term
 *   - genre: optional genre filter
 *   - userId: user ID to personalize based on right/left swipe history
 *   - limit: number of tracks (default 10)
 */
router.get('/', async (req, res) => {
  try {
    const { query = '', limit = 10, genre = '', userId = '' } = req.query;

    const result = await getPersonalizedTracks({
      userId,
      query,
      genre,
      limit: Number(limit) || 10,
    });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Error in GET /api/tracks:', error);
    // Safe fallback to basic fetch if recommendation pipeline encounters unexpected error
    try {
      const fallback = await fetchSpotifyTracks({ query: req.query.query, limit: 10 });
      return res.status(200).json({
        success: true,
        ...fallback,
      });
    } catch (_) {}
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve tracks',
      message: error.message,
    });
  }
});

module.exports = router;
