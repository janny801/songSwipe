const express = require('express');
const router = express.Router();
const axios = require('axios');
const { pool, getIsConnected } = require('../config/db');
const { requireAuth, optionalAuth, JWT_SECRET } = require('../middleware/auth');
const inMemoryStore = require('../config/inMemoryStore');

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
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-public',
  'playlist-modify-private',
  'user-library-read',
  'user-library-modify',
].join(' ');

/**
 * Helper to determine redirect URI for Spotify OAuth
 */
function getSpotifyRedirectUri(req) {
  return process.env.SPOTIFY_REDIRECT_URI || 'https://unsolar-shirl-enquiringly.ngrok-free.dev/api/users/spotify/callback';
}

/**
 * GET /api/users/spotify/login
 * Step 1 of Spotify User OAuth: redirects to Spotify authorization dialog
 * Links directly to the authenticated SongSwipe user (via JWT in header or ?token=)
 */
router.get('/spotify/login', optionalAuth, (req, res) => {
  const clientId = process.env.CLIENT_ID || process.env.SPOTIFY_CLIENT_ID;
  const redirectUri = getSpotifyRedirectUri(req);

  if (!clientId || clientId === 'your_spotify_client_id_here') {
    return res.status(400).json({
      success: false,
      error: 'CLIENT_ID not configured in backend/.env',
    });
  }

  // Determine user ID from auth header, query token, or query userId
  let targetUserId = req.user?.userId;
  if (!targetUserId && req.query.token) {
    try {
      const decoded = jwt.verify(req.query.token, JWT_SECRET);
      targetUserId = decoded.userId;
    } catch (e) {
      console.warn('Invalid token in spotify/login query:', e.message);
    }
  }
  if (!targetUserId && req.query.userId) {
    targetUserId = req.query.userId;
  }

  if (!targetUserId) {
    return res.status(401).json({
      success: false,
      error: 'You must be logged in to link your Spotify account.',
    });
  }

  const returnUri = req.query.return_uri || 'songswipe://spotify-connected';

  // Encode state payload containing userId and returnUri
  const statePayload = {
    userId: targetUserId,
    returnUri,
    nonce: Math.random().toString(36).substring(7),
  };
  const state = Buffer.from(JSON.stringify(statePayload)).toString('base64url');

  const authUrl =
    `https://accounts.spotify.com/authorize?` +
    new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      scope: SPOTIFY_SCOPES,
      redirect_uri: redirectUri,
      state,
      show_dialog: 'true',
    }).toString();

  // If invoked via browser direct navigation, redirect immediately
  if (req.headers.accept?.includes('text/html')) {
    return res.redirect(authUrl);
  }

  return res.json({
    success: true,
    authUrl,
  });
});

/**
 * GET /api/users/spotify/callback
 * Step 2 of Spotify User OAuth: Exchange auth code for user access token and refresh token,
 * then link directly to the authenticated user in PostgreSQL `users` table
 */
