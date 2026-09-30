/**
 * relationActions: holding a drop, the yes (with Undo), and keeping it as new.
 * The store and the chat card's applyEntityChange are mocked; what they do
 * is tested where they live.
 */
import {
  applyDropRelation,
  fetchDropRelation,
  holdDropForRelation,
  keepDropAsNew,
  leavingCardIds,
  outcomeWords,
  RELATION_KEEP_OPTION,
  shouldRelate,
} from '../relationActions';
import type { DropRelation, HeldRelation, RelationEntity } from '../dropRelation';
import type { QueuedDrop } from '../dropQueue';
import { applyEntityChange } from '../../chat/entityCards';

const mockState: any = {};
jest.mock('../../store/useGremlyStore', () => ({
  useGremlyStore: { getState: () => mockState },
}));
jest.mock('../../chat/entityCards', () => ({
  applyEntityChange: jest.fn(),
  formatDay: (d: string) => (d === '2026-09-30' ? 'Today' : 'Thu 1 Oct'),
  formatTime: (t: string) => (t === '16:00' ? '4:00pm' : t),
}));
jest.mock('../../cortex/getSessionToken', () => ({
  getSessionToken: () => Promise.resolve('tok'),
}));
jest.mock('../../env', () => ({
  env: { cortexUrl: 'https://cortex.test' },
  getEnv: () => undefined,
}));
jest.mock('../../date/DateService', () => ({ dateService: { today: () => '2026-09-30' } }));

const todo: RelationEntity = {
  id: 't1',
  type: 'todo',
  title: 'Send Q3 deck to Rachel',
  due_day: '2026-10-01',
  due_time: null,
};
const other: RelationEntity = {
  id: 't2',
  type: 'todo',
  title: 'Send Q4 plan to Rachel',
  due_day: null,
  due_time: null,
};

function baseDrop(over: Partial<QueuedDrop> = {}): QueuedDrop {
  return {
    localId: 'drop-1',
    text: 'Sent the deck to Rachel',
    source: 'minddrop',
    phase: 'classified',
    classifyEngine: 'v3',
    bucket: 'todo',
    subtype: null,
    habitSubtype: null,
    needsClarification: false,
    ...over,
  } as QueuedDrop;
}

const complete: DropRelation = {
  kind: 'edit',
  intent: 'complete',
  entity: todo,
  others: [other],
  confidence: 95,
  change: { field: 'completed', from: null, to: 'done' },
};

function heldNote(rel: DropRelation, classified: Partial<HeldRelation['classified']> = {}) {
  const held = holdDropForRelation(baseDrop(), rel).relation as HeldRelation;
  return {
    id: 'note-1',
    type: 'note',
    title: 'Sent the deck',
    body: 'Sent the deck to Rachel',
    subtype: 'catchall',
    views: {
      minddrop_stage: 'enriched',
      relation: { ...held, classified: { ...held.classified, ...classified } },
    },
  };
}

function resetStore(notes: any[]) {
  mockState.notes = notes;
  mockState.todos = [
    {
      id: 't1',
      name: 'Send Q3 deck to Rachel',
      due_day: '2026-10-01',
      completed_at: null,
      archived: false,
    },
    {
      id: 't2',
      name: 'Send Q4 plan to Rachel',
      due_day: null,
      completed_at: null,
      archived: false,
    },
  ];
  mockState.habits = [];
  mockState.habitProgress = [];
  mockState.updateNote = jest.fn(async (id: string, updates: any) => {
    mockState.notes = mockState.notes.map((n: any) => (n.id === id ? { ...n, ...updates } : n));
  });
  mockState.archiveNote = jest.fn(async () => {});
  mockState.restoreNote = jest.fn(async () => {});
  mockState.archiveTodo = jest.fn(async () => {});
  mockState.restoreTodo = jest.fn(async () => {});
  // the real step turns the note into the todo or habit and archives the note
  mockState.resolveEntityClarification = jest.fn(async (id: string) => {
    mockState.notes = mockState.notes.map((n: any) => (n.id === id ? { ...n, archived: true } : n));
  });
}

const relationOfNote = () => mockState.notes[0].views.relation as HeldRelation;

