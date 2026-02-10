import type { CalendarEvent } from '../types';

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

  const params = new URLSearchParams({
    timeMin: new Date(startDate).toISOString(),
    timeMax: new Date(endDate).toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '100',
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
  console.log('[Google Calendar] Got', data.items?.length || 0, 'events');

  return (data.items || [])
    .filter((event) => event.status !== 'cancelled')
    .map((event) => transformGoogleEvent(event));
}

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
