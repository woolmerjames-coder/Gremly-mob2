/**
 * @jest-environment node
 *
 * The daily picture under the check (data fabric stage 3): every sentence is
 * held to its records, one that fails goes back once alone with its records,
 * and one that fails again is left out. A headline that fails twice is blank.
 * The models and the database are replaced; every name and record is made up.
 */
import {
  buildDcoV4,
  writeDco,
  renderDay,
  daySentences,
  cancelledCalendarIds,
  rewriteSystemPrompt,
} from '../daily';
import { db, personIdentity } from '../db';
import { jsonCall, modelFor } from '../llm';
import { personNow } from '../../../shared/day.js';
import { readDayFrame } from '../dayFrame';
import { recentCorrections } from '../corrections';
import { loadStory } from '../story';
import { readThreadReaction } from '../../brief/reaction';
import { weekSettings } from '../../week/settings';

// jest resets every mock before each test: their answers are given in beforeEach
jest.mock('../db', () => ({
  ...jest.requireActual('../db'),
  db: jest.fn(),
  personIdentity: jest.fn(),
}));
jest.mock('../llm', () => ({ jsonCall: jest.fn(), modelFor: jest.fn() }));
jest.mock('../../../shared/day.js', () => ({
  ...jest.requireActual('../../../shared/day.js'),
  personNow: jest.fn(),
}));
jest.mock('../dayFrame', () => ({ ...jest.requireActual('../dayFrame'), readDayFrame: jest.fn() }));
jest.mock('../corrections', () => ({ recentCorrections: jest.fn() }));
jest.mock('../story', () => ({ loadStory: jest.fn() }));
jest.mock('../../brief/reaction', () => ({ readThreadReaction: jest.fn() }));
jest.mock('../../week/settings', () => ({ weekSettings: jest.fn() }));

beforeEach(() => {
  personIdentity.mockResolvedValue({ first_name: 'Alex', pronouns: null });
  modelFor.mockImplementation((env, job) => ({
    provider: 'openai',
    model: job.endsWith('Fallback') ? `${job}-fallback-model` : `${job}-model`,
  }));
  personNow.mockResolvedValue({ today: '2026-10-08' });
  readDayFrame.mockResolvedValue({ date: '2026-10-08', travel: null, blocks: [] });
  recentCorrections.mockResolvedValue([]);
  loadStory.mockResolvedValue([]);
  readThreadReaction.mockResolvedValue(null);
  weekSettings.mockResolvedValue(null);
});

const TODAY = '2026-10-08';

const TABLES = {
  synced_calendar_events: [
    {
      id: 'cal1',
      title: 'Design review',
      location: null,
      start_at: `${TODAY}T14:00:00Z`,
      end_at: `${TODAY}T15:00:00Z`,
      is_all_day: false,
      cancelled_at: null,
    },
    {
      id: 'cal2',
      title: 'Team lunch',
      location: null,
      start_at: `${TODAY}T12:00:00Z`,
      end_at: `${TODAY}T13:00:00Z`,
      is_all_day: false,
      cancelled_at: '2026-10-07T18:00:00Z',
    },
  ],
  life_facts_now: [
    {
      id: 'fact1',
      statement: 'Alex has a physio session today.',
      subject: null,
      about_date: TODAY,
      about_date_end: null,
      state: 'planned',
      date_confidence: 'exact',
      observed_at: '2026-10-06T10:00:00Z',
      last_confirmed_at: '2026-10-06T10:00:00Z',
      private: true,
      health: true,
      item_table: null,
      item_id: null,
    },
  ],
};

function fakeDb() {
  const inserted = [];
  db.mockReturnValue({
    upsert: jest.fn(async (table, rows) => {
      inserted.push({ table, rows });
      return table === 'user_daily_state' ? [{ id: 'day-row-1' }] : rows;
    }),
    select: jest.fn(async (path) => {
      const table = path.split('?')[0];
      // the past facts read uses the same view; only the open facts are given
      if (table === 'life_facts_now' && path.includes('state=in.(happened')) return [];
      return TABLES[table] || [];
    }),
    rpc: jest.fn(async () => null),
    insertQuiet: jest.fn(async (table, rows) => inserted.push({ table, rows })),
    update: jest.fn(async () => []),
    remove: jest.fn(async (path) => {
      inserted.push({ removed: path });
      return [];
    }),
  });
  return inserted;
}

