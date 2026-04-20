import { supabase } from '../supabase/client';

/**
 * Cached session access token for synchronous reads (SSE streaming calls).
 * Updated on every auth state change and on first async read.
 */
let cachedToken: string | null = null;

// Subscribe to auth state changes to keep cache fresh
supabase.auth.onAuthStateChange((_event, session) => {
  cachedToken = session?.access_token ?? null;
});

/**
 * Get the current Supabase session access token (JWT) for authenticating
 * outbound worker calls. Returns null if no session is active.
 *
 * Phase 6.2 will enforce server-side verification of this token.
 */
export async function getSessionToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token ?? null;
    cachedToken = token;
    return token;
  } catch {
    return cachedToken;
  }
}

/**
 * Synchronous read of the last-known session token.
 * Used by SSE streaming calls that cannot await.
 * Returns null before the first auth state change fires.
 */
export function getSessionTokenSync(): string | null {
  return cachedToken;
}
