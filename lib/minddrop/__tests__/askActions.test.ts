/**
 * askActions: what the ask rules write (Mind Drop rethink stage 6). Not now
 * keeps the item exactly as it was saved and the ask live; a lapse writes the
 * plain outcome for each kind of ask; the store's load lets every stale ask
 * go and leaves live ones alone; an answer takes the same path on the card
 * and in Sweep.
 */
import { answerAsk, lapseAsk, lapseStaleAsks, notNow } from '../askActions';
import { applyDropRelation, keepDropAsNew } from '../relationActions';
import { getDateService } from '../../date/DateService';

const mockState: any = {};
jest.mock('../../store/useGremlyStore', () => ({
  useGremlyStore: { getState: () => mockState },
}));
jest.mock('../relationActions', () => ({
  applyDropRelation: jest.fn(),
  keepDropAsNew: jest.fn(),
}));
jest.mock('../dropSync', () => ({ updateDropRow: jest.fn() }));
import { updateDropRow } from '../dropSync';

/** dropSync's per-row update, as it behaves: the change built on the item, written through the store */
function rowUpdatesThroughStore() {
  (updateDropRow as jest.Mock).mockImplementation(
    async (kind: string, id: string, _what: string, build: (row: any) => any) => {
      const key = kind === 'todo' ? 'todos' : kind === 'habit' ? 'habits' : 'notes';
      const item = (mockState[key] || []).find((x: any) => x.id === id);
      if (!item) return false;
      const patch = build(item);
      if (!patch) return false;
      const write =
        kind === 'todo' ? 'updateTodo' : kind === 'habit' ? 'updateHabit' : 'updateNote';
      await mockState[write](id, patch);
      return true;
    },
  );
}

const ds = getDateService();
let today = '';
const day = (n: number) => ds.addDays(today, n);

const relation = (surface?: 'card' | 'sweep') => ({
  kind: 'same',
  intent: 'same',
  entity: { id: 'vet', type: 'todo', title: 'Call the vet' },
  others: [],
  confidence: 95,
  extra: null,
  status: 'pending',
  classified: {
    bucket: 'todo',
    subtype: null,
    habitSubtype: null,
    needsClarification: false,
    ambiguityType: null,
    clarificationQuestion: null,
    clarificationOptions: null,
  },
  ...(surface ? { surface } : {}),
});

function setStore(todos: any[] = [], habits: any[] = [], notes: any[] = []) {
  mockState.todos = todos;
  mockState.habits = habits;
  mockState.notes = notes;
  const update = (list: 'todos' | 'habits' | 'notes') =>
    jest.fn(async (id: string, patch: any) => {
      mockState[list] = mockState[list].map((x: any) => (x.id === id ? { ...x, ...patch } : x));
    });
  mockState.updateTodo = update('todos');
  mockState.updateHabit = update('habits');
  mockState.updateNote = update('notes');
  mockState.resolveEntityClarification = jest.fn(async () => {});
}

beforeEach(() => {
  today = ds.today();
  // resetMocks clears the factory's answers before each test
  (applyDropRelation as jest.Mock).mockImplementation(async () => ({ summary: 'Kept it.' }));
  (keepDropAsNew as jest.Mock).mockImplementation(async () => 'kept');
  rowUpdatesThroughStore();
});

describe('Not now', () => {
  it('keeps the item exactly as saved: only the card stops asking', async () => {
    const saved = {
      id: 'n1',
      title: 'Dentist',
      subtype: 'catchall',
      needs_clarification: true,
      views: {
        minddrop_stage: 'settled',
        needs_clarification: true,
        ask_since: today,
        ask_on_card: true,
      },
    };
    setStore([], [], [saved]);
    await notNow('n1');
    const after = mockState.notes[0];
    expect(after).toMatchObject({
      title: 'Dentist',
      subtype: 'catchall',
      needs_clarification: true,
    });
    expect(after.views).toEqual({ ...saved.views, ask_on_card: false });
    expect(after.views.clarification_resolved).toBeUndefined();
    expect(after.views.clarification_skipped).toBeUndefined();
  });

  it('works on a todo or a habit drop, and records the day for an older ask', async () => {
    setStore([
      { id: 't1', created_at: `${day(-1)}T08:00:00`, views: { relation: relation('card') } },
    ]);
    await notNow('t1');
    expect(mockState.updateTodo).toHaveBeenCalled();
    expect(mockState.todos[0].views).toMatchObject({ ask_on_card: false, ask_since: day(-1) });
  });
});

