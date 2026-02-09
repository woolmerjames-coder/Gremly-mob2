/**
 * CalendarClient.ts - Calendar Integration Service
 *
 * Handles:
 * 1. Outlook OAuth flow using expo-auth-session
 * 2. API calls to Cloudflare calendar worker
 * 3. Token management (Supabase JWT for auth)
 *
 * Based on CortexClient.ts pattern for API call structure.
 */

import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { env } from '../env';

// Ensure web browser auth session completes properly
WebBrowser.maybeCompleteAuthSession();

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type CalendarProvider = 'outlook' | 'google' | 'ics';

export interface CalendarEvent {
  id: string;
  provider: CalendarProvider;
  providerEventId: string;
  title: string;
  startAt: string; // ISO timestamp
  endAt: string; // ISO timestamp
  isAllDay: boolean;
  location: string | null;
}

export interface CalendarConnectionStatus {
  provider: CalendarProvider;
  isConnected: boolean;
  email: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
}

export interface CalendarClientResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

// Microsoft OAuth endpoints
const MICROSOFT_AUTH_ENDPOINT = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const MICROSOFT_TOKEN_ENDPOINT = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';

// OAuth scopes for Outlook Calendar
const OUTLOOK_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'Calendars.Read',
  'User.Read',
];

// Google OAuth endpoints
const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/calendar.readonly',
];

// Redirect URI (matches Azure app registration and wrangler.toml)
const REDIRECT_URI = 'gremly://auth/callback';

// Google iOS OAuth requires reversed client ID as the URL scheme
const GOOGLE_REDIRECT_URI =
  'com.googleusercontent.apps.81105861621-ombuvivk9f9kifkoji8pgvnfsvstovqi:/oauth2redirect/google';

// Read environment variables from typed env layer
const getCalendarWorkerUrl = (): string => {
  return env.calendarWorkerUrl || '';
};

const getAzureClientId = (): string => {
  return env.azureClientId || '';
};

const getGoogleClientId = (): string => {
  return env.googleClientId || '';
};

// Logging helper - always log for debugging OAuth issues
const log = (...args: unknown[]) => {
  console.log('[CalendarClient]', ...args);
};

