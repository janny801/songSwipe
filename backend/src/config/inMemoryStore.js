const bcrypt = require('bcryptjs');

// Pre-hashed default password 'Password123!' for demo seeds
const defaultHash = bcrypt.hashSync('Password123!', 10);

const inMemoryUsers = new Map([
  [
    '00000000-0000-0000-0000-000000000001',
    {
      id: '00000000-0000-0000-0000-000000000001',
      email: 'guest@songswipe.local',
      display_name: 'GuestListener',
      password_hash: defaultHash,
      auth_provider: 'email',
      has_chosen_username: true,
      profile_image_url: null,
      created_at: new Date().toISOString(),
    },
  ],
  [
    'b91cd078-cf4e-4a20-b61c-c6cf91f38f27',
    {
      id: 'b91cd078-cf4e-4a20-b61c-c6cf91f38f27',
      email: 'testuser@songswipe.com',
      display_name: 'TestListener',
      password_hash: defaultHash,
      auth_provider: 'email',
      has_chosen_username: true,
      profile_image_url: null,
      created_at: new Date().toISOString(),
    },
  ],
  [
    '368b9fab-a401-4430-98ef-f56ce8721be9',
    {
      id: '368b9fab-a401-4430-98ef-f56ce8721be9',
      email: 'jred8069@gmail.com',
      display_name: 'janred',
      password_hash: defaultHash,
      auth_provider: 'email',
      has_chosen_username: true,
      profile_image_url: null,
      created_at: new Date().toISOString(),
    },
  ],
]);

function findUserByEmailOrUsername(identifier) {
  const clean = (identifier || '').trim().toLowerCase();
  for (const user of inMemoryUsers.values()) {
    if (
      (user.email && user.email.toLowerCase() === clean) ||
      (user.display_name && user.display_name.toLowerCase() === clean)
    ) {
      return user;
    }
  }
  return null;
}

function findUserById(id) {
  return inMemoryUsers.get(id) || null;
}

function emailExists(email) {
  const clean = (email || '').trim().toLowerCase();
  for (const user of inMemoryUsers.values()) {
    if (user.email && user.email.toLowerCase() === clean) {
      return true;
    }
  }
  return false;
}

function usernameExists(username, excludeId = null) {
  const clean = (username || '').trim().toLowerCase();
  for (const user of inMemoryUsers.values()) {
    if (excludeId && user.id === excludeId) continue;
    if (user.display_name && user.display_name.toLowerCase() === clean) {
      return true;
    }
  }
  return false;
}

function createUser(userData) {
  const user = {
    id: userData.id || `usr-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    email: userData.email.toLowerCase().trim(),
    display_name: userData.display_name.trim(),
    password_hash: userData.password_hash || null,
    auth_provider: userData.auth_provider || 'email',
    has_chosen_username: Boolean(userData.has_chosen_username),
    favorite_genres: Array.isArray(userData.favorite_genres) ? userData.favorite_genres : [],
    profile_image_url: userData.profile_image_url || null,
    created_at: new Date().toISOString(),
  };
  inMemoryUsers.set(user.id, user);
  return user;
}

function updateUsername(userId, newUsername) {
  const user = inMemoryUsers.get(userId);
  if (!user) return null;
  user.display_name = newUsername.trim();
  user.has_chosen_username = true;
  user.updated_at = new Date().toISOString();
  return user;
}

function updateGenres(userId, genres) {
  const user = inMemoryUsers.get(userId);
  if (!user) return null;
  user.favorite_genres = Array.isArray(genres) ? genres : [];
  user.updated_at = new Date().toISOString();
  return user;
}

function updateSpotify(userId, spotifyData) {
  const user = inMemoryUsers.get(userId);
  if (!user) return null;
  user.spotify_id = spotifyData.spotify_id;
  user.spotify_display_name = spotifyData.spotify_display_name;
  user.spotify_profile_image_url = spotifyData.spotify_profile_image_url;
  user.spotify_access_token = spotifyData.spotify_access_token;
  user.spotify_refresh_token = spotifyData.spotify_refresh_token;
  user.spotify_token_expires_at = spotifyData.spotify_token_expires_at;
  user.updated_at = new Date().toISOString();
  return user;
}

function disconnectSpotify(userId) {
  const user = inMemoryUsers.get(userId);
  if (!user) return null;
  user.spotify_id = null;
  user.spotify_display_name = null;
  user.spotify_profile_image_url = null;
  user.spotify_access_token = null;
  user.spotify_refresh_token = null;
  user.spotify_token_expires_at = null;
  user.updated_at = new Date().toISOString();
  return user;
}

const inMemoryCustomPlaylists = new Map();
const inMemoryPlaylistTracks = [];

function getCustomPlaylists(userId, trackId = null) {
  const list = inMemoryCustomPlaylists.get(userId) || [];
  return list.map((pl) => {
    const trackCount = inMemoryPlaylistTracks.filter(
      (t) => t.userId === userId && t.playlistName === pl.name
    ).length;
    const hasTrack = trackId
      ? inMemoryPlaylistTracks.some(
          (t) =>
            t.userId === userId &&
            t.playlistName === pl.name &&
            ((t.track.spotify_track_id && t.track.spotify_track_id === trackId) || t.track.id === trackId)
        )
      : false;
    return {
      ...pl,
      track_count: trackCount,
      has_track: hasTrack,
    };
  });
}

function createCustomPlaylist(userId, name) {
  let list = inMemoryCustomPlaylists.get(userId);
  if (!list) {
    list = [];
    inMemoryCustomPlaylists.set(userId, list);
  }
  const clean = name.trim();
  if (list.some((p) => p.name.toLowerCase() === clean.toLowerCase())) {
    throw new Error(`Playlist "${clean}" already exists`);
  }
  const playlist = {
    id: `pl-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    name: clean,
    created_at: new Date().toISOString(),
    track_count: 0,
    has_track: false,
  };
  list.push(playlist);
  return playlist;
}