describe('a lapse writes the plain outcome', () => {
  it('a question becomes resolved, marked lapsed, and the item stays', async () => {
    setStore(
      [],
      [],
      [{ id: 'n1', title: 'Dentist', views: { needs_clarification: true, ask_since: day(-2) } }],
    );
    await expect(lapseAsk('n1')).resolves.toBe(true);
    expect(mockState.notes[0]).toMatchObject({
      title: 'Dentist',
      clarification_resolved: true,
      views: { clarification_resolved: true, clarification_lapsed: true },
    });
  });

  it('a split becomes kept as one', async () => {
    setStore([{ id: 't1', views: { split: { status: 'pending', pieces: [{ text: 'a' }] } } }]);
    await lapseAsk('t1');
    expect(mockState.todos[0].views.split).toEqual({
      status: 'kept',
      lapsed: true,
      pieces: [{ text: 'a' }],
    });
  });

  it('an older build’s note waiting to be split stays one note', async () => {
    setStore(
      [],
      [],
      [
        {
          id: 'n1',
          created_at: '2026-03-01T09:00:00Z',
          views: { is_multi: true, minddrop_stage: 'multi_pending', multi_items: [{ text: 'a' }] },
        },
      ],
    );
    await expect(lapseStaleAsks()).resolves.toBe(1);
    expect(mockState.notes[0].views).toEqual({
      is_multi: false,
      minddrop_stage: 'enriched',
      multi_items: [{ text: 'a' }],
      split: { status: 'kept', lapsed: true },
    });
  });

  it('a relation or a same becomes lapsed, and both items stay', async () => {
    setStore([], [{ id: 'h1', views: { relation: relation('sweep') } }]);
    await lapseAsk('h1');
    expect(mockState.habits[0].views.relation.status).toBe('lapsed');
    expect(applyDropRelation).not.toHaveBeenCalled();
    expect(keepDropAsNew).not.toHaveBeenCalled();
  });

  it('a drop an older build held as a note is filed as it was classified', async () => {
    setStore([], [], [{ id: 'n1', views: { relation: relation() } }]);
    await lapseAsk('n1');
    expect(keepDropAsNew).toHaveBeenCalledWith('n1', 'lapsed');
  });

  it('writes nothing for an item that asks nothing, or is not there', async () => {
    setStore([{ id: 't1', views: {} }]);
    await expect(lapseAsk('t1')).resolves.toBe(false);
    await expect(lapseAsk('missing')).resolves.toBe(false);
    expect(mockState.updateTodo).not.toHaveBeenCalled();
  });
});