const S = (text, refs = [], stated = []) => ({ text, refs, stated });

const DRAFT = {
  headline: S('Design review at 4pm.', ['c1'], [{ kind: 'time', value: '16:00', ref: 'c1' }]),
  day_shape: S(
    'One meeting, 2pm to 3pm.',
    ['s1'],
    [
      { kind: 'number', value: '1', ref: 's1' },
      { kind: 'time', value: '14:00', ref: 's1' },
      { kind: 'time', value: '15:00', ref: 's1' },
    ],
  ),
  tone: 'focused',
  day_type: 'work_day',
  lead_what: S('The physio session.', ['f1']),
  lead_why_today: S(''),
  today_focus: [S('Get ready for the design review.', ['c1']), S('Call at 9.')],
  also_matters: [S('The physio is at noon.', ['f1'])],
  claims: [
    { ref: 'c1', why: S('It is at 2pm.', ['c1'], [{ kind: 'time', value: '14:00', ref: 'c1' }]) },
  ],
  reach_ref: null,
  reach_why: S(''),
  reach_fact_refs: [],
  anchor_refs: ['f1'],
  anchor_labels: [{ ref: 'f1', short_label: 'Physio' }],
  question_ref: null,
  return_note: S(''),
  voice_note: 'Calm and plain.',
};

function fakeModels(draft = DRAFT) {
  const rewrites = [];
  jsonCall.mockImplementation(async (env, { system, user, schema }) => {
    if (schema.properties?.not_held) {
      // the words question: held unless the sentence says when the physio is
      return {
        output: { not_held: /noon/.test(user), what: 'a time no record gives' },
        model: 'check-model',
      };
    }
    if (system.includes('ONE SENTENCE AGAIN')) {
      rewrites.push(user);
      if (user.includes('FIELD: headline'))
        return {
          output: S(
            'Design review at 4pm today.',
            ['c1'],
            [{ kind: 'time', value: '16:00', ref: 'c1' }],
          ),
          model: 'daily-model',
        };
      if (user.includes('FIELD: lead_what')) return { output: S(''), model: 'daily-model' };
      if (user.includes('Call at 9')) return { output: S('Call at 9.'), model: 'daily-model' };
      return {
        output: S('The physio is today.', ['f1'], [{ kind: 'date', value: TODAY, ref: 'f1' }]),
        model: 'daily-model',
      };
    }
    return { output: JSON.parse(JSON.stringify(draft)), model: 'daily-model' };
  });
  return rewrites;
}

