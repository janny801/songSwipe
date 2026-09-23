import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Alert, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';

export default function AppHeader({
  onOpenSettings,
  isConnected = true,
  onRefresh,
  user,
  onOpenSignIn,
  onOpenProfile,
}) {
  const isUserLoggedIn = Boolean(user && user.auth_provider !== 'guest');
  const avatarUrl = user?.spotify_profile_image_url || user?.profile_image_url;

  const handleProfilePress = () => {
    if (isUserLoggedIn) {
      onOpenProfile && onOpenProfile();
    } else {
      onOpenSignIn && onOpenSignIn();
    }
  };

  return (
    <View style={styles.headerContainer}>
      {/* Settings Button */}
      <TouchableOpacity
        style={styles.iconBtn}
        onPress={onOpenSettings}
        activeOpacity={0.7}
      >
        <Ionicons name="options-outline" size={22} color={COLORS.textPrimary} />
        {!isConnected && <View style={styles.offlineDot} />}
      </TouchableOpacity>

      {/* Brand Title */}
      <View style={styles.brandTitleContainer}>
        <Ionicons name="musical-notes" size={22} color={COLORS.primary} />
        <Text style={styles.brandTitle}>
          song<Text style={styles.brandAccent}>Swipe</Text>
        </Text>
      </View>

      {/* Right Controls: User Profile / Sign In & Refresh */}
      <View style={styles.rightActions}>
        <TouchableOpacity
          style={[styles.authPill, isUserLoggedIn && styles.authPillLoggedIn]}
          onPress={handleProfilePress}
          activeOpacity={0.8}
        >
          {isUserLoggedIn ? (
            <>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.headerAvatar} />
              ) : user.auth_provider === 'google' ? (
                <Ionicons name="logo-google" size={14} color="#EA4335" />
              ) : (
                <Ionicons name="person-circle" size={16} color={COLORS.primary} />
              )}
              <Text style={styles.authPillText} numberOfLines={1}>
                {user.display_name?.split(' ')[0] || 'Me'}
              </Text>
            </>
          ) : (
            <>
              <Ionicons name="log-in-outline" size={15} color="#000" />
              <Text style={styles.authPillTextGuest}>Sign In</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.iconBtn}
          onPress={onRefresh}
          activeOpacity={0.7}
        >
          <Ionicons name="sync-outline" size={20} color={COLORS.textPrimary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  offlineDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.nopeRed,
    borderWidth: 2,
    borderColor: COLORS.background,
  },
  brandTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  brandTitle: {
    color: COLORS.textPrimary,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  brandAccent: {
    color: COLORS.primary,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  authPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  authPillLoggedIn: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  authPillTextGuest: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '700',
  },
  authPillText: {
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '600',
    maxWidth: 60,
  },
  headerAvatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
});
