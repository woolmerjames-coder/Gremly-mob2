/**
 * Google Auth Worker Tests
 *
 * Tests for the Google OAuth token exchange and refresh flows
 * in the Cloudflare Calendar Worker.
 *
 * These tests mock the global `fetch` to verify:
 * - Code exchange (PKCE flow) → token + email
 * - Token refresh → new access token
 * - Error handling for both flows
 */

// ─── Mock setup ──────────────────────────────────────────────────────────────

const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

import { exchangeGoogleCode, refreshGoogleToken } from '../auth/google';

describe('Google Auth - exchangeGoogleCode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
  });

  const DEFAULT_ARGS = {
    code: 'test-auth-code',
    codeVerifier: 'test-verifier',
    redirectUri: 'https://app.example.com/callback',
    clientId: 'test-client-id',
  };

  it('exchanges code for tokens and returns email', async () => {
    // Token endpoint response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: 'access-123',
          refresh_token: 'refresh-456',
          expires_in: 3600,
          token_type: 'Bearer',
          scope: 'openid email',
        }),
    });

    // User info endpoint response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          id: 'user-id',
          email: 'user@gmail.com',
          verified_email: true,
        }),
    });

    const result = await exchangeGoogleCode(
      DEFAULT_ARGS.code,
      DEFAULT_ARGS.codeVerifier,
      DEFAULT_ARGS.redirectUri,
      DEFAULT_ARGS.clientId,
    );

    expect(result.accessToken).toBe('access-123');
    expect(result.refreshToken).toBe('refresh-456');
    expect(result.email).toBe('user@gmail.com');
    expect(result.expiresAt).toBeTruthy();
  });

  it('sends correct parameters to token endpoint', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: 'access-123',
          refresh_token: 'refresh-456',
          expires_in: 3600,
          token_type: 'Bearer',
          scope: 'openid email',
        }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 'u1', email: 'test@gmail.com', verified_email: true }),
    });

    await exchangeGoogleCode(
      DEFAULT_ARGS.code,
      DEFAULT_ARGS.codeVerifier,
      DEFAULT_ARGS.redirectUri,
      DEFAULT_ARGS.clientId,
    );

    const [tokenUrl, tokenOptions] = mockFetch.mock.calls[0];
    expect(tokenUrl).toBe('https://oauth2.googleapis.com/token');
    expect(tokenOptions.method).toBe('POST');
    expect(tokenOptions.body).toContain('grant_type=authorization_code');
    expect(tokenOptions.body).toContain(`code=${DEFAULT_ARGS.code}`);
    expect(tokenOptions.body).toContain(`code_verifier=${DEFAULT_ARGS.codeVerifier}`);
    expect(tokenOptions.body).toContain(`client_id=${DEFAULT_ARGS.clientId}`);
  });

  it('includes client_secret when provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: 'a',
          refresh_token: 'r',
          expires_in: 3600,
          token_type: 'Bearer',
          scope: '',
        }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 'u', email: 't@g.com', verified_email: true }),
    });

    await exchangeGoogleCode(
      DEFAULT_ARGS.code,
      DEFAULT_ARGS.codeVerifier,
      DEFAULT_ARGS.redirectUri,
      DEFAULT_ARGS.clientId,
      'my-secret',
    );

    const body = mockFetch.mock.calls[0][1].body;
    expect(body).toContain('client_secret=my-secret');
  });

  it('does not include client_secret when value is "none"', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: 'a',
          refresh_token: 'r',
          expires_in: 3600,
          token_type: 'Bearer',
          scope: '',
        }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 'u', email: 't@g.com', verified_email: true }),
    });

    await exchangeGoogleCode(
      DEFAULT_ARGS.code,
      DEFAULT_ARGS.codeVerifier,
      DEFAULT_ARGS.redirectUri,
      DEFAULT_ARGS.clientId,
      'none',
    );

    const body = mockFetch.mock.calls[0][1].body;
    expect(body).not.toContain('client_secret');
  });

  it('throws on token exchange failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: () => Promise.resolve('invalid_grant'),
    });

    await expect(
      exchangeGoogleCode(
        DEFAULT_ARGS.code,
        DEFAULT_ARGS.codeVerifier,
        DEFAULT_ARGS.redirectUri,
        DEFAULT_ARGS.clientId,
      ),
    ).rejects.toThrow('Google token exchange failed: 400');
  });

  it('throws on user info fetch failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: 'access-123',
          refresh_token: 'refresh-456',
          expires_in: 3600,
          token_type: 'Bearer',
          scope: '',
        }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
    });

    await expect(
      exchangeGoogleCode(
        DEFAULT_ARGS.code,
        DEFAULT_ARGS.codeVerifier,
        DEFAULT_ARGS.redirectUri,
        DEFAULT_ARGS.clientId,
      ),
    ).rejects.toThrow('Failed to get Google user info');
  });

  it('returns empty refresh_token when not provided by Google', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: 'access-123',
          // No refresh_token (subsequent auth without prompt)
          expires_in: 3600,
          token_type: 'Bearer',
          scope: '',
        }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 'u', email: 't@g.com', verified_email: true }),
    });

    const result = await exchangeGoogleCode(
      DEFAULT_ARGS.code,
      DEFAULT_ARGS.codeVerifier,
      DEFAULT_ARGS.redirectUri,
      DEFAULT_ARGS.clientId,
    );

    expect(result.refreshToken).toBe('');
  });
});

describe('Google Auth - refreshGoogleToken', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
  });

  it('refreshes token and returns new access token', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: 'new-access-token',
          expires_in: 3600,
          token_type: 'Bearer',
          scope: '',
        }),
    });

    const result = await refreshGoogleToken('refresh-token-123', 'client-id');

    expect(result.accessToken).toBe('new-access-token');
    expect(result.expiresAt).toBeTruthy();
  });

  it('sends correct parameters', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: 'new-token',
          expires_in: 3600,
          token_type: 'Bearer',
          scope: '',
        }),
    });

    await refreshGoogleToken('my-refresh', 'my-client');

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    expect(options.method).toBe('POST');
    expect(options.body).toContain('grant_type=refresh_token');
    expect(options.body).toContain('refresh_token=my-refresh');
    expect(options.body).toContain('client_id=my-client');
  });

  it('includes client_secret when provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: 'new-token',
          expires_in: 3600,
          token_type: 'Bearer',
          scope: '',
        }),
    });

    await refreshGoogleToken('my-refresh', 'my-client', 'my-secret');

    const body = mockFetch.mock.calls[0][1].body;
    expect(body).toContain('client_secret=my-secret');
  });

  it('throws on refresh failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve('invalid_grant'),
    });

    await expect(refreshGoogleToken('bad-token', 'client-id')).rejects.toThrow(
      'Google token refresh failed: 401',
    );
  });

  it('calculates expiresAt based on expires_in', async () => {
    const before = Date.now();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: 'token',
          expires_in: 3600,
          token_type: 'Bearer',
          scope: '',
        }),
    });

    const result = await refreshGoogleToken('refresh', 'client');
    const expiresAtMs = new Date(result.expiresAt).getTime();
    const after = Date.now();

    // Should be approximately 1 hour from now (with tolerance)
    expect(expiresAtMs).toBeGreaterThanOrEqual(before + 3600 * 1000 - 1000);
    expect(expiresAtMs).toBeLessThanOrEqual(after + 3600 * 1000 + 1000);
  });
});
