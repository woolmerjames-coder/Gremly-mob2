/**
 * AuthProvider - Manages authentication state
 * Updated with Google Sign-In support for native iOS
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  GoogleSignin,
  isSuccessResponse,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from '../lib/supabase/client';
import { useGremlyStore } from '../lib/store/useGremlyStore';
import { FLAGS } from '../config/flags';
import type { Session, User } from '@supabase/supabase-js';

// Configure Google Sign-In on module load
GoogleSignin.configure({
  iosClientId: '81105861621-ombuvivk9f9kifkoji8pgvnfsvstovqi.apps.googleusercontent.com',
  webClientId: '81105861621-9cj79c9dtderk21druo7st1o0fqva5hs.apps.googleusercontent.com',
  offlineAccess: false,
});

interface AuthContextValue {
  user: User | null;
  userId: string | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signInWithEmail: (email: string, password?: string) => Promise<void>;
  devSignIn: () => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
  waitForSession: (timeoutMs?: number) => Promise<Session | null>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const AUTH_STORAGE_KEY = '@gremly:auth:session';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const initialize = useGremlyStore((state) => state.initialize);
  const reset = useGremlyStore((state) => state.reset);
  const isStoreInitialized = useGremlyStore((state) => state.isInitialized);

  useEffect(() => {
    const initializeStore = async () => {
      if (__DEV__) console.log('[AuthProvider] initializeStore called, user.id:', user?.id);
      if (user?.id) {
        try {
          await initialize(user.id);
        } catch (error) {
          console.error('[AuthProvider] Failed to initialize store:', error);
        }
      } else {
        reset();
      }
    };
    initializeStore();
  }, [user?.id, initialize, reset]);

  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      try {
        if (FLAGS.REPO_BACKEND === 'memory') {
          if (mounted) setLoading(false);
          return;
        }

        const storedSession = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
        if (storedSession && mounted) {
          try {
            const parsedSession = JSON.parse(storedSession);
            setSession(parsedSession);
            setUser(parsedSession.user);
          } catch (e) {
            console.error('Failed to parse stored session:', e);
            await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
          }
        }

        const {
          data: { session: currentSession },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          console.error('Auth session error:', sessionError);
          if (mounted) setError(sessionError.message);
        } else if (currentSession && mounted) {
          setSession(currentSession);
          setUser(currentSession.user);
          await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(currentSession));
          if (__DEV__)
            console.log('[AuthProvider] Session restored, user.id:', currentSession.user.id);
        } else if (!currentSession && mounted) {
          if (__DEV__) console.log('[AuthProvider] No session found, awaiting Google sign-in');
        }
      } catch (err) {
        console.error('Auth initialization error:', err);
        if (mounted) setError(err instanceof Error ? err.message : 'Authentication failed');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    initAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!mounted) return;
      if (__DEV__) {
        console.log('[AuthProvider] Auth state change:', event);
        if (newSession) console.log('[AuthProvider] session user.id:', newSession.user.id);
      }
      setSession(newSession);
      setUser(newSession?.user ?? null);
      setError(null);
      if (newSession) {
        await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(newSession));
      } else {
        await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
      }
      switch (event) {
        case 'SIGNED_OUT':
          setUser(null);
          setSession(null);
          break;
        case 'TOKEN_REFRESHED':
          if (__DEV__) console.log('[AuthProvider] Token refreshed successfully');
          break;
        case 'USER_UPDATED':
          if (newSession?.user) setUser(newSession.user);
          break;
      }
    });

    return () => {
      mounted = false;
      authListener?.subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = async () => {
    setLoading(true);
    setError(null);
    try {
      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();
      if (!isSuccessResponse(response)) {
        throw new Error('Google sign-in was not successful');
      }
      const { idToken } = response.data;
      if (!idToken) {
        throw new Error('No ID token returned from Google');
      }
      if (__DEV__)
        console.log('[AuthProvider] Google ID token received, exchanging with Supabase...');
      const { data, error: supabaseError } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      });
      if (supabaseError) throw supabaseError;
      if (__DEV__) console.log('[AuthProvider] Google sign-in successful:', data.user?.email);
    } catch (err) {
      let message = 'Google sign-in failed';
      if (isErrorWithCode(err)) {
        switch (err.code) {
          case statusCodes.SIGN_IN_CANCELLED:
            message = '';
            break;
          case statusCodes.IN_PROGRESS:
            message = 'Sign-in already in progress';
            break;
          case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
            message = 'Google Play Services not available';
            break;
          default:
            message = err.message || 'Google sign-in failed';
        }
      } else if (err instanceof Error) {
        message = err.message;
      }
      if (message) {
        console.error('[AuthProvider] Google sign-in error:', message);
        setError(message);
      }
      throw new Error(message || 'Sign-in cancelled');
    } finally {
      setLoading(false);
    }
  };

  const signInWithApple = async () => {
    if (Platform.OS !== 'ios') {
      throw new Error('Sign in with Apple is only available on iOS');
    }
    setLoading(true);
    setError(null);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        throw new Error('No identity token returned from Apple');
      }

      if (__DEV__)
        console.log('[AuthProvider] Apple identity token received, exchanging with Supabase...');

      const { data, error: supabaseError } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });

      if (supabaseError) throw supabaseError;

      // Apple only provides name on FIRST sign-in, save it if available
      if (credential.fullName?.givenName) {
        const fullName = [credential.fullName.givenName, credential.fullName.familyName]
          .filter(Boolean)
          .join(' ');

        await supabase.auth.updateUser({
          data: {
            full_name: fullName,
            given_name: credential.fullName.givenName,
            family_name: credential.fullName.familyName,
          },
        });
        if (__DEV__) console.log('[AuthProvider] Apple user name saved:', fullName);
      }

      if (__DEV__) console.log('[AuthProvider] Apple sign-in successful:', data.user?.email);
    } catch (err: any) {
      // User cancelled - don't show error
      if (err.code === 'ERR_REQUEST_CANCELED') {
        if (__DEV__) console.log('[AuthProvider] Apple sign-in cancelled by user');
        throw new Error(''); // Empty message for cancelled
      }

      const message = err instanceof Error ? err.message : 'Apple sign-in failed';
      console.error('[AuthProvider] Apple sign-in error:', message);
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  };

  const signInWithEmail = async (email: string, password?: string) => {
    setLoading(true);
    setError(null);
    try {
      if (FLAGS.REPO_BACKEND === 'memory') {
        const mockUser = { id: 'memory-user', email, created_at: new Date().toISOString() } as User;
        setUser(mockUser);
        setSession({ user: mockUser } as Session);
        return;
      }
      let result;
      if (password) {
        result = await supabase.auth.signInWithPassword({ email, password });
      } else {
        result = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
      }
      if (result.error) throw result.error;
      if (!password && __DEV__) console.log('[AuthProvider] Magic link sent to:', email);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign in failed';
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  };

  const devSignIn = async () => {
    if (!__DEV__) throw new Error('devSignIn is only available in development mode');
    setLoading(true);
    setError(null);
    try {
      if (FLAGS.REPO_BACKEND === 'memory') {
        const mockUser = {
          id: 'dev-user',
          email: 'dev@gremly.test',
          created_at: new Date().toISOString(),
        } as User;
        setUser(mockUser);
        setSession({ user: mockUser } as Session);
        console.log('[DevLogin] signed in (memory mode)', { userId: mockUser.id });
        return;
      }
      let result = await supabase.auth.signInAnonymously();
      if (result.error) {
        console.log('[DevLogin] Anonymous auth not available, trying dev user...');
        const devEmail = 'dev@gremly.test';
        const devPassword = 'devdevdev';
        result = await supabase.auth.signInWithPassword({ email: devEmail, password: devPassword });
        if (result.error) {
          throw new Error(`Dev user (${devEmail}) doesn't exist or password is incorrect.`);
        }
      }
      if (result.data?.session)
        console.log('[DevLogin] signed in', { userId: result.data.session.user.id });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Dev sign in failed';
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    setLoading(true);
    setError(null);
    reset();
    try {
      try {
        await GoogleSignin.signOut();
      } catch (e) {
        console.log('[AuthProvider] Google sign-out error (ignored):', e);
      }
      if (FLAGS.REPO_BACKEND === 'memory') {
        setUser(null);
        setSession(null);
        return;
      }
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign out failed';
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  };

  const clearError = () => setError(null);

  const waitForSession = async (timeoutMs: number = 5000): Promise<Session | null> => {
    if (session) return session;
    if (!loading) return null;
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(null), timeoutMs);
      const checkSession = () => {
        if (!loading) {
          clearTimeout(timeout);
          resolve(session);
        } else {
          setTimeout(checkSession, 100);
        }
      };
      checkSession();
    });
  };

  const isFullyLoaded = !loading && (!user || isStoreInitialized);

  return (
    <AuthContext.Provider
      value={{
        user,
        userId: user?.id ?? null,
        session,
        loading: !isFullyLoaded,
        error,
        signInWithGoogle,
        signInWithApple,
        signInWithEmail,
        devSignIn,
        signOut,
        clearError,
        waitForSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
