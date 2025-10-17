/**
 * AuthProvider - Manages authentication state
 * Improved version with better error handling and loading states
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase/client';
import { FLAGS } from '../config/flags';
import type { Session, User } from '@supabase/supabase-js';

interface AuthContextValue {
  user: User | null;
  userId: string | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
  signInWithEmail: (email: string, password?: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const AUTH_STORAGE_KEY = '@gremly:auth:session';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize auth state
  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      try {
        // Skip Supabase in memory mode
        if (FLAGS.REPO_BACKEND === 'memory') {
          if (mounted) {
            setLoading(false);
          }
          return;
        }

        // Check for stored session
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

        // Get current session from Supabase
        const {
          data: { session: currentSession },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          console.error('Auth session error:', sessionError);
          if (mounted) {
            setError(sessionError.message);
          }
        } else if (currentSession && mounted) {
          setSession(currentSession);
          setUser(currentSession.user);
          await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(currentSession));
        }
      } catch (err) {
        console.error('Auth initialization error:', err);
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Authentication failed');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    initAuth();

    // Listen for auth changes
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!mounted) return;

      if (__DEV__) {
        console.log('[AuthProvider] Auth state change:', event);
      }

      setSession(newSession);
      setUser(newSession?.user ?? null);
      setError(null);

      // Persist session
      if (newSession) {
        await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(newSession));
      } else {
        await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
      }

      // Handle specific events
      switch (event) {
        case 'SIGNED_OUT':
          setUser(null);
          setSession(null);
          break;
        case 'TOKEN_REFRESHED':
          if (__DEV__) {
            console.log('[AuthProvider] Token refreshed successfully');
          }
          break;
        case 'USER_UPDATED':
          if (newSession?.user) {
            setUser(newSession.user);
          }
          break;
      }
    });

    return () => {
      mounted = false;
      authListener?.subscription.unsubscribe();
    };
  }, []);

  const signInWithEmail = async (email: string, password?: string) => {
    setLoading(true);
    setError(null);

    try {
      if (FLAGS.REPO_BACKEND === 'memory') {
        // Mock auth for memory mode
        const mockUser = {
          id: 'memory-user',
          email,
          created_at: new Date().toISOString(),
        } as User;

        setUser(mockUser);
        setSession({ user: mockUser } as Session);
        return;
      }

      let result;
      if (password) {
        // Email + password sign in
        result = await supabase.auth.signInWithPassword({ email, password });
      } else {
        // Magic link
        result = await supabase.auth.signInWithOtp({
          email,
          options: {
            shouldCreateUser: true,
          },
        });
      }

      if (result.error) {
        throw result.error;
      }

      if (!password && __DEV__) {
        console.log('[AuthProvider] Magic link sent to:', email);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign in failed';
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    setLoading(true);
    setError(null);

    try {
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

  return (
    <AuthContext.Provider
      value={{
        user,
        userId: user?.id ?? null,
        session,
        loading,
        error,
        signInWithEmail,
        signOut,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
