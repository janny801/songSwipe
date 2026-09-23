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
  user.spotify_access_token = null;
  user.spotify_refresh_token = null;
  user.spotify_token_expires_at = null;
  user.updated_at = new Date().toISOString();
  return user;
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
};