// ═══════════════════════════════════════════════════════════════════════════════
// CALENDAR CLIENT CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class CalendarClient {
  private supabaseToken: string | null = null;

  /**
   * Set the Supabase JWT token for authenticating with the calendar worker.
   * Call this after user logs in or token refreshes.
   */
  setSupabaseToken(token: string | null): void {
    this.supabaseToken = token;
    log('Supabase token updated:', token ? '✅ Set' : '❌ Cleared');
  }

  /**
   * Get headers for API requests to the calendar worker.
   */
  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (this.supabaseToken) {
      headers['Authorization'] = `Bearer ${this.supabaseToken}`;
    }

    return headers;
  }

  /**
   * Make a GET request to the calendar worker.
   */
  private async get<T>(path: string): Promise<CalendarClientResult<T>> {
    const baseUrl = getCalendarWorkerUrl();

    if (!baseUrl) {
      log('ERROR', 'Missing EXPO_PUBLIC_CALENDAR_WORKER_URL');
      return { ok: false, error: 'Calendar service not configured' };
    }

    if (!this.supabaseToken) {
      log('ERROR', 'No Supabase token set');
      return { ok: false, error: 'Not authenticated' };
    }

    try {
      const url = `${baseUrl}${path}`;
      log('GET', url);

      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      log('STATUS', response.status);

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        log('ERROR_RESPONSE', response.status, text);
        return { ok: false, error: `${response.status}: ${text || 'Unknown error'}` };
      }

      const data = await response.json();
      return { ok: true, data };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Network error';
      log('FETCH_ERROR', message);
      return { ok: false, error: message };
    }
  }

  /**
   * Make a POST request to the calendar worker.
   */
  private async post<T>(path: string, body: unknown): Promise<CalendarClientResult<T>> {
    const baseUrl = getCalendarWorkerUrl();

    if (!baseUrl) {
      log('ERROR', 'Missing EXPO_PUBLIC_CALENDAR_WORKER_URL');
      return { ok: false, error: 'Calendar service not configured' };
    }

    if (!this.supabaseToken) {
      log('ERROR', 'No Supabase token set');
      return { ok: false, error: 'Not authenticated' };
    }

    try {
      const url = `${baseUrl}${path}`;
      log('POST', url, body);

      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
      });

      log('STATUS', response.status);

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        log('ERROR_RESPONSE', response.status, text);
        return { ok: false, error: `${response.status}: ${text || 'Unknown error'}` };
      }

      const data = await response.json();
      return { ok: true, data };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Network error';
      log('FETCH_ERROR', message);
      return { ok: false, error: message };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // OUTLOOK OAUTH FLOW
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Initiate Outlook OAuth flow and exchange code for tokens via worker.
   *
   * Uses PKCE flow with expo-auth-session for security.
   * Tokens are stored server-side in Supabase (via worker).
   */
  async connectOutlook(): Promise<{ success: boolean; error?: string }> {
    const clientId = getAzureClientId();
    const workerUrl = getCalendarWorkerUrl();

    if (!clientId) {
      log('ERROR', 'Missing EXPO_PUBLIC_AZURE_CLIENT_ID');
      return {
        success: false,
        error: 'Azure Client ID not configured. Check EXPO_PUBLIC_AZURE_CLIENT_ID.',
      };
    }

    if (!workerUrl) {
      log('ERROR', 'Missing EXPO_PUBLIC_CALENDAR_WORKER_URL');
      return {
        success: false,
        error: 'Calendar Worker URL not configured. Check EXPO_PUBLIC_CALENDAR_WORKER_URL.',
      };
    }

    if (!this.supabaseToken) {
      log('ERROR', 'No Supabase token - user must be logged in');
      return { success: false, error: 'Not authenticated. Please log in again.' };
    }

    try {
      log('Starting Outlook OAuth flow...');

      // Create OAuth discovery document for Microsoft
      const discovery: AuthSession.DiscoveryDocument = {
        authorizationEndpoint: MICROSOFT_AUTH_ENDPOINT,
        tokenEndpoint: MICROSOFT_TOKEN_ENDPOINT,
      };

      // Create auth request with PKCE
      const request = new AuthSession.AuthRequest({
        clientId,
        scopes: OUTLOOK_SCOPES,
        redirectUri: REDIRECT_URI,
        usePKCE: true,
        responseType: AuthSession.ResponseType.Code,
      });

      // Prompt user to authenticate
      log('Opening browser for Microsoft login...');
      const result = await request.promptAsync(discovery);

      log('OAuth result type:', result.type);

      if (result.type !== 'success') {
        if (result.type === 'cancel' || result.type === 'dismiss') {
          return { success: false, error: 'User cancelled authentication' };
        }
        return { success: false, error: `OAuth failed: ${result.type}` };
      }

      const { code } = result.params;

      if (!code) {
        log('ERROR', 'No authorization code received');
        return { success: false, error: 'No authorization code received' };
      }

      log('Got authorization code, exchanging for tokens...');

      // Exchange code for tokens via our worker
      // Worker will store tokens in Supabase and return success/failure
      const exchangeResult = await this.post<{ success: boolean; email?: string }>(
        '/auth/outlook/exchange',
        {
          code,
          code_verifier: request.codeVerifier,
          redirect_uri: REDIRECT_URI,
        },
      );

      if (!exchangeResult.ok || !exchangeResult.data?.success) {
        log('ERROR', 'Token exchange failed:', exchangeResult.error);
        return { success: false, error: exchangeResult.error || 'Token exchange failed' };
      }

      log('✅ Outlook connected successfully:', exchangeResult.data.email);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      log('ERROR', 'connectOutlook failed:', message);
      return { success: false, error: message };
    }
  }

  /**
   * Initiate Google OAuth flow and exchange code for tokens via worker.
   *
   * Uses PKCE flow with expo-auth-session for security.
   * Tokens are stored server-side in Supabase (via worker).
   */
  async connectGoogle(): Promise<{ success: boolean; error?: string }> {
    const clientId = getGoogleClientId();
    const workerUrl = getCalendarWorkerUrl();

    if (!clientId) {
      log('ERROR', 'Missing EXPO_PUBLIC_GOOGLE_CLIENT_ID');
      return {
        success: false,
        error: 'Google Client ID not configured. Check EXPO_PUBLIC_GOOGLE_CLIENT_ID.',
      };
    }

    if (!workerUrl) {
      log('ERROR', 'Missing EXPO_PUBLIC_CALENDAR_WORKER_URL');
      return {
        success: false,
        error: 'Calendar Worker URL not configured. Check EXPO_PUBLIC_CALENDAR_WORKER_URL.',
      };
    }

    if (!this.supabaseToken) {
      log('ERROR', 'No Supabase token - user must be logged in');
      return { success: false, error: 'Not authenticated. Please log in again.' };
    }

    try {
      log('Starting Google OAuth flow...');

      // Create OAuth discovery document for Google
      const discovery: AuthSession.DiscoveryDocument = {
        authorizationEndpoint: GOOGLE_AUTH_ENDPOINT,
        tokenEndpoint: GOOGLE_TOKEN_ENDPOINT,
      };

      // Create auth request with PKCE
      const request = new AuthSession.AuthRequest({
        clientId,
        scopes: GOOGLE_SCOPES,
        redirectUri: GOOGLE_REDIRECT_URI,
        usePKCE: true,
        responseType: AuthSession.ResponseType.Code,
      });

      // Prompt user to authenticate
      log('Opening browser for Google login...');
      const result = await request.promptAsync(discovery);

      log('OAuth result type:', result.type);

      if (result.type !== 'success') {
        if (result.type === 'cancel' || result.type === 'dismiss') {
          return { success: false, error: 'User cancelled authentication' };
        }
        return { success: false, error: `OAuth failed: ${result.type}` };
      }

      const { code } = result.params;

      if (!code) {
        log('ERROR', 'No authorization code received');
        return { success: false, error: 'No authorization code received' };
      }

      log('Got authorization code, exchanging for tokens...');

      // Exchange code for tokens via our worker
      // Worker will store tokens in Supabase and return success/failure
      const exchangeResult = await this.post<{ success: boolean; email?: string }>(
        '/auth/google/exchange',
        {
          code,
          code_verifier: request.codeVerifier,
          redirect_uri: GOOGLE_REDIRECT_URI,
        },
      );

      if (!exchangeResult.ok || !exchangeResult.data?.success) {
        log('ERROR', 'Token exchange failed:', exchangeResult.error);
        return { success: false, error: exchangeResult.error || 'Token exchange failed' };
      }

      log('✅ Google connected successfully:', exchangeResult.data.email);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      log('ERROR', 'connectGoogle failed:', message);
      return { success: false, error: message };
    }
  }

  /**
   * Connect an ICS calendar by URL.
   *
   * @param icsUrl - The ICS calendar URL (must be https://)
   * @param label - Optional friendly name for the calendar
   */
  async connectIcs(
    icsUrl: string,
    label?: string,
  ): Promise<{ success: boolean; error?: string; calendarName?: string }> {
    if (!this.supabaseToken) {
      log('ERROR', 'No Supabase token - user must be logged in');
      return { success: false, error: 'Not authenticated. Please log in again.' };
    }

    if (!icsUrl.trim()) {
      return { success: false, error: 'Please enter a calendar URL' };
    }

    try {
      const url = new URL(icsUrl.trim());
      if (!['http:', 'https:'].includes(url.protocol)) {
        return { success: false, error: 'URL must start with http:// or https://' };
      }
    } catch {
      return { success: false, error: 'Invalid URL format' };
    }

    log('Connecting ICS calendar:', icsUrl);

    const result = await this.post<{ success: boolean; calendarName?: string; error?: string }>(
      '/auth/ics/connect',
      {
        ics_url: icsUrl.trim(),
        label: label?.trim() || undefined,
      },
    );

    if (!result.ok || !result.data?.success) {
      log('ERROR', 'ICS connect failed:', result.error || result.data?.error);
      return {
        success: false,
        error: result.error || result.data?.error || 'Failed to connect calendar',
      };
    }

    log('✅ ICS calendar connected:', result.data.calendarName);
    return { success: true, calendarName: result.data.calendarName };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CALENDAR API METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get calendar events for a date range.
   *
   * @param startDate - Start date in YYYY-MM-DD format
   * @param endDate - End date in YYYY-MM-DD format
   * @returns Array of calendar events (empty array on error)
   */
  async getEvents(startDate: string, endDate: string): Promise<CalendarEvent[]> {
    log('Fetching events:', startDate, 'to', endDate);

    const result = await this.get<{ events: CalendarEvent[] }>(
      `/calendar/events?start=${startDate}&end=${endDate}`,
    );

    if (!result.ok || !result.data?.events) {
      log('Failed to fetch events:', result.error);
      return [];
    }

    log('Fetched', result.data.events.length, 'events');
    return result.data.events;
  }

  /**
   * Get connection status for all calendar providers.
   */
  async getConnectionStatus(): Promise<CalendarConnectionStatus[]> {
    log('Fetching connection status...');

    const result = await this.get<{ connections: CalendarConnectionStatus[] }>('/calendar/status');

    if (!result.ok || !result.data?.connections) {
      log('Failed to fetch connection status:', result.error);
      return [];
    }

    log('Connection status:', result.data.connections);
    return result.data.connections;
  }

  /**
   * Disconnect a calendar provider.
   *
   * @param provider - Provider to disconnect ('outlook', 'google', or 'ics')
   */
  async disconnect(provider: CalendarProvider): Promise<{ success: boolean; error?: string }> {
    log('Disconnecting provider:', provider);

    const result = await this.post<{ success: boolean }>('/auth/disconnect', { provider });

    if (!result.ok || !result.data?.success) {
      log('Failed to disconnect:', result.error);
      return { success: false, error: result.error || 'Disconnect failed' };
    }

    log('✅ Disconnected', provider);
    return { success: true };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Singleton calendar client instance.
 *
 * Usage:
 *   import { calendarClient } from '../lib/calendar/CalendarClient';
 *
 *   // Set token after auth
 *   calendarClient.setSupabaseToken(session.access_token);
 *
 *   // Connect Outlook
 *   const { success, error } = await calendarClient.connectOutlook();
 *
 *   // Get events
 *   const events = await calendarClient.getEvents('2026-01-20', '2026-01-26');
 */
export const calendarClient = new CalendarClient();

// Also export the class for testing
export { CalendarClient };