function deleteCustomPlaylist(userId, name) {
  const list = inMemoryCustomPlaylists.get(userId) || [];
  const filtered = list.filter((p) => p.name.toLowerCase() !== name.toLowerCase());
  inMemoryCustomPlaylists.set(userId, filtered);

  for (let i = inMemoryPlaylistTracks.length - 1; i >= 0; i--) {
    if (
      inMemoryPlaylistTracks[i].userId === userId &&
      inMemoryPlaylistTracks[i].playlistName.toLowerCase() === name.toLowerCase()
    ) {
      inMemoryPlaylistTracks.splice(i, 1);
    }
  }
  return true;
}

function addTrackToCustomPlaylists(userId, track, playlistNames) {
  const allowed = (inMemoryCustomPlaylists.get(userId) || []).map((p) => p.name);
  let added = 0;
  for (const name of playlistNames) {
    if (!allowed.includes(name)) continue;
    const trackKey = track.spotify_track_id || track.id;
    const exists = inMemoryPlaylistTracks.some(
      (t) =>
        t.userId === userId &&
        t.playlistName === name &&
        (t.track.spotify_track_id === trackKey || t.track.id === trackKey)
    );
    if (!exists) {
      inMemoryPlaylistTracks.push({
        id: `pl-entry-${Date.now()}-${Math.random()}`,
        userId,
        playlistName: name,
        track,
        swiped_at: new Date().toISOString(),
      });
      added++;
    }
  }
  return added;
}

const inMemoryUserSwipes = new Map(); // userId -> Map(spotify_track_id -> { ... })

function recordSwipe(userId, track, direction) {
  if (!inMemoryUserSwipes.has(userId)) {
    inMemoryUserSwipes.set(userId, new Map());
  }
  const userMap = inMemoryUserSwipes.get(userId);
  const trackId = track.spotify_track_id || track.id;
  userMap.set(trackId, {
    spotify_track_id: trackId,
    artist_name: track.artist || track.artists?.[0]?.name || 'Unknown Artist',
    track_name: track.name,
    direction,
    created_at: new Date().toISOString(),
  });
}

function deleteSwipe(userId, trackId) {
  const userMap = inMemoryUserSwipes.get(userId);
  if (!userMap) return false;

  const deleted = userMap.delete(trackId);
  if (userMap.size === 0) {
    inMemoryUserSwipes.delete(userId);
  }
  return deleted;
}

const SWIPE_RETENTION_DAYS = 10;

function pruneOldSwipes(days = SWIPE_RETENTION_DAYS) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  for (const [uid, userMap] of inMemoryUserSwipes.entries()) {
    for (const [trackId, swipe] of userMap.entries()) {
      if (new Date(swipe.created_at).getTime() < cutoff) {
        userMap.delete(trackId);
      }
    }
    if (userMap.size === 0) {
      inMemoryUserSwipes.delete(uid);
    }
  }
}

function getUserSwipes(userId) {
  if (!inMemoryUserSwipes.has(userId)) return [];
  pruneOldSwipes(SWIPE_RETENTION_DAYS);
  const cutoff = Date.now() - SWIPE_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const swipes = Array.from(inMemoryUserSwipes.get(userId)?.values() || []);
  return swipes.filter((s) => new Date(s.created_at).getTime() >= cutoff);
}

function deleteUser(userId) {
  inMemoryUsers.delete(userId);
  inMemoryCustomPlaylists.delete(userId);
  inMemoryUserSwipes.delete(userId);
  for (let i = inMemoryPlaylistTracks.length - 1; i >= 0; i--) {
    if (inMemoryPlaylistTracks[i].userId === userId) {
      inMemoryPlaylistTracks.splice(i, 1);
    }
  }
  return true;
}

module.exports = {
  inMemoryUsers,
  findUserByEmailOrUsername,
  findUserById,
  emailExists,
  usernameExists,
  createUser,
  updateUsername,
  updateGenres,
  updateSpotify,
  disconnectSpotify,
  getCustomPlaylists,
  createCustomPlaylist,
  deleteCustomPlaylist,
  addTrackToCustomPlaylists,
  deleteUser,
  recordSwipe,
  deleteSwipe,
  getUserSwipes,
  pruneOldSwipes,
};
