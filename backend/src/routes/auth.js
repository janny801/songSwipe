const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { pool, getIsConnected } = require('../config/db');
const { JWT_SECRET, requireAuth } = require('../middleware/auth');

// Optional Google OAuth Client (used if GOOGLE_CLIENT_ID is configured)
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClient = googleClientId ? new OAuth2Client(googleClientId) : null;

// Helper to generate standard JWT session token
function generateToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      displayName: user.display_name,
    },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

/**
 * POST /api/auth/register
 * Standard Email & Password registration
 */
router.post('/register', async (req, res) => {
  const { email, password, displayName } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: 'Email and password are required',
    });
  }

  // Validate password complexity rules: > 8 chars, uppercase, number, special char
  if (password.length <= 8) {
    return res.status(400).json({
      success: false,
      error: 'Password must be more than 8 characters long.',
    });
  }

  if (!/[A-Z]/.test(password)) {
    return res.status(400).json({
      success: false,
      error: 'Password must contain at least one uppercase letter (A-Z).',
    });
  }

  if (!/[0-9]/.test(password)) {
    return res.status(400).json({
      success: false,
      error: 'Password must contain at least one number (0-9).',
    });
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password)) {
    return res.status(400).json({
      success: false,
      error: 'Password must contain at least one special character (!, @, #, $, %, etc.).',
    });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const name = displayName?.trim() || normalizedEmail.split('@')[0];

  try {
    const passwordHash = await bcrypt.hash(password, 10);

    if (getIsConnected()) {
      // Check if user already exists
      const existing = await pool.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
      if (existing.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: 'An account with this email already exists. Please sign in.',
        });
      }

      // Insert new user
      const result = await pool.query(
        `INSERT INTO users (email, password_hash, display_name, auth_provider)
         VALUES ($1, $2, $3, 'email')
         RETURNING id, email, display_name, profile_image_url, auth_provider, created_at`,
        [normalizedEmail, passwordHash, name]
      );

      const user = result.rows[0];
      const token = generateToken(user);

      return res.status(201).json({
        success: true,
        message: 'Account created successfully',
        token,
        user,
      });
    }

    // In-memory fallback
    const fallbackUser = {
      id: `usr-${Date.now()}`,
      email: normalizedEmail,
      display_name: name,
      auth_provider: 'email',
      profile_image_url: null,
    };
    const token = generateToken(fallbackUser);

    return res.status(201).json({
      success: true,
      message: 'Account created (in-memory mode)',
      token,
      user: fallbackUser,
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create account',
      details: error.message,
    });
  }
});

/**
 * POST /api/auth/login
 * Standard Email & Password sign-in
 */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: 'Email and password are required',
    });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    if (getIsConnected()) {
      const result = await pool.query(
        `SELECT id, email, password_hash, display_name, profile_image_url, auth_provider
         FROM users
         WHERE email = $1`,
        [normalizedEmail]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({
          success: false,
          error: 'Invalid email or password',
        });
      }

      const user = result.rows[0];

      if (!user.password_hash) {
        return res.status(400).json({
          success: false,
          error: `This account was registered with ${user.auth_provider === 'google' ? 'Google' : 'Spotify'}. Please sign in with ${user.auth_provider === 'google' ? 'Google' : 'Spotify'}.`,
        });
      }

      const isValid = await bcrypt.compare(password, user.password_hash);
      if (!isValid) {
        return res.status(401).json({
          success: false,
          error: 'Invalid email or password',
        });
      }

      delete user.password_hash;
      const token = generateToken(user);

      return res.status(200).json({
        success: true,
        message: 'Signed in successfully',
        token,
        user,
      });
    }

    // In-memory demo login
    const user = {
      id: '00000000-0000-0000-0000-000000000001',
      email: normalizedEmail,
      display_name: normalizedEmail.split('@')[0],
      auth_provider: 'email',
    };
    const token = generateToken(user);

    return res.status(200).json({
      success: true,
      token,
      user,
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      error: 'Sign in failed',
      details: error.message,
    });
  }
});