describe('the daily picture under the check', () => {
  it('keeps what holds, sends back what does not once, and leaves out what fails twice', async () => {
    fakeDb();
    const rewrites = fakeModels();
    const built = await buildDcoV4({}, 'user', { tz: 'UTC' });
    const { dco } = built;

    // the headline failed twice: blank, and nothing stands in for it
    expect(dco.brief_headline).toBeNull();
    expect(dco.brief.headline).toBeNull();
    expect(dco.brief.day_shape).toBe('One meeting, 2pm to 3pm.');
    // the lead rested on something private, a glanceable line: left out
    expect(dco.lead_story).toBeNull();
    expect(dco.today_focus).toEqual(['Get ready for the design review.']);
    // the words question sent it back, and the rewrite holds
    expect(dco.also_matters).toEqual(['The physio is today.']);
    expect(dco.brief.claims).toEqual([
      { type: 'calendar', id: 'cal1', title: 'Design review', date: TODAY, why: 'It is at 2pm.' },
    ]);
    // a private fact is never a chip
    expect(dco.named_anchors).toEqual([]);
    expect(dco.cancelled_calendar_ids).toEqual(['cal2']);

    // the lead rested on something private: left out at once, never sent back
    expect(built.check.counts).toEqual({ checked: 7, sent_back: 3, left_out: 3 });
    expect(rewrites).toHaveLength(3);
    expect(rewrites.some((u) => u.includes('FIELD: lead_what'))).toBe(false);
    // a sentence goes back alone, with only its own records
    const headlineAgain = rewrites.find((u) => u.includes('FIELD: headline'));
    expect(headlineAgain).toContain('c1 | today | 2026-10-08 14:00 to 15:00 | Design review');
    expect(headlineAgain).not.toContain('physio');
    expect(dco.review_flags.map((f) => [f.field, f.outcome])).toEqual([
      ['headline', 'left_out'],
      ['lead_what', 'left_out'],
      ['today_focus_1', 'left_out'],
      ['also_matters_0', 'rewritten'],
    ]);
  });

  it('records what each line that stands was written from, and logs what the check did', async () => {
    const inserted = fakeDb();
    fakeModels();
    const built = await buildDcoV4({}, 'user', { tz: 'UTC' });
    await writeDco({}, 'user', built, { shadow: false });
    const passages = inserted.find((x) => x.table === 'passage_refs').rows;
    expect(passages.map((p) => [p.field, p.fact_ids, p.items])).toEqual([
      ['brief.day_shape', [], []],
      ['today_focus.0', [], [{ table: 'synced_calendar_events', id: 'cal1' }]],
      ['also_matters.0', ['fact1'], []],
      ['brief.claims.0.why', [], [{ table: 'synced_calendar_events', id: 'cal1' }]],
    ]);
    expect(
      passages.every((p) => p.row_table === 'user_daily_state' && p.row_id === 'day-row-1'),
    ).toBe(true);
    // the day's earlier records go first
    const removed = inserted.findIndex((x) =>
      x.removed?.startsWith(
        'passage_refs?user_id=eq.user&row_table=eq.user_daily_state&row_id=eq.day-row-1',
      ),
    );
    expect(removed).toBeGreaterThanOrEqual(0);
    expect(removed).toBeLessThan(inserted.findIndex((x) => x.table === 'passage_refs'));
    const log = inserted.find((x) => x.table === 'check_runs').rows[0];
    expect(log).toMatchObject({
      user_id: 'user',
      job: 'daily',
      checked: 7,
      sent_back: 3,
      left_out: 3,
    });
    // the log keeps why, never the words
    expect(JSON.stringify(log)).not.toContain('Design review at 4pm');
  });

  it('keeps a claim whose why was left out, with no why at all, so corrections keep it too', async () => {
    fakeDb();
    fakeModels({
      ...DRAFT,
      claims: [
        ...DRAFT.claims,
        {
          ref: 'c1',
          why: S('It runs to 5pm.', ['c1'], [{ kind: 'time', value: '17:00', ref: 'c1' }]),
        },
      ],
    });
    const { dco } = await buildDcoV4({}, 'user', { tz: 'UTC' });
    expect(dco.brief.claims).toHaveLength(2);
    expect(dco.brief.claims[1]).toEqual({
      type: 'calendar',
      id: 'cal1',
      title: 'Design review',
      date: TODAY,
    });
    expect('why' in dco.brief.claims[1]).toBe(false);
  });

  it('carries none of the keys that were always empty', async () => {
    fakeDb();
    fakeModels();
    const { dco } = await buildDcoV4({}, 'user', { tz: 'UTC' });
    for (const key of ['life_moment', 'week_recap', 'recent_context'])
      expect(dco).not.toHaveProperty(key);
    expect(dco.active_today).not.toHaveProperty('habit_streak_risk');
  });

  it('asks the model for the day once, with no second draft', async () => {
    fakeDb();
    fakeModels();
    await buildDcoV4({}, 'user', { tz: 'UTC' });
    const drafts = jsonCall.mock.calls.filter(([, a]) => a.system.includes('YOUR JOB'));
    expect(drafts).toHaveLength(1);
  });
});

describe('a line sent back', () => {
  it('is told only what that line is, not the whole day', () => {
    const system = rewriteSystemPrompt({ first_name: 'Alex' }, 'today_focus_1');
    expect(system).toContain('today_focus: up to three short items');
    expect(system).not.toContain('headline: the notification line');
    expect(system).not.toContain('YOUR JOB');
    expect(system).toContain('ONE SENTENCE AGAIN');
  });
});

