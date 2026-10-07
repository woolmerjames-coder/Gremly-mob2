/**
 * @jest-environment node
 */
/**
 * The days the calendar providers are asked for (src/calendar/window.ts), and
 * every page of a busy calendar read (outlook.ts, google.ts).
 */
import { addDays, fetchWindow } from '../calendar/window';
import { fetchEventsFromCalendar } from '../calendar/outlook';
import { fetchGoogleEvents } from '../calendar/google';

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
});

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

describe('the days asked for', () => {
  it('is a day either side, in UTC, so every local time on the days is in it', () => {
    expect(addDays('2026-10-05', 1)).toBe('2026-10-06');
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31');
    expect(fetchWindow('2026-10-04', '2026-10-11')).toEqual({
      from: '2026-10-03T00:00:00Z',
      to: '2026-10-12T23:59:59Z',
    });
  });
});

describe('a busy calendar', () => {
  const graphEvent = (id: string) => ({
    id,
    subject: id,
    start: { dateTime: '2026-10-05T19:00:00.0000000', timeZone: 'UTC' },
    end: { dateTime: '2026-10-05T20:00:00.0000000', timeZone: 'UTC' },
    isAllDay: false,
  });

  it('reads every page from Outlook, asking in UTC for the whole span', async () => {
    const urls: string[] = [];
    global.fetch = jest.fn(async (url: any) => {
      urls.push(String(url));
      return urls.length === 1
        ? json({ value: [graphEvent('a')], '@odata.nextLink': 'https://graph.example/next' })
        : json({ value: [graphEvent('b')] });
    }) as any;
    const events = await fetchEventsFromCalendar(
      'token',
      'cal',
      'Work',
      '2026-10-04',
      '2026-10-11',
    );
    expect(events.map((e) => e.providerEventId)).toEqual(['a', 'b']);
    expect(urls[0]).toContain('startDateTime=2026-10-03T00%3A00%3A00Z');
    expect(urls[0]).toContain('endDateTime=2026-10-12T23%3A59%3A59Z');
    expect(urls[1]).toBe('https://graph.example/next');
    expect(events[0].startAt).toBe('2026-10-05T19:00:00Z');
  });

  it('reads every page from Google, through the end date', async () => {
    const urls: string[] = [];
    const item = (id: string) => ({
      id,
      summary: id,
      status: 'confirmed',
      start: { dateTime: '2026-10-05T12:00:00-07:00' },
      end: { dateTime: '2026-10-05T13:00:00-07:00' },
    });
    global.fetch = jest.fn(async (url: any) => {
      urls.push(String(url));
      return urls.length === 1
        ? json({ items: [item('a')], nextPageToken: 'p2' })
        : json({ items: [item('b')] });
    }) as any;
    const events = await fetchGoogleEvents('token', '2026-10-04', '2026-10-11');
    expect(events.map((e) => e.providerEventId)).toEqual(['a', 'b']);
    expect(urls[0]).toContain('timeMax=2026-10-12T23%3A59%3A59Z');
    expect(urls[1]).toContain('pageToken=p2');
  });
});
