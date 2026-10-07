/**
 * @jest-environment node
 *
 * Stage 1 of the data fabric: the reader sees everything a person gives, as it
 * stands now. Whole words, a journal page's prompts kept apart from what they
 * wrote, edits and deletes from the change log, private items, and a plan
 * whose date has passed. Made up records only.
 */
import {
  changeRecord,
  deletedRecord,
  journalCards,
  noteRecord,
  personMoods,
  reviewRecord,
  splitRecord,
  todoRecord,
} from '../records';
import { gatherChanges, readerRequest, retireDeleted } from '../reader';
import { factTiming, planPassed, stateWords } from '../../../shared/factTiming';
import { db } from '../db';

jest.mock('../db', () => ({ ...jest.requireActual('../db'), db: jest.fn() }));
jest.mock('../llm', () => ({ jsonCall: jest.fn(), modelFor: jest.fn() }));

const TZ = 'America/Los_Angeles';
const PERSON = { first_name: 'Robin', pronouns: null, identity: {} };
const long = (n, word = 'river') => Array.from({ length: n }, (_, i) => `${word}${i}`).join(' ');

describe('whole words', () => {
  it('keeps every word of a long entry, with no cut', () => {
    const body = long(900);
    const rec = noteRecord({
      id: 'n1',
      subtype: 'journal',
      title: 'Sunday',
      body,
      created_at: '2026-10-04T20:00:00Z',
    });
    expect(rec.text).toContain(body);
    expect(rec.text).not.toContain('…');
  });

  it('splits a record too long for one call at its own paragraphs, and loses nothing', () => {
    const paras = [long(400, 'a'), long(400, 'b'), long(400, 'c'), long(400, 'd')];
    const rec = { table: 'notes', id: 'n1', at: '2026-10-04T20:00:00Z', text: paras.join('\n\n') };
    const parts = splitRecord(rec, 6000);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.id === 'n1' && p.at === rec.at)).toBe(true);
    for (const p of paras) expect(parts.some((x) => x.text.includes(p))).toBe(true);
    expect(parts[1].text).toMatch(/^\(part 2 of \d+ of the same record\)/);
  });

  it('leaves a record that fits as it is', () => {
    const rec = { table: 'notes', id: 'n1', at: 'x', text: 'short' };
    expect(splitRecord(rec)).toEqual([rec]);
  });
});

describe('a journal page', () => {
  const page = {
    id: 'n2',
    subtype: 'journal',
    title: 'Evening',
    body: 'What went well?\nThe walk by the canal.\n\nThe long Sunday lunch.',
    created_at: '2026-10-05T05:30:00Z',
    views: {
      sweep_date: '2026-10-04',
      journal_page: {
        v: 1,
        tpl: 't1',
        cards: [
          { q: 'What went well?', html: '<p>The walk by the canal.</p>' },
          { q: null, html: '<p>The long Sunday lunch.</p>' },
        ],
        text: 'What went well?\nThe walk by the canal.\n\nThe long Sunday lunch.',
      },
    },
  };

  it("marks the page's prompt as the app's, and keeps their words", () => {
    expect(journalCards(page)).toEqual([
      '[The page asked: "What went well?"]\nThe walk by the canal.',
      'The long Sunday lunch.',
    ]);
  });

  it('says the day the entry is for when it was written after midnight', () => {
    expect(noteRecord(page).text).toContain('for Sunday 2026-10-04');
  });

  it('reads the words as they stand when the page no longer matches them', () => {
    const edited = { ...page, body: 'Rewritten later.' };
    expect(journalCards(edited)).toBeNull();
    expect(noteRecord(edited).text).toContain('Rewritten later.');
  });

  it("names a goal check in's goal", () => {
    const n = {
      id: 'n3',
      title: 'Check-in',
      body: 'Two runs.',
      created_at: 'x',
      views: { goal_checkin: { goal_id: 'g1', goal_name: 'Run a 10k' } },
    };
    expect(noteRecord(n).text).toContain('a check in on their goal "Run a 10k"');
  });
});

