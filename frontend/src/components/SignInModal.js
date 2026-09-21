import React, { useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { COLORS } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { api, getBackendUrl } from '../services/api';

WebBrowser.maybeCompleteAuthSession();

export default function SignInModal({ visible, onClose, onGoogleSuccess }) {
  const { login, register, setSession, updateUser, continueAsGuest } = useAuth();

  // Mode: 'signin' | 'signup' | 'choose_username'
  const [mode, setMode] = useState('signin');

  // Form states
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Post-Google username selection states
  const [chosenHandle, setChosenHandle] = useState('');
  const [googleUser, setGoogleUser] = useState(null);

  // Independent Loading & Error states
  const [isEmailLoading, setIsEmailLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isHandleSaving, setIsHandleSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const isSignUp = mode === 'signup';
  const isChooseUsername = mode === 'choose_username';

  const switchMode = (newMode) => {
    setMode(newMode);
    setErrorMessage('');
  };

  // Live password complexity checks
  const hasMinLength = password.length > 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password);

  // Handle Standard Email & Password Submit
  const handleSubmit = async () => {
    setErrorMessage('');

    if (!email.trim() || !password.trim()) {
      setErrorMessage('Please enter both email/username and password.');
      return;
    }

    setIsEmailLoading(true);

    try {
      if (isSignUp) {
        const cleanUsername = displayName.trim();
        if (!cleanUsername) {
          setErrorMessage('Please choose a unique username.');
          setIsEmailLoading(false);
          return;
        }
        if (cleanUsername.length < 3 || cleanUsername.length > 30) {
          setErrorMessage('Username must be between 3 and 30 characters.');
          setIsEmailLoading(false);
          return;
        }
        if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) {
          setErrorMessage('Username can only contain letters, numbers, and underscores.');
          setIsEmailLoading(false);
          return;
        }
        if (!hasMinLength) {
          setErrorMessage('Password must be more than 8 characters long.');
          setIsEmailLoading(false);
          return;
        }
        if (!hasUppercase) {
          setErrorMessage('Password must contain at least one uppercase letter (A-Z).');
          setIsEmailLoading(false);
          return;
        }
        if (!hasNumber) {
          setErrorMessage('Password must contain at least one number (0-9).');
          setIsEmailLoading(false);
          return;
        }
        if (!hasSpecial) {
          setErrorMessage('Password must contain at least one special character (!, @, #, $, etc.).');
          setIsEmailLoading(false);
          return;
        }

        const res = await register(email.trim(), password, cleanUsername);
        if (res.success) {
          onClose();
        } else {
          setErrorMessage(res.error || 'Registration failed.');
        }
      } else {
        const res = await login(email.trim(), password);
        if (res.success) {
          onClose();
        } else {
          setErrorMessage(res.error || 'Invalid email/username or password.');
        }
      }
    } catch (err) {
      setErrorMessage(err.message || 'An error occurred. Please try again.');
    } finally {
      setIsEmailLoading(false);
    }
  };

  // Handle Google Sign-In via native WebBrowser OAuth session
  const handleGoogleSignIn = async () => {
    setErrorMessage('');
    setIsGoogleLoading(true);

    try {
      // 1. Create redirect deep-link for Expo Go or standalone app
      const redirectUri = Linking.createURL('auth');
      const backendUrl = getBackendUrl();
      const authUrl = `${backendUrl}/api/auth/google/authorize?redirect_uri=${encodeURIComponent(redirectUri)}`;

      // 2. Open authentic Google OAuth browser session
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

      if (result.type === 'success' && result.url) {
        // Parse redirect parameters
        const parsed = Linking.parse(result.url);
        // Robust parameter parsing for both Linking and standard URL
        let token = parsed.queryParams?.token;
        let emailParam = parsed.queryParams?.email;
        let displayNameParam = parsed.queryParams?.displayName;
        let userId = parsed.queryParams?.userId;
        let isNewUser =
          parsed.queryParams?.isNewUser === 'true' ||
          parsed.queryParams?.isNewUser === true;
        let needsUsername =
          parsed.queryParams?.needsUsername === 'true' ||
          parsed.queryParams?.needsUsername === true ||
          isNewUser ||
          parsed.queryParams?.hasChosenUsername === 'false' ||
          parsed.queryParams?.hasChosenUsername === false;

        // Fallback parameter parsing if queryParams is incomplete
        if (result.url.includes('?')) {
          try {
            const urlStr = result.url.replace(/^[^?]+\?/, 'http://localhost/?');
            const searchParams = new URL(urlStr).searchParams;
            if (!token) token = searchParams.get('token');
            if (!emailParam) emailParam = searchParams.get('email');
            if (!displayNameParam) displayNameParam = searchParams.get('displayName');
            if (!userId) userId = searchParams.get('userId');
            if (searchParams.has('needsUsername')) {
              needsUsername = searchParams.get('needsUsername') === 'true';
            } else if (searchParams.has('isNewUser')) {
              needsUsername = searchParams.get('isNewUser') === 'true';
            }
          } catch (e) {}
        }

        if (token) {
          const userObj = {
            id: userId,
            email: emailParam,
            display_name: displayNameParam,
            auth_provider: 'google',
            has_chosen_username: !needsUsername,
            needsUsername,
          };

          // Update active authentication session
          setSession(token, userObj);

          if (needsUsername) {
            // New Google signup -> Mandatory prompt to choose a unique handle
            setGoogleUser(userObj);
            const initialHandle = (displayNameParam || emailParam?.split('@')[0] || 'user')
              .replace(/[^a-zA-Z0-9_]/g, '')
              .toLowerCase();
            setChosenHandle(initialHandle);
            setMode('choose_username');
          } else {
            // Existing account with unique username set -> Sign in immediately
            onClose();
            if (onGoogleSuccess) {
              onGoogleSuccess(userObj, false);
            }
          }
        } else {
          setErrorMessage('Google authentication did not return a valid session.');
        }
      } else if (result.type === 'cancel' || result.type === 'dismiss') {
        // User dismissed browser - no error needed
      }
    } catch (err) {
      console.warn('Google auth error:', err);
      setErrorMessage(err.message || 'Could not connect to Google authentication.');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  // Save the unique handle chosen after Google login
  const handleSaveHandle = async () => {
    setErrorMessage('');
    const clean = chosenHandle.trim();

    if (!clean) {
      setErrorMessage('Please enter a username.');
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

    setIsHandleSaving(true);

    try {
      const res = await api.updateUsername(clean);
      if (res.success && res.user) {
        updateUser(res.user);
        onClose();
        if (onGoogleSuccess) {
          onGoogleSuccess(res.user, false);
        }
      } else {
        setErrorMessage(res.error || 'Failed to set username. Please try another.');
      }
    } catch (err) {
      setErrorMessage(err.message || 'Username already taken. Please choose another.');
    } finally {
      setIsHandleSaving(false);
    }
  };

  const handleGuest = () => {
    continueAsGuest();
    onClose();
  };

  const handleCloseModal = () => {
    if (isChooseUsername) {
      setErrorMessage('A unique username is required to complete setting up your account.');
      return;
    }
    setMode('signin');
    setErrorMessage('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleCloseModal}
    >
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            {/* Header with dismiss */}
            <View style={styles.header}>
              <View style={styles.brandRow}>
                <Ionicons name="musical-notes" size={26} color={COLORS.primary} />
                <Text style={styles.brandTitle}>
                  song<Text style={styles.brandAccent}>Swipe</Text>
                </Text>
              </View>
              {!isChooseUsername && (
                <TouchableOpacity style={styles.closeBtn} onPress={handleCloseModal}>
                  <Ionicons name="close" size={22} color={COLORS.textPrimary} />
                </TouchableOpacity>
              )}
            </View>

            {/* ERROR BANNER */}
            {errorMessage ? (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={18} color={COLORS.nopeRed} />
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            {/* DEDICATED POST-GOOGLE "CHOOSE UNIQUE USERNAME" VIEW */}
            {isChooseUsername ? (
              <View style={styles.chooseHandleContainer}>
                <View style={styles.badgeCircle}>
                  <Ionicons name="at" size={32} color={COLORS.primary} />
                </View>

                <Text style={styles.chooseTitle}>Choose Your Unique Username</Text>
                <Text style={styles.chooseSubtitle}>
                  Welcome to SongSwipe! Set your unique handle to identify your profile and playlists across the app.
                </Text>

                <View style={styles.inputWrapper}>
                  <Text style={styles.atSymbol}>@</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="username"
                    placeholderTextColor={COLORS.textMuted}
                    value={chosenHandle}
                    onChangeText={(text) => {
                      setChosenHandle(text.toLowerCase());
                      setErrorMessage('');
                    }}
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={30}
                  />
                </View>

                <Text style={styles.hintText}>
                  3–30 characters • Letters, numbers, and underscores only
                </Text>

                <TouchableOpacity
                  style={[styles.primaryBtn, isHandleSaving && { opacity: 0.75 }]}
                  onPress={handleSaveHandle}
                  disabled={isHandleSaving}
                  activeOpacity={0.8}
                >
                  {isHandleSaving ? (
                    <ActivityIndicator color="#000" />
                  ) : (
                    <Text style={styles.primaryBtnText}>Save Username & Continue</Text>
                  )}
                </TouchableOpacity>

                <View style={styles.requiredNoticeRow}>
                  <Ionicons name="shield-checkmark-outline" size={16} color={COLORS.primary} />
                  <Text style={styles.requiredNoticeText}>
                    A unique username is required to complete account setup.
                  </Text>
                </View>
              </View>
            ) : (
              /* STANDARD SIGN IN / CREATE ACCOUNT VIEW */
              <View>
                {/* View Title & Subtitle */}
                <Text style={styles.welcomeText}>
                  {isSignUp ? 'Create your account' : 'Welcome back'}
                </Text>
                <Text style={styles.subtitleText}>
                  {isSignUp
                    ? 'Sign up with a unique username to save tracks to your playlist.'
                    : 'Sign in with your email or username to access your saved songs.'}
                </Text>

                {/* Segmented Tab Switcher */}
                <View style={styles.tabContainer}>
                  <TouchableOpacity
                    style={[styles.tabBtn, !isSignUp && styles.activeTabBtn]}
                    onPress={() => switchMode('signin')}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.tabText, !isSignUp && styles.activeTabText]}>
                      Sign In
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.tabBtn, isSignUp && styles.activeTabBtn]}
                    onPress={() => switchMode('signup')}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.tabText, isSignUp && styles.activeTabText]}>
                      Create Account
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Form Inputs */}
                <View style={styles.formContainer}>
                  {/* Unique Username Input (Visible on Create Account) */}
                  {isSignUp && (
                    <View>
                      <Text style={styles.fieldLabel}>Unique Username</Text>
                      <View style={styles.inputWrapper}>
                        <Ionicons name="at-outline" size={20} color={COLORS.textSecondary} />
                        <TextInput
                          style={styles.textInput}
                          placeholder="Choose unique username (e.g. janred)"
                          placeholderTextColor={COLORS.textMuted}
                          value={displayName}
                          onChangeText={setDisplayName}
                          autoCapitalize="none"
                          autoCorrect={false}
                        />
                      </View>
                    </View>
                  )}

                  {/* Email / Username Input */}
                  <Text style={styles.fieldLabel}>
                    {isSignUp ? 'Email Address' : 'Email or Username'}
                  </Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons
                      name={isSignUp ? 'mail-outline' : 'person-outline'}
                      size={20}
                      color={COLORS.textSecondary}
                    />
                    <TextInput
                      style={styles.textInput}
                      placeholder={isSignUp ? 'your.email@example.com' : 'Email address or username'}
                      placeholderTextColor={COLORS.textMuted}
                      value={email}
                      onChangeText={setEmail}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      autoCorrect={false}
                    />
                  </View>

                  {/* Password Input */}
                  <Text style={styles.fieldLabel}>Password</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="lock-closed-outline" size={20} color={COLORS.textSecondary} />
                    <TextInput
                      style={styles.textInput}
                      placeholder={isSignUp ? 'Create a safe password' : 'Enter your password'}
                      placeholderTextColor={COLORS.textMuted}
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                    />
                    <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                      <Ionicons
                        name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                        size={20}
                        color={COLORS.textSecondary}
                      />
                    </TouchableOpacity>
                  </View>

                  {/* Live Password Rules Checklist (on Create Account) */}
                  {isSignUp && (
                    <View style={styles.rulesContainer}>
                      <Text style={styles.rulesTitle}>Password must include:</Text>

                      <View style={styles.ruleRow}>
                        <Ionicons
                          name={hasMinLength ? 'checkmark-circle' : 'ellipse-outline'}
                          size={14}
                          color={hasMinLength ? COLORS.primary : COLORS.textMuted}
                        />
                        <Text style={[styles.ruleText, hasMinLength && styles.ruleTextValid]}>
                          More than 8 characters
                        </Text>
                      </View>

                      <View style={styles.ruleRow}>
                        <Ionicons
                          name={hasUppercase ? 'checkmark-circle' : 'ellipse-outline'}
                          size={14}
                          color={hasUppercase ? COLORS.primary : COLORS.textMuted}
                        />
                        <Text style={[styles.ruleText, hasUppercase && styles.ruleTextValid]}>
                          At least one uppercase letter (A-Z)
                        </Text>
                      </View>

                      <View style={styles.ruleRow}>
                        <Ionicons
                          name={hasNumber ? 'checkmark-circle' : 'ellipse-outline'}
                          size={14}
                          color={hasNumber ? COLORS.primary : COLORS.textMuted}
                        />
                        <Text style={[styles.ruleText, hasNumber && styles.ruleTextValid]}>
                          At least one number (0-9)
                        </Text>
                      </View>

                      <View style={styles.ruleRow}>
                        <Ionicons
                          name={hasSpecial ? 'checkmark-circle' : 'ellipse-outline'}
                          size={14}
                          color={hasSpecial ? COLORS.primary : COLORS.textMuted}
                        />
                        <Text style={[styles.ruleText, hasSpecial && styles.ruleTextValid]}>
                          At least one special character (!, @, #, $, %, etc.)
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* Email/Password Submit Button */}
                  <TouchableOpacity
                    style={[styles.primaryBtn, isEmailLoading && { opacity: 0.75 }]}
                    onPress={handleSubmit}
                    disabled={isEmailLoading || isGoogleLoading}
                    activeOpacity={0.8}
                  >
                    {isEmailLoading ? (
                      <ActivityIndicator color="#000" />
                    ) : (
                      <Text style={styles.primaryBtnText}>
                        {isSignUp ? 'Create Account' : 'Sign In'}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>

                {/* Divider */}
                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>OR</Text>
                  <View style={styles.dividerLine} />
                </View>

                {/* Authentic Google Sign-In Button */}
                <TouchableOpacity
                  style={[styles.googleBtn, isGoogleLoading && { opacity: 0.75 }]}
                  onPress={handleGoogleSignIn}
                  disabled={isEmailLoading || isGoogleLoading}
                  activeOpacity={0.8}
                >
                  {isGoogleLoading ? (
                    <ActivityIndicator color={COLORS.textPrimary} />
                  ) : (
                    <View style={styles.googleBtnRow}>
                      <Ionicons name="logo-google" size={20} color="#EA4335" />
                      <Text style={styles.googleBtnText}>Continue with Google</Text>
                    </View>
                  )}
                </TouchableOpacity>

                {/* Continue as Guest */}
                <TouchableOpacity style={styles.guestBtn} onPress={handleGuest}>
                  <Text style={styles.guestText}>Continue as Guest</Text>
                </TouchableOpacity>
              </View>
            )}
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
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  brandRow: {
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
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeText: {
    color: COLORS.textPrimary,
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 6,
  },
  subtitleText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  activeTabBtn: {
    backgroundColor: COLORS.cardBackground,
  },
  tabText: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  activeTabText: {
    color: COLORS.textPrimary,
    fontWeight: '800',
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
  formContainer: {
    gap: 14,
  },
  fieldLabel: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.cardBackground,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 52,
  },
  textInput: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 15,
  },
  rulesContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 10,
    padding: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  rulesTitle: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ruleText: {
    color: COLORS.textMuted,
    fontSize: 12,
  },
  ruleTextValid: {
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  primaryBtn: {
    backgroundColor: COLORS.primary,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '800',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  dividerText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.cardBackground,
    borderWidth: 1,
    borderColor: COLORS.border,
    height: 52,
    borderRadius: 26,
    marginBottom: 16,
  },
  googleBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  googleBtnText: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  guestBtn: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  guestText: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  chooseHandleContainer: {
    alignItems: 'center',
    paddingTop: 10,
    gap: 10,
  },
  badgeCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(29, 185, 84, 0.12)',
    borderWidth: 2,
    borderColor: 'rgba(29, 185, 84, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  chooseTitle: {
    color: COLORS.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  chooseSubtitle: {
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  atSymbol: {
    color: COLORS.primary,
    fontSize: 18,
    fontWeight: '800',
  },
  hintText: {
    color: COLORS.textMuted,
    fontSize: 12,
    alignSelf: 'flex-start',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  requiredNoticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
  },
  requiredNoticeText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
});
