/**
 * dropCardModel: what the drop card shows, from the item's own fields
 * (Mind Drop rethink stage 5).
 */
import {
  cardAccessibilityLabel,
  dayWords,
  dropCardKind,
  dropCardStage,
  estimateWords,
  hasOpenQuestion,
  howOftenWords,
  metaParts,
  moodWords,
  onlyCapitalDiffers,
  startsWords,
  timeWords,
  whenWords,
} from '../dropCardModel';
import { getDateService } from '../../date/DateService';

const ds = getDateService();
let today = '';
const day = (n: number) => ds.addDays(today, n);

beforeEach(() => {
  today = ds.today();
});

describe('kind', () => {
  it('names todos, habits and each kind of note; general and catchall are a Note', () => {
    expect(dropCardKind({ kind: 'todo' })).toBe('todo');
    expect(dropCardKind({ kind: 'habit' })).toBe('habit');
    expect(dropCardKind({ kind: 'note', noteSubtype: 'event' })).toBe('event');
    expect(dropCardKind({ kind: 'note', noteSubtype: 'journal' })).toBe('journal');
    expect(dropCardKind({ kind: 'note', noteSubtype: 'idea' })).toBe('idea');
    expect(dropCardKind({ kind: 'note', noteSubtype: 'general' })).toBe('note');
    expect(dropCardKind({ kind: 'note', noteSubtype: 'catchall' })).toBe('note');
  });

  it('is One quick question while a question is open, on the column or in views', () => {
    expect(dropCardKind({ kind: 'note', needs_clarification: true })).toBe('ask');
    expect(dropCardKind({ kind: 'note', views: { needs_clarification: true } })).toBe('ask');
    expect(
      dropCardKind({
        kind: 'note',
        noteSubtype: 'event',
        needs_clarification: true,
        clarification_resolved: true,
      }),
    ).toBe('event');
    expect(
      hasOpenQuestion({ views: { needs_clarification: true, clarification_resolved: true } }),
    ).toBe(false);
  });
});

describe('stage', () => {
  it('a queued drop has landed until its kind is known, then is sorted', () => {
    expect(dropCardStage({ views: { bucket_confirmed: false } }, true)).toBe('landed');
    expect(dropCardStage({ views: { bucket_confirmed: true } }, true)).toBe('sorted');
  });

  it('a saved row is sorted until it settles', () => {
    expect(dropCardStage({ views: { minddrop_stage: 'saved' } }, false)).toBe('sorted');
    expect(dropCardStage({ views: { minddrop_stage: 'settled' } }, false)).toBe('settled');
  });

  it('older rows are settled, and an answer being filed waits for its details', () => {
    expect(dropCardStage({ views: { minddrop_stage: 'enriched' } }, false)).toBe('settled');
    expect(dropCardStage({ views: {} }, false)).toBe('settled');
    expect(dropCardStage({ views: { minddrop_stage: 'settled', ai_pending: true } }, false)).toBe(
      'sorted',
    );
  });
});

describe('words', () => {
  it('days: Today, Tomorrow, a weekday in the week ahead, then the date', () => {
    expect(dayWords(today)).toBe('Today');
    expect(dayWords(day(1))).toBe('Tomorrow');
    expect(dayWords(day(3))).toMatch(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/);
    expect(dayWords(day(10))).toMatch(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) \d{1,2} [A-Z][a-z]{2}$/);
  });

  it('times: 7:30pm, and 3pm on the hour', () => {
    expect(timeWords('19:30')).toBe('7:30pm');
    expect(timeWords('15:00:00')).toBe('3pm');
    expect(timeWords('00:15')).toBe('12:15am');
    expect(timeWords(null)).toBe('');
  });

  it('how long: 5 min, About 45 min, About 2 hrs', () => {
    expect(estimateWords(5)).toBe('5 min');
    expect(estimateWords(45)).toBe('About 45 min');
    expect(estimateWords(60)).toBe('About 1 hr');
    expect(estimateWords(90)).toBe('About 1.5 hrs');
    expect(estimateWords(120)).toBe('About 2 hrs');
    expect(estimateWords(0)).toBeNull();
    expect(estimateWords(null)).toBeNull();
  });

  it('only the first capital differs: no cross fade', () => {
    expect(onlyCapitalDiffers('buy milk', 'Buy milk')).toBe(true);
    expect(onlyCapitalDiffers('Buy milk', 'Buy milk')).toBe(true);
    expect(onlyCapitalDiffers('buy milk before friday', 'Buy milk')).toBe(false);
    expect(onlyCapitalDiffers('email the hoa', 'Email the HOA')).toBe(false);
  });
});