describe('whose words', () => {
  it('shows a mood only when the person chose it', () => {
    expect(personMoods({ mood: ['calm'], views: { sweep_origin: true, sweep_moods: [] } })).toEqual(
      [],
    );
    expect(
      personMoods({ mood: ['calm'], views: { sweep_origin: true, sweep_moods: ['calm'] } }),
    ).toEqual(['calm']);
    expect(personMoods({ mood: ['calm'], views: { ai_mood: ['calm'] } })).toEqual([]);
    expect(personMoods({ mood: ['tired'], views: {} })).toEqual(['tired']);
  });

  it('carries a private mark on the record', () => {
    const rec = noteRecord({
      id: 'n4',
      title: 'Private',
      body: 'x',
      created_at: 'x',
      views: { private_journal: true },
    });
    expect(rec.private).toBe(true);
    expect(rec.text).toContain('[they marked it private]');
  });

  it("reads a todo's details and list whole", () => {
    const t = todoRecord({
      id: 't1',
      title: 'Pack',
      body: long(200),
      list_items: [
        { text: 'Passport', checked: true },
        { text: 'Charger', checked: false },
      ],
      created_at: 'x',
    });
    expect(t.text).toContain(long(200));
    expect(t.text).toContain('List: [done] Passport; Charger.');
  });
});

describe('a weekly review', () => {
  it("reads their answers, with Gremly's words marked as his", () => {
    const row = {
      id: 'w1',
      status: 'done',
      week_start: '2026-10-05',
      read: {
        first: '2026-10-05',
        last: '2026-10-11',
        challenge: { headline: 'Too much on Thursday' },
        intention_drafts: ['Protect the mornings'],
        coming_up: [{ when: 'Fri', what: 'The quarterly review', item: null }],
      },
      answers: {
        challenge: { agreed: false, note: 'Thursday is fine, Friday is the problem' },
        priorities: [{ text: 'Finish the deck', item_ids: ['t9'] }],
        intention: 'Protect the mornings',
        dates_out: ['when:0'],
        said: [{ step: 'priorities', text: 'The deck matters most' }],
      },
    };
    const rec = reviewRecord(row, new Map([['t9', 'Quarterly deck']]), '2026-10-05T18:00:00Z');
    expect(rec.text).toContain(
      '[Gremly\'s read of what could make the week go wrong, context only: "Too much on Thursday"] They said he had it wrong: "Thursday is fine, Friday is the problem"',
    );
    expect(rec.text).toContain('meaning: "Quarterly deck"');
    expect(rec.text).toContain("(a draft of Gremly's they chose)");
    expect(rec.text).toContain(
      'Took these off the week\'s list of what is coming: "The quarterly review"',
    );
    expect(rec.text).toContain('Typed to Gremly: "The deck matters most"');
  });

  it('is nothing when they have answered nothing yet', () => {
    expect(reviewRecord({ id: 'w2', status: 'started', answers: {}, read: {} })).toBeNull();
  });
});

