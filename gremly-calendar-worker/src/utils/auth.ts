/**
 * Verify a Supabase-issued JWT using HS256 shared secret and return the user ID.
 * Returns null if the token is invalid, expired, unsigned, or the signature doesn't match.
 *
 * This replaces a decode-only implementation that accepted any well-formed JWT
 * with a matching user_id claim — including forged tokens.
 */
export async function extractUserIdFromToken(
  token: string,
  secret: string,
): Promise<string | null> {
  if (!token || !secret) return null;

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, signatureB64] = parts;

    // Check the algorithm is HS256
    const headerJson = atob(headerB64.replace(/-/g, '+').replace(/_/g, '/'));
    const header = JSON.parse(headerJson);
    if (header.alg !== 'HS256') return null;

    // Verify the signature
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const signatureBytes = Uint8Array.from(
      atob(signatureB64.replace(/-/g, '+').replace(/_/g, '/')),
      (c) => c.charCodeAt(0),
    );
    const signedData = encoder.encode(`${headerB64}.${payloadB64}`);
    const valid = await crypto.subtle.verify('HMAC', key, signatureBytes, signedData);
    if (!valid) return null;

    // Decode the payload and check expiry
    const payloadJson = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(payloadJson);
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;

    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch (err) {
    console.warn('[extractUserIdFromToken] Verification failed:', (err as Error)?.message ?? err);
    return null;
  }
}
