/**
 * Gremly's questions about Worlds and Chapters in the app (stage 3): how a
 * stored question is read, which one waits above the box, the welcome back,
 * what the card says, and what each tap does, with Undo.
 */
import {
  askWords,
  closeIt,
  fetchWorldsQuestions,
  moveIt,
  notNow,
  proposedWorld,
  startIt,
  stillGoing,
  tellGremly,
  welcomeBack,
  worldsAsk,
  withFactItems,
  worldsQuestionFrom,
} from '../questions';
import { useGremlyStore } from '../../store/useGremlyStore';
import { callNotRight } from '../../cortex/CortexClient';

type Op = {
  table?: string;
  kind?: string;
  payload?: unknown;
  where: [string, string, unknown][];
};
const mockOps: Op[] = [];
let mockRows: Record<string, unknown>[] = [];
let mockFacts: Record<string, unknown>[] = [];
let mockFail = false;

jest.mock('../../supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const op: Op = { table, where: [] };
      mockOps.push(op);
      const chain: Record<string, unknown> = {};
      Object.assign(chain, {
        select: () => chain,
        update: (p: unknown) => {
          op.kind = 'update';
          op.payload = p;
          return chain;
        },
        eq: (k: string, v: unknown) => (op.where.push(['eq', k, v]), chain),
        in: (k: string, v: unknown) => (op.where.push(['in', k, v]), chain),
        order: () => chain,
        limit: () => chain,
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
          Promise.resolve(
            mockFail && op.kind === 'update'
              ? { data: null, error: { message: 'no' } }
              : {
                  data: op.kind ? null : op.table === 'life_facts' ? mockFacts : mockRows,
                  error: null,
                },
          ).then(res, rej),
      });
      return chain;
    },
  },
}));
jest.mock('../../cortex/CortexClient', () => ({ callNotRight: jest.fn() }));
jest.mock('../../date/DateService', () => ({ nowTimestamp: () => '2026-10-08T09:00:00Z' }));
jest.mock('../../store/useGremlyStore', () => ({ useGremlyStore: { getState: jest.fn() } }));

const row = (o: Record<string, unknown>) => ({
  status: 'open',
  question: 'A question?',
  choices: ['Yes', 'No', 3],
  created_at: '2026-10-07T05:00:00Z',
  asked_at: null,
  hold_until: null,
  weight: null,
  record_table: null,
  record_id: null,
  rests_on: [],
  set_id: null,
  ...o,
});
const start = (o: Record<string, unknown> = {}) =>
  worldsQuestionFrom(
    row({
      id: 'q1',
      kind: 'start_chapter',
      proposed_change: {
        type: 'start',
        title: 'Yard tidy',
        world_id: 'w1',
        start_date: '2026-10-10',
        end_date: 'soon',
        unsure: true,
      },
      rests_on: [
        { table: 'todos', id: 't1' },
        { table: 'notes', id: 'n1' },
        { table: 'life_facts', id: 'f1' },
      ],
      ...o,
    }),
  )!;
const close = (id: string, chapterId: string, guess: string, o: Record<string, unknown> = {}) =>
  worldsQuestionFrom(
    row({
      id,
      kind: 'close_chapter',
      record_table: 'chapters',
      record_id: chapterId,
      proposed_change: { type: 'close', chapter_id: chapterId, guess, ...o },
    }),
  )!;

const chapters = [
  {
    id: 'c1',
    title: 'Garden fence',
    phase: 'active',
    closed_at: null,
    start_date: null,
    end_date: '2026-09-30',
    end_date_source: 'synthesis',
  },
  {
    id: 'c2',
    title: 'Lisbon trip',
    phase: 'upcoming',
    closed_at: null,
    start_date: '2026-11-20',
    end_date: '2026-11-22',
    end_date_source: 'user',
  },
  {
    id: 'c3',
    title: 'Summer move',
    phase: 'closed',
    closed_at: '2026-09-01T10:00:00Z',
    start_date: null,
    end_date: null,
  },
] as any[];

let s: Record<string, any>;
const undo = jest.fn(() => Promise.resolve());
beforeEach(() => {
  jest.clearAllMocks();
  mockOps.length = 0;
  mockFail = false;
  mockFacts = [];
  s = {
    chapters,
    todos: [{ id: 't1' }],
    notes: [],
    habits: [],
    makeChapter: jest.fn(() =>
      Promise.resolve({ chapter: { id: 'c9', title: 'Yard tidy' }, undo }),
    ),
    closeChapter: jest.fn(() => Promise.resolve(undo)),
    askForMemory: jest.fn(() => Promise.resolve('You did it.')),
    setChapterDates: jest.fn(() => Promise.resolve(undo)),
  };
  (useGremlyStore.getState as jest.Mock).mockReturnValue(s);
});

const updates = () => mockOps.filter((o) => o.kind === 'update');

