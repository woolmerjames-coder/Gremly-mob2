import {
  briefReadyLine,
  clearFrom,
  pinStatusLine,
  threadDateLabel,
  todayThreadParams,
} from '../pinned';
import { isBriefUnread, withinResumeWindow, RESUME_WINDOW_MS } from '../todayThread';

jest.mock('../../repo/dailyThreadRepo', () => ({ getDailyThread: jest.fn() }));
jest.mock('../../store/useGremlyStore', () => ({
  useGremlyStore: Object.assign(jest.fn(), { getState: () => ({ userId: null }) }),
}));

const m = (start: number, end: number, title = 'Meeting') => ({
  id: `${start}`,
  title,
  start,
  end,
});
const MORNING = [m(480, 510), m(510, 555), m(570, 600), m(600, 630), m(660, 690), m(690, 795)];

describe('the pinned Today card', () => {
  it('describes the rest of the day from the calendar', () => {
    expect(pinStatusLine(MORNING, [], 465)).toBe('Six meetings left, clear from 1:15');
    expect(pinStatusLine(MORNING, [], 720)).toBe('One meeting left, clear from 1:15');
    expect(pinStatusLine(MORNING, [], 800)).toBe('No more meetings today');
    expect(pinStatusLine([], [], 600)).toBe('Nothing on the calendar today');
    expect(pinStatusLine([m(900, 930)], [], 600)).toBe('Clear now, one meeting later');
  });

  it('describes the locked plan when there is one', () => {
    const planned = [
      { id: 'a', title: 'Social posts', start: 795, end: 825, kind: 'habit' as const },
      { id: 'b', title: 'Oat milk', start: 930, end: 945, kind: 'todo' as const },
    ];
    expect(pinStatusLine(MORNING, planned, 700)).toBe('2 planned, next Social posts at 1:15');
    expect(pinStatusLine(MORNING, planned, 900)).toBe('2 planned, next Oat milk at 3:30');
    expect(pinStatusLine(MORNING, planned, 1000)).toBe('Two things planned, all done');
  });

  it('finds the first clear stretch of 45 minutes', () => {
    expect(clearFrom(MORNING, 465)).toBe(795);
    expect(clearFrom([m(480, 510), m(540, 600)], 465)).toBe(600);
    expect(clearFrom([m(480, 510), m(560, 600)], 465)).toBe(510);
    expect(clearFrom([m(1290, 1320)], 1280)).toBeNull();
  });

  it('labels the thread by its day', () => {
    expect(threadDateLabel('2026-10-01')).toBe('Thursday 1 Oct');
  });
});

describe('Gremly’s line when the brief is waiting', () => {
  it('names the day', () => {
    expect(briefReadyLine('2026-10-01', { returnDay: false, surface: 'drop' })).toEqual({
      lead: "Your Thursday's ready.",
      rest: 'Want the rundown? Tap here',
    });
    expect(briefReadyLine('2026-10-01', { returnDay: false, surface: 'today' }).rest).toBe(
      'Tap for the rundown',
    );
  });

  it('welcomes them back on a return day, without mentioning time away', () => {
    const line = briefReadyLine('2026-10-01', {
      returnDay: true,
      firstName: 'James',
      surface: 'drop',
    });
    expect(line.lead).toBe('Good to see you, James.');
    expect(`${line.lead} ${line.rest}`).not.toMatch(/away|while|missed/i);
  });
});

describe('today’s thread state', () => {
  it('is unread once a brief is written and until it has been seen', () => {
    expect(isBriefUnread({ metadata_json: { ritual_day: 'x' } } as any)).toBe(false);
    expect(
      isBriefUnread({ metadata_json: { ritual_day: 'x', brief_written_at: 't' } } as any),
    ).toBe(true);
    expect(
      isBriefUnread({
        metadata_json: { ritual_day: 'x', brief_written_at: 't', seen_at: 's' },
      } as any),
    ).toBe(false);
    expect(isBriefUnread(null)).toBe(false);
  });

  it('resumes a chat left less than five minutes ago', () => {
    const left = { chatLeftAt: 1_000_000, chatLeftId: 'c1' };
    expect(withinResumeWindow(left, 1_000_000 + 4 * 60_000)).toBe(true);
    expect(withinResumeWindow(left, 1_000_000 + RESUME_WINDOW_MS + 1)).toBe(false);
    expect(withinResumeWindow({ chatLeftAt: 1_000_000, chatLeftId: null }, 1_000_100)).toBe(false);
  });

  it('gives every jump to today’s thread its own key', () => {
    const a = todayThreadParams();
    const b = todayThreadParams('plan');
    expect(a).toMatchObject({ mode: 'chat', thread: 'today' });
    expect(b.step).toBe('plan');
    expect(a.threadKey).not.toBe(b.threadKey);
  });
});