beforeEach(() => {
  (applyEntityChange as jest.Mock).mockImplementation(async (entity: RelationEntity) => ({
    summary: `${entity.title} is done.`,
    revert: mockRevert,
    entity,
  }));
  mockRevert.mockImplementation(async () => {});
});
const mockRevert = jest.fn();

describe('shouldRelate', () => {
  it('checks single drops from the one call classifier', () => {
    expect(shouldRelate(baseDrop())).toBe(true);
    expect(shouldRelate(baseDrop({ classifyEngine: 'v2' }))).toBe(false);
    expect(shouldRelate(baseDrop({ isMulti: true }))).toBe(false);
  });

  it('leaves quick adds from Today, a Space or a photo alone', () => {
    expect(shouldRelate(baseDrop({ source: 'today' }))).toBe(false);
    expect(shouldRelate(baseDrop({ source: 'space' }))).toBe(false);
    expect(shouldRelate(baseDrop({ dueDayOverride: '2026-10-01' }))).toBe(false);
  });

  it('skips drops addressed to Gremly or asking a question', () => {
    expect(
      shouldRelate(baseDrop({ needsClarification: true, ambiguityType: 'conversation' })),
    ).toBe(false);
    expect(
      shouldRelate(baseDrop({ needsClarification: true, ambiguityType: 'open_question' })),
    ).toBe(false);
    expect(shouldRelate(baseDrop({ needsClarification: true, ambiguityType: 'bucket' }))).toBe(
      true,
    );
  });
});

describe('holdDropForRelation', () => {
  it('holds a todo as a plain note and remembers how it was classified', () => {
    const held = holdDropForRelation(
      baseDrop({
        needsClarification: true,
        ambiguityType: 'bucket',
        clarificationQuestion: 'Q?',
        clarificationOptions: [] as any,
      }),
      complete,
    );
    expect(held.bucket).toBe('log');
    expect(held.subtype).toBe('general');
    expect(held.needsClarification).toBe(false);
    expect(held.relation).toMatchObject({
      status: 'pending',
      kind: 'edit',
      classified: {
        bucket: 'todo',
        needsClarification: true,
        ambiguityType: 'bucket',
        clarificationQuestion: 'Q?',
      },
    });
  });

  it('keeps a note drop its own kind', () => {
    const held = holdDropForRelation(baseDrop({ bucket: 'log', subtype: 'event' }), complete);
    expect(held.subtype).toBe('event');
  });
});

describe('fetchDropRelation', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('returns nothing while the Worker switch is off', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ enabled: false, relation: null }),
    })) as any;
    await expect(fetchDropRelation('Sent the deck')).resolves.toBeNull();
  });

  it('returns the checked relation when on', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ enabled: true, relation: complete }),
    })) as any;
    await expect(fetchDropRelation('Sent the deck')).resolves.toMatchObject({
      kind: 'edit',
      intent: 'complete',
    });
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body).toMatchObject({
      type: 'minddrop-relate',
      text: 'Sent the deck',
      currentDate: '2026-09-30',
    });
  });

  it('files as usual on an error or a slow answer', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('offline');
    }) as any;
    await expect(fetchDropRelation('x')).resolves.toBeNull();
    global.fetch = jest.fn(() => new Promise(() => {})) as any;
    await expect(fetchDropRelation('x', 20)).resolves.toBeNull();
  });
});

