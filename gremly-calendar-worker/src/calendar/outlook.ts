/**
 * Microsoft Graph Calendar API
 * Fetches calendar events from Outlook
 */

import type { CalendarEvent, MSGraphCalendarResponse, MSGraphEvent, Env } from '../types';
import { getValidOutlookToken } from '../auth/outlook';
import { TokenStorage } from '../storage/tokens';

const MICROSOFT_GRAPH_URL = 'https://graph.microsoft.com/v1.0';

/**
 * Transform Microsoft Graph event to our CalendarEvent format
 */
function transformEvent(event: MSGraphEvent): CalendarEvent {
  // Microsoft returns times in the calendar's timezone
  // We need to handle this properly
  const startAt = event.isAllDay
    ? `${event.start.dateTime.split('T')[0]}T00:00:00Z`
    : new Date(event.start.dateTime + 'Z').toISOString();

  const endAt = event.isAllDay
    ? `${event.end.dateTime.split('T')[0]}T23:59:59Z`
    : new Date(event.end.dateTime + 'Z').toISOString();

  return {
    id: `outlook-${event.id}`,
    provider: 'outlook',
    providerEventId: event.id,
    title: event.subject || '(No title)',
    startAt,
    endAt,
    isAllDay: event.isAllDay,
    location: event.location?.displayName || null,
    description: event.bodyPreview || null,
  };
}

export interface FetchEventsResult {
  events: CalendarEvent[];
  error?: string;
}

/**
 * Fetch calendar events for a date range
 *
 * @param userId - Supabase user ID
 * @param startDate - Start date (YYYY-MM-DD)
 * @param endDate - End date (YYYY-MM-DD)
 * @param env - Worker environment
 */
export async function fetchOutlookEvents(
  userId: string,
  startDate: string,
  endDate: string,
  env: Env,
): Promise<FetchEventsResult> {
  // Get valid access token
  const { accessToken, error: tokenError } = await getValidOutlookToken(userId, env);

  if (!accessToken) {
    return { events: [], error: tokenError };
  }

  try {
    // Build the calendar view URL
    // calendarView returns events that occur within the time range (handles recurring events)
    const startDateTime = `${startDate}T00:00:00`;
    const endDateTime = `${endDate}T23:59:59`;

    const params = new URLSearchParams({
      startDateTime,
      endDateTime,
      $select: 'id,subject,start,end,isAllDay,location,bodyPreview',
      $orderby: 'start/dateTime',
      $top: '100', // Max events to fetch
    });

    const url = `${MICROSOFT_GRAPH_URL}/me/calendarView?${params}`;

    console.log('[Outlook] Fetching events:', { startDate, endDate });

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Outlook] Calendar API error:', response.status, errorText);

      // Record error in storage
      const storage = new TokenStorage(env);
      await storage.recordError(userId, 'outlook', `API error: ${response.status}`);

      return { events: [], error: `Calendar API error: ${response.status}` };
    }

    const data: MSGraphCalendarResponse = await response.json();
    const events = data.value.map(transformEvent);

    // Update last synced timestamp
    const storage = new TokenStorage(env);
    await storage.updateLastSynced(userId, 'outlook');

    console.log('[Outlook] Fetched events:', events.length);
    return { events };
  } catch (err) {
    console.error('[Outlook] Fetch error:', err);

    const storage = new TokenStorage(env);
    await storage.recordError(userId, 'outlook', String(err));

    return { events: [], error: String(err) };
  }
}

// NOTE: Server-side convenience methods removed.
// The client always passes explicit date strings in the user's local timezone,
// so these UTC-based server helpers would give wrong results.
// If needed in the future, the client should pass timezone info.
