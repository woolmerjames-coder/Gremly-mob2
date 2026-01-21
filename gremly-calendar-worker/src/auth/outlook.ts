/**
 * Outlook (Microsoft) OAuth handlers
 * Handles token exchange and refresh
 */

import type { Env, MSGraphTokenResponse, MSGraphUserResponse } from '../types';
import { TokenStorage } from '../storage/tokens';

const MICROSOFT_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const MICROSOFT_GRAPH_URL = 'https://graph.microsoft.com/v1.0';

export interface ExchangeCodeParams {
  code: string;
  redirectUri: string;
  codeVerifier: string;
}

export interface ExchangeResult {
  success: boolean;
  error?: string;
  email?: string;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeOutlookCode(
  params: ExchangeCodeParams,
  userId: string,
  env: Env,
): Promise<ExchangeResult> {
  const { code, redirectUri, codeVerifier } = params;

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch(MICROSOFT_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: env.AZURE_CLIENT_ID,
        client_secret: env.AZURE_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('[Outlook] Token exchange failed:', tokenResponse.status, errorText);
      return { success: false, error: `Token exchange failed: ${tokenResponse.status}` };
    }

    const tokens: MSGraphTokenResponse = await tokenResponse.json();

    // Get user info (email)
    const userResponse = await fetch(`${MICROSOFT_GRAPH_URL}/me`, {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    });

    let email: string | null = null;
    let accountId: string | null = null;

    if (userResponse.ok) {
      const user: MSGraphUserResponse = await userResponse.json();
      email = user.mail || user.userPrincipalName;
      accountId = user.id;
    }

    // Calculate expiration time
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    // Store tokens in Supabase
    const storage = new TokenStorage(env);
    const saveResult = await storage.saveToken(userId, 'outlook', {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      access_token_expires_at: expiresAt,
      provider_email: email,
      provider_account_id: accountId,
    });

    if (!saveResult.success) {
      console.error('[Outlook] Failed to save token:', saveResult.error);
      return { success: false, error: 'Failed to save token' };
    }

    console.log('[Outlook] Successfully connected:', email);
    return { success: true, email: email || undefined };
  } catch (err) {
    console.error('[Outlook] Exchange error:', err);
    return { success: false, error: String(err) };
  }
}

/**
 * Refresh an expired access token
 */
export async function refreshOutlookToken(
  userId: string,
  env: Env,
): Promise<{ success: boolean; accessToken?: string; error?: string }> {
  const storage = new TokenStorage(env);
  const token = await storage.getToken(userId, 'outlook');

  if (!token) {
    return { success: false, error: 'No token found' };
  }

  try {
    const tokenResponse = await fetch(MICROSOFT_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: env.AZURE_CLIENT_ID,
        client_secret: env.AZURE_CLIENT_SECRET,
        refresh_token: token.refresh_token,
        grant_type: 'refresh_token',
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('[Outlook] Token refresh failed:', tokenResponse.status, errorText);
      await storage.recordError(userId, 'outlook', `Refresh failed: ${tokenResponse.status}`);
      return { success: false, error: 'Token refresh failed' };
    }

    const tokens: MSGraphTokenResponse = await tokenResponse.json();
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    // Update stored tokens
    await storage.saveToken(userId, 'outlook', {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || token.refresh_token, // Keep old refresh if not returned
      access_token_expires_at: expiresAt,
    });

    return { success: true, accessToken: tokens.access_token };
  } catch (err) {
    console.error('[Outlook] Refresh error:', err);
    await storage.recordError(userId, 'outlook', String(err));
    return { success: false, error: String(err) };
  }
}

/**
 * Get a valid access token (refreshing if necessary)
 */
export async function getValidOutlookToken(
  userId: string,
  env: Env,
): Promise<{ accessToken: string | null; error?: string }> {
  const storage = new TokenStorage(env);
  const token = await storage.getToken(userId, 'outlook');

  if (!token) {
    return { accessToken: null, error: 'Not connected' };
  }

  if (!token.is_active) {
    return { accessToken: null, error: 'Connection disabled' };
  }

  // Check if token is expired (with 5 minute buffer)
  const expiresAt = new Date(token.access_token_expires_at);
  const now = new Date();
  const bufferMs = 5 * 60 * 1000; // 5 minutes

  if (expiresAt.getTime() - bufferMs <= now.getTime()) {
    // Token is expired or about to expire, refresh it
    console.log('[Outlook] Token expired, refreshing...');
    const refreshResult = await refreshOutlookToken(userId, env);

    if (!refreshResult.success) {
      return { accessToken: null, error: refreshResult.error };
    }

    return { accessToken: refreshResult.accessToken! };
  }

  return { accessToken: token.access_token };
}
