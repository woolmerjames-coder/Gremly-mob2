/**
 * @jest-environment node
 *
 * The check on the weekly pass (data fabric stage 7): every note the pass
 * writes goes through the shared check before anything is kept, as every
 * other writer's sentences do. A note that holds stays, one written again
 * replaces it, and one still wrong is left empty, or taken out of a list. A
 * World or Chapter whose notes were left out has them emptied, not kept from
 * last week.
 */
import {
  applyWeekly,
  afterWeeklyCheck,
  checkWeekly,
  weeklyCheckItems,
  weeklyRecords,
  whereKept,
} from '../weekly.js';
import { db } from '../db';

jest.mock('../db', () => ({
  ...jest.requireActual('../db'),
  db: jest.fn(),
  personIdentity: jest.fn(async () => ({ first_name: 'Alex', identity: {} })),
}));
jest.mock('../cache', () => ({ invalidateChatCache: jest.fn(async () => ({})) }));

const USER = 'u-1';
const snapshot = [
  ['f1', { type: 'fact', id: 'fact-1', statement: 'Alex is training for a half marathon.', state: 'current', private: false, about_date: '2026-10-01', label: 'f1 | current | 1 Oct | Alex is training for a half marathon.' }],
  ['f2', { type: 'fact', id: 'fact-2', statement: 'Alex plans a long run on Saturday.', state: 'planned', private: false, about_date: '2026-10-03', label: 'f2 | planned | 3 Oct | Alex plans a long run on Saturday.' }],
  ['f3', { type: 'fact', id: 'fact-3', statement: 'Alex saw a physio about their knee.', state: 'happened', private: false, health: true, about_date: '2026-10-02', label: 'f3 | happened [health] | 2 Oct | Alex saw a physio about their knee.' }],
  ['t1', { type: 'item', id: 'todo-1', title: 'Book race hotel', added: '2026-10-01', done: '2026-10-02', due: null, label: 't1 | added 2026-10-01, done 2026-10-02 | Book race hotel' }],
  ['p1', { type: 'person', id: 'person-1', name: 'Sam', relationship: null, label: 'p1 | Sam | who they are to them is not recorded' }],
  ['w1', { type: 'world', id: 'world-1', label: 'w1 | Running | phase active' }],
  ['c1', { type: 'chapter', id: 'chapter-1', label: 'c1 | Race season | active' }],
];

const output = () => ({
  life_map: {
    domains: [
      {
        name: 'Running',
        attention: 'active',
        threads: [
          {
            name: 'Half marathon',
            status: 'active',
            momentum: 'building',
            lifecycle: 'active',
            importance: 'high',
            attention: 'active',
            summary: 'Alex is training for a half marathon.',
            recent_update: 'Alex did the long run on Saturday.',
            fact_refs: ['f1', 'f2'],
          },
        ],
      },
    ],
  },
  profile_text: 'Alex is training for a half marathon this autumn and enjoys it.\n\nAlex booked the race hotel this week.',
  profile_refs: [['f1'], ['t1']],
  worlds: [
    {
      world_ref: 'w1',
      phase: 'active',
      summary: 'You did your long run on Saturday.',
      key_priorities: [{ text: 'Your long run on 3 October', date: '2026-10-03' }],
      card_fact_refs: ['f2'],
    },
  ],
  worlds_summary: { headline: 'Running is most alive for you this week.', refs: ['f1'], featured: [] },
  chapters: [
    {
      chapter_ref: 'c1',
      summary: 'You are training for your half marathon this autumn.',
      stage: 'Building up',
      key_priorities: [],
      card_fact_refs: ['f1'],
    },
  ],
  questions: [{ question: 'How did the long run go?', fact_ref: 'f2' }],
  week_note: 'A week of training, and the race hotel booked.',
  week_note_refs: ['f1', 't1'],
  summary_plan: {
    character: 'Building up',
    through_line: 'Training carried the week.',
    cards: [{ about: 'The race hotel booked on 2 October.', refs: ['t1'] }],
  },
  people_notes: [{ person_ref: 'p1', note: 'Sam came up this week.', refs: ['f1'] }],
});

describe('the records the check reads', () => {
  it('reads each ref by the line the writer was shown, with its dates, and none from a run that kept no lines', () => {
    const r = weeklyRecords(snapshot);
    expect(r.get('f2')).toMatchObject({ label: expect.stringContaining('long run'), dates: ['2026-10-03'] });
    expect(r.get('t1').dates).toEqual(['2026-10-01', '2026-10-02']);
    expect(r.get('p1').names).toEqual(['Sam']);
    expect(r.get('f3')).toMatchObject({ health: true });
    expect(weeklyRecords([['f1', { type: 'fact', id: 'x', statement: 'no label' }]]).size).toBe(0);
  });
});

