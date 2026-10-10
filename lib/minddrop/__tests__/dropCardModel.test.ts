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
  itemStateWords,
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

  it('after Not now: Kept as it is and Sweep will ask again, in place of the rest (stage 6)', () => {
    const later = {
      due_day: today,
      time_estimate_minutes: 10,
      views: { relation: undefined, needs_clarification: true, ask_on_card: false },
    };
    expect(metaParts(later as any, 'note')).toEqual([
      { key: 'kept', icon: 'sticky-note', text: 'Kept as it is' },
      { key: 'sweep', icon: 'moon', text: 'Sweep will ask again' },
    ]);
  });

  it('an unsure split after Not now: Kept as one and Sweep will ask again (stage 7)', () => {
    const later = {
      time_estimate_minutes: 120,
      views: { split: { status: 'pending', pieces: [] }, ask_on_card: false },
    };
    expect(metaParts(later as any, 'todo')).toEqual([
      { key: 'kept', icon: 'sticky-note', text: 'Kept as one' },
      { key: 'sweep', icon: 'moon', text: 'Sweep will ask again' },
    ]);
  });

  it('a split kept as one says so, with the kind it was kept as (stage 7, final check item 2)', () => {
    expect(metaParts({ views: { kept_as_one: { group: 'd1', count: 3 } } } as any, 'note')).toEqual(
      [{ key: 'kept', icon: 'sticky-note', text: 'Kept as one note' }],
    );
    expect(
      metaParts({ views: { kept_as_one: { group: 'd1', count: 3 } } } as any, 'todo')[0],
    ).toEqual({ key: 'kept', icon: 'sticky-note', text: 'Kept as one todo' });
    expect(
      metaParts({ views: { kept_as_one: { group: 'd1', count: 2 } } } as any, 'journal')[0],
    ).toEqual({ key: 'kept', icon: 'sticky-note', text: 'Kept as one journal entry' });
  });

  it('a journal entry that stays after an answer says what happened to it', () => {
    const rel = (status: string, intent: string) => ({
      relation: {
        kind: 'edit',
        intent,
        status,
        entity: { id: 'h1', type: 'habit', title: 'Run' },
        others: [],
        confidence: 90,
        change: { field: 'logged', from: null, to: today },
        classified: { bucket: 'log', subtype: 'journal' },
      },
    });
    expect(
      metaParts({ mood: ['tired'] as any, views: rel('applied', 'logged') }, 'journal'),
    ).toEqual([
      { key: 'outcome', icon: 'check', text: 'Logged to Run' },
      { key: 'mood', icon: 'heart', text: 'Tired' },
    ]);
    expect(metaParts({ views: rel('kept', 'logged') }, 'journal')[0]).toEqual({
      key: 'outcome',
      icon: 'notebook-pen',
      text: 'Kept as a journal entry',
    });
    expect(metaParts({ views: rel('pending', 'logged') }, 'journal')).toEqual([]);
    // a which one: the habit picked, as the yes recorded it
    const picked = {
      relation: {
        kind: 'choose',
        intent: 'logged',
        status: 'applied',
        candidates: [],
        applied_to: { id: 'h2', type: 'habit', title: 'Morning run' },
        classified: { bucket: 'log', subtype: 'journal' },
      },
    };
    expect(metaParts({ views: picked }, 'journal')[0]).toEqual({
      key: 'outcome',
      icon: 'check',
      text: 'Logged to Morning run',
    });
    expect(metaParts({ views: rel('applied', 'logged') }, 'note')).toEqual([]);
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

describe('an item they already have, in a few words', () => {
  it('a todo: due today, due Fri, overdue, or no date yet', () => {
    expect(itemStateWords({ due_day: today }, 'todo')).toBe('due today');
    expect(itemStateWords({ due_day: day(1) }, 'todo')).toBe('due tomorrow');
    expect(itemStateWords({ due_day: day(3) }, 'todo')).toMatch(
      /^due (Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/,
    );
    expect(itemStateWords({ due_day: day(-1) }, 'todo')).toBe('overdue');
    expect(itemStateWords({ target_date: day(1) }, 'todo')).toBe('due tomorrow');
    expect(itemStateWords({}, 'todo')).toBe('no date yet');
  });

  it('a habit: how often', () => {
    expect(itemStateWords({ cadence: 'daily', time_window: 'morning' }, 'habit')).toBe(
      'every morning',
    );
    expect(itemStateWords({ cadence: 'weekly', target_per_period: 3 }, 'habit')).toBe(
      '3 times a week',
    );
    expect(itemStateWords({ cadence: 'weekly', days_active: [1, 3] }, 'habit')).toBe('Mon, Wed');
    expect(itemStateWords({}, 'habit')).toBeNull();
  });

  it('an event: its day; any other note: when it was added', () => {
    expect(
      itemStateWords({ subtype: 'event', target_date: day(1), event_time: '19:30' } as any, 'note'),
    ).toBe('tomorrow, 7:30pm');
    expect(itemStateWords({ created_at: `${today}T09:00:00` }, 'note')).toBe('added today');
    expect(itemStateWords({ created_at: `${day(-1)}T09:00:00` }, 'note')).toBe('added yesterday');
  });
});
