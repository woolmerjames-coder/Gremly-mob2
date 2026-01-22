/**
 * Extract user ID from Supabase JWT token
 *
 * In a real implementation, you'd verify the JWT signature.
 * For now, we decode and trust (since we're behind HTTPS and the
 * token comes from our app).
 *
 * TODO: Add proper JWT verification using Supabase JWT secret
 */

export function extractUserIdFromToken(authHeader: string | null): string | null {
  if (!authHeader) {
    return null;
  }

  // Remove "Bearer " prefix
  const token = authHeader.replace(/^Bearer\s+/i, '');

  if (!token) {
    return null;
  }

  try {
    // JWT is three base64 parts: header.payload.signature
    const parts = token.split('.');
    if (parts.length !== 3) {
      console.error('[Auth] Invalid JWT format');
      return null;
    }

    // Decode the payload (second part)
    const payload = JSON.parse(atob(parts[1]));

    // Supabase JWTs have 'sub' as the user ID
    const userId = payload.sub;

    if (!userId || typeof userId !== 'string') {
      console.error('[Auth] No user ID in token');
      return null;
    }

    // Check expiration
    if (payload.exp) {
      const expTime = payload.exp * 1000; // Convert to milliseconds
      if (Date.now() > expTime) {
        console.error('[Auth] Token expired');
        return null;
      }
    }

    return userId;
  } catch (err) {
    console.error('[Auth] Failed to decode token:', err);
    return null;
  }
}
