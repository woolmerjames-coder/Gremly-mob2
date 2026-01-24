/**
 * Microsoft Graph Calendar API
 * Fetches calendar events from Outlook (including subscribed calendars)
 */

import type { CalendarEvent, MSGraphCalendarResponse, MSGraphEvent, Env } from '../types';
import { getValidOutlookToken } from '../auth/outlook';
import { TokenStorage } from '../storage/tokens';

const MICROSOFT_GRAPH_URL = 'https://graph.microsoft.com/v1.0';

interface MSGraphCalendar {
  id: string;
  name: string;
  isDefaultCalendar: boolean;
  canEdit: boolean;
  owner?: {
    name: string;
    address: string;
  };
}

interface MSGraphCalendarsResponse {
  value: MSGraphCalendar[];
}

/**
 * Transform Microsoft Graph event to our CalendarEvent format
 */
function transformEvent(event: MSGraphEvent, calendarName?: string): CalendarEvent {
  // Microsoft returns times in UTC (timeZone: "UTC")
  // We append 'Z' to indicate UTC so JavaScript Date parses correctly
  // The client will then convert to local timezone for display/keying
  const startAt = event.isAllDay
    ? `${event.start.dateTime.split('T')[0]}T00:00:00Z`
    : `${event.start.dateTime.replace(/\.\d+$/, '')}Z`;

  const endAt = event.isAllDay
    ? `${event.end.dateTime.split('T')[0]}T23:59:59Z`
    : `${event.end.dateTime.replace(/\.\d+$/, '')}Z`;

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
    calendarName: calendarName || null,
  };
}

export interface FetchEventsResult {
  events: CalendarEvent[];
  error?: string;
}

/**
 * Fetch all calendars for the user (including subscribed calendars)
 */
async function fetchAllCalendars(accessToken: string): Promise<MSGraphCalendar[]> {
  const response = await fetch(`${MICROSOFT_GRAPH_URL}/me/calendars`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    console.error('[Outlook] Failed to fetch calendars:', response.status);
    return [];
  }

  const data: MSGraphCalendarsResponse = await response.json();
  console.log(
    '[Outlook] Found calendars:',
    data.value.map((c) => ({ name: c.name, isDefault: c.isDefaultCalendar })),
  );
  return data.value;
}

/**
 * Fetch events from a specific calendar
 */
async function fetchEventsFromCalendar(
  accessToken: string,
  calendarId: string,
  calendarName: string,
  startDate: string,
  endDate: string,
): Promise<CalendarEvent[]> {
  const startDateTime = `${startDate}T00:00:00`;
  const endDateTime = `${endDate}T23:59:59`;

  const params = new URLSearchParams({
    startDateTime,
    endDateTime,
    $select: 'id,subject,start,end,isAllDay,location,bodyPreview',
    $orderby: 'start/dateTime',
    $top: '100',
  });

  const url = `${MICROSOFT_GRAPH_URL}/me/calendars/${calendarId}/calendarView?${params}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    console.error(
      `[Outlook] Failed to fetch events from calendar "${calendarName}":`,
      response.status,
    );
    return [];
  }

  const data: MSGraphCalendarResponse = await response.json();
  return data.value.map((event) => transformEvent(event, calendarName));
}

/**
 * Fetch calendar events for a date range from ALL calendars
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
    console.log('[Outlook] Fetching events from all calendars:', { startDate, endDate });

    const calendars = await fetchAllCalendars(accessToken);

    if (calendars.length === 0) {
      console.log('[Outlook] No calendars found');
      return { events: [], error: 'No calendars found' };
    }

    const eventPromises = calendars.map((calendar) =>
      fetchEventsFromCalendar(accessToken, calendar.id, calendar.name, startDate, endDate),
    );

    const eventsArrays = await Promise.all(eventPromises);

    const allEvents = eventsArrays.flat();

    // Dedupe by providerEventId (events can appear in multiple calendars)
    const seenIds = new Set<string>();
    const uniqueEvents = allEvents.filter((event) => {
      if (seenIds.has(event.providerEventId)) {
        return false;
      }
      seenIds.add(event.providerEventId);
      return true;
    });

    // Sort by start time
    uniqueEvents.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

    // Update last synced timestamp
    const storage = new TokenStorage(env);
    await storage.updateLastSynced(userId, 'outlook');

    console.log(
      '[Outlook] Fetched total events:',
      uniqueEvents.length,
      'from',
      calendars.length,
      'calendars',
    );
    return { events: uniqueEvents };
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