describe('when', () => {
  it("a todo's planned day, with its time", () => {
    expect(whenWords({ due_day: today }, 'todo')).toBe('Today');
    expect(whenWords({ due_day: day(1), due_time: '09:00' }, 'todo')).toBe('Tomorrow, 9am');
    expect(whenWords({ scheduled_date: today }, 'todo')).toBe('Today');
  });

  it('a todo with only a deadline reads Due, then Overdue', () => {
    expect(whenWords({ target_date: today }, 'todo')).toBe('Due today');
    expect(whenWords({ target_date: day(1) }, 'todo')).toBe('Due tomorrow');
    expect(whenWords({ target_date: day(3) }, 'todo')).toMatch(
      /^Due (Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/,
    );
    expect(whenWords({ target_date: day(-1) }, 'todo')).toBe('Overdue');
  });

  it('a planned day wins over a deadline', () => {
    expect(whenWords({ due_day: today, target_date: day(3) }, 'todo')).toBe('Today');
  });

  it('a todo with no day yet says so', () => {
    expect(whenWords({}, 'todo')).toBe('No date yet');
  });

  it("an event's day and time", () => {
    expect(whenWords({ target_date: day(1), event_time: '19:30' }, 'event')).toBe(
      'Tomorrow, 7:30pm',
    );
    expect(whenWords({}, 'event')).toBeNull();
  });

  it('other notes have no when', () => {
    expect(whenWords({ target_date: today }, 'journal')).toBeNull();
    expect(whenWords({}, 'idea')).toBeNull();
  });
});

describe('how often, and when it starts', () => {
  it('reads the saved cadence and part of the day', () => {
    expect(howOftenWords({ cadence: 'daily', time_window: 'morning' })).toEqual({
      text: 'Every morning',
      icon: 'sunrise',
    });
    expect(howOftenWords({ cadence: 'daily', time_window: 'evening' })?.text).toBe('Every evening');
    expect(howOftenWords({ cadence: 'daily', time_window: 'day' })?.text).toBe('Every day');
    expect(howOftenWords({ cadence: 'weekly', target_per_period: 3 })?.text).toBe('3 times a week');
    expect(howOftenWords({ cadence: 'weekly', target_per_period: 1 })?.text).toBe('Once a week');
    expect(howOftenWords({ cadence: 'monthly', target_per_period: 2 })?.text).toBe(
      '2 times a month',
    );
  });

  it('names the days when only some are set', () => {
    expect(howOftenWords({ cadence: 'weekly', days_active: [5, 1, 3] })?.text).toBe(
      'Mon, Wed, Fri',
    );
  });

  it('says nothing without a cadence', () => {
    expect(howOftenWords({})).toBeNull();
  });

  it('starts on a day ahead', () => {
    expect(startsWords({ start_date: day(1) })).toBe('Starts tomorrow');
    expect(startsWords({ start_date: today })).toBeNull();
  });
});

describe('mood', () => {
  it("a journal's mood, by its label", () => {
    expect(moodWords({ mood: ['grateful', 'tired'] as any })).toBe('Grateful, Tired');
    expect(moodWords({ mood: ['proud'] as any })).toBe('Proud');
    expect(moodWords({ mood: [] })).toBeNull();
  });
});

describe('the meta line', () => {
  it('a todo: when, then how long', () => {
    const parts = metaParts({ target_date: day(3), time_estimate_minutes: 10 }, 'todo');
    expect(parts.map((p) => p.key)).toEqual(['when', 'long']);
    expect(parts.map((p) => p.icon)).toEqual(['calendar', 'clock']);
    expect(parts[1].text).toBe('About 10 min');
  });

  it('a habit: how long, how often, when it starts', () => {
    const parts = metaParts(
      { cadence: 'daily', time_window: 'morning', start_date: day(1), time_estimate_minutes: 15 },
      'habit',
    );
    expect(parts.map((p) => [p.key, p.text])).toEqual([
      ['long', 'About 15 min'],
      ['often', 'Every morning'],
      ['starts', 'Starts tomorrow'],
    ]);
  });

  it('a journal: its mood; an idea or a question: nothing after the kind word', () => {
    expect(metaParts({ mood: ['calm'] as any }, 'journal')).toEqual([
      { key: 'mood', icon: 'heart', text: 'Calm' },
    ]);
    expect(metaParts({}, 'idea')).toEqual([]);
    expect(metaParts({ due_day: today }, 'ask')).toEqual([]);
  });

  it('never shows people or tags', () => {
    const parts = metaParts({ tags: ['x'], views: { people: ['Sam'] } } as any, 'note');
    expect(parts).toEqual([]);
  });
});

describe('accessibility', () => {
  it('one label: the kind, the title and the meta line once settled', () => {
    const parts = metaParts({ due_day: today, time_estimate_minutes: 5 }, 'todo');
    expect(cardAccessibilityLabel('todo', 'Call mum', parts, 'settled')).toBe(
      'Todo. Call mum. Today. 5 min',
    );
    expect(cardAccessibilityLabel('todo', 'Call mum', parts, 'sorted')).toBe('Todo. Call mum');
    expect(cardAccessibilityLabel('todo', 'call mum', parts, 'landed')).toBe(
      'call mum. Gremly is sorting it.',
    );
  });
});
