import type { CalendarEvent, Env } from '../types';
import { TokenStorage } from '../storage/tokens';

function parseIcsContent(icsContent: string, startDate: string, endDate: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const startFilter = new Date(startDate + 'T00:00:00Z');
  const endFilter = new Date(endDate + 'T23:59:59Z');

  const veventRegex = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/g;
  let match;

  while ((match = veventRegex.exec(icsContent)) !== null) {
    const eventBlock = match[1];
    try {
      const event = parseVEvent(eventBlock);
      if (!event) continue;

      const eventStart = new Date(event.startAt);
      const eventEnd = new Date(event.endAt);

      if (eventEnd >= startFilter && eventStart <= endFilter) {
        events.push(event);
      }
    } catch (err) {
      console.error('[ICS] Failed to parse event:', err);
    }
  }

  events.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  return events;
}

function parseVEvent(eventBlock: string): CalendarEvent | null {
  const uid = extractField(eventBlock, 'UID');
  const summary = extractField(eventBlock, 'SUMMARY') || 'Untitled Event';
  const location = extractField(eventBlock, 'LOCATION');
  const description = extractField(eventBlock, 'DESCRIPTION');
  const dtstart = extractField(eventBlock, 'DTSTART');
  const dtend = extractField(eventBlock, 'DTEND');
  const duration = extractField(eventBlock, 'DURATION');

  if (!dtstart) return null;

  const { date: startDate, isAllDay } = parseIcsDate(dtstart);
  let endDate: Date;

  if (dtend) {
    endDate = parseIcsDate(dtend).date;
  } else if (duration) {
    endDate = addDuration(startDate, duration);
  } else {
    endDate = isAllDay ? startDate : new Date(startDate.getTime() + 60 * 60 * 1000);
  }

  return {
    id: `ics-${uid || Math.random().toString(36).substr(2, 9)}`,
    provider: 'ics',
    providerEventId: uid || '',
    title: decodeIcsText(summary),
    startAt: startDate.toISOString(),
    endAt: endDate.toISOString(),
    isAllDay,
    location: location ? decodeIcsText(location) : null,
    description: description ? decodeIcsText(description) : null,
  };
}

function extractField(block: string, fieldName: string): string | null {
  const regex = new RegExp(`^${fieldName}(?:;[^:]*)?:(.*)`, 'm');
  const match = block.match(regex);
  if (!match) return null;

  const lines = block.split(/\r?\n/);
  let inField = false;
  let result = '';

  for (const line of lines) {
    if (line.match(new RegExp(`^${fieldName}(?:;[^:]*)?:`))) {
      inField = true;
      result = line.split(':').slice(1).join(':');
    } else if (inField && (line.startsWith(' ') || line.startsWith('\t'))) {
      result += line.substring(1);
    } else if (inField) {
      break;
    }
  }

  return result || null;
}

function parseIcsDate(dateStr: string): { date: Date; isAllDay: boolean } {
  const cleanDate = dateStr.replace(/.*:/, '');

  if (cleanDate.length === 8 && !cleanDate.includes('T')) {
    const year = parseInt(cleanDate.substring(0, 4));
    const month = parseInt(cleanDate.substring(4, 6)) - 1;
    const day = parseInt(cleanDate.substring(6, 8));
    return { date: new Date(Date.UTC(year, month, day)), isAllDay: true };
  }

  const isUtc = cleanDate.endsWith('Z');
  const datePart = cleanDate.replace('Z', '');

  const year = parseInt(datePart.substring(0, 4));
  const month = parseInt(datePart.substring(4, 6)) - 1;
  const day = parseInt(datePart.substring(6, 8));
  const hour = parseInt(datePart.substring(9, 11)) || 0;
  const minute = parseInt(datePart.substring(11, 13)) || 0;
  const second = parseInt(datePart.substring(13, 15)) || 0;

  const date = new Date(Date.UTC(year, month, day, hour, minute, second));
  return { date, isAllDay: false };
}

