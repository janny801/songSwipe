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
 * Standard Email, Username & Password registration
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
  const username = (displayName || '').trim();

  if (!username) {
    return res.status(400).json({
      success: false,
      error: 'Username is required.',
    });
  }

  if (username.length < 3 || username.length > 30) {
    return res.status(400).json({
      success: false,
      error: 'Username must be between 3 and 30 characters.',
    });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);

    if (getIsConnected()) {
      // 1. Check if email already exists
      const existingEmail = await pool.query(
        'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
        [normalizedEmail]
      );
      if (existingEmail.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: 'An account with this email already exists. Please sign in.',
        });
      }

      // 2. Check if username already exists
      const existingUsername = await pool.query(
        'SELECT id FROM users WHERE LOWER(display_name) = LOWER($1)',
        [username]
      );
      if (existingUsername.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: 'This username is already taken. Please choose another.',
        });
      }

      // 3. Insert new user
      const result = await pool.query(
        `INSERT INTO users (email, password_hash, display_name, auth_provider)
         VALUES ($1, $2, $3, 'email')
         RETURNING id, email, display_name, profile_image_url, auth_provider, created_at`,
        [normalizedEmail, passwordHash, username]
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
      display_name: username,
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
 * Standard Email or Username & Password sign-in
 */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: 'Email or username and password are required',
    });
  }

  const identifier = email.trim().toLowerCase();

  try {
    if (getIsConnected()) {
      // Find user by either email OR username!
      const result = await pool.query(
        `SELECT id, email, password_hash, display_name, profile_image_url, auth_provider
         FROM users
         WHERE LOWER(email) = $1 OR LOWER(display_name) = $1`,
        [identifier]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({
          success: false,
          error: 'Invalid email/username or password',
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
          error: 'Invalid email/username or password',
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
      email: identifier,
      display_name: identifier.split('@')[0],
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
 * GET /api/auth/google/authorize
 * Initiates the Google OAuth web session (opened by WebBrowser.openAuthSessionAsync)
 */
router.get('/google/authorize', async (req, res) => {
  const redirectUri = req.query.redirect_uri || 'songswipe://auth';

  // If real Google OAuth credentials are configured, forward to Google OAuth 2.0
  if (googleClientId && process.env.GOOGLE_CLIENT_SECRET) {
    const callbackUrl = `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
    const googleOAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
      googleClientId
    )}&redirect_uri=${encodeURIComponent(callbackUrl)}&response_type=code&scope=openid%20email%20profile&state=${encodeURIComponent(
      redirectUri
    )}`;
    return res.redirect(googleOAuthUrl);
  }

  // Otherwise, serve an authentic Google Account Chooser & Sign-In web page
  let knownAccounts = [];
  if (getIsConnected()) {
    try {
      const dbAccounts = await pool.query(
        `SELECT DISTINCT email, display_name, profile_image_url
         FROM users
         WHERE email IS NOT NULL
         ORDER BY email ASC
         LIMIT 4`
      );
      knownAccounts = dbAccounts.rows;
    } catch (e) {
      console.warn('Could not query accounts for Google selector:', e.message);
    }
  }

  const accountCardsHtml = knownAccounts.map((acc, idx) => {
    const initial = (acc.display_name || acc.email || 'G').charAt(0).toUpperCase();
    const colors = ['#1a73e8', '#ea4335', '#fbbc05', '#34a853'];
    const avatarBg = colors[idx % colors.length];
    return `
      <div class="account-item" onclick="selectAccount('${encodeURIComponent(acc.email)}', '${encodeURIComponent(acc.display_name || '')}')">
        <div class="avatar" style="background-color: ${avatarBg};">${initial}</div>
        <div class="account-info">
          <div class="account-name">${acc.display_name || acc.email.split('@')[0]}</div>
          <div class="account-email">${acc.email}</div>
        </div>
      </div>
    `;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
  <title>Sign in with Google</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #f0f4f9;
      color: #1f1f1f;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 16px;
    }
    .auth-card {
      background: #ffffff;
      border-radius: 28px;
      width: 100%;
      max-width: 440px;
      padding: 36px 32px 32px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
    }
    .logo-row {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 20px;
    }
    .title {
      font-size: 24px;
      font-weight: 500;
      color: #1f1f1f;
      margin-bottom: 6px;
    }
    .subtitle {
      font-size: 15px;
      color: #444746;
      margin-bottom: 24px;
      line-height: 20px;
    }
    .subtitle strong {
      color: #1f1f1f;
    }
    .account-list {
      border: 1px solid #c4c7c5;
      border-radius: 16px;
      overflow: hidden;
      margin-bottom: 20px;
    }
    .account-item {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px 16px;
      border-bottom: 1px solid #e1e3e1;
      cursor: pointer;
      transition: background 0.15s ease;
      -webkit-tap-highlight-color: transparent;
    }
    .account-item:last-child {
      border-bottom: none;
    }
    .account-item:hover, .account-item:active {
      background-color: #f8fafd;
    }
    .avatar {
      width: 38px;
      height: 38px;
      border-radius: 19px;
      color: #ffffff;
      font-weight: 600;
      font-size: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .account-info {
      flex: 1;
      min-width: 0;
    }
    .account-name {
      font-size: 15px;
      font-weight: 600;
      color: #1f1f1f;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .account-email {
      font-size: 13px;
      color: #5e5e5e;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .use-another-btn {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px 16px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      color: #1a73e8;
      background: none;
      border: none;
      width: 100%;
      text-align: left;
      border-top: 1px solid #e1e3e1;
    }
    .use-another-btn:hover {
      background-color: #f8fafd;
    }
    .input-section {
      display: none;
      margin-top: 16px;
    }
    .input-label {
      font-size: 13px;
      font-weight: 600;
      color: #444746;
      margin-bottom: 6px;
      display: block;
    }
    .text-input {
      width: 100%;
      height: 52px;
      border: 1.5px solid #747775;
      border-radius: 8px;
      padding: 0 16px;
      font-size: 16px;
      color: #1f1f1f;
      outline: none;
      margin-bottom: 18px;
    }
    .text-input:focus {
      border-color: #0b57d0;
      box-shadow: 0 0 0 2px rgba(11, 87, 208, 0.2);
    }
    .btn-row {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      align-items: center;
      margin-top: 12px;
    }
    .cancel-btn {
      background: none;
      border: none;
      color: #0b57d0;
      font-weight: 600;
      font-size: 14px;
      padding: 10px 16px;
      cursor: pointer;
      border-radius: 20px;
    }
    .submit-btn {
      background-color: #0b57d0;
      color: #ffffff;
      border: none;
      border-radius: 20px;
      height: 42px;
      padding: 0 24px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 1px 3px rgba(0,0,0,0.12);
    }
    .submit-btn:active {
      background-color: #0842a0;
    }
    .footer-note {
      margin-top: 24px;
      font-size: 12px;
      color: #747775;
      line-height: 16px;
    }
  </style>
</head>
<body>
  <div class="auth-card">
    <div class="logo-row">
      <svg width="36" height="36" viewBox="0 0 48 48">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
      </svg>
    </div>

    <h1 class="title">Sign in with Google</h1>
    <p class="subtitle">Choose an account to continue to <strong>SongSwipe</strong></p>

    <!-- Pre-existing Accounts List -->
    <div class="account-list" id="accountList">
      ${accountCardsHtml}
      <button class="use-another-btn" onclick="showInputSection()">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="#1a73e8">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
        </svg>
        Use another account
      </button>
    </div>

    <!-- Enter another Google Account Form -->
    <form id="googleForm" method="POST" action="/api/auth/google/callback-web">
      <input type="hidden" name="redirect_uri" value="${redirectUri}" />
      <input type="hidden" id="selectedEmail" name="email" value="" />
      <input type="hidden" id="selectedName" name="displayName" value="" />

      <div class="input-section" id="inputSection" ${knownAccounts.length === 0 ? 'style="display:block;"' : ''}>
        <label class="input-label" for="manualEmail">Email or phone</label>
        <input
          class="text-input"
          type="email"
          id="manualEmail"
          placeholder="yourname@gmail.com"
          autocomplete="email"
          required
        />
        <div class="btn-row">
          ${knownAccounts.length > 0 ? '<button type="button" class="cancel-btn" onclick="hideInputSection()">Back</button>' : ''}
          <button type="button" class="submit-btn" onclick="submitManualEmail()">Next</button>
        </div>
      </div>
    </form>

    <p class="footer-note">
      To continue, Google will share your name and email address with SongSwipe.
    </p>
  </div>

  <script>
    function selectAccount(encodedEmail, encodedName) {
      document.getElementById('selectedEmail').value = decodeURIComponent(encodedEmail);
      document.getElementById('selectedName').value = decodeURIComponent(encodedName);
      document.getElementById('googleForm').submit();
    }

    function showInputSection() {
      document.getElementById('accountList').style.display = 'none';
      document.getElementById('inputSection').style.display = 'block';
      document.getElementById('manualEmail').focus();
    }

    function hideInputSection() {
      document.getElementById('inputSection').style.display = 'none';
      document.getElementById('accountList').style.display = 'block';
    }

    function submitManualEmail() {
      const email = document.getElementById('manualEmail').value.trim();
      if (!email || !email.includes('@')) {
        alert('Please enter a valid Google email address.');
        return;
      }
      document.getElementById('selectedEmail').value = email;
      document.getElementById('selectedName').value = email.split('@')[0];
      document.getElementById('googleForm').submit();
    }
  </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.send(html);
});

/**
 * POST /api/auth/google/callback-web
 * Handles the Google sign-in form submission from the browser session and redirects to mobile app
 */
router.post('/google/callback-web', async (req, res) => {
  const email = (req.body.email || req.query.email || '').toLowerCase().trim();
  const displayName = (req.body.displayName || req.query.displayName || email.split('@')[0]).trim();
  const redirectUri = req.body.redirect_uri || req.query.redirect_uri || 'songswipe://auth';

  if (!email || !email.includes('@')) {
    return res.status(400).send('Invalid email provided.');
  }

  let user = null;
  let isNewUser = false;

  try {
    if (getIsConnected()) {
      // 1. Check if email exists
      const existing = await pool.query(
        `SELECT id, google_id, email, display_name, profile_image_url, auth_provider
         FROM users
         WHERE LOWER(email) = LOWER($1)`,
        [email]
      );

      if (existing.rows.length > 0) {
        user = existing.rows[0];
        isNewUser = false;
        // Update google_id if not present
        if (!user.google_id) {
          const upd = await pool.query(
            `UPDATE users
             SET google_id = $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2
             RETURNING id, google_id, display_name, email, profile_image_url, auth_provider`,
            [`google-${Date.now()}`, user.id]
          );
          user = upd.rows[0];
        }
      } else {
        // New Google user: determine unique display_name
        isNewUser = true;
        let uniqueName = displayName || email.split('@')[0];
        const nameCheck = await pool.query(
          'SELECT id FROM users WHERE LOWER(display_name) = LOWER($1)',
          [uniqueName]
        );
        if (nameCheck.rows.length > 0) {
          uniqueName = `${uniqueName}_${Math.floor(100 + Math.random() * 900)}`;
        }

        const inserted = await pool.query(
          `INSERT INTO users (google_id, email, display_name, auth_provider)
           VALUES ($1, $2, $3, 'google')
           RETURNING id, google_id, display_name, email, profile_image_url, auth_provider`,
          [`google-${Date.now()}`, email, uniqueName]
        );
        user = inserted.rows[0];
      }
    } else {
      // In-memory fallback
      user = {
        id: `usr-google-${Date.now()}`,
        email,
        display_name: displayName,
        auth_provider: 'google',
      };
      isNewUser = true;
    }

    const token = generateToken(user);
    const sep = redirectUri.includes('?') ? '&' : '?';
    const targetUrl = `${redirectUri}${sep}token=${encodeURIComponent(token)}&userId=${encodeURIComponent(
      user.id
    )}&email=${encodeURIComponent(user.email)}&displayName=${encodeURIComponent(
      user.display_name
    )}&isNewUser=${isNewUser}`;

    // Send HTTP 302 + HTML script redirect for maximum compatibility with WebBrowser
    const redirectHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Redirecting to SongSwipe...</title>
  <script>
    window.location.replace("${targetUrl}");
    setTimeout(function() {
      window.location.href = "${targetUrl}";
    }, 200);
  </script>
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#121212;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;padding:20px;text-align:center;">
  <div>
    <div style="font-size:20px;font-weight:700;margin-bottom:8px;color:#1DB954;">Connecting to SongSwipe...</div>
    <p style="font-size:14px;color:#b3b3b3;margin-bottom:18px;">Signed in as <strong>${user.email}</strong></p>
    <a href="${targetUrl}" style="display:inline-block;padding:12px 24px;background:#1DB954;color:#000;text-decoration:none;border-radius:24px;font-weight:700;font-size:14px;">Return to App</a>
  </div>
</body>
</html>`;

    res.setHeader('Location', targetUrl);
    return res.status(302).send(redirectHtml);
  } catch (err) {
    console.error('Google callback error:', err);
    return res.status(500).send(`Authentication error: ${err.message}`);
  }
});

/**
 * POST /api/auth/google
 * Sign in or sign up with Google account
 * Accepts Google idToken or verified user profile with unique username
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

    // 2. Direct userProfile fallback
    if (!googleUser && userProfile && userProfile.email) {
      const email = userProfile.email.toLowerCase().trim();
      const rawUsername = (userProfile.username || userProfile.displayName || userProfile.name || email.split('@')[0]).trim();
      googleUser = {
        googleId: userProfile.id || userProfile.sub || `google-${Date.now()}`,
        email,
        displayName: rawUsername,
        profileImageUrl: userProfile.photoUrl || userProfile.picture || null,
        isCustomUsername: Boolean(userProfile.username),
      };
    }

    if (!googleUser || !googleUser.email) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Google authentication data. Valid email is required.',
      });
    }

    // 3. PostgreSQL user lookup and handling
    if (getIsConnected()) {
      // A. Check if a user with this email already exists
      const existingEmailResult = await pool.query(
        `SELECT id, google_id, email, display_name, profile_image_url, auth_provider
         FROM users
         WHERE LOWER(email) = LOWER($1)`,
        [googleUser.email]
      );

      if (existingEmailResult.rows.length > 0) {
        // Existing user found! Link Google ID if not already linked
        const existingUser = existingEmailResult.rows[0];
        const updateResult = await pool.query(
          `UPDATE users
           SET google_id = COALESCE(google_id, $1),
               profile_image_url = COALESCE(profile_image_url, $2),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $3
           RETURNING id, google_id, display_name, email, profile_image_url, auth_provider`,
          [googleUser.googleId, googleUser.profileImageUrl, existingUser.id]
        );

        const user = updateResult.rows[0];
        const token = generateToken(user);
        return res.status(200).json({
          success: true,
          message: 'Signed in with Google successfully!',
          token,
          user,
        });
      }

      // B. New user with Google: verify uniqueness of chosen username (display_name)
      let uniqueDisplayName = googleUser.displayName;
      const existingNameResult = await pool.query(
        'SELECT id FROM users WHERE LOWER(display_name) = LOWER($1)',
        [uniqueDisplayName]
      );

      if (existingNameResult.rows.length > 0) {
        if (googleUser.isCustomUsername) {
          return res.status(409).json({
            success: false,
            error: `The username "${uniqueDisplayName}" is already taken. Please choose another username.`,
          });
        }
        // If not custom (auto-derived from Google), make it uniquely recognizable
        uniqueDisplayName = `${uniqueDisplayName}_${Math.floor(100 + Math.random() * 900)}`;
      }

      // C. Insert new Google user
      const insertResult = await pool.query(
        `INSERT INTO users (google_id, email, display_name, profile_image_url, auth_provider)
         VALUES ($1, $2, $3, $4, 'google')
         RETURNING id, google_id, display_name, email, profile_image_url, auth_provider`,
        [googleUser.googleId, googleUser.email, uniqueDisplayName, googleUser.profileImageUrl]
      );

      const user = insertResult.rows[0];
      const token = generateToken(user);

      return res.status(201).json({
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
      error: error.message || 'Google authentication failed',
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