describe('changes from the change log', () => {
  it('folds every change to an item into one, with its first and last dates', () => {
    const [c] = gatherChanges([
      {
        table_name: 'todos',
        row_id: 't1',
        op: 'update',
        fields: ['due_day'],
        dates: { due_day: ['2026-10-06', '2026-10-07'] },
        at: '2026-10-06T20:00:00Z',
      },
      {
        table_name: 'todos',
        row_id: 't1',
        op: 'update',
        fields: ['due_day', 'title'],
        dates: { due_day: ['2026-10-07', '2026-10-09'] },
        at: '2026-10-07T20:00:00Z',
      },
    ]);
    expect(c.at).toBe('2026-10-07T20:00:00Z');
    expect([...c.fields].sort()).toEqual(['due_day', 'title']);
    expect(c.dates.due_day).toEqual(['2026-10-06', '2026-10-09']);
  });

  it('knows a delete wins', () => {
    const [c] = gatherChanges([
      { table_name: 'notes', row_id: 'n1', op: 'update', fields: ['body'], at: 'a' },
      { table_name: 'notes', row_id: 'n1', op: 'delete', fields: [], at: 'b' },
    ]);
    expect(c.op).toBe('delete');
  });

  it('says how a todo moved, how many times in all, and how it stands now', () => {
    const rec = changeRecord(
      {
        table: 'todos',
        row_id: 't1',
        at: '2026-10-07T20:00:00Z',
        fields: ['due_day'],
        dates: { due_day: ['2026-10-06', '2026-10-09'] },
      },
      {
        id: 't1',
        title: 'Call the plumber',
        due_day: '2026-10-09',
        sweep_reschedule_count: 5,
        created_at: '2026-09-30T10:00:00Z',
      },
      TZ,
    );
    expect(rec.kind).toBe('changed');
    expect(rec.text).toContain('moved it from 2026-10-06 to 2026-10-09');
    expect(rec.text).toContain('(moved 5 times in all)');
    expect(rec.text).toContain('due 2026-10-09');
  });

  it('says a todo was let go, from the reason the app saved', () => {
    const rec = changeRecord(
      {
        table: 'todos',
        row_id: 't1',
        at: 'x',
        fields: ['archived'],
        dates: { archived: [false, true] },
      },
      {
        id: 't1',
        title: 'Call the plumber',
        archived: true,
        archived_reason: 'swept',
        sweep_reschedule_count: 5,
      },
      TZ,
    );
    expect(rec.text).toContain('let it go in the evening wrap up');
  });

  it("leaves out the app's own tidying, where the item became another", () => {
    const rec = changeRecord(
      { table: 'notes', row_id: 'n1', at: 'x', fields: ['archived'] },
      { id: 'n1', title: 'Drop', archived: true, archived_reason: 'converted_to_todo' },
      TZ,
    );
    expect(rec).toBeNull();
  });

  it('shows an edited entry whole, as it stands now', () => {
    const rec = changeRecord(
      { table: 'notes', row_id: 'n1', at: '2026-10-06T16:00:00Z', fields: ['body'] },
      {
        id: 'n1',
        subtype: 'journal',
        title: 'Sunday',
        body: 'First half.\n\nAdded the next morning.',
        created_at: '2026-10-05T05:00:00Z',
      },
      TZ,
    );
    expect(rec.text).toContain('changed its words');
    expect(rec.text).toContain('First half.\n\nAdded the next morning.');
  });

  it('says a calendar entry moved, and from when', () => {
    const rec = changeRecord(
      {
        table: 'synced_calendar_events',
        row_id: 'e1',
        at: 'x',
        fields: ['start_at', 'end_at'],
        dates: {
          start_at: ['2026-10-08T17:00:00Z', '2026-10-09T17:00:00Z'],
          end_at: ['2026-10-08T18:00:00Z', '2026-10-09T18:00:00Z'],
        },
      },
      {
        id: 'e1',
        title: 'Dentist',
        start_at: '2026-10-09T17:00:00Z',
        end_at: '2026-10-09T18:00:00Z',
        is_all_day: false,
      },
      TZ,
    );
    expect(rec.text).toContain('moved, it was from 2026-10-08 10:00 to 2026-10-08 11:00');
    expect(rec.text).toContain('now "Dentist" from 2026-10-09 10:00 to 2026-10-09 11:00');
  });

  it('shows a deleted record by the facts taken from it, and those facts beside it', () => {
    const rec = {
      ...deletedRecord({ table: 'todos', row_id: 't7', at: '2026-10-07T20:00:00Z' }),
      factIds: ['fact-2'],
    };
    const { user } = readerRequest({
      today: '2026-10-07',
      person: PERSON,
      chunk: [rec],
      openFacts: [
        {
          id: 'fact-1',
          statement: 'Robin is going to Lisbon.',
          state: 'planned',
          about_date: '2026-11-02',
        },
        {
          id: 'fact-2',
          statement: 'Robin plans to repaint the hall.',
          state: 'planned',
          about_date: null,
        },
      ],
      tz: TZ,
    });
    expect(user).toContain('[deleted] Deleted a todo.');
    expect(user).toContain('ledger facts from it: f2');
  });
});