router.get('/spotify/callback', async (req, res) => {
  const { code, state, error: oauthError } = req.query;
  const clientId = process.env.CLIENT_ID || process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.CLIENT_SECRET || process.env.SPOTIFY_CLIENT_SECRET;
  const redirectUri = getSpotifyRedirectUri(req);

  // Parse state to extract userId and returnUri
  let targetUserId = null;
  let returnUri = 'songswipe://spotify-connected';
  if (state) {
    try {
      const decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
      targetUserId = decoded.userId;
      returnUri = decoded.returnUri || returnUri;
    } catch (e) {
      console.warn('Could not decode state in callback:', e.message);
    }
  }

  // Handle user cancelled or denied access
  if (oauthError) {
    const errorHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Spotify Connection Cancelled</title>
  <style>
    body {
      background: #121212;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 24px;
      text-align: center;
      box-sizing: border-box;
    }
    .card {
      background: #181818;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 20px;
      padding: 32px 24px;
      max-width: 400px;
      width: 100%;
    }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h2 { font-size: 22px; margin-bottom: 8px; color: #e91429; }
    p { color: #a7a7a7; font-size: 14px; line-height: 20px; margin-bottom: 24px; }
    .btn {
      display: inline-block;
      background: #333;
      color: #fff;
      text-decoration: none;
      padding: 12px 28px;
      border-radius: 24px;
      font-weight: 700;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">⚠️</div>
    <h2>Connection Cancelled</h2>
    <p>You cancelled the Spotify authorization. Your Spotify account was not linked.</p>
    <a href="${returnUri}?status=cancelled" class="btn">Return to SongSwipe</a>
  </div>
  <script>
    setTimeout(function() {
      window.location.href = "${returnUri}?status=cancelled";
    }, 1500);
  </script>
</body>
</html>`;
    return res.status(200).send(errorHtml);
  }

  if (!code) {
    return res.status(400).send('Authorization code missing');
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
    const spotifyDisplayName = spotifyProfile.display_name || spotifyProfile.id;
    const spotifyAvatarUrl = spotifyProfile.images?.[0]?.url || null;

    // 3. Link to existing user in PostgreSQL
    if (getIsConnected() && targetUserId) {
      await pool.query(
        `UPDATE users
         SET
           spotify_id = $1,
           spotify_display_name = $2,
           spotify_profile_image_url = $3,
           spotify_access_token = $4,
           spotify_refresh_token = $5,
           spotify_token_expires_at = $6,
           profile_image_url = COALESCE($3, profile_image_url),
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $7`,
        [
          spotifyProfile.id,
          spotifyDisplayName,
          spotifyAvatarUrl,
          access_token,
          refresh_token,
          expiresAt,
          targetUserId,
        ]
      );
    } else if (getIsConnected()) {
      await pool.query(
        `INSERT INTO users (spotify_id, spotify_display_name, spotify_profile_image_url, display_name, email, profile_image_url, spotify_access_token, spotify_refresh_token, spotify_token_expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (spotify_id)
         DO UPDATE SET
           spotify_display_name = EXCLUDED.spotify_display_name,
           spotify_profile_image_url = EXCLUDED.spotify_profile_image_url,
           profile_image_url = COALESCE(EXCLUDED.spotify_profile_image_url, users.profile_image_url),
           spotify_access_token = EXCLUDED.spotify_access_token,
           spotify_refresh_token = EXCLUDED.spotify_refresh_token,
           spotify_token_expires_at = EXCLUDED.spotify_token_expires_at,
           updated_at = CURRENT_TIMESTAMP`,
        [
          spotifyProfile.id,
          spotifyDisplayName,
          spotifyAvatarUrl,
          spotifyDisplayName,
          spotifyProfile.email,
          spotifyAvatarUrl,
          access_token,
          refresh_token,
          expiresAt,
        ]
      );
    } else if (targetUserId) {
      inMemoryStore.updateSpotify(targetUserId, {
        spotify_id: spotifyProfile.id,
        spotify_display_name: spotifyDisplayName,
        spotify_profile_image_url: spotifyAvatarUrl,
        spotify_access_token: access_token,
        spotify_refresh_token: refresh_token,
        spotify_token_expires_at: expiresAt,
      });
    }

    const targetDeepLink = `${returnUri}?status=success&spotifyId=${encodeURIComponent(
      spotifyProfile.id
    )}&spotifyName=${encodeURIComponent(spotifyDisplayName)}`;

    // Deliver a Spotify-styled success page with auto-redirect
    const successHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Spotify Connected | SongSwipe</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #121212;
      color: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px;
      text-align: center;
    }
    .card {
      background: #181818;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 24px;
      padding: 36px 28px;
      max-width: 420px;
      width: 100%;
      box-shadow: 0 16px 40px rgba(0,0,0,0.5);
    }
    .icon-badge {
      width: 72px;
      height: 72px;
      background: #1DB954;
      border-radius: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
      box-shadow: 0 8px 24px rgba(29, 185, 84, 0.4);
    }
    .icon-badge svg {
      width: 40px;
      height: 40px;
      fill: #000;
    }
    h1 {
      font-size: 24px;
      font-weight: 800;
      margin-bottom: 8px;
      color: #fff;
    }
    p {
      color: #b3b3b3;
      font-size: 15px;
      line-height: 22px;
      margin-bottom: 24px;
    }
    strong {
      color: #1DB954;
    }
    .btn {
      display: block;
      width: 100%;
      background: #1DB954;
      color: #000;
      text-decoration: none;
      padding: 14px 20px;
      border-radius: 28px;
      font-weight: 800;
      font-size: 15px;
      transition: transform 0.15s ease;
    }
    .btn:active {
      transform: scale(0.98);
    }
    .note {
      margin-top: 18px;
      font-size: 12px;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon-badge">
      <svg viewBox="0 0 24 24">
        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
      </svg>
    </div>
    <h1>Spotify Connected!</h1>
    <p>Connected as <strong>${spotifyDisplayName}</strong>.<br/>Your right-swiped songs can now sync to your Spotify account.</p>
    <a href="${targetDeepLink}" class="btn" id="returnBtn">Return to SongSwipe</a>
    <div class="note">You can also close this window manually.</div>
  </div>

  <script>
    window.location.replace("${targetDeepLink}");
    setTimeout(function() {
      window.location.href = "${targetDeepLink}";
    }, 200);
  </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(successHtml);
  } catch (error) {
    console.error('Spotify OAuth callback error:', error.response?.data || error.message);
    const errDetails = error.response?.data?.error_description || error.response?.data?.error || error.message;
    return res.status(500).send(`
      <!DOCTYPE html>
      <html><body style="background:#121212;color:#fff;font-family:sans-serif;padding:30px;text-align:center;">
        <h2 style="color:#e91429;">Failed to Link Spotify</h2>
        <p style="color:#aaa;">${errDetails}</p>
        <a href="${returnUri}?status=error&error=${encodeURIComponent(errDetails)}" style="color:#1DB954;">Return to SongSwipe</a>
      </body></html>
    `);
  }
});

/**
 * POST /api/users/spotify/disconnect
 * Disconnects / unlinks Spotify account from current authenticated user
 */
router.post('/spotify/disconnect', requireAuth, async (req, res) => {
  const userId = req.user.userId;

  try {
    if (getIsConnected()) {
      const result = await pool.query(
        `UPDATE users
         SET
           spotify_id = NULL,
           spotify_display_name = NULL,
           spotify_profile_image_url = NULL,
           spotify_access_token = NULL,
           spotify_refresh_token = NULL,
           spotify_token_expires_at = NULL,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING id, google_id, spotify_id, spotify_display_name, spotify_profile_image_url, display_name, email, profile_image_url, auth_provider, has_chosen_username`,
        [userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      return res.status(200).json({
        success: true,
        message: 'Spotify account unlinked successfully',
        user: result.rows[0],
      });
    }

    // In-memory fallback
    const updated = inMemoryStore.disconnectSpotify(userId);
    return res.status(200).json({
      success: true,
      message: 'Spotify account unlinked successfully',
      user: updated,
    });
  } catch (error) {
    console.error('Spotify disconnect error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to disconnect Spotify account',
      details: error.message,
    });
  }
});

/**
 * PUT /api/users/username
 * Updates a user's unique username (display_name)
 */
router.put('/username', requireAuth, async (req, res) => {
  const { username } = req.body;
  const userId = req.user.userId;

  if (!username || !username.trim()) {
    return res.status(400).json({
      success: false,
      error: 'Username is required',
    });
  }

  const cleanUsername = username.trim();

  if (cleanUsername.length < 3 || cleanUsername.length > 30) {
    return res.status(400).json({
      success: false,
      error: 'Username must be between 3 and 30 characters',
    });
  }

  if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) {
    return res.status(400).json({
      success: false,
      error: 'Username can only contain letters, numbers, and underscores',
    });
  }

  try {
    if (getIsConnected()) {
      // Check if username is already taken by another user
      const existing = await pool.query(
        'SELECT id FROM users WHERE LOWER(display_name) = LOWER($1) AND id != $2',
        [cleanUsername, userId]
      );

      if (existing.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: `The username "${cleanUsername}" is already taken. Please choose another.`,
        });
      }

      // Update username in PostgreSQL and mark has_chosen_username as TRUE
      const updateResult = await pool.query(
        `UPDATE users
         SET display_name = $1, has_chosen_username = TRUE, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING id, google_id, spotify_id, display_name, email, profile_image_url, auth_provider, has_chosen_username`,
        [cleanUsername, userId]
      );

      return res.status(200).json({
        success: true,
        message: 'Username updated successfully',
        user: {
          ...updateResult.rows[0],
          has_chosen_username: true,
          needsUsername: false,
        },
      });
    }

    // In-memory fallback
    if (inMemoryStore.usernameExists(cleanUsername, userId)) {
      return res.status(409).json({
        success: false,
        error: `The username "${cleanUsername}" is already taken. Please choose another.`,
      });
    }

    const updated = inMemoryStore.updateUsername(userId, cleanUsername);

    return res.status(200).json({
      success: true,
      message: 'Username updated successfully',
      user: {
        ...(updated || { id: userId, display_name: cleanUsername }),
        has_chosen_username: true,
        needsUsername: false,
      },
    });
  } catch (error) {
    console.error('Update username error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update username',
      details: error.message,
    });
  }
});

/**
 * PUT /api/users/genres
 * Updates a user's favorite genres for personalized song recommendations
 */
router.put('/genres', requireAuth, async (req, res) => {
  const { genres } = req.body;
  const userId = req.user.userId;

  if (!Array.isArray(genres)) {
    return res.status(400).json({
      success: false,
      error: 'Genres must be an array of strings',
    });
  }

  // Clean and filter valid string genres (max 15 genres)
  const cleanGenres = genres
    .map((g) => (typeof g === 'string' ? g.trim() : ''))
    .filter((g) => g.length > 0 && g.length <= 40)
    .slice(0, 15);

  try {
    if (getIsConnected()) {
      const updateResult = await pool.query(
        `UPDATE users
         SET favorite_genres = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING id, google_id, spotify_id, display_name, email, profile_image_url, auth_provider, has_chosen_username, favorite_genres`,
        [cleanGenres, userId]
      );

      if (updateResult.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      return res.status(200).json({
        success: true,
        message: 'Favorite genres updated successfully',
        user: {
          ...updateResult.rows[0],
          favorite_genres: updateResult.rows[0].favorite_genres || [],
        },
      });
    }

    // In-memory fallback
    const updated = inMemoryStore.updateGenres(userId, cleanGenres);
    return res.status(200).json({
      success: true,
      message: 'Favorite genres updated successfully',
      user: updated || { id: userId, favorite_genres: cleanGenres },
    });
  } catch (error) {
    console.error('Update genres error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update genres',
      details: error.message,
    });
  }
});

module.exports = router;
