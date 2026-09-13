const express = require('express');
const router = express.Router();
const axios = require('axios');
const { pool, getIsConnected } = require('../config/db');

/**
 * Spotify OAuth Scopes needed for full user linking and playlist export:
 * - user-read-private: Read username, country, product (Free/Premium)
 * - user-read-email: User's Spotify email
 * - playlist-modify-public: Create and update public playlists
 * - playlist-modify-private: Create and update private playlists
 */
const SPOTIFY_SCOPES = [
  'user-read-private',
  'user-read-email',
  'playlist-modify-public',
  'playlist-modify-private',
].join(' ');

/**
 * GET /api/users/spotify/login
 * Step 1 of Spotify User OAuth: redirects to Spotify authorization dialog
 */
router.get('/spotify/login', (req, res) => {
  const clientId = process.env.CLIENT_ID || process.env.SPOTIFY_CLIENT_ID;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI || 'http://localhost:5000/api/users/spotify/callback';

  if (!clientId || clientId === 'your_spotify_client_id_here') {
    return res.status(400).json({
      success: false,
      error: 'CLIENT_ID not configured in backend/.env',
    });
  }

  const state = Math.random().toString(36).substring(7);
  const authUrl =
    `https://accounts.spotify.com/authorize?` +
    new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      scope: SPOTIFY_SCOPES,
      redirect_uri: redirectUri,
      state,
    }).toString();

  res.json({
    success: true,
    authUrl,
  });
});

/**
 * GET /api/users/spotify/callback
 * Step 2 of Spotify User OAuth: Exchange auth code for user access token and refresh token,
 * then store/link into the PostgreSQL `users` table
 */
router.get('/spotify/callback', async (req, res) => {
  const { code } = req.query;
  const clientId = process.env.CLIENT_ID || process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.CLIENT_SECRET || process.env.SPOTIFY_CLIENT_SECRET;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI || 'http://localhost:5000/api/users/spotify/callback';

  if (!code) {
    return res.status(400).json({ success: false, error: 'Authorization code missing' });
  }

  try {
    // 1. Exchange code for access & refresh tokens
    const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenResponse = await axios.post(
      'https://accounts.spotify.com/api/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }).toString(),
      {
        headers: {
          Authorization: `Basic ${authHeader}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    // 2. Fetch Spotify user profile
    const profileResponse = await axios.get('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const spotifyProfile = profileResponse.data;
    const expiresAt = new Date(Date.now() + expires_in * 1000);

    // 3. Save / update in PostgreSQL users table if connected
    if (getIsConnected()) {
      const query = `
        INSERT INTO users (spotify_id, display_name, email, profile_image_url, spotify_access_token, spotify_refresh_token, spotify_token_expires_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (spotify_id)
        DO UPDATE SET
          display_name = EXCLUDED.display_name,
          email = EXCLUDED.email,
          profile_image_url = EXCLUDED.profile_image_url,
          spotify_access_token = EXCLUDED.spotify_access_token,
          spotify_refresh_token = EXCLUDED.spotify_refresh_token,
          spotify_token_expires_at = EXCLUDED.spotify_token_expires_at,
          updated_at = CURRENT_TIMESTAMP
        RETURNING id, spotify_id, display_name, email, profile_image_url;
      `;

      const dbUser = await pool.query(query, [
        spotifyProfile.id,
        spotifyProfile.display_name,
        spotifyProfile.email,
        spotifyProfile.images?.[0]?.url || null,
        access_token,
        refresh_token,
        expiresAt,
      ]);

      return res.json({
        success: true,
        message: 'Successfully linked Spotify user account!',
        user: dbUser.rows[0],
      });
    }

    // Fallback if DB not yet migrated
    return res.json({
      success: true,
      message: 'Spotify authorized (PostgreSQL connection pending)',
      spotifyProfile: {
        id: spotifyProfile.id,
        display_name: spotifyProfile.display_name,
        email: spotifyProfile.email,
      },
    });
  } catch (error) {
    console.error('Spotify OAuth callback error:', error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      error: 'OAuth exchange failed',
      details: error.response?.data || error.message,
    });
  }
});

module.exports = router;
