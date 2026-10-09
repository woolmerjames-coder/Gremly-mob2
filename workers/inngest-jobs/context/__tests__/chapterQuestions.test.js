/**
 * @jest-environment node
 *
 * Gremly's questions about Chapters (context/chapterQuestions.js, data fabric
 * stage 4c): code decides which Chapters and drops by ids, phases and dates,
 * a model writes the questions, and nothing is written while the switch is
 * off.
 */
import {
  awayState,
  closeCandidates,
  closeNoKey,
  whileAway,
  restsOnDeclined,
  closeRequest,
  closeRows,
  chapterQuestionsForDay,
  chapterQuestionEvents,
} from '../chapterQuestions.js';
import { chapterQuestionsOn, welcomeBackOf } from '../../../shared/questionRules.js';
import { jsonCall } from '../llm.js';
import { db } from '../db.js';
import { memoryDb } from './memoryDb.js';

jest.mock('../llm.js', () => ({ jsonCall: jest.fn(), modelFor: (env, job) => ({ model: job }) }));
jest.mock('../db.js', () => ({
  ...jest.requireActual('../db.js'),
  db: jest.fn(),
  personIdentity: async () => ({ first_name: 'Robin', pronouns: null }),
}));
jest.mock('../filing.js', () => ({ personToday: async () => '2026-10-07' }));

beforeEach(() => jsonCall.mockReset());

const TODAY = '2026-10-07';
const ch = (id, over = {}) => ({
  id,
  title: `Chapter ${id}`,
  phase: 'active',
  start_date: null,
  end_date: null,
  closed_at: null,
  primary_world_id: 'w-1',
  ...over,
});

describe('the switch', () => {
  it('is off unless set on', () => {
    expect(chapterQuestionsOn({})).toBe(false);
    expect(chapterQuestionsOn({ CHAPTER_QUESTIONS: 'off' })).toBe(false);
    expect(chapterQuestionsOn({ CHAPTER_QUESTIONS: 'on' })).toBe(true);
  });
});

describe('away and back', () => {
  it('is away after more than a day unseen, and a welcome back after two weeks away', () => {
    expect(
      awayState({ days_since_active: 0, active_today: true, days_away_before_today: 0 }),
    ).toMatchObject({ away: false, welcomeBack: false });
    expect(awayState({ days_since_active: 2 })).toMatchObject({ away: true });
    expect(awayState({ days_since_active: null })).toMatchObject({ away: true });
    expect(
      awayState({
        days_since_active: 0,
        active_today: true,
        days_away_before_today: 16,
        last_active_day_before_today: '2026-09-20',
      }),
    ).toMatchObject({ away: false, welcomeBack: true, lastActiveBefore: '2026-09-20' });
    expect(
      awayState({ days_since_active: 0, active_today: true, days_away_before_today: 13 })
        .welcomeBack,
    ).toBe(false);
  });
});