describe('applyDropRelation', () => {
  it('makes the change, clears the drop, and Undo puts both back', async () => {
    resetStore([heldNote(complete)]);
    const outcome = await applyDropRelation('note-1');
    expect(applyEntityChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: 't1' }),
      complete.kind === 'edit' ? complete.change : null,
    );
    expect(mockState.archiveNote).toHaveBeenCalledWith('note-1', 'minddrop_relation');
    expect(relationOfNote().status).toBe('applied');
    expect(outcome.summary).toBe('Send Q3 deck to Rachel is done.');

    await outcome.undo();
    expect(mockRevert).toHaveBeenCalled();
    expect(mockState.restoreNote).toHaveBeenCalledWith('note-1');
    expect(relationOfNote().status).toBe('pending');
  });

  it('keeps a journal entry after the yes', async () => {
    resetStore([heldNote(complete, { bucket: 'log', subtype: 'journal' })]);
    await applyDropRelation('note-1');
    expect(mockState.archiveNote).not.toHaveBeenCalled();
    expect(relationOfNote().status).toBe('applied');
  });

  it('works on the item the user picked instead', async () => {
    resetStore([heldNote(complete)]);
    await applyDropRelation('note-1', other);
    expect(applyEntityChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: 't2' }),
      expect.objectContaining({ field: 'completed' }),
    );
  });

  it('keeping just one adds the new detail to the first', async () => {
    const same: DropRelation = {
      kind: 'same',
      intent: 'same',
      entity: todo,
      others: [],
      confidence: 95,
      extra: 'with the appendix',
    };
    resetStore([heldNote(same)]);
    const outcome = await applyDropRelation('note-1');
    expect(applyEntityChange).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }), {
      field: 'body_add',
      from: null,
      to: 'with the appendix',
    });
    expect(outcome.summary).toMatch(/Kept Send Q3 deck to Rachel/);
  });

  it('removes the item for a cancellation, and Undo restores it', async () => {
    const remove: DropRelation = {
      kind: 'remove',
      intent: 'remove',
      entity: todo,
      others: [],
      confidence: 95,
    };
    resetStore([heldNote(remove)]);
    const outcome = await applyDropRelation('note-1');
    expect(mockState.archiveTodo).toHaveBeenCalledWith('t1', 'minddrop_relation');
    await outcome.undo();
    expect(mockState.restoreTodo).toHaveBeenCalledWith('t1');
  });

  it('does not log a day already logged by hand since the drop', async () => {
    const logged: DropRelation = {
      kind: 'edit',
      intent: 'logged',
      entity: { id: 'h1', type: 'habit', title: 'Walk Bella', frequency: 'daily', logged_days: [] },
      others: [],
      confidence: 95,
      change: { field: 'logged', from: null, to: '2026-09-30' },
    };
    resetStore([heldNote(logged)]);
    mockState.habits = [{ id: 'h1', name: 'Walk Bella', frequency: 'daily' }];
    mockState.habitProgress = [{ habit_id: 'h1', occurred_day: '2026-09-30' }];
    await expect(applyDropRelation('note-1')).rejects.toThrow('already logged');
    expect(applyEntityChange).not.toHaveBeenCalled();
  });

  it('puts the change back when the drop cannot be cleared, so a second yes is safe', async () => {
    resetStore([heldNote(complete)]);
    mockState.archiveNote = jest.fn(async () => {
      throw new Error('offline');
    });
    await expect(applyDropRelation('note-1')).rejects.toThrow('did not go through');
    expect(mockRevert).toHaveBeenCalled();
    expect(relationOfNote().status).toBe('pending');
  });

  it('applies once however fast the taps', async () => {
    resetStore([heldNote(complete)]);
    const results = await Promise.allSettled([
      applyDropRelation('note-1'),
      applyDropRelation('note-1'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(applyEntityChange).toHaveBeenCalledTimes(1);
  });

  it('says so when the item has gone since, and changes nothing', async () => {
    resetStore([heldNote(complete)]);
    mockState.todos[0].completed_at = '2026-09-30T09:00:00Z';
    await expect(applyDropRelation('note-1')).rejects.toThrow('already done');
    expect(applyEntityChange).not.toHaveBeenCalled();
    expect(mockState.archiveNote).not.toHaveBeenCalled();
  });
});

describe('what the toast says', () => {
  const held = (rel: DropRelation) => heldNote(rel).views.relation as HeldRelation;

  it('says what happened to the item and to the drop, in plain words', () => {
    const moved = held({
      ...complete,
      intent: 'edit',
      change: { field: 'due_day', from: '2026-10-02', to: '2026-10-01', time_to: '16:00' },
    } as DropRelation);
    const w = outcomeWords(
      moved,
      todo,
      { field: 'due_day', from: '2026-10-02', to: '2026-10-01', time_to: '16:00' },
      false,
      false,
    );
    expect(w.confirm).toBe('Moved');
    expect(w.toast).toEqual({
      icon: 'moved',
      title: 'Moved “Send Q3 deck to Rachel” to Thu 1 Oct, 4:00pm',
      detail: 'Drop archived',
    });

    expect(
      outcomeWords(
        held(complete),
        todo,
        { field: 'completed', from: null, to: 'done' },
        false,
        false,
      ).toast.title,
    ).toBe('Marked “Send Q3 deck to Rachel” done');
    const same = held({
      kind: 'same',
      intent: 'same',
      entity: todo,
      others: [],
      confidence: 95,
      extra: null,
    });
    expect(outcomeWords(same, todo, null, false, false)).toMatchObject({
      confirm: 'Kept one',
      toast: { icon: 'kept', title: 'Kept “Send Q3 deck to Rachel”' },
    });
    const habit: RelationEntity = { id: 'h1', type: 'habit', title: 'Walk Bella' };
    expect(
      outcomeWords(
        held(complete),
        habit,
        { field: 'logged', from: null, to: '2026-09-30' },
        false,
        true,
      ).toast,
    ).toEqual({
      icon: 'logged',
      title: 'Logged “Walk Bella” for today',
      detail: 'Your journal entry stays',
    });
  });

  it('knows which cards leave before the change is made', () => {
    resetStore([heldNote(complete)]);
    expect(leavingCardIds('note-1')).toEqual(['note-1', 't1']);
    const same: DropRelation = {
      kind: 'same',
      intent: 'same',
      entity: todo,
      others: [],
      confidence: 95,
      extra: null,
    };
    resetStore([heldNote(same)]);
    expect(leavingCardIds('note-1')).toEqual(['note-1']);
    resetStore([heldNote(complete, { bucket: 'log', subtype: 'journal' })]);
    expect(leavingCardIds('note-1')).toEqual(['t1']);
  });

  it('gives the toast its words after a yes', async () => {
    resetStore([heldNote(complete)]);
    const outcome = await applyDropRelation('note-1');
    expect(outcome.confirm).toBe('Done');
    expect(outcome.toast).toMatchObject({ icon: 'done', detail: 'Drop archived' });
  });
});

describe('keepDropAsNew', () => {
  it('files a todo drop as a todo through the clarification step', async () => {
    resetStore([heldNote(complete)]);
    await expect(keepDropAsNew('note-1')).resolves.toBe('kept');
    const options = mockState.notes[0].clarification_options;
    expect(options[0]).toMatchObject({ id: RELATION_KEEP_OPTION, action: { bucket: 'todo' } });
    expect(mockState.resolveEntityClarification).toHaveBeenCalledWith(
      'note-1',
      RELATION_KEEP_OPTION,
      false,
      null,
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(relationOfNote().status).toBe('kept');
  });

  it('puts the question back if filing it did not go through', async () => {
    resetStore([heldNote(complete)]);
    mockState.resolveEntityClarification = jest.fn(async () => {
      throw new Error('offline');
    });
    await keepDropAsNew('note-1');
    await new Promise((r) => setTimeout(r, 0));
    expect(relationOfNote().status).toBe('pending');
  });

  it('leaves a note drop as it is', async () => {
    resetStore([heldNote(complete, { bucket: 'log', subtype: 'event' })]);
    await expect(keepDropAsNew('note-1')).resolves.toBe('kept');
    expect(mockState.resolveEntityClarification).not.toHaveBeenCalled();
    expect(relationOfNote().status).toBe('kept');
  });

  it('gives an unclear drop its question back', async () => {
    const options = [
      { id: 'opt_1', label: 'I need to do it', action: { bucket: 'todo' } },
      { id: 'opt_2', label: 'Just a note', action: { bucket: 'log' } },
    ];
    resetStore([
      heldNote(complete, {
        needsClarification: true,
        ambiguityType: 'bucket',
        clarificationQuestion: 'Is this a job?',
        clarificationOptions: options,
      }),
    ]);
    await expect(keepDropAsNew('note-1')).resolves.toBe('clarify');
    expect(mockState.notes[0]).toMatchObject({
      needs_clarification: true,
      clarification_question: 'Is this a job?',
    });
    expect(mockState.resolveEntityClarification).not.toHaveBeenCalled();
  });
});