describe('what the check reads in a pass', () => {
  it('reads every note, each by where it is kept, with the glanceable lines marked', () => {
    const items = weeklyCheckItems(output());
    const keys = items.map((x) => x.key);
    expect(keys).toEqual([
      'lm.0.0.summary',
      'lm.0.0.update',
      'profile.0',
      'profile.1',
      'w.0.summary',
      'w.0.p.0',
      'ws.headline',
      'c.0.summary',
      'q.0',
      'week_note',
      'plan.character',
      'plan.line',
      'plan.card.0',
      'pn.0',
    ]);
    const glance = items.filter((x) => x.glanceable).map((x) => x.key);
    expect(glance).toEqual(['ws.headline', 'week_note', 'plan.character', 'plan.card.0', 'pn.0']);
    // stored notes keep no list of what they state; the words question reads them
    expect(items.every((x) => x.listed === false)).toBe(true);
    expect(items.find((x) => x.key === 'profile.1').sentence.refs).toEqual(['t1']);
    expect(items.find((x) => x.key === 'plan.character').sentence.refs).toEqual(['t1']);
    expect(items.find((x) => x.key === 'pn.0').sentence.refs).toEqual(['f1', 'p1']);
  });

  it('tells a note sent back where it is kept, and whether the person sees it', () => {
    expect(whereKept('w.0.summary')).toMatch(/shown to them/);
    expect(whereKept('lm.0.0.update')).toMatch(/Gremly's own/);
    expect(whereKept('plan.character')).toMatch(/neither their name nor a pronoun/);
  });
});

describe('the pass as the check leaves it', () => {
  it('keeps what held, takes in what was written again, and empties or takes out what was left out', () => {
    const results = new Map([
      ['lm.0.0.update', { outcome: 'rewritten', sentence: { text: 'Alex planned a long run for Saturday.' }, refs: ['f2'] }],
      ['profile.1', { outcome: 'left_out', sentence: null, refs: [] }],
      ['w.0.summary', { outcome: 'left_out', sentence: null, refs: [] }],
      ['w.0.p.0', { outcome: 'left_out', sentence: null, refs: [] }],
      ['q.0', { outcome: 'pass', sentence: { text: 'How did the long run go?' }, refs: ['f2'] }],
      ['pn.0', { outcome: 'left_out', sentence: null, refs: [] }],
      ['plan.card.0', { outcome: 'rewritten', sentence: { text: 'The race hotel, booked on 2 October.' }, refs: ['t1'] }],
    ]);
    const { output: out, left_out } = afterWeeklyCheck(output(), results);
    const thread = out.life_map.domains[0].threads[0];
    expect(thread.recent_update).toBe('Alex planned a long run for Saturday.');
    expect(thread.summary).toBe('Alex is training for a half marathon.');
    expect(out.profile_text).toBe('Alex is training for a half marathon this autumn and enjoys it.');
    expect(out.profile_refs).toEqual([['f1']]);
    expect(out.worlds[0]).toMatchObject({ summary: '', cleared: true, key_priorities: [] });
    expect(out.questions).toHaveLength(1);
    expect(out.people_notes).toEqual([]);
    expect(out.summary_plan.cards[0].about).toBe('The race hotel, booked on 2 October.');
    expect(left_out.sort()).toEqual(['pn.0', 'profile.1', 'w.0.p.0', 'w.0.summary'].sort());
  });
});

describe('the check on the pass', () => {
  const held = async () => ({ not_held: false, what: null });

  it('sends a note that does not hold back once, keeps a repair that holds, and leaves a health fact off a glanceable line', async () => {
    const ask = jest.fn(async (req) =>
      /SENTENCE: [^\n]*did (the|your) long run on/.test(req.user) ? { not_held: true, what: 'says the planned run happened' } : { not_held: false, what: null },
    );
    const rewrite = jest.fn(async ({ key, sentence }) => ({
      text: key === 'w.0.summary' ? 'You planned your long run for Saturday.' : 'Alex planned a long run for Saturday.',
      refs: sentence.refs,
      stated: [],
    }));
    const o = output();
    // the week note leans on the physio visit, which is about health
    o.week_note_refs = ['f1', 'f3'];
    const r = await checkWeekly({ output: o, refsSnapshot: snapshot, today: '2026-10-08', person: { first_name: 'Alex' }, ask, rewrite, confirm: held });
    // the second reader says both hold: nothing is sent back
    expect(rewrite).not.toHaveBeenCalled();
    expect(r.counts.held_by_second).toBe(2);
    expect(r.output.week_note).toBe('');
    expect(r.left_out).toContain('week_note');

    const r2 = await checkWeekly({ output: output(), refsSnapshot: snapshot, today: '2026-10-08', person: { first_name: 'Alex' }, ask, rewrite });
    expect(rewrite.mock.calls.map((c) => c[0].key).sort()).toEqual(['lm.0.0.update', 'w.0.summary']);
    expect(r2.output.worlds[0].summary).toBe('You planned your long run for Saturday.');
    expect(r2.output.life_map.domains[0].threads[0].recent_update).toBe('Alex planned a long run for Saturday.');
    expect(r2.counts).toMatchObject({ sent_back: 2, left_out: 0 });
  });

  it("keeps a World's notes from before when the new ones were left out and the old ones still hold, and reads them against the World's own line", async () => {
    const ask = jest.fn(async (req) => ({ not_held: /SENTENCE: [^\n]*did your long run/.test(req.user), what: 'says the planned run happened' }));
    const previous = new Map([['w1', 'You are training for a half marathon.']]);
    const r = await checkWeekly({ output: output(), refsSnapshot: snapshot, today: '2026-10-08', person: null, ask, rewrite: async () => null, previous });
    expect(r.output.worlds[0].summary).toBe('You are training for a half marathon.');
    expect(r.output.worlds[0].cleared).toBeUndefined();
    expect(r.kept_before).toEqual(['w.0.summary']);
    // the World's own line is among the records its notes were read against
    expect(ask.mock.calls.some((c) => c[0].user.includes('w1 | Running'))).toBe(true);
    // its own ref is never kept among the facts its notes cite
    expect(r.output.worlds[0].card_fact_refs).not.toContain('w1');
  });

  it('applies a run that kept no lines unchecked, and says so', async () => {
    const ask = jest.fn();
    const plain = snapshot.map(([k, v]) => [k, { ...v, label: undefined }]);
    const r = await checkWeekly({ output: output(), refsSnapshot: plain, today: '2026-10-08', person: null, ask, rewrite: jest.fn() });
    expect(ask).not.toHaveBeenCalled();
    expect(r.unchecked).toMatch(/no lines/);
    expect(r.output).toEqual(output());
  });

  it('throws rather than blank the notes when the words question cannot be asked', async () => {
    const down = async () => {
      throw new Error('model down');
    };
    await expect(
      checkWeekly({ output: output(), refsSnapshot: snapshot, today: '2026-10-08', person: null, ask: down, rewrite: jest.fn() }),
    ).rejects.toThrow(/could not ask/);
  });
});

describe('applying a checked pass', () => {
  function fakeDb() {
    const calls = [];
    db.mockReturnValue({
      select: async (path) => {
        if (path.startsWith('user_life_map')) return [{ id: 'lm-1', life_map: { domains: [] }, version: 1 }];
        if (path.startsWith('worlds')) return [{ id: 'world-1', summary_source: 'synthesis' }];
        if (path.startsWith('chapters')) return [{ id: 'chapter-1', phase: 'active', summary_source: 'synthesis' }];
        if (path.startsWith('user_profiles')) return [{ user_id: USER, signals: {} }];
        return [];
      },
      update: async (path, patch) => calls.push({ op: 'update', path, patch }),
      insertQuiet: async (table, rows) => calls.push({ op: 'insert', table, rows }),
      remove: async (path) => calls.push({ op: 'remove', path }),
      upsert: async (table, rows) => calls.push({ op: 'upsert', table, rows }),
    });
    return calls;
  }

  it("empties a World's notes the check left out, logs the check, and returns the notes as checked", async () => {
    const calls = fakeDb();
    const ask = async (req) => (/SENTENCE: [^\n]*did your long run on/.test(req.user) ? { not_held: true, what: 'says the planned run happened' } : { not_held: false, what: null });
    const rewrite = async () => null;
    const r = await applyWeekly({}, USER, output(), snapshot, {
      shadow: false,
      runId: 'run',
      today: '2026-10-08',
      model: 'claude-sonnet-5-5',
      calls: { ask, rewrite },
    });
    const world = calls.find((c) => c.op === 'update' && c.path.startsWith('worlds?id=eq.world-1'));
    expect(world.patch.summary).toBe('');
    const row = calls.find((c) => c.op === 'insert' && c.table === 'check_runs').rows[0];
    expect(row).toMatchObject({ job: 'weekly', day: '2026-10-08', model: 'claude-sonnet-5-5' });
    expect(row.details.some((d) => d.field === 'w.0.summary' && d.outcome === 'left_out')).toBe(true);
    expect(r.output.worlds[0].cleared).toBe(true);
    expect(r.applied.check.left_out).toContain('w.0.summary');
  });
});