/**
 * POST /api/auth/google
 * Sign in or sign up with Google account
 * Accepts Google idToken or verified user profile
 */
router.post('/google', async (req, res) => {
  const { idToken, userProfile } = req.body;

  let googleUser = null;

  try {
    // 1. Verify via Google OAuth2 Client if configured and token provided
    if (idToken && googleClient) {
      try {
        const ticket = await googleClient.verifyIdToken({
          idToken,
          audience: googleClientId,
        });
        const payload = ticket.getPayload();
        googleUser = {
          googleId: payload.sub,
          email: payload.email,
          displayName: payload.name || payload.given_name || payload.email.split('@')[0],
          profileImageUrl: payload.picture,
        };
      } catch (verifyError) {
        console.warn('Google token verification with library failed:', verifyError.message);
      }
    }

    // 2. Direct userProfile fallback (from Expo Google AuthSession or manual payload)
    if (!googleUser && userProfile && userProfile.email) {
      googleUser = {
        googleId: userProfile.id || userProfile.sub || `google-${Date.now()}`,
        email: userProfile.email.toLowerCase(),
        displayName: userProfile.name || userProfile.displayName || userProfile.email.split('@')[0],
        profileImageUrl: userProfile.photoUrl || userProfile.picture || null,
      };
    }

    if (!googleUser) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Google authentication data. Could not extract user profile.',
      });
    }

    // 3. Upsert into Neon PostgreSQL
    if (getIsConnected()) {
      const query = `
        INSERT INTO users (google_id, email, display_name, profile_image_url, auth_provider)
        VALUES ($1, $2, $3, $4, 'google')
        ON CONFLICT (email) DO UPDATE SET
          google_id = COALESCE(users.google_id, EXCLUDED.google_id),
          display_name = COALESCE(users.display_name, EXCLUDED.display_name),
          profile_image_url = COALESCE(EXCLUDED.profile_image_url, users.profile_image_url),
          updated_at = CURRENT_TIMESTAMP
        RETURNING id, google_id, display_name, email, profile_image_url, auth_provider;
      `;

      const result = await pool.query(query, [
        googleUser.googleId,
        googleUser.email,
        googleUser.displayName,
        googleUser.profileImageUrl,
      ]);

      const user = result.rows[0];
      const token = generateToken(user);

      return res.status(200).json({
        success: true,
        message: 'Signed in with Google successfully!',
        token,
        user,
      });
    }

    // In-memory fallback
    const fallbackUser = {
      id: `usr-google-${Date.now()}`,
      google_id: googleUser.googleId,
      email: googleUser.email,
      display_name: googleUser.displayName,
      profile_image_url: googleUser.profileImageUrl,
      auth_provider: 'google',
    };
    const token = generateToken(fallbackUser);

    return res.status(200).json({
      success: true,
      token,
      user: fallbackUser,
    });
  } catch (error) {
    console.error('Google auth error:', error);
    return res.status(500).json({
      success: false,
      error: 'Google authentication failed',
      details: error.message,
    });
  }
});

/**
 * GET /api/auth/me
 * Retrieves current authenticated user profile
 */
router.get('/me', requireAuth, async (req, res) => {
  try {
    if (getIsConnected()) {
      const result = await pool.query(
        `SELECT id, google_id, spotify_id, display_name, email, profile_image_url, auth_provider, created_at
         FROM users
         WHERE id = $1`,
        [req.user.userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      // Count liked songs
      const countResult = await pool.query(
        `SELECT COUNT(*) as liked_count FROM playlists WHERE user_id = $1`,
        [req.user.userId]
      );

      return res.status(200).json({
        success: true,
        user: {
          ...result.rows[0],
          likedCount: parseInt(countResult.rows[0]?.liked_count || 0, 10),
        },
      });
    }

    return res.status(200).json({
      success: true,
      user: {
        id: req.user.userId,
        email: req.user.email,
        display_name: req.user.displayName,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
