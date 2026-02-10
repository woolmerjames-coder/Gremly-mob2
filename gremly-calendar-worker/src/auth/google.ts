import type { CalendarToken } from '../types';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
  id_token?: string;
}

interface GoogleUserInfo {
  id: string;
  email: string;
  verified_email: boolean;
  name?: string;
  picture?: string;
}

/**
 * Exchange Google auth code for tokens.
 * Uses PKCE flow (public client) — no client_secret needed for mobile.
 */
export async function exchangeGoogleCode(
  code: string,
  codeVerifier: string,
  redirectUri: string,
  clientId: string,
  clientSecret?: string,
): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  email: string;
}> {
  console.log('[Google Auth] Exchanging code for tokens...');

  const body: Record<string, string> = {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: codeVerifier,
  };

  // Add client_secret only if provided (not needed for mobile PKCE)
  if (clientSecret && clientSecret !== 'none') {
    body.client_secret = clientSecret;
  }

  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    console.error('[Google Auth] Token exchange failed:', tokenResponse.status, errorText);
    throw new Error(`Google token exchange failed: ${tokenResponse.status} - ${errorText}`);
  }

  const tokens: GoogleTokenResponse = await tokenResponse.json();
  console.log('[Google Auth] Got tokens, fetching user info...');

  // Get user's email
  const userResponse = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!userResponse.ok) {
    console.error('[Google Auth] Failed to get user info:', userResponse.status);
    throw new Error('Failed to get Google user info');
  }

  const userInfo: GoogleUserInfo = await userResponse.json();
  console.log('[Google Auth] User email:', userInfo.email);

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || '',
    expiresAt,
    email: userInfo.email,
  };
}

/**
 * Refresh an expired Google access token.
 */
export async function refreshGoogleToken(
  refreshToken: string,
  clientId: string,
  clientSecret?: string,
): Promise<{
  accessToken: string;
  expiresAt: string;
}> {
  console.log('[Google Auth] Refreshing access token...');

  const body: Record<string, string> = {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  };

  if (clientSecret && clientSecret !== 'none') {
    body.client_secret = clientSecret;
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Google Auth] Token refresh failed:', response.status, errorText);
    throw new Error(`Google token refresh failed: ${response.status}`);
  }

  const tokens: GoogleTokenResponse = await response.json();
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  return {
    accessToken: tokens.access_token,
    expiresAt,
  };
}
