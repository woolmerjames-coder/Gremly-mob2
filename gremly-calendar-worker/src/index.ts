/**
 * Gremly Calendar Worker
 *
 * Handles OAuth flows and calendar API calls for:
 * - Microsoft Outlook (via Microsoft Graph)
 * - Google Calendar (Phase 4)
 *
 * Endpoints:
 * - POST /auth/outlook/exchange - Exchange auth code for tokens
 * - POST /auth/disconnect - Disconnect a calendar provider
 * - GET  /calendar/events - Fetch events for a date range
 * - GET  /calendar/status - Get connection status for all providers
 * - GET  /health - Health check
 */

import type { Env, CalendarProvider, CalendarConnectionStatus } from './types';
import { json, error, corsPreflightResponse } from './utils/response';
import { extractUserIdFromToken } from './utils/auth';
import { TokenStorage } from './storage/tokens';
import { exchangeOutlookCode } from './auth/outlook';
import { exchangeGoogleCode, refreshGoogleToken } from './auth/google';
import { fetchOutlookEvents } from './calendar/outlook';
import { fetchGoogleEvents } from './calendar/google';
import { connectIcsCalendar, fetchIcsEvents } from './calendar/ics';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return corsPreflightResponse();
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Health check (no auth required)
    if (path === '/health') {
      return json({ status: 'ok', timestamp: new Date().toISOString() });
    }

    // All other endpoints require authentication
    const authHeader = request.headers.get('Authorization');
    const userId = extractUserIdFromToken(authHeader);

    if (!userId) {
      return error('Unauthorized', 401);
    }

    // Route requests
    try {
      // ═══════════════════════════════════════════════════════════════════
      // AUTH ENDPOINTS
      // ═══════════════════════════════════════════════════════════════════

      // POST /auth/outlook/exchange - Exchange auth code for tokens
      if (path === '/auth/outlook/exchange' && request.method === 'POST') {
        const body = (await request.json()) as {
          code?: string;
          redirectUri?: string;
          redirect_uri?: string;
          codeVerifier?: string;
          code_verifier?: string;
        };

        // Support both camelCase and snake_case field names
        const code = body.code;
        const redirectUri = body.redirectUri || body.redirect_uri;
        const codeVerifier = body.codeVerifier || body.code_verifier;

        if (!code || !redirectUri || !codeVerifier) {
          return error(
            'Missing required fields: code, redirectUri/redirect_uri, codeVerifier/code_verifier',
          );
        }

        const result = await exchangeOutlookCode({ code, redirectUri, codeVerifier }, userId, env);

        if (!result.success) {
          return error(result.error || 'Exchange failed', 400);
        }

        return json({ success: true, email: result.email });
      }

      // POST /auth/ics/connect - Connect an ICS calendar via URL
      if (path === '/auth/ics/connect' && request.method === 'POST') {
        const body = (await request.json()) as {
          ics_url?: string;
          icsUrl?: string;
          label?: string;
        };

        const icsUrl = body.ics_url || body.icsUrl;

        if (!icsUrl) {
          return error('Missing required field: ics_url');
        }

        const result = await connectIcsCalendar(icsUrl, body.label, userId, env);

        if (!result.success) {
          return error(result.error || 'Failed to connect calendar', 400);
        }

        return json({ success: true, calendarName: result.calendarName });
      }

      // POST /auth/google/exchange - Exchange Google auth code for tokens
      if (path === '/auth/google/exchange' && request.method === 'POST') {
        const body = (await request.json()) as {
          code: string;
          code_verifier: string;
          redirect_uri: string;
        };

        if (!body.code || !body.code_verifier || !body.redirect_uri) {
          return error('Missing required fields: code, code_verifier, redirect_uri', 400);
        }

        try {
          const googleClientId = env.GOOGLE_CLIENT_ID;
          const googleClientSecret = env.GOOGLE_CLIENT_SECRET;

          if (!googleClientId) {
            return error('Google Client ID not configured', 500);
          }

          const result = await exchangeGoogleCode(
            body.code,
            body.code_verifier,
            body.redirect_uri,
            googleClientId,
            googleClientSecret,
          );

          // Store tokens in Supabase
          const storage = new TokenStorage(env);
          await storage.saveToken(userId, 'google', {
            access_token: result.accessToken,
            refresh_token: result.refreshToken,
            access_token_expires_at: result.expiresAt,
            provider_email: result.email,
          });

          return json({
            success: true,
            email: result.email,
          });
        } catch (err) {
          console.error('[Google Exchange] Error:', err);
          return error(
            `Google auth failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
            500,
          );
        }
      }

      // POST /auth/disconnect - Disconnect a calendar provider
      if (path === '/auth/disconnect' && request.method === 'POST') {
        const body = (await request.json()) as { provider: CalendarProvider };

        if (!body.provider || !['outlook', 'google', 'ics'].includes(body.provider)) {
          return error('Invalid provider');
        }

        const storage = new TokenStorage(env);
        const result = await storage.deleteToken(userId, body.provider);

        if (!result.success) {
          return error(result.error || 'Failed to disconnect', 500);
        }

        return json({ success: true });
      }

      // ═══════════════════════════════════════════════════════════════════
      // CALENDAR ENDPOINTS
      // ═══════════════════════════════════════════════════════════════════

      // GET /calendar/events - Fetch events for a date range
      if (path === '/calendar/events' && request.method === 'GET') {
        const startDate = url.searchParams.get('start');
        const endDate = url.searchParams.get('end');
        const provider = url.searchParams.get('provider') as CalendarProvider | null;

        if (!startDate || !endDate) {
          return error('Missing required params: start, end (YYYY-MM-DD format)');
        }

        // Validate date format
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
          return error('Invalid date format. Use YYYY-MM-DD');
        }

        // Fetch from requested provider(s)
        const allEvents: any[] = [];
        const errors: string[] = [];

        // Fetch from Outlook if requested or no specific provider
        if (!provider || provider === 'outlook') {
          const outlookResult = await fetchOutlookEvents(userId, startDate, endDate, env);
          if (outlookResult.events.length > 0) {
            allEvents.push(...outlookResult.events);
          }
          if (outlookResult.error) {
            errors.push(`outlook: ${outlookResult.error}`);
          }
        }

        // Fetch Google events
        if (!provider || provider === 'google') {
          const storage = new TokenStorage(env);
          const tokens = await storage.getTokensForUser(userId);
          const googleToken = tokens.find((t) => t.provider === 'google');
          if (googleToken && googleToken.is_active) {
            try {
              let googleAccessToken = googleToken.access_token;

              // Check if token is expired and refresh if needed
              const expiresAt = new Date(googleToken.access_token_expires_at);
              if (expiresAt <= new Date()) {
                console.log('[Events] Google token expired, refreshing...');
                const refreshed = await refreshGoogleToken(
                  googleToken.refresh_token,
                  env.GOOGLE_CLIENT_ID,
                  env.GOOGLE_CLIENT_SECRET,
                );
                googleAccessToken = refreshed.accessToken;

                // Update stored token
                await storage.saveToken(userId, 'google', {
                  ...googleToken,
                  access_token: refreshed.accessToken,
                  access_token_expires_at: refreshed.expiresAt,
                });
              }

              const googleEvents = await fetchGoogleEvents(googleAccessToken, startDate, endDate);
              allEvents.push(...googleEvents);
              console.log('[Events] Google events:', googleEvents.length);
            } catch (err) {
              console.error('[Events] Google fetch error:', err);
              errors.push(`google: ${err instanceof Error ? err.message : 'Unknown'}`);
            }
          }
        }

        // Fetch from ICS if requested or no specific provider
        if (!provider || provider === 'ics') {
          const icsResult = await fetchIcsEvents(userId, startDate, endDate, env);
          if (icsResult.events.length > 0) {
            allEvents.push(...icsResult.events);
          }
          if (icsResult.error) {
            errors.push(`ics: ${icsResult.error}`);
          }
        }

        // Sort all events by start time
        allEvents.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

        return json({
          events: allEvents,
          count: allEvents.length,
          errors: errors.length > 0 ? errors : undefined,
        });
      }

      // GET /calendar/status - Get connection status for all providers
      if (path === '/calendar/status' && request.method === 'GET') {
        const storage = new TokenStorage(env);
        const tokens = await storage.getTokensForUser(userId);

        const connections: CalendarConnectionStatus[] = [];

        // Check Outlook
        const outlookToken = tokens.find((t) => t.provider === 'outlook');
        connections.push({
          provider: 'outlook',
          isConnected: !!outlookToken && outlookToken.is_active,
          email: outlookToken?.provider_email || null,
          lastSyncedAt: outlookToken?.last_synced_at || null,
          lastError: outlookToken?.last_error || null,
        });

        // Check Google (Phase 4)
        const googleToken = tokens.find((t) => t.provider === 'google');
        connections.push({
          provider: 'google',
          isConnected: !!googleToken && googleToken.is_active,
          email: googleToken?.provider_email || null,
          lastSyncedAt: googleToken?.last_synced_at || null,
          lastError: googleToken?.last_error || null,
        });

        // Check ICS
        const icsToken = tokens.find((t) => t.provider === 'ics');
        connections.push({
          provider: 'ics',
          isConnected: !!icsToken && icsToken.is_active,
          email: icsToken?.provider_email || null,
          lastSyncedAt: icsToken?.last_synced_at || null,
          lastError: icsToken?.last_error || null,
        });

        return json({ connections });
      }

      // ═══════════════════════════════════════════════════════════════════
      // 404 - Not Found
      // ═══════════════════════════════════════════════════════════════════
      return error('Not found', 404);
    } catch (err) {
      console.error('[Worker] Unhandled error:', err);
      return error('Internal server error', 500);
    }
  },
};