describe('closing', () => {
  it('asks about open Chapters past their end date, once for each end date they had', () => {
    const chapters = [
      ch('past', { end_date: '2026-10-01' }),
      ch('today', { end_date: TODAY }),
      ch('ahead', { end_date: '2026-10-20' }),
      ch('closed', { end_date: '2026-09-01', phase: 'closed' }),
      ch('closing', { end_date: '2026-09-01', closed_at: '2026-09-02' }),
      ch('asked', { end_date: '2026-09-15' }),
      ch('said', { end_date: '2026-09-10' }),
      ch('moved', { end_date: '2026-09-25' }),
    ];
    const got = closeCandidates({
      chapters,
      today: TODAY,
      asked: new Set(['asked']),
      noKeys: new Set([
        closeNoKey(ch('said', { end_date: '2026-09-10' })),
        closeNoKey(ch('moved', { end_date: '2026-09-12' })),
      ]),
    });
    expect(got.map((c) => c.id)).toEqual(['moved', 'past']);
  });

  it('asks about an open Chapter with no end date once nothing new has come into it for a while, again after something new', () => {
    const chapters = [
      ch('quiet', { start_date: '2026-01-01', end_date: null }),
      ch('busy', { start_date: '2026-01-01', end_date: null }),
      ch('new', { start_date: '2026-09-20', end_date: null }),
      ch('none', { start_date: null, end_date: null }),
      ch('said', { start_date: '2026-02-01', end_date: null }),
    ];
    const lastSign = new Map([
      ['quiet', '2026-05-20'],
      ['busy', '2026-10-01'],
      ['said', '2026-06-01'],
    ]);
    const said = closeNoKey({ ...ch('said'), quiet_since: '2026-06-01' });
    const got = closeCandidates({ chapters, today: TODAY, noKeys: new Set([said]), lastSign });
    expect(got.map((c) => [c.id, c.quiet_since])).toEqual([['quiet', '2026-05-20']]);
    expect(closeNoKey(got[0])).toBe('close:quiet:quiet:2026-05-20');
    // something filed since they answered lets it be asked again, once it goes quiet again
    const again = closeCandidates({ chapters, today: TODAY, noKeys: new Set([said]), lastSign: new Map([['said', '2026-07-01']]) });
    expect(again.map((c) => c.id)).toContain('said');
  });

  it('lists for a welcome back what passed while they were away, and what is ahead', () => {
    const { passed, ahead } = whileAway({
      chapters: [
        ch('before', { end_date: '2026-09-10' }),
        ch('while', { end_date: '2026-09-28' }),
        ch('ahead', { start_date: '2026-10-20' }),
        ch('ending', { start_date: '2026-09-01', end_date: '2026-10-15' }),
      ],
      today: TODAY,
      since: '2026-09-20',
    });
    expect(passed.map((c) => c.id)).toEqual(['while']);
    expect(ahead.map((c) => c.id)).toEqual(['ending', 'ahead']);
  });

  it('writes a question for each Chapter it was given, with the guess as the change it proposes', () => {
    const chapters = [ch('a', { end_date: '2026-10-01' })];
    const req = closeRequest({
      chapters,
      records: new Map(),
      worlds: [{ id: 'w-1', name: 'Home' }],
      person: null,
      today: TODAY,
    });
    expect(req.user).toContain('k1 | Chapter a | no start set to 2026-10-01 | in the World Home');
    const { rows, problems } = closeRows({
      output: {
        questions: [
          {
            chapter_ref: 'k1',
            guess: 'over',
            new_start_date: null,
            new_end_date: null,
            question: 'Is Chapter a over?',
            choices: ['Yes, over', 'Still going'],
            why: '',
          },
          { chapter_ref: 'k9', guess: 'over', question: 'x', choices: ['a', 'b'] },
        ],
      },
      refs: req.refs,
      userId: 'u',
      runId: 'r',
    });
    expect(problems).toEqual(['a ref it was never given']);
    expect(rows).toEqual([
      expect.objectContaining({
        kind: 'close_chapter',
        record_table: 'chapters',
        record_id: 'a',
        no_key: 'close:a:2026-10-01',
        proposed_change: {
          type: 'close',
          chapter_id: 'a',
          guess: 'over',
          end_date_was: '2026-10-01',
        },
      }),
    ]);
  });
});

describe('a suggestion turned down', () => {
  // the weekly pass offers Chapters forming since 18 Oct (weeklyForming.test.js),
  // by these same rules for what was offered before
  it('counts a turned down suggestion only when half or more of the drops are the same', () => {
    const mine = [
      { table: 'notes', id: 'a' },
      { table: 'notes', id: 'b' },
      { table: 'notes', id: 'c' },
    ];
    expect(restsOnDeclined(mine, [[{ table: 'notes', id: 'a' }]])).toBe(false);
    expect(
      restsOnDeclined(mine, [
        [
          { table: 'notes', id: 'a' },
          { table: 'notes', id: 'b' },
        ],
      ]),
    ).toBe(true);
  });
});

const mine = (rows) => rows.map((r) => ({ owner_id: 'u', ...r }));

function tables(over = {}) {
  return {
    chapters: mine([ch('past', { end_date: '2026-10-01' })]),
    worlds: [{ id: 'w-1', owner_id: 'u', name: 'Home', phase: 'active' }],
    gremly_questions: [],
    drop_chapter_links: [],
    notes: [1, 2, 3, 4].map((i) => ({
      id: `d-${i}`,
      owner_id: 'u',
      title: `drop ${i}`,
      archived: false,
      external_source: null,
      created_at: `2026-10-0${i}T09:00:00Z`,
    })),
    todos: [],
    habits: [],
    life_fact_sources: [],
    life_facts_now: [],
    ...over,
  };
}

function withDb(t, absence) {
  const mem = memoryDb(t);
  mem.rpc = async () => absence;
  db.mockReturnValue(mem);
  return mem;
}

const HERE = { days_since_active: 0, active_today: true, days_away_before_today: 0 };

function answers({ close }) {
  jsonCall.mockImplementation(async () => ({ output: close, model: 'chapterQuestion' }));
}

