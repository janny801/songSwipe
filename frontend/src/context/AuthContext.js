import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { api, setAuthToken } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGuest, setIsGuest] = useState(false);

  // Check current session
  const checkAuthStatus = useCallback(async () => {
    if (!token) return;
    try {
      const profile = await api.getMe();
      if (profile) {
        setUser(profile);
      }
    } catch (e) {
      console.warn('Check auth error:', e.message);
    }
  }, [token]);

  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  // Handle successful auth
  const handleAuthSuccess = (data) => {
    if (data.token) {
      setToken(data.token);
      setAuthToken(data.token);
    }
    if (data.user) {
      setUser(data.user);
    }
    setIsGuest(false);
  };

  // Sign in with Email and Password
  const login = async (email, password) => {
    setIsLoading(true);
    try {
      const data = await api.login({ email, password });
      handleAuthSuccess(data);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    } finally {
      setIsLoading(false);
    }
  };

  // Create an account with Email, Password & Name
  const register = async (email, password, displayName) => {
    setIsLoading(true);
    try {
      const data = await api.register({ email, password, displayName });
      handleAuthSuccess(data);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    } finally {
      setIsLoading(false);
    }
  };

  // Sign in or register with Google OAuth
  const loginWithGoogle = async (userProfile, idToken = null) => {
    setIsLoading(true);
    try {
      const data = await api.googleAuth({ idToken, userProfile });
      handleAuthSuccess(data);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    } finally {
      setIsLoading(false);
    }
  };

  // Continue as Guest without creating an account
  const continueAsGuest = () => {
    setIsGuest(true);
    setUser({
      id: '00000000-0000-0000-0000-000000000001',
      display_name: 'Guest Listener',
      email: null,
      auth_provider: 'guest',
    });
  };

  // Sign Out
  const logout = () => {
    setUser(null);
    setToken(null);
    setAuthToken(null);
    setIsGuest(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: Boolean(user && !isGuest),
        isGuest,
        isLoading,
        login,
        register,
        loginWithGoogle,
        logout,
        continueAsGuest,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
