const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
require('dotenv').config();

const { testConnection, getIsConnected } = require('./config/db');
const tracksRouter = require('./routes/tracks');
const playlistsRouter = require('./routes/playlists');
const usersRouter = require('./routes/users');
const authRouter = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Routes
app.use('/api/auth', authRouter);
app.use('/api/tracks', tracksRouter);
app.use('/api/playlists', playlistsRouter);
app.use('/api/users', usersRouter);

// Healthcheck & Diagnostic Endpoint
app.get('/api/health', (req, res) => {
  const hasSpotifyCredentials = Boolean(
    (process.env.CLIENT_ID || process.env.SPOTIFY_CLIENT_ID) &&
    (process.env.CLIENT_SECRET || process.env.SPOTIFY_CLIENT_SECRET) &&
    process.env.CLIENT_ID !== 'your_spotify_client_id_here'
  );

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: {
      connected: getIsConnected(),
      status: getIsConnected() ? 'PostgreSQL Active' : 'In-memory fallback (PostgreSQL pending setup)',
    },
    spotify: {
      credentialsConfigured: hasSpotifyCredentials,
      mode: hasSpotifyCredentials ? 'Live Spotify Web API' : 'Demo Tracks Mode',
    },
    version: '1.0.0',
  });
});

// Root welcome message
app.get('/', (req, res) => {
  res.json({
    name: 'SongSwipe Backend API',
    description: 'Tinder-for-Spotify Fullstack Application',
    endpoints: {
      health: 'GET /api/health',
      tracks: 'GET /api/tracks',
      playlists: 'GET /api/playlists',
      swipeLike: 'POST /api/playlists/swipe',
      spotifyOAuthLogin: 'GET /api/users/spotify/login',
    },
  });
});

// Start server on 0.0.0.0 so iOS simulators and physical devices on LAN can connect
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`\n==================================================`);
  console.log(`🎵 SongSwipe Backend Server running on port ${PORT}`);
  console.log(`📡 Local URL:   http://localhost:${PORT}`);
  console.log(`🩺 Health check: http://localhost:${PORT}/api/health`);
  console.log(`==================================================\n`);

  // Check PostgreSQL connection status
  await testConnection();
});
