# 🎵 SongSwipe

A full-stack mobile application ("Tinder for Spotify") consisting of an **Express & Node.js backend**, **PostgreSQL database**, and a **React Native (Expo) frontend** optimized for iPhone, architected to support future Spotify user OAuth account linking.

---

## 🏗️ Architecture Overview

```
songSwipe/
├── backend/                      # Node.js + Express API
│   ├── src/
│   │   ├── config/
│   │   │   └── db.js            # PostgreSQL connection pool with in-memory fallback
│   │   ├── db/
│   │   │   ├── schema.sql       # PostgreSQL DDL (users, tracks, playlists)
│   │   │   └── migrate.js       # Migration runner
│   │   ├── routes/
│   │   │   ├── tracks.js        # GET /api/tracks (Spotify Web API client credentials)
│   │   │   ├── playlists.js     # POST /api/playlists/swipe, GET /api/playlists
│   │   │   └── users.js         # OAuth skeleton for Spotify account linking
│   │   ├── services/
│   │   │   └── spotifyService.js# Spotify API client credentials & fallback demos
│   │   └── server.js            # Express server entry point (Port 3001)
│   ├── .env.example
│   └── package.json
│
├── frontend/                     # React Native Expo App (iPhone-focused)
│   ├── src/
│   │   ├── components/
│   │   │   ├── AppHeader.js     # Top bar with status & settings
│   │   │   ├── CardDeck.js      # PanResponder swipe gestures, rotation & haptics
│   │   │   ├── TrackCard.js     # Album art, badges, sound waves, progress bar
│   │   │   ├── BottomControls.js# Pass, Like, Play/Pause, Playlist drawer buttons
│   │   │   ├── LikedPlaylistModal.js # Saved songs list with in-modal audio preview
│   │   │   └── SettingsModal.js # IP configuration & database status
│   │   ├── constants/
│   │   │   └── theme.js         # Spotify dark theme palette & shadows
│   │   ├── hooks/
│   │   │   └── useAudioPlayer.js# Expo-AV audio streaming with iOS silent mode
│   │   └── services/
│   │       └── api.js           # API client with auto-detected backend IP
│   ├── App.js                   # Root application container
│   ├── app.json                 # Expo configuration with audio background mode
│   └── package.json
│
├── docker-compose.yml            # 1-command PostgreSQL service
├── package.json                  # Root monorepo scripts
└── README.md
```

---

## 🚀 Quick Start

### 1. Start the Backend

```bash
# From project root:
npm run backend

# Or inside backend directory:
cd backend
npm run dev
```

The Express server starts on **`http://localhost:3001`** (avoiding macOS port 5000 AirPlay conflicts).
> **Note**: If PostgreSQL is not yet running, the backend automatically boots in **resilient in-memory mode**, so you can test the frontend immediately!

---

### 2. Start the Frontend (Expo / React Native)

```bash
# From project root:
npm run frontend

# To target iOS Simulator directly:
npm run frontend:ios
```

- Press **`i`** in the terminal to launch the **iOS Simulator**.
- Or scan the QR code with your iPhone camera to run in the **Expo Go** app.

---

## 🗄️ PostgreSQL Setup Guide (When You're Ready)

You don't need PostgreSQL running to test right now, but when you are ready to persist data to a real database, use any of these 3 easy methods:

### Method A: Docker Compose (Easiest - 1 Command)
Since Docker is installed on your Mac:
```bash
# Starts PostgreSQL 16 and automatically runs schema.sql
docker compose up -d

# Verify it's running:
docker compose ps
```

### Method B: Homebrew PostgreSQL
```bash
# Start PostgreSQL service:
brew services start postgresql@14 # or postgresql

# Create the database:
createdb songswipe

# Run schema migrations:
npm run db:migrate
```

