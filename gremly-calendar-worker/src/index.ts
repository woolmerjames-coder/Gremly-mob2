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
import { fetchOutlookEvents } from './calendar/outlook';

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

      // POST /auth/google/exchange - Exchange auth code for tokens (Phase 4)
      if (path === '/auth/google/exchange' && request.method === 'POST') {
        return error('Google Calendar integration coming soon', 501);
      }

      // POST /auth/disconnect - Disconnect a calendar provider
      if (path === '/auth/disconnect' && request.method === 'POST') {
        const body = (await request.json()) as { provider: CalendarProvider };

        if (!body.provider || !['outlook', 'google'].includes(body.provider)) {
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

        // Google (Phase 4)
        if (provider === 'google') {
          errors.push('google: Not implemented yet');
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