describe('a stored question', () => {
  it('a suggestion: its title, World, real dates, and only items it can file', () => {
    const q = start();
    expect(q.proposal).toEqual({
      type: 'start',
      title: 'Yard tidy',
      world_id: 'w1',
      start_date: '2026-10-10',
      end_date: null,
      unsure: true,
    });
    expect(q.rests_on).toEqual([
      { table: 'todos', id: 't1' },
      { table: 'notes', id: 'n1' },
    ]);
    expect(q.rests_on_facts).toEqual(['f1']);
    expect(q.choices).toEqual(['Yes', 'No']);
  });

  it('a suggestion holds the items its facts were read from, once each', () => {
    const q = withFactItems(
      start({
        rests_on: [
          { table: 'todos', id: 't1' },
          { table: 'life_facts', id: 'f1' },
          { table: 'life_facts', id: 'f2' },
          { table: 'life_facts', id: 'f3' },
        ],
      }),
      [
        { id: 'f1', source_table: 'todos', source_id: 't9' },
        { id: 'f2', source_table: 'todos', source_id: 't1' },
        { id: 'f3', source_table: 'scope_chat_messages', source_id: 'm1' },
        { id: 'other', source_table: 'habits', source_id: 'h1' },
      ],
    );
    expect(q.rests_on).toEqual([
      { table: 'todos', id: 't1' },
      { table: 'todos', id: 't9' },
    ]);
  });

  it('a close: its Chapter and Gremly’s guess, unsure when it gave none it knows', () => {
    expect(close('q2', 'c1', 'over').proposal).toMatchObject({ chapter_id: 'c1', guess: 'over' });
    expect(close('q3', 'c1', 'maybe').proposal).toMatchObject({ guess: 'unsure' });
  });

  it('is nothing when it cannot be put', () => {
    expect(worldsQuestionFrom(row({ id: 'x', kind: 'person', proposed_change: {} }))).toBeNull();
    expect(
      worldsQuestionFrom(row({ id: 'x', kind: 'start_chapter', proposed_change: {} })),
    ).toBeNull();
    expect(
      worldsQuestionFrom(row({ id: 'x', kind: 'close_chapter', proposed_change: {} })),
    ).toBeNull();
  });

  it('reads what each fact a suggestion rests on was taken from', async () => {
    mockRows = [
      row({
        id: 'q1',
        kind: 'start_chapter',
        proposed_change: { title: 'A birthday trip', world_id: 'w1' },
        rests_on: [
          { table: 'life_facts', id: 'f1' },
          { table: 'life_facts', id: 'f2' },
        ],
      }),
    ];
    mockFacts = [
      { id: 'f1', source_table: 'todos', source_id: 't7' },
      { id: 'f2', source_table: 'notes', source_id: 'n4' },
    ];
    const [q] = await fetchWorldsQuestions();
    expect(q.rests_on).toEqual([
      { table: 'todos', id: 't7' },
      { table: 'notes', id: 'n4' },
    ]);
    const facts = mockOps.find((o) => o.table === 'life_facts');
    expect(facts?.where).toEqual(
      expect.arrayContaining([
        ['in', 'id', ['f1', 'f2']],
        ['in', 'source_table', ['todos', 'notes', 'habits']],
      ]),
    );
  });

  it('reads only these kinds, still waiting', async () => {
    mockRows = [
      row({ id: 'q1', kind: 'start_chapter', proposed_change: { title: 'Yard' } }),
      row({ id: 'bad', kind: 'start_chapter' }),
    ];
    const list = await fetchWorldsQuestions();
    expect(list.map((q) => q.id)).toEqual(['q1']);
    // no facts to read, so no second read
    expect(mockOps.filter((o) => o.table === 'life_facts')).toHaveLength(0);
    expect(mockOps[0].where).toEqual(
      expect.arrayContaining([
        ['in', 'kind', ['start_chapter', 'close_chapter', 'while_away']],
        ['in', 'status', ['open', 'asked']],
      ]),
    );
  });
});

describe('which question waits above the box', () => {
  const day = '2026-10-08';
  it('one at a time, those that need an answer first, and only about a Chapter still open', () => {
    const helps = close('q2', 'c1', 'over');
    const needs = { ...close('q4', 'c2', 'going'), weight: 'needs' as const };
    const gone = close('q5', 'c3', 'over');
    expect(worldsAsk([helps, needs, gone], { day, chapters })?.id).toBe('q4');
    expect(worldsAsk([gone], { day, chapters })).toBeNull();
  });

  it('by the rules every place keeps: held, or asked lately elsewhere, it waits', () => {
    const held = { ...start(), hold_until: '2026-10-12' };
    const lately = { ...close('q2', 'c1', 'over'), asked_at: '2026-10-07T20:00:00Z' };
    expect(worldsAsk([held, lately], { day, chapters })).toBeNull();
  });

  it('a welcome back is its own card: the newest set, Chapters still open', () => {
    const away = (id: string, chapterId: string, set: string, at: string) => ({
      ...close(id, chapterId, 'over'),
      kind: 'while_away' as const,
      set_id: set,
      created_at: at,
    });
    const old = away('a0', 'c1', 's0', '2026-09-01T05:00:00Z');
    const a1 = away('a1', 'c1', 's1', '2026-10-08T05:00:00Z');
    const a2 = away('a2', 'c3', 's1', '2026-10-08T05:00:00Z');
    expect(welcomeBack([old, a1, a2], chapters).map((q) => q.id)).toEqual(['a1']);
    expect(worldsAsk([a1], { day, chapters })).toBeNull();
  });
});