### Method C: Cloud PostgreSQL (Supabase / Neon / Render)
1. Create a free PostgreSQL instance on [Supabase](https://supabase.com) or [Neon](https://neon.tech).
2. Copy the connection string and paste it into `backend/.env`:
   ```env
   DATABASE_URL=postgresql://user:password@ep-host.region.aws.neon.tech/songswipe?sslmode=require
   ```
3. Run migrations:
   ```bash
   npm run db:migrate
   ```

---

## 🔑 Spotify API Setup (Client Credentials)

SongSwipe includes curated fallback tracks with working 30-second audio previews out of the box. To stream live Spotify catalog tracks:

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Click **Create App**:
   - **App name**: `SongSwipe`
   - **App description**: `Song swipe discovery`
   - **Redirect URI**: `http://localhost:3001/api/users/spotify/callback`
   - Select **Web API**.
3. Open `backend/.env` and insert your credentials:
   ```env
   CLIENT_ID=your_actual_spotify_client_id
   CLIENT_SECRET=your_actual_spotify_client_secret
   ```
4. Restart the backend: `npm run backend`.

---

## 🔐 Future Spotify OAuth Architecture

SongSwipe was built with future Spotify user authorization in mind:

1. **Database Schema**:
   - `users`: Stores `spotify_id`, `spotify_access_token`, `spotify_refresh_token`, and `spotify_token_expires_at`.
   - `tracks`: Caches Spotify track ID and metadata.
   - `playlists`: Links user IDs to track IDs, with a `spotify_playlist_id` column ready to mirror app playlists directly to a user's Spotify account.
2. **Backend Endpoints Ready in `src/routes/users.js`**:
   - `GET /api/users/spotify/login`: Generates authorization URL with scopes `user-read-private`, `playlist-modify-public`, `playlist-modify-private`.
   - `GET /api/users/spotify/callback`: Exchanges OAuth authorization code for Spotify user access & refresh tokens and upserts the profile into the PostgreSQL `users` table.

---

## 📱 Mobile Features (iPhone / iOS)

- **Card Deck Swiping**: Smooth 60 FPS gesture mechanics powered by `PanResponder` and `Animated` (drag, rotational tilting, green **LIKE** & red **PASS** stamps).
- **Audio Previews**: Automatic playback of Spotify 30-second previews using `expo-audio`, with iOS silent-mode override (`playsInSilentMode: true`).
- **Tactile Haptics**: Light haptic triggers when dragging past the swipe threshold, and success vibrations on right swipes (`expo-haptics`).
- **Playlist Drawer**: Interactive modal displaying all liked tracks with in-modal playback.
- **Network Resiliency**: Dynamic backend URL selector allowing seamless switching between `localhost` (iOS simulator) and your Mac's LAN IP (`192.168.1.36:3001`) for physical iPhone testing.

---

## 🧠 Recommendation & Swiping Discovery Algorithm

SongSwipe features a retention-focused, adaptive recommendation engine inspired by TikTok and Spotify Discover Weekly, designed to continuously learn from user interactions while keeping the catalog fresh and storage lean.

### 1. How Songs Are Chosen (The 70 / 20 / 10 Engine)

Every batch of 10 discovery cards is assembled using a balanced **Exploit / Explore / Serendipity** distribution:

* **70% Exploit (Known Favorites & Profile Genres)**:
  * Pulls tracks from the user's top-liked artists (weighted by right-swipes) and their chosen **Profile Favorite Genres**.
* **20% Explore (Musically Adjacent Artists)**:
  * Uses an internal artist proximity matrix to introduce musically related artists (e.g., liking *Billie Eilish* introduces *Djo*, *Hozier*, or *Dominic Fike*; liking *The Weeknd* introduces *Brent Faiyaz* or *Steve Lacy*).
* **10% Serendipity (Trending Wildcards)**:
  * Injects current viral breakout hits to test appetite for new music without breaking the session's flow.

---

### 2. Profile Genres + Behavioral Swiping Integration

* **Day 1 / Cold Start**: Before any swipes are recorded, the user's **Profile Favorite Genres** take dominant control of the Exploit and Explore buckets, ensuring cards immediately match their chosen style.
* **Micro-Learning**: As the user swipes, the algorithm learns specific artist preferences within those genres (right-swipe = +1.0 affinity, left-swipe = -0.5 penalty).
* **Instant Refresh**: Updating genres in the Profile modal immediately fires `onGenresUpdated()`, reloading the swipe queue with fresh cards.

---

### 3. 10-Day Rolling Cooldown & Misswipe Recirculation

Permanent song blacklisting is avoided to address real-world usage patterns:
* **Misswipes & Mood Changes**: Users frequently skip songs accidentally or may appreciate an upbeat track on a Friday that they skipped on a Monday morning.
* **10-Day Sliding Deduplication**: Songs swiped within the last 10 days are strictly excluded from appearing again in the deck.
* **Second Chances**: After 10 days, passed songs naturally age out of the exclusion filter and become eligible to reappear as fresh discoveries.

---

### 4. Automated Database Pruning (Zero Storage Bloat)

To ensure the app stays permanently within free-tier cloud database quotas (Neon, Supabase 500MB) without slowing down queries:
* **Periodic Cleanup**: Background job runs on server startup and every 12 hours:
  ```sql
  DELETE FROM user_swipes WHERE created_at < NOW() - INTERVAL '10 days';
  ```
* **Performance Indexing**: Indexed on `user_swipes(created_at)` for sub-millisecond pruning and range filtering.
* **Storage Footprint**: The `user_swipes` table stays tiny (< 5MB) even with thousands of active listeners.

---

### 5. Continuous Stream & Audio Previews

* **Background Prefetching**: When the user reaches 3 cards before the end of their current deck, the app silently fetches the next 10 personalized recommendations in the background for an uninterrupted infinite swipe stream.
* **30s Studio Previews**: Real 30-second studio preview clips are resolved and verified for every candidate track.