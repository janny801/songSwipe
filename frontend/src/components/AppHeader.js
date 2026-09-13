import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';

export default function AppHeader({ onOpenSettings, isConnected = true, onRefresh }) {
  return (
    <View style={styles.headerContainer}>
      <TouchableOpacity
        style={styles.settingsBtn}
        onPress={onOpenSettings}
        activeOpacity={0.7}
      >
        <Ionicons name="options-outline" size={24} color={COLORS.textPrimary} />
        {!isConnected && <View style={styles.offlineDot} />}
      </TouchableOpacity>

      {/* Brand Title */}
      <View style={styles.brandTitleContainer}>
        <Ionicons name="musical-notes" size={22} color={COLORS.primary} />
        <Text style={styles.brandTitle}>
          song<Text style={styles.brandAccent}>Swipe</Text>
        </Text>
      </View>

      {/* Refresh tracks button */}
      <TouchableOpacity
        style={styles.refreshBtn}
        onPress={onRefresh}
        activeOpacity={0.7}
      >
        <Ionicons name="sync-outline" size={22} color={COLORS.textPrimary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  settingsBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
