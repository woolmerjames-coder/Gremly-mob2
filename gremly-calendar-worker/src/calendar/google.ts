import type { CalendarEvent } from '../types';
import { fetchWindow } from './window';

const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  status: string;
}

interface GoogleCalendarResponse {
  items: GoogleCalendarEvent[];
  nextPageToken?: string;
}

/**
 * Fetch events from Google Calendar for a date range.
 */
export async function fetchGoogleEvents(
  accessToken: string,
  startDate: string,
  endDate: string,
): Promise<CalendarEvent[]> {
  console.log('[Google Calendar] Fetching events:', startDate, 'to', endDate);

  // in UTC, a day either side, so every local time on the days asked for is
  // in it (timeMax at the end date's midnight left the end date out)
  const { from, to } = fetchWindow(startDate, endDate);
  const items: GoogleCalendarEvent[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      timeMin: from,
      timeMax: to,
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
      ...(pageToken ? { pageToken } : {}),
    });

    const response = await fetch(`${GOOGLE_CALENDAR_API}/calendars/primary/events?${params}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Google Calendar] API error:', response.status, errorText);
      throw new Error(`Google Calendar API error: ${response.status}`);
    }

    const data: GoogleCalendarResponse = await response.json();
    items.push(...(data.items || []));
    // a busy calendar runs past one page: every page is read
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  console.log('[Google Calendar] Got', items.length, 'events');

  return items
    .filter((event) => event.status !== 'cancelled')
    .map((event) => transformGoogleEvent(event));
}

/** Pages read at most: 5,000 events, far beyond any week. */
const MAX_PAGES = 20;

function transformGoogleEvent(event: GoogleCalendarEvent): CalendarEvent {
  const isAllDay = !event.start.dateTime;

  let startAt: string;
  let endAt: string;

  if (isAllDay) {
    startAt = `${event.start.date}T00:00:00.000Z`;
    endAt = `${event.end.date}T00:00:00.000Z`;
  } else {
    startAt = event.start.dateTime!;
    endAt = event.end.dateTime!;
  }

  return {
    id: `google_${event.id}`,
    provider: 'google',
    providerEventId: event.id,
    title: event.summary || '(No title)',
    startAt,
    endAt,
    isAllDay,
    location: event.location || null,
    description: event.description || null,
  };
}