const CLOSE = {
  questions: [
    {
      chapter_ref: 'k1',
      guess: 'over',
      new_start_date: null,
      new_end_date: null,
      question: 'Is Chapter past over?',
      choices: ['Yes', 'Still going'],
      why: '',
    },
  ],
};
describe("the day's run", () => {
  it('writes nothing while the switch is off, and says what it would have', async () => {
    const mem = withDb(tables(), HERE);
    answers({ close: CLOSE });
    const out = await chapterQuestionsForDay({}, 'u');
    expect(out.written).toBe(false);
    expect(out.close.rows).toHaveLength(1);
    expect(mem.tables.gremly_questions).toEqual([]);
  });

  it('writes the close questions when on, and never a suggestion: the weekly pass offers those', async () => {
    const mem = withDb(tables(), HERE);
    answers({ close: CLOSE });
    const out = await chapterQuestionsForDay({ CHAPTER_QUESTIONS: 'on' }, 'u');
    expect(mem.tables.gremly_questions.map((q) => q.kind)).toEqual(['close_chapter']);
    expect(out.suggest).toBeUndefined();
    expect(jsonCall).toHaveBeenCalledTimes(1);
  });

  it('puts away a question about a Chapter they have since closed, and asks it no more', async () => {
    const mem = withDb(
      tables({
        chapters: mine([ch('done', { end_date: '2026-09-01', phase: 'closed', closed_at: '2026-10-08T23:19:27Z' })]),
        gremly_questions: [
          { id: 'q-close', user_id: 'u', kind: 'close_chapter', status: 'open', record_id: 'done' },
          { id: 'q-start', user_id: 'u', kind: 'start_chapter', status: 'open', record_id: 'w-1' },
        ],
      }),
      HERE,
    );
    answers({ close: CLOSE });
    const out = await chapterQuestionsForDay({ CHAPTER_QUESTIONS: 'on' }, 'u');
    expect(out.retired).toEqual(['q-close']);
    expect(mem.tables.gremly_questions.map((q) => [q.id, q.status])).toEqual([
      ['q-close', 'expired'],
      ['q-start', 'open'],
    ]);
  });

  it('asks nothing new while they are away', async () => {
    withDb(tables(), { days_since_active: 4, active_today: false, days_away_before_today: 3 });
    const out = await chapterQuestionsForDay({ CHAPTER_QUESTIONS: 'on' }, 'u');
    expect(out.skipped).toBe('away');
    expect(jsonCall).not.toHaveBeenCalled();
  });

  it('on a welcome back makes one set from what passed while they were away, and nothing else', async () => {
    const mem = withDb(
      tables({
        chapters: mine([
          ch('while', { end_date: '2026-09-28' }),
          ch('ahead', { start_date: '2026-10-20' }),
        ]),
      }),
      {
        days_since_active: 0,
        active_today: true,
        days_away_before_today: 16,
        last_active_day_before_today: '2026-09-20',
      },
    );
    answers({
      close: {
        questions: [
          {
            chapter_ref: 'k1',
            guess: 'over',
            question: 'Did Chapter while wrap up?',
            choices: ['Yes', 'Still going'],
            why: '',
          },
          {
            chapter_ref: 'k2',
            guess: 'still_ahead',
            question: 'Is Chapter ahead still on?',
            choices: ['Yes', 'No'],
            why: '',
          },
        ],
      },
    });
    const out = await chapterQuestionsForDay({ CHAPTER_QUESTIONS: 'on' }, 'u');
    const rows = mem.tables.gremly_questions;
    expect(rows.map((q) => [q.kind, q.record_id])).toEqual([
      ['while_away', 'while'],
      ['while_away', 'ahead'],
    ]);
    expect(new Set(rows.map((q) => q.set_id)).size).toBe(1);
    expect(out.welcome.set_id).toBe(rows[0].set_id);
    expect(jsonCall).toHaveBeenCalledTimes(1);
    expect(welcomeBackOf(rows)).toEqual({ set_id: rows[0].set_id, count: 2 });
  });
});

describe('the hourly events', () => {
  it('are none while off, and on, one for each active person at their early morning hour', async () => {
    const mem = memoryDb({});
    mem.rpc = async () => [
      { user_id: 'u-la', timezone: 'America/Los_Angeles' },
      { user_id: 'u-ldn', timezone: 'Europe/London' },
    ];
    db.mockReturnValue(mem);
    // 12:00 UTC is 5am in Los Angeles in October, 1pm in London
    const at = new Date('2026-10-07T12:00:00Z');
    expect(await chapterQuestionEvents({}, at)).toEqual([]);
    expect(await chapterQuestionEvents({ CHAPTER_QUESTIONS: 'on' }, at)).toEqual([
      {
        id: 'chapter-questions-u-la-2026-10-07',
        name: 'app/chapters.questions',
        data: { user_id: 'u-la' },
      },
    ]);
  });
});
