import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, FontAwesome } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

WebBrowser.maybeCompleteAuthSession();

const AVAILABLE_GENRES = [
  { id: 'pop', label: 'Pop', icon: 'musical-note' },
  { id: 'rock', label: 'Rock', icon: 'flame' },
  { id: 'hip-hop', label: 'Hip-Hop', icon: 'mic' },
  { id: 'r-b', label: 'R&B', icon: 'heart' },
  { id: 'indie', label: 'Indie', icon: 'leaf' },
  { id: 'electronic', label: 'Electronic', icon: 'pulse' },
  { id: 'country', label: 'Country', icon: 'radio' },
  { id: 'latin', label: 'Latin', icon: 'flash' },
  { id: 'jazz', label: 'Jazz', icon: 'cafe' },
  { id: 'classical', label: 'Classical', icon: 'library' },
];

export default function ProfileModal({ visible, onClose, onGenresUpdated }) {
  const { user, updateUser, logout, refreshUser } = useAuth();

  const [username, setUsername] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Genres state
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [isSavingGenres, setIsSavingGenres] = useState(false);
  const [genreSuccessMessage, setGenreSuccessMessage] = useState('');
  const [genreErrorMessage, setGenreErrorMessage] = useState('');

  // Spotify linking state
  const [isConnectingSpotify, setIsConnectingSpotify] = useState(false);
  const [isDisconnectingSpotify, setIsDisconnectingSpotify] = useState(false);
  const [spotifySuccessMessage, setSpotifySuccessMessage] = useState('');
  const [spotifyErrorMessage, setSpotifyErrorMessage] = useState('');

  // Sync profile data whenever modal opens
  useEffect(() => {
    if (visible && user) {
      setUsername(user.display_name || user.email?.split('@')[0] || '');
      setSelectedGenres(Array.isArray(user.favorite_genres) ? user.favorite_genres : []);
      setErrorMessage('');
      setSuccessMessage('');
      setGenreSuccessMessage('');
      setGenreErrorMessage('');
      setSpotifySuccessMessage('');
      setSpotifyErrorMessage('');
    }
  }, [visible, user]);

  const toggleGenre = (genreId) => {
    setGenreSuccessMessage('');
    setGenreErrorMessage('');
    setSelectedGenres((prev) =>
      prev.includes(genreId) ? prev.filter((g) => g !== genreId) : [...prev, genreId]
    );
  };

  const handleSaveGenres = async () => {
    setIsSavingGenres(true);
    setGenreSuccessMessage('');
    setGenreErrorMessage('');
    try {
      const res = await api.updateGenres(selectedGenres);
      if (res.success && res.user) {
        updateUser(res.user);
        setGenreSuccessMessage('Music preferences saved! Next song batch will adapt to your genres.');
        if (onGenresUpdated) {
          onGenresUpdated();
        }
      } else {
        setGenreErrorMessage(res.error || 'Failed to save preferences.');
      }
    } catch (err) {
      setGenreErrorMessage(err.message || 'Failed to save preferences.');
    } finally {
      setIsSavingGenres(false);
    }
  };

  const handleSaveUsername = async () => {
    setErrorMessage('');
    setSuccessMessage('');
    const clean = username.trim();

    if (!clean) {
      setErrorMessage('Username cannot be empty.');
      return;
    }

    if (clean.length < 3 || clean.length > 30) {
      setErrorMessage('Username must be between 3 and 30 characters.');
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(clean)) {
      setErrorMessage('Username can only contain letters, numbers, and underscores.');
      return;
    }

    if (clean === user?.display_name) {
      setSuccessMessage('Username is already up to date.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await api.updateUsername(clean);
      if (res.success && res.user) {
        updateUser(res.user);
        setSuccessMessage('Username updated successfully!');
      } else {
        setErrorMessage(res.error || 'Failed to update username.');
      }
    } catch (err) {
      setErrorMessage(err.message || 'Username is already taken. Please choose another.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnectSpotify = async () => {
    setIsConnectingSpotify(true);
    setSpotifySuccessMessage('');
    setSpotifyErrorMessage('');

    try {
      const redirectUri = Linking.createURL('spotify-connected');
      const authUrl = await api.getSpotifyAuthUrl(redirectUri);
      if (!authUrl) {
        throw new Error('Could not retrieve Spotify authorization link.');
      }

      // Open OAuth sheet in-app
      const result = await WebBrowser.openAuthSessionAsync(
        authUrl,
        redirectUri
      );

      // Refresh user profile after auth session completes/dismisses
      if (refreshUser) {
        await refreshUser();
      }

      const latestUser = await api.getMe();
      if (latestUser && latestUser.spotify_id) {
        updateUser(latestUser);
        const name = latestUser.spotify_display_name || latestUser.spotify_id;
        setSpotifySuccessMessage(`Connected to Spotify as @${name}!`);
      }
    } catch (err) {
      console.warn('Spotify connect error:', err);
      setSpotifyErrorMessage(err.message || 'Failed to connect Spotify account.');
    } finally {
      setIsConnectingSpotify(false);
    }
  };

  const handleDisconnectSpotify = () => {
    Alert.alert(
      'Disconnect Spotify',
      'Are you sure you want to disconnect your Spotify account from SongSwipe?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            setIsDisconnectingSpotify(true);
            setSpotifySuccessMessage('');
            setSpotifyErrorMessage('');
            try {
              const res = await api.disconnectSpotify();
              if (res.success && res.user) {
                updateUser(res.user);
                setSpotifySuccessMessage('Spotify account unlinked successfully.');
              }
            } catch (err) {
              setSpotifyErrorMessage(err.message || 'Failed to disconnect Spotify.');
            } finally {
              setIsDisconnectingSpotify(false);
            }
          },
        },
      ]
    );
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out of SongSwipe?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: () => {
            onClose();
            logout();
          },
        },
      ]
    );
  };

  if (!user) return null;

  const isGoogle = user.auth_provider === 'google';
  const initial = (user.display_name || user.email || 'U').charAt(0).toUpperCase();
  const avatarUrl = user.spotify_profile_image_url || user.profile_image_url;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Account & Profile</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                <Ionicons name="close" size={22} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            {/* Profile Avatar Card */}
            <View style={styles.avatarSection}>
              <View style={styles.avatarWrapper}>
                <View
                  style={[
                    styles.avatarCircle,
                    isGoogle && styles.avatarCircleGoogle,
                    user.spotify_id && styles.avatarCircleSpotify,
                  ]}
                >
                  {avatarUrl ? (
                    <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                  ) : (
                    <Text style={styles.avatarInitial}>{initial}</Text>
                  )}
                </View>
                {user.spotify_id ? (
                  <View style={styles.spotifyProviderBadge}>
                    <FontAwesome name="spotify" size={13} color="#000" />
                  </View>
                ) : isGoogle ? (
                  <View style={styles.providerBadge}>
                    <Ionicons name="logo-google" size={14} color="#FFF" />
                  </View>
                ) : null}
              </View>

              <Text style={styles.profileName}>@{user.display_name || 'username'}</Text>
              <Text style={styles.profileEmail}>{user.email || 'No email registered'}</Text>

              <View style={styles.badgeRow}>
                <View style={styles.authBadge}>
                  <Ionicons
                    name={isGoogle ? 'logo-google' : 'mail'}
                    size={12}
                    color={isGoogle ? '#EA4335' : COLORS.primary}
                  />
                  <Text style={styles.authBadgeText}>
                    {isGoogle ? 'Google Account' : 'Email Account'}
                  </Text>
                </View>
                {user.spotify_id ? (
                  <View style={[styles.authBadge, styles.spotifyAuthBadge]}>
                    <FontAwesome name="spotify" size={13} color={COLORS.primary} />
                    <Text style={[styles.authBadgeText, { color: COLORS.primary }]}>
                      Spotify Linked
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            {/* Feedback Banners */}
            {errorMessage ? (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={18} color={COLORS.nopeRed} />
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            {successMessage ? (
              <View style={styles.successBanner}>
                <Ionicons name="checkmark-circle" size={18} color={COLORS.primary} />
                <Text style={styles.successText}>{successMessage}</Text>
              </View>
            ) : null}

            {/* Edit Username Section */}
            <View style={styles.editSection}>
              <Text style={styles.sectionTitle}>Modify Unique Username</Text>
              <Text style={styles.sectionSubtitle}>
                Your username is unique across SongSwipe and identifies your profile.
              </Text>

              <View style={styles.inputWrapper}>
                <Text style={styles.atPrefix}>@</Text>
                <TextInput
                  style={styles.textInput}
                  value={username}
                  onChangeText={(text) => {
                    setUsername(text.toLowerCase());
                    setErrorMessage('');
                    setSuccessMessage('');
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={30}
                  placeholder="new_username"
                  placeholderTextColor={COLORS.textMuted}
                />
              </View>

              <Text style={styles.hintText}>
                3–30 characters • Letters, numbers, and underscores only
              </Text>

              <TouchableOpacity
                style={[styles.saveBtn, isLoading && { opacity: 0.7 }]}
                onPress={handleSaveUsername}
                disabled={isLoading}
                activeOpacity={0.8}
              >
                {isLoading ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <View style={styles.saveBtnRow}>
                    <Ionicons name="checkmark-sharp" size={18} color="#000" />
                    <Text style={styles.saveBtnText}>Save Changes</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {/* Favorite Music Genres Section */}
            <View style={styles.genresSection}>
              <View style={styles.genreHeaderRow}>
                <Ionicons name="musical-notes" size={20} color={COLORS.primary} />
                <Text style={styles.sectionTitle}>Favorite Music Genres</Text>
              </View>
              <Text style={styles.sectionSubtitle}>
                Select the genres you love so SongSwipe can curate cards tailored to your taste.
              </Text>

              {/* Genre Feedback Banners */}
              {genreErrorMessage ? (
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle" size={16} color={COLORS.nopeRed} />
                  <Text style={styles.errorText}>{genreErrorMessage}</Text>
                </View>
              ) : null}

              {genreSuccessMessage ? (
                <View style={styles.successBanner}>
                  <Ionicons name="checkmark-circle" size={16} color={COLORS.primary} />
                  <Text style={styles.successText}>{genreSuccessMessage}</Text>
                </View>
              ) : null}

              {/* Genre Chips Grid */}
              <View style={styles.genreGrid}>
                {AVAILABLE_GENRES.map((g) => {
                  const isSelected = selectedGenres.includes(g.id);
                  return (
                    <TouchableOpacity
                      key={g.id}
                      style={[styles.genreChip, isSelected && styles.genreChipSelected]}
                      onPress={() => toggleGenre(g.id)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={g.icon}
                        size={15}
                        color={isSelected ? '#000' : COLORS.textSecondary}
                      />
                      <Text
                        style={[
                          styles.genreChipText,
                          isSelected && styles.genreChipTextSelected,
                        ]}
                      >
                        {g.label}
                      </Text>
                      {isSelected && (
                        <Ionicons name="checkmark-circle" size={14} color="#000" />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.genreCountText}>
                {selectedGenres.length === 0
                  ? 'No genres selected • Swipe feed shows all trending hits'
                  : `${selectedGenres.length} genre${selectedGenres.length > 1 ? 's' : ''} selected • Feed tailored to your picks`}
              </Text>

              <TouchableOpacity
                style={[styles.saveGenresBtn, isSavingGenres && { opacity: 0.7 }]}
                onPress={handleSaveGenres}
                disabled={isSavingGenres}
                activeOpacity={0.8}
              >
                {isSavingGenres ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <View style={styles.saveBtnRow}>
                    <Ionicons name="sparkles" size={16} color="#000" />
                    <Text style={styles.saveBtnText}>Save Music Preferences</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {/* Spotify Account Section */}
            <View style={styles.spotifySection}>
              <View style={styles.spotifyHeaderRow}>
                <FontAwesome name="spotify" size={22} color={COLORS.primary} />
                <Text style={styles.sectionTitle}>Spotify Account</Text>
              </View>
              <Text style={styles.sectionSubtitle}>
                {user.spotify_id
                  ? 'Your Spotify account is connected to SongSwipe. Liked tracks can sync directly to your personal library.'
                  : 'Link your Spotify account to export liked songs to Spotify and personalize your discovery feed.'}
              </Text>

              {/* Feedback Banners */}
              {spotifyErrorMessage ? (
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle" size={16} color={COLORS.nopeRed} />
                  <Text style={styles.errorText}>{spotifyErrorMessage}</Text>
                </View>
              ) : null}

              {spotifySuccessMessage ? (
                <View style={styles.successBanner}>
                  <Ionicons name="checkmark-circle" size={16} color={COLORS.primary} />
                  <Text style={styles.successText}>{spotifySuccessMessage}</Text>
                </View>
              ) : null}

              {user.spotify_id ? (
                <View style={styles.spotifyLinkedCard}>
                  <View style={styles.spotifyInfoRow}>
                    {user.spotify_profile_image_url ? (
                      <View style={styles.spotifyAvatarWrapper}>
                        <Image
                          source={{ uri: user.spotify_profile_image_url }}
                          style={styles.spotifyAvatarImg}
                        />
                        <View style={styles.spotifyAvatarBadge}>
                          <FontAwesome name="spotify" size={10} color="#000" />
                        </View>
                      </View>
                    ) : (
                      <View style={styles.spotifyIconCircle}>
                        <FontAwesome name="spotify" size={24} color={COLORS.primary} />
                      </View>
                    )}
                    <View style={styles.spotifyTextInfo}>
                      <View style={styles.spotifyPillRow}>
                        <View style={styles.spotifyActiveDot} />
                        <Text style={styles.spotifyPillText}>CONNECTED</Text>
                      </View>
                      <Text style={styles.spotifyUsernameText} numberOfLines={1}>
                        @{user.spotify_display_name || user.spotify_id}
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.disconnectSpotifyBtn, isDisconnectingSpotify && { opacity: 0.7 }]}
                    onPress={handleDisconnectSpotify}
                    disabled={isDisconnectingSpotify}
                    activeOpacity={0.8}
                  >
                    {isDisconnectingSpotify ? (
                      <ActivityIndicator size="small" color={COLORS.nopeRed} />
                    ) : (
                      <View style={styles.saveBtnRow}>
                        <Ionicons name="unlink-outline" size={16} color={COLORS.nopeRed} />
                        <Text style={styles.disconnectSpotifyText}>Disconnect</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.connectSpotifyBtn, isConnectingSpotify && { opacity: 0.7 }]}
                  onPress={handleConnectSpotify}
                  disabled={isConnectingSpotify}
                  activeOpacity={0.85}
                >
                  {isConnectingSpotify ? (
                    <ActivityIndicator color="#000" />
                  ) : (
                    <View style={styles.saveBtnRow}>
                      <FontAwesome name="spotify" size={20} color="#000" />
                      <Text style={styles.connectSpotifyBtnText}>Connect Spotify Account</Text>
                    </View>
                  )}
                </TouchableOpacity>
              )}
            </View>

            {/* Divider */}
            <View style={styles.divider} />

            {/* Sign Out Action */}
            <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut} activeOpacity={0.8}>
              <Ionicons name="log-out-outline" size={20} color={COLORS.nopeRed} />
              <Text style={styles.signOutText}>Sign Out</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  headerTitle: {
    color: COLORS.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginBottom: 20,
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 12,
  },
  avatarCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: COLORS.surface,
    borderWidth: 2,
    borderColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCircleGoogle: {
    borderColor: '#EA4335',
  },
  avatarCircleSpotify: {
    borderColor: COLORS.primary,
  },
  avatarImage: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  avatarInitial: {
    color: COLORS.textPrimary,
    fontSize: 32,
    fontWeight: '800',
  },
  providerBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#EA4335',
    borderWidth: 2,
    borderColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spotifyProviderBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.primary,
    borderWidth: 2,
    borderColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileName: {
    color: COLORS.textPrimary,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 4,
  },
  profileEmail: {
    color: COLORS.textSecondary,
    fontSize: 14,
    marginBottom: 10,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  authBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  authBadgeText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(233, 20, 41, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(233, 20, 41, 0.3)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: COLORS.nopeRed,
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(29, 185, 84, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(29, 185, 84, 0.3)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  successText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  editSection: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sectionTitle: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  sectionSubtitle: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 52,
    marginBottom: 6,
  },
  atPrefix: {
    color: COLORS.primary,
    fontSize: 18,
    fontWeight: '800',
    marginRight: 4,
  },
  textInput: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  hintText: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginBottom: 16,
    paddingHorizontal: 2,
  },
  saveBtn: {
    backgroundColor: COLORS.primary,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  saveBtnText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '800',
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 24,
  },
  genresSection: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 10,
  },
  genreHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  genreGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginVertical: 14,
  },
  genreChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  genreChipSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  genreChipText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  genreChipTextSelected: {
    color: '#000',
    fontWeight: '800',
  },
  genreCountText: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  saveGenresBtn: {
    backgroundColor: COLORS.primary,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(233, 20, 41, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(233, 20, 41, 0.3)',
    borderRadius: 24,
    height: 50,
  },
  signOutText: {
    color: COLORS.nopeRed,
    fontSize: 15,
    fontWeight: '700',
  },
  spotifyAuthBadge: {
    borderColor: 'rgba(29, 185, 84, 0.3)',
    backgroundColor: 'rgba(29, 185, 84, 0.1)',
  },
  spotifySection: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 14,
    marginBottom: 6,
  },
  spotifyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  spotifyLinkedCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(29, 185, 84, 0.2)',
  },
  spotifyInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  spotifyAvatarWrapper: {
    position: 'relative',
    width: 48,
    height: 48,
  },
  spotifyAvatarImg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  spotifyAvatarBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.primary,
    borderWidth: 1.5,
    borderColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spotifyIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(29, 185, 84, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spotifyTextInfo: {
    flex: 1,
  },
  spotifyPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  spotifyActiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  spotifyPillText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  spotifyUsernameText: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  disconnectSpotifyBtn: {
    backgroundColor: 'rgba(233, 20, 41, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(233, 20, 41, 0.25)',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disconnectSpotifyText: {
    color: COLORS.nopeRed,
    fontSize: 13,
    fontWeight: '700',
  },
  connectSpotifyBtn: {
    backgroundColor: COLORS.primary,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  connectSpotifyBtnText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '800',
  },
});