describe('what the card says', () => {
  it('for a suggestion, and for each guess about a Chapter', () => {
    expect(askWords(start(), chapters)).toMatchObject({
      chip: 'Start Yard tidy?',
      title: 'Something is starting: Yard tidy',
      primary: { label: 'Start it', act: 'start' },
      secondary: { label: 'Not now', act: 'no' },
    });
    expect(askWords(close('q', 'c1', 'over'), chapters)).toMatchObject({
      chip: 'Close Garden fence?',
      primary: { act: 'close' },
      secondary: { label: 'Not yet', act: 'going' },
    });
    expect(askWords(close('q', 'c1', 'going'), chapters).primary.act).toBe('going');
    expect(
      askWords(close('q', 'c1', 'moved', { end_date: '2026-10-20' }), chapters).primary.act,
    ).toBe('move');
    // moved, but with no new days to move to
    expect(askWords(close('q', 'c1', 'moved'), chapters).primary.act).toBe('going');
    expect(askWords(close('q', 'c1', 'unsure'), chapters).chip).toBe('How is Garden fence going?');
  });

  it('a suggestion goes in its World only when it is one they see', () => {
    expect(proposedWorld(start(), [{ id: 'w1', phase: 'active' }] as any)).toBe('w1');
    expect(proposedWorld(start(), [{ id: 'w1', phase: 'archived' }] as any)).toBeNull();
    expect(proposedWorld(start(), [] as any)).toBeNull();
  });
});

describe('a tap on the card', () => {
  it('Start it makes the Chapter with what is still theirs, answers the question, and Undo puts both back', async () => {
    const { undo: back } = await startIt(start(), { title: ' Yard ', worldId: null });
    expect(s.makeChapter).toHaveBeenCalledWith({
      title: 'Yard',
      worldId: null,
      startDate: '2026-10-10',
      endDate: null,
      items: [{ id: 't1', type: 'todo' }],
    });
    expect(updates()[0].payload).toEqual({
      status: 'answered',
      answer: 'Start it',
      answered_at: '2026-10-08T09:00:00Z',
    });
    await back();
    expect(undo).toHaveBeenCalled();
    expect(updates()[1].payload).toEqual({ status: 'open', answer: null, answered_at: null });
  });

  it('when the question cannot be answered, nothing is left made', async () => {
    mockFail = true;
    await expect(startIt(start())).rejects.toBeTruthy();
    expect(undo).toHaveBeenCalled();
  });

  it('Not now turns it down for good', async () => {
    await notNow(start());
    expect(updates()[0].payload).toMatchObject({ status: 'dismissed', answer: 'no' });
  });

  it('Close it closes it and asks for the memory', async () => {
    await closeIt(close('q2', 'c1', 'over'));
    expect(s.closeChapter).toHaveBeenCalledWith('c1');
    expect(s.askForMemory).toHaveBeenCalledWith('c1');
    expect(updates()[0].payload).toMatchObject({ status: 'answered', answer: 'Close it' });
  });

  it('Still going takes away an end that passed, unless they set it themselves', async () => {
    await stillGoing(close('q2', 'c1', 'over'), '2026-10-08');
    expect(s.setChapterDates).toHaveBeenCalledWith('c1', null, null);
    s.setChapterDates.mockClear();
    await stillGoing(close('q4', 'c2', 'going'), '2026-12-01');
    expect(s.setChapterDates).not.toHaveBeenCalled();
    expect(updates().at(-1)!.payload).toMatchObject({ answer: 'Still going' });
  });

  it('Move it moves it to the days Gremly found', async () => {
    await moveIt(close('q2', 'c2', 'moved', { start_date: '2026-11-27', end_date: '2026-11-29' }));
    expect(s.setChapterDates).toHaveBeenCalledWith('c2', '2026-11-27', '2026-11-29');
    await expect(moveIt(close('q3', 'c2', 'over'))).rejects.toThrow();
  });

  it('their own words go to the pipeline, which reads them', async () => {
    (callNotRight as jest.Mock).mockResolvedValue({ ok: true });
    expect(await tellGremly(start(), '  later in the year ')).toBe(true);
    expect(callNotRight).toHaveBeenCalledWith({
      surface: 'question',
      targetId: 'q1',
      said: 'later in the year',
    });
    expect(await tellGremly(start(), ' ')).toBe(false);
  });
});
