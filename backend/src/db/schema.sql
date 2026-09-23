-- PostgreSQL Database Schema for SongSwipe
-- Structured to support Google Auth, standard Email/Password, Spotify OAuth, and swipe-to-like behavior

-- Enable UUID extension if supported/needed
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users table
-- Accommodates Google Sign-In, Email/Password, anonymous guests, and Spotify OAuth linking
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_id VARCHAR(255) UNIQUE,
    spotify_id VARCHAR(255) UNIQUE,
    display_name VARCHAR(255),
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255),
    profile_image_url TEXT,
    auth_provider VARCHAR(50) DEFAULT 'email',
    has_chosen_username BOOLEAN DEFAULT FALSE,
    spotify_access_token TEXT,
    spotify_refresh_token TEXT,
    spotify_token_expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Ensure columns exist if table was already created earlier
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(50) DEFAULT 'email';
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_chosen_username BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS favorite_genres TEXT[] DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS spotify_display_name VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS spotify_profile_image_url TEXT;

-- Tracks table
-- Caches Spotify track metadata, preview URLs, and album artwork
CREATE TABLE IF NOT EXISTS tracks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    spotify_track_id VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    artist VARCHAR(255) NOT NULL,
    album VARCHAR(255),
    album_art_url TEXT,
    preview_url TEXT,
    duration_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Playlists table
-- Links users to liked tracks (from right-swipe action)
-- Includes playlist_name for custom playlists and spotify_playlist_id for future Spotify playlist export/sync
CREATE TABLE IF NOT EXISTS playlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    track_id UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    playlist_name VARCHAR(100) DEFAULT 'Liked Songs',
    spotify_playlist_id VARCHAR(255),
    swiped_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_user_track_playlist UNIQUE (user_id, track_id, playlist_name)
);

-- User-created custom playlists defined on profile
CREATE TABLE IF NOT EXISTS user_custom_playlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_user_custom_playlist UNIQUE (user_id, name)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_playlists_user_id ON playlists(user_id);
CREATE INDEX IF NOT EXISTS idx_playlists_track_id ON playlists(track_id);
CREATE INDEX IF NOT EXISTS idx_playlists_user_name ON playlists(user_id, playlist_name);
CREATE INDEX IF NOT EXISTS idx_user_custom_playlists_user_id ON user_custom_playlists(user_id);
CREATE INDEX IF NOT EXISTS idx_tracks_spotify_id ON tracks(spotify_track_id);
CREATE UNIQUE INDEX IF NOT EXISTS users_display_name_lower_idx ON users (LOWER(display_name));
CREATE INDEX IF NOT EXISTS idx_users_spotify_id ON users(spotify_id);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (LOWER(email));
