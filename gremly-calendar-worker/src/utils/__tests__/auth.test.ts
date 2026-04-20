/**
 * Tests for extractUserIdFromToken — JWT HS256 signature verification.
 *
 * Covers: valid token extraction, tampered signature rejection,
 * algorithm enforcement, expiry, missing claims, and malformed tokens.
 */

// Polyfill crypto.subtle and TextEncoder for Node/Jest if not available
const { TextEncoder: TE, TextDecoder: TD } = require('util');
if (typeof globalThis.TextEncoder === 'undefined') {
  Object.defineProperty(globalThis, 'TextEncoder', { value: TE, writable: true });
  Object.defineProperty(globalThis, 'TextDecoder', { value: TD, writable: true });
}
const cryptoModule = globalThis.crypto?.subtle ? globalThis.crypto : require('crypto').webcrypto;
Object.defineProperty(globalThis, 'crypto', { value: cryptoModule, writable: true });

import { extractUserIdFromToken } from '../../utils/auth';

const TEST_SECRET = 'super-secret-jwt-key-for-testing';

// ─── Helper: create a valid HS256 JWT ────────────────────────────────────────

function base64url(data: string): string {
  return btoa(data).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function createHS256Token(
  payload: Record<string, unknown>,
  secret: string,
  headerOverride?: Record<string, unknown>,
): Promise<string> {
  const header = headerOverride ?? { alg: 'HS256', typ: 'JWT' };
  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${headerB64}.${payloadB64}`),
  );
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return `${headerB64}.${payloadB64}.${signatureB64}`;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('extractUserIdFromToken', () => {
  it('extracts user ID from a valid HS256 token', async () => {
    const token = await createHS256Token(
      { sub: 'user-abc-123', exp: Math.floor(Date.now() / 1000) + 3600 },
      TEST_SECRET,
    );
    const userId = await extractUserIdFromToken(token, TEST_SECRET);
    expect(userId).toBe('user-abc-123');
  });

  it('returns null for tampered signature', async () => {
    const token = await createHS256Token(
      { sub: 'user-abc-123', exp: Math.floor(Date.now() / 1000) + 3600 },
      TEST_SECRET,
    );
    // Tamper the last 10 chars of the signature
    const tampered = token.slice(0, -10) + 'aaaaaaaaaa';
    const userId = await extractUserIdFromToken(tampered, TEST_SECRET);
    expect(userId).toBeNull();
  });

  it('returns null for wrong secret', async () => {
    const token = await createHS256Token(
      { sub: 'user-abc-123', exp: Math.floor(Date.now() / 1000) + 3600 },
      TEST_SECRET,
    );
    const userId = await extractUserIdFromToken(token, 'wrong-secret');
    expect(userId).toBeNull();
  });

  it('returns null for alg: "none"', async () => {
    const token = await createHS256Token(
      { sub: 'user-abc-123', exp: Math.floor(Date.now() / 1000) + 3600 },
      TEST_SECRET,
      { alg: 'none', typ: 'JWT' },
    );
    const userId = await extractUserIdFromToken(token, TEST_SECRET);
    expect(userId).toBeNull();
  });

  it('returns null for alg: "RS256"', async () => {
    // Manually craft a token with RS256 header but HS256 sig
    const token = await createHS256Token(
      { sub: 'user-abc-123', exp: Math.floor(Date.now() / 1000) + 3600 },
      TEST_SECRET,
      { alg: 'RS256', typ: 'JWT' },
    );
    const userId = await extractUserIdFromToken(token, TEST_SECRET);
    expect(userId).toBeNull();
  });

  it('returns null for expired token', async () => {
    const token = await createHS256Token(
      { sub: 'user-abc-123', exp: Math.floor(Date.now() / 1000) - 60 },
      TEST_SECRET,
    );
    const userId = await extractUserIdFromToken(token, TEST_SECRET);
    expect(userId).toBeNull();
  });

  it('accepts token without exp claim (no expiry)', async () => {
    const token = await createHS256Token({ sub: 'user-no-exp' }, TEST_SECRET);
    const userId = await extractUserIdFromToken(token, TEST_SECRET);
    expect(userId).toBe('user-no-exp');
  });

  it('returns null for missing sub claim', async () => {
    const token = await createHS256Token(
      { name: 'Alice', exp: Math.floor(Date.now() / 1000) + 3600 },
      TEST_SECRET,
    );
    const userId = await extractUserIdFromToken(token, TEST_SECRET);
    expect(userId).toBeNull();
  });

  it('returns null for numeric sub claim', async () => {
    const token = await createHS256Token(
      { sub: 12345, exp: Math.floor(Date.now() / 1000) + 3600 },
      TEST_SECRET,
    );
    const userId = await extractUserIdFromToken(token, TEST_SECRET);
    expect(userId).toBeNull();
  });

  it('returns null for malformed token (not 3 parts)', async () => {
    expect(await extractUserIdFromToken('abc.def', TEST_SECRET)).toBeNull();
    expect(await extractUserIdFromToken('onlyonepart', TEST_SECRET)).toBeNull();
    expect(await extractUserIdFromToken('a.b.c.d', TEST_SECRET)).toBeNull();
  });

  it('returns null for empty token', async () => {
    expect(await extractUserIdFromToken('', TEST_SECRET)).toBeNull();
  });

  it('returns null for empty secret', async () => {
    const token = await createHS256Token({ sub: 'user-1' }, TEST_SECRET);
    expect(await extractUserIdFromToken(token, '')).toBeNull();
  });
});