function addDuration(date: Date, duration: string): Date {
  const result = new Date(date);
  const dayMatch = duration.match(/(\d+)D/);
  const hourMatch = duration.match(/(\d+)H/);
  const minuteMatch = duration.match(/(\d+)M/);

  if (dayMatch) result.setDate(result.getDate() + parseInt(dayMatch[1]));
  if (hourMatch) result.setHours(result.getHours() + parseInt(hourMatch[1]));
  if (minuteMatch) result.setMinutes(result.getMinutes() + parseInt(minuteMatch[1]));

  return result;
}

function decodeIcsText(text: string): string {
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function extractCalendarName(icsContent: string): string | null {
  const nameMatch = icsContent.match(/X-WR-CALNAME:(.*)/);
  if (nameMatch) return decodeIcsText(nameMatch[1].trim());
  return null;
}

export interface IcsConnectResult {
  success: boolean;
  error?: string;
  calendarName?: string;
}

export async function connectIcsCalendar(
  icsUrl: string,
  label: string | undefined,
  userId: string,
  env: Env,
): Promise<IcsConnectResult> {
  try {
    let url: URL;
    try {
      url = new URL(icsUrl);
    } catch {
      return { success: false, error: 'Invalid URL format' };
    }

    if (!['http:', 'https:'].includes(url.protocol)) {
      return { success: false, error: 'URL must use http:// or https://' };
    }

    console.log('[ICS] Validating calendar URL:', icsUrl);
    const response = await fetch(icsUrl, {
      headers: {
        'User-Agent': 'Gremly/1.0 (Calendar Sync)',
        Accept: 'text/calendar, */*',
      },
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Could not fetch calendar (${response.status}). Check the URL is correct and publicly accessible.`,
      };
    }

    const content = await response.text();

    if (!content.includes('BEGIN:VCALENDAR')) {
      return {
        success: false,
        error: 'URL does not point to a valid calendar file.',
      };
    }

    const detectedName = extractCalendarName(content);
    const calendarName = label || detectedName || 'ICS Calendar';

    const storage = new TokenStorage(env);
    const saveResult = await storage.saveToken(userId, 'ics', {
      access_token: icsUrl,
      refresh_token: '',
      access_token_expires_at: '2099-12-31T23:59:59Z',
      provider_email: calendarName,
      provider_account_id: null,
    });

    if (!saveResult.success) {
      return { success: false, error: 'Failed to save calendar connection' };
    }

    console.log('[ICS] Successfully connected:', calendarName);
    return { success: true, calendarName };
  } catch (err) {
    console.error('[ICS] Connect error:', err);
    return { success: false, error: String(err) };
  }
}

export async function fetchIcsEvents(
  userId: string,
  startDate: string,
  endDate: string,
  env: Env,
): Promise<{ events: CalendarEvent[]; error?: string }> {
  const storage = new TokenStorage(env);
  const token = await storage.getToken(userId, 'ics');

  if (!token || !token.is_active) {
    return { events: [], error: 'ICS calendar not connected' };
  }

  const icsUrl = token.access_token;

  try {
    console.log('[ICS] Fetching events from:', icsUrl);
    const response = await fetch(icsUrl, {
      headers: {
        'User-Agent': 'Gremly/1.0 (Calendar Sync)',
        Accept: 'text/calendar, */*',
      },
    });

    if (!response.ok) {
      const error = `Failed to fetch calendar (${response.status})`;
      await storage.recordError(userId, 'ics', error);
      return { events: [], error };
    }

    const content = await response.text();
    const events = parseIcsContent(content, startDate, endDate);

    await storage.updateLastSynced(userId, 'ics');

    console.log('[ICS] Fetched', events.length, 'events');
    return { events };
  } catch (err) {
    const error = String(err);
    await storage.recordError(userId, 'ics', error);
    return { events: [], error };
  }
}