describe('when the store loads', () => {
  it('lets go of every ask past the day after it was made, and leaves live ones alone', async () => {
    setStore(
      [
        { id: 'stale', views: { relation: relation('card'), ask_since: day(-2) } },
        { id: 'yesterday', views: { relation: relation('card'), ask_since: day(-1) } },
        {
          id: 'archived',
          archived: true,
          views: { needs_clarification: true, ask_since: day(-9) },
        },
      ],
      [],
      [
        {
          id: 'old-question',
          created_at: `${day(-30)}T10:00:00`,
          needs_clarification: true,
          views: {},
        },
        { id: 'today', views: { needs_clarification: true, ask_since: today } },
      ],
    );
    await expect(lapseStaleAsks(today)).resolves.toBe(2);
    const todo = (id: string) => mockState.todos.find((t: any) => t.id === id);
    const note = (id: string) => mockState.notes.find((n: any) => n.id === id);
    expect(todo('stale').views.relation.status).toBe('lapsed');
    expect(todo('yesterday').views.relation.status).toBe('pending');
    expect(todo('archived').views.clarification_lapsed).toBeUndefined();
    expect(note('old-question').views.clarification_lapsed).toBe(true);
    expect(note('today').views.clarification_lapsed).toBeUndefined();
  });

  it('carries on past an item that will not save', async () => {
    setStore([
      { id: 'a', views: { needs_clarification: true, ask_since: day(-3) } },
      { id: 'b', views: { needs_clarification: true, ask_since: day(-3) } },
    ]);
    mockState.updateTodo = jest.fn(async (id: string) => {
      if (id === 'a') throw new Error('offline');
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(lapseStaleAsks(today)).resolves.toBe(1);
    expect(warn).toHaveBeenCalledWith('[Asks] could not let an old question go', expect.anything());
    warn.mockRestore();
  });
});

describe('an answer', () => {
  it('a question goes through the store, Something else as free text', async () => {
    setStore();
    await answerAsk('n1', { kind: 'clarify', optionId: 'opt_2' });
    expect(mockState.resolveEntityClarification).toHaveBeenCalledWith('n1', 'opt_2', false, null);
    await answerAsk('n1', { kind: 'clarify', optionId: 'it is a gift', isFreeText: true });
    expect(mockState.resolveEntityClarification).toHaveBeenLastCalledWith(
      'n1',
      'it is a gift',
      true,
      null,
    );
    const when = { date: day(1), time: null };
    await answerAsk('n1', { kind: 'clarify', optionId: 'opt_1', when });
    expect(mockState.resolveEntityClarification).toHaveBeenLastCalledWith(
      'n1',
      'opt_1',
      false,
      when,
    );
    const fallbackOption = {
      id: 'opt_2',
      label: 'Still thinking about it',
      action: {
        bucket: 'log' as const,
        subtype: 'idea',
        target_date: false,
        scheduled_date: false,
      },
    };
    await answerAsk('n1', { kind: 'clarify', optionId: 'opt_2', fallbackOption });
    expect(mockState.resolveEntityClarification).toHaveBeenLastCalledWith(
      'n1',
      'opt_2',
      false,
      null,
      fallbackOption,
    );
  });

  it('a relation yes applies it, and a no keeps the drop as new', async () => {
    setStore();
    const picked = { id: 'vet2', type: 'todo' as const, title: 'Vet' };
    await expect(answerAsk('t1', { kind: 'relation', yes: true, picked })).resolves.toEqual({
      summary: 'Kept it.',
    });
    expect(applyDropRelation).toHaveBeenCalledWith('t1', picked);
    await expect(answerAsk('t1', { kind: 'relation', yes: false })).resolves.toBeNull();
    expect(keepDropAsNew).toHaveBeenCalledWith('t1');
  });
});

describe('written in turn with the pipeline, on the row as it is then', () => {
  it('Not now goes through the per-row update', async () => {
    setStore([], [], [{ id: 'n1', views: { needs_clarification: true, ask_since: today } }]);
    await notNow('n1');
    expect(updateDropRow).toHaveBeenCalledWith('note', 'n1', 'not_now', expect.any(Function));
  });

  it('a lapse leaves an ask answered since alone', async () => {
    setStore([{ id: 't1', views: { relation: relation('card'), ask_since: day(-3) } }]);
    const stale = {
      kind: 'same' as const,
      since: day(-3),
      onCard: true,
      relation: relation('card') as any,
    };
    // answered on another device before the lapse was written
    mockState.todos[0].views.relation = { ...relation('card'), status: 'applied' };
    await expect(lapseAsk('t1', stale)).resolves.toBe(false);
    expect(mockState.todos[0].views.relation.status).toBe('applied');
  });
});
