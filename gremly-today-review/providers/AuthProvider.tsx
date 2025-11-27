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
          if (__DEV__) {
            console.log('[AuthProvider] session user.id:', currentSession.user.id);
          }
        } else if (!currentSession && mounted) {
          // No existing session - auto sign in anonymously
          console.log('[Auth] No session found, signing in anonymously...');

          const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously();

          if (anonError) {
            console.error('[Auth] Anonymous sign-in failed:', anonError.message);
            if (mounted) {
              setError(anonError.message);
              // Show fallback error
              if (__DEV__) {
                console.error(
                  '[Auth] CRITICAL: Anonymous sign-in failed. App may not function correctly.',
                );
                console.log('[Auth] Continuing without authentication for development...');
                // Create a mock user for development
                const mockUser = {
                  id: 'dev-user-' + Math.random().toString(36).substr(2, 9),
                  email: 'dev@example.com',
                  user_metadata: {},
                  app_metadata: {},
                  aud: 'authenticated',
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                };
                setUser(mockUser as any);
              }
            }
          } else if (anonData?.session && anonData?.user && mounted) {
            console.log('[Auth] anonymous signed in', { userId: anonData.user.id });
            setSession(anonData.session);
            setUser(anonData.user);
            await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(anonData.session));
            if (__DEV__) {
              console.log('[AuthProvider] session user.id:', anonData.user.id);
            }
          }
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
        if (newSession) {
          console.log('[AuthProvider] session user.id:', newSession.user.id);
        }
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

  const devSignIn = async () => {
    if (!__DEV__) {
      throw new Error('devSignIn is only available in development mode');
    }

    setLoading(true);
    setError(null);

    try {
      if (FLAGS.REPO_BACKEND === 'memory') {
        // Mock auth for memory mode
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

      // Try anonymous sign-in first
      let result = await supabase.auth.signInAnonymously();

      if (result.error) {
        // Anonymous auth not enabled, fall back to hardcoded dev user
        console.log('[DevLogin] Anonymous auth not available, trying dev user...');

        const devEmail = 'dev@gremly.test';
        const devPassword = 'devdevdev';

        result = await supabase.auth.signInWithPassword({
          email: devEmail,
          password: devPassword,
        });

        if (result.error) {
          // User doesn't exist or wrong password
          throw new Error(
            `Dev user (${devEmail}) doesn't exist or password is incorrect. ` +
              `Please create this user in Supabase Dashboard → Authentication → Users ` +
              `with password: ${devPassword}`,
          );
        }
      }

      if (result.data?.session) {
        console.log('[DevLogin] signed in', { userId: result.data.session.user.id });
      }
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

  const waitForSession = async (timeoutMs: number = 5000): Promise<Session | null> => {
    // If already have session, return it
    if (session) {
      return session;
    }

    // If not loading and no session, return null
    if (!loading) {
      return null;
    }

    // Wait for auth to finish loading or timeout
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(null);
      }, timeoutMs);

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

  return (
    <AuthContext.Provider
      value={{
        user,
        userId: user?.id ?? null,
        session,
        loading,
        error,
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
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