describe('the ledger as the reader sees it', () => {
  it('says when a plan date has passed, and how the item a fact is about stands', () => {
    const { user } = readerRequest({
      today: '2026-10-07',
      person: PERSON,
      chunk: [{ table: 'notes', id: 'n1', at: '2026-10-07T18:00:00Z', text: 'Wrote a note: "x"' }],
      openFacts: [
        {
          id: 'a',
          statement: 'Robin planned a haircut.',
          state: 'planned',
          about_date: '2026-10-01',
        },
        {
          id: 'b',
          statement: 'Robin is in Lisbon this week.',
          state: 'planned',
          about_date: '2026-10-05',
          about_date_end: '2026-10-10',
        },
        {
          id: 'c',
          statement: 'Robin will see the dentist.',
          state: 'planned',
          about_date: '2026-10-09',
          item_table: 'synced_calendar_events',
          item_cancelled: true,
        },
      ],
      tz: TZ,
    });
    expect(user).toContain('f1 | planned, date passed |');
    expect(user).toContain('f2 | planned |');
    expect(user).toContain('f3 | planned | about a calendar entry, cancelled |');
  });

  it('marks a plan as passed by an exact comparison of dates, and nothing else', () => {
    expect(factTiming({ about_date: '2026-10-01' }, '2026-10-07')).toBe('passed');
    expect(
      factTiming({ about_date: '2026-10-05', about_date_end: '2026-10-10' }, '2026-10-07'),
    ).toBe('now');
    expect(factTiming({ about_date: '2026-10-08' }, '2026-10-07')).toBe('ahead');
    expect(factTiming({}, '2026-10-07')).toBe('undated');
    expect(planPassed({ state: 'happened', about_date: '2026-10-01' }, '2026-10-07')).toBe(false);
    expect(stateWords({ state: 'planned', about_date: '2026-10-01' }, '2026-10-07')).toBe(
      'planned, date passed',
    );
  });
});

describe('a deleted note', () => {
  function fakeDb({ sources, facts }) {
    const calls = { updates: [], changes: [] };
    db.mockReturnValue({
      select: async (path) => {
        if (path.startsWith('life_fact_sources')) return sources;
        if (path.startsWith('life_facts')) return facts.filter((f) => path.includes(f.id));
        return [];
      },
      update: async (path, patch) => calls.updates.push({ path, patch }),
      insertQuiet: async (table, rows) => calls.changes.push(...rows),
    });
    return calls;
  }

  it('sets aside the facts that rested on it alone, and leaves the rest for the reader', async () => {
    const calls = fakeDb({
      sources: [
        { fact_id: 'f1', source_table: 'notes', source_id: 'n1' },
        { fact_id: 'f2', source_table: 'notes', source_id: 'n1' },
        { fact_id: 'f2', source_table: 'scope_chat_messages', source_id: 'm1' },
      ],
      facts: [{ id: 'f1', state: 'happened', source_id: 'n1' }],
    });
    const deleted = [{ table: 'notes', row_id: 'n1', factIds: ['f1', 'f2'] }];
    const r = await retireDeleted({}, 'u1', deleted, 'run');
    expect(r.retired).toBe(1);
    expect(calls.updates[0].path).toContain('id=eq.f1');
    expect(calls.updates[0].patch).toMatchObject({
      state: 'superseded',
      state_reason: 'source deleted',
    });
    expect(calls.changes[0]).toMatchObject({
      fact_id: 'f1',
      from_state: 'happened',
      to_state: 'superseded',
      reason: 'source deleted',
    });
    expect(deleted[0].factIds).toEqual(['f2']);
  });

  it('sets nothing aside for a deleted todo: tidying away is not forgetting', async () => {
    const calls = fakeDb({ sources: [], facts: [] });
    const r = await retireDeleted(
      {},
      'u1',
      [{ table: 'todos', row_id: 't1', factIds: ['f9'] }],
      'run',
    );
    expect(r.retired).toBe(0);
    expect(calls.updates).toHaveLength(0);
  });
});