describe('the records the check holds the day to', () => {
  const g = {
    today: TODAY,
    weeklyDay: 0,
    calendar: TABLES.synced_calendar_events,
    cancelledIds: cancelledCalendarIds(TABLES.synced_calendar_events),
    noteEvents: [],
    openTodos: [
      {
        id: 'todo1',
        title: 'Send the Q4 deck',
        due_day: TODAY,
        time_estimate_minutes: 30,
        created_at: '2026-10-01T09:00:00Z',
      },
    ],
    doneToday: [],
    habits: [],
    progress: [],
    brief: null,
    intention: null,
    journals: [],
    facts: [
      {
        ...TABLES.life_facts_now[0],
        id: 'fact2',
        statement: 'Alex visits Rowan in Leeds.',
        about_date: '2026-10-10',
        about_date_end: '2026-10-12',
        private: false,
        health: false,
      },
    ],
    changes: [],
    questions: [],
    absence: { days_away_before_today: 0 },
    usage: null,
    lifeMap: null,
    prevDco: null,
    corrections: [],
    pastFacts: [],
    calendarConnected: true,
    story: [],
    recentNotes: [],
    reaction: null,
    eases: [],
    people: {
      byFact: new Map([
        [
          'fact2',
          [{ id: 'person1', name: 'Rowan', names: ['Rowan', 'Ro'], relationship: 'brother' }],
        ],
      ]),
    },
  };

  it('are the lines the model is shown, with what code can compare', () => {
    const { text, records } = renderDay(g, 'UTC');
    expect(records.get('c1')).toMatchObject({
      times: ['14:00', '15:00'],
      dates: [TODAY],
      exact: ['date', 'time'],
    });
    expect(records.get('c2').label).toContain('| cancelled');
    // a cancelled entry is not busy time
    expect(records.get('s1').label).toContain('1 timed entry');
    expect(records.get('t1')).toMatchObject({ dates: [TODAY], exact: [] });
    expect(records.get('t1').numbers).toContain(30);
    expect(records.get('p1')).toMatchObject({ names: ['Rowan', 'Ro'], exact: ['person'] });
    expect(records.get('p1').label).toBe('p1 | Rowan | also called Ro | brother, as they said');
    expect(records.get('f1')).toMatchObject({
      spans: [['2026-10-10', '2026-10-12']],
      names: ['Rowan', 'Ro'],
    });
    expect(records.get('f1').label).toContain('| about p1');
    expect(records.get('d1')).toMatchObject({ dates: [TODAY], exact: ['date'] });
    expect(text).toContain(
      'PEOPLE IN THESE FACTS (ref | name | other names | who they are):\np1 | Rowan',
    );
    expect(records.get('p1').private).toBe(false);
    // every ref the model is shown has a record
    for (const ref of text.match(/\b[cthfpqjnyls]\d+\b|\b[dak]1\b|\bi1\b/g))
      expect(records.has(ref)).toBe(true);
  });

  it('show someone known only from private or health facts as private', () => {
    const health = { ...g, facts: [{ ...g.facts[0], private: false, health: true }] };
    const { records, text } = renderDay(health, 'UTC');
    expect(records.get('p1')).toMatchObject({ private: true });
    expect(records.get('f1')).toMatchObject({ health: true });
    expect(text).toContain('p1 [private] | Rowan');
    expect(text).toMatch(/f1 \| planned \[private\]/);
  });

  it('read every sentence of the day, and know which are seen at a glance', () => {
    const keys = daySentences({ ...DRAFT, reach_ref: 't1', reach_why: S('a reason') }).map((i) => [
      i.key,
      i.glanceable,
    ]);
    expect(keys).toEqual([
      ['headline', true],
      ['day_shape', true],
      ['lead_what', true],
      ['lead_why_today', true],
      ['today_focus_0', true],
      ['today_focus_1', true],
      ['also_matters_0', false],
      ['claims_0_why', false],
      ['reach_why', true],
      ['return_note', false],
    ]);
  });
});
