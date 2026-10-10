/**
 * The already have it check moves a todo's deadline (final check item 6).
 * Real path from the yes down: applyDropRelation, the chat card's
 * applyEntityChange, the change model and its Undo, on a store mock. The
 * deadline (target_date) is written and the planned day (due_day) is never
 * touched; Undo puts the old deadline back.
 */
const mockState: any = {};
jest.mock('../../store/useGremlyStore', () => ({
  useGremlyStore: { getState: () => mockState },
}));
jest.mock('../../cortex/getSessionToken', () => ({
  getSessionToken: () => Promise.resolve('tok'),
}));
jest.mock('../../env', () => ({
  env: { cortexUrl: 'https://cortex.test' },
  getEnv: () => undefined,
}));
jest.mock('../dropSync', () => ({
  updateDropRow: jest.fn(),
  kindWordOf: jest.requireActual('../dropSync').kindWordOf,
}));

import { applyDropRelation, fetchDropRelation, RELATE_SENDS_DEADLINES } from '../relationActions';
import type { DropRelation, HeldRelation, RelationEntity } from '../dropRelation';
import { updateDropRow } from '../dropSync';
import { describeChange, entityAfterChange, primaryLabel } from '../../chat/entityCards';
import { changeLogOf } from '../../chat/changeHistory';
import { fromEntityCard } from '../../changes/fromLegacy';
import { getDateService } from '../../date/DateService';

const ds = getDateService();
const TODAY = ds.today();
const PLANNED = ds.addDays(TODAY, 1);
const OLD_DEADLINE = ds.addDays(TODAY, 3);
const NEW_DEADLINE = ds.addDays(TODAY, 10);

const report: RelationEntity = {
  id: 't1',
  type: 'todo',
  title: 'Quarterly report',
  due_day: PLANNED,
  due_time: null,
  target_date: OLD_DEADLINE,
};

const moveDeadline: DropRelation = {
  kind: 'edit',
  intent: 'edit',
  entity: report,
  others: [],
  confidence: 90,
  change: { field: 'target_date', from: OLD_DEADLINE, to: NEW_DEADLINE },
};

function held(rel: DropRelation): HeldRelation {
  return {
    ...rel,
    status: 'pending',
    surface: 'card',
    classified: {
      bucket: 'log',
      subtype: 'catchall',
      habitSubtype: null,
      needsClarification: false,
      ambiguityType: null,
      clarificationQuestion: null,
      clarificationOptions: null,
    },
  } as HeldRelation;
}

function reset(target: Record<string, unknown> = {}) {
  mockState.todos = [
    {
      id: 't1',
      name: 'Quarterly report',
      due_day: PLANNED,
      target_date: OLD_DEADLINE,
      completed_at: null,
      archived: false,
      views: {},
      ...target,
    },
  ];
  mockState.notes = [
    {
      id: 'drop-x',
      drop_id: 'local-x',
      title: 'Report moved',
      body: 'the report deadline got pushed back',
      subtype: 'catchall',
      archived: false,
      views: { minddrop_stage: 'settled', relation: held(moveDeadline) },
    },
  ];
  mockState.habits = [];
  mockState.habitProgress = [];
  const updater = (list: string) =>
    jest.fn(async (id: string, updates: any) => {
      mockState[list] = mockState[list].map((x: any) => (x.id === id ? { ...x, ...updates } : x));
    });
  mockState.updateTodo = updater('todos');
  mockState.updateNote = updater('notes');
  mockState.updateHabit = updater('habits');
  mockState.archiveNote = jest.fn(async () => {});
  mockState.restoreNote = jest.fn(async () => {});
  (updateDropRow as jest.Mock).mockImplementation(
    async (kind: string, id: string, _what: string, build: (row: any) => any) => {
      const key = kind === 'todo' ? 'todos' : kind === 'habit' ? 'habits' : 'notes';
      const item = mockState[key].find((x: any) => x.id === id);
      if (!item) return false;
      const patch = build(item);
      if (!patch) return false;
      await mockState[
        kind === 'todo' ? 'updateTodo' : kind === 'habit' ? 'updateHabit' : 'updateNote'
      ](id, patch);
      return true;
    },
  );
}

const reportNow = () => mockState.todos.find((t: any) => t.id === 't1');
const dropNow = () => mockState.notes.find((n: any) => n.id === 'drop-x');

describe('a deadline moved from Mind Drop', () => {
  beforeEach(() => reset());

  it('writes the deadline, never the planned day, and Undo restores the old deadline', async () => {
    const outcome = await applyDropRelation('drop-x');
    expect(reportNow().target_date).toBe(NEW_DEADLINE);
    expect(reportNow().due_day).toBe(PLANNED);
    for (const [, patch] of mockState.updateTodo.mock.calls) {
      expect(patch).not.toHaveProperty('due_day');
      expect(patch).not.toHaveProperty('scheduled_date');
    }
    expect(changeLogOf(reportNow().views)[0]).toMatchObject({
      field: 'deadline',
      source: 'minddrop',
    });
    expect(dropNow().views.relation.status).toBe('applied');
    expect(mockState.archiveNote).toHaveBeenCalledWith('drop-x', 'minddrop_relation');

    await outcome.undo();
    expect(reportNow().target_date).toBe(OLD_DEADLINE);
    expect(reportNow().due_day).toBe(PLANNED);
    expect(changeLogOf(reportNow().views)).toEqual([]);
    expect(mockState.restoreNote).toHaveBeenCalledWith('drop-x');
    expect(dropNow().views.relation.status).toBe('pending');
  });

  it('gives a todo with no deadline its first one, and Undo clears it', async () => {
    reset({ target_date: null });
    const outcome = await applyDropRelation('drop-x');
    expect(reportNow().target_date).toBe(NEW_DEADLINE);
    expect(reportNow().due_day).toBe(PLANNED);
    await outcome.undo();
    expect(reportNow().target_date ?? null).toBeNull();
  });

  it('says what happened in plain deadline words', async () => {
    const outcome = await applyDropRelation('drop-x');
    const day = ds.fromLocalDate(NEW_DEADLINE)!;
    const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day.getDay()];
    expect(outcome.confirm).toBe('Deadline moved');
    expect(outcome.toast.icon).toBe('moved');
    expect(outcome.toast.title).toMatch(
      new RegExp(
        `^Moved the deadline for “Quarterly report” to ${weekday} \\d{1,2} [A-Z][a-z]{2}$`,
      ),
    );
    // the closing line names the date, so it is still true tomorrow
    expect(outcome.summary).toMatch(
      new RegExp(`^Quarterly report is now due ${weekday} \\d{1,2} [A-Z][a-z]{2}\\.$`),
    );
    expect([outcome.confirm, outcome.toast.title, outcome.summary].join(' ')).not.toMatch(/[–—]/);
  });

  it('asks nothing new when the deadline is already that day', async () => {
    reset({ target_date: NEW_DEADLINE });
    await expect(applyDropRelation('drop-x')).rejects.toThrow(
      'There is nothing to change on that one.',
    );
    expect(mockState.updateTodo).not.toHaveBeenCalled();
  });
});

describe('the card words for a deadline', () => {
  it('reads Due and the day, and No deadline when there was none', () => {
    const words = describeChange(report, {
      field: 'target_date',
      from: null,
      to: ds.addDays(TODAY, 1),
    });
    expect(words).toEqual({
      from: 'No deadline',
      to: 'Due tomorrow',
      label: 'Move the deadline to',
    });
    expect(primaryLabel({ field: 'target_date', from: null, to: NEW_DEADLINE })).toBe(
      'Move the deadline',
    );
    expect(
      entityAfterChange(report, { field: 'target_date', from: OLD_DEADLINE, to: NEW_DEADLINE }),
    ).toMatchObject({ due_day: PLANNED, target_date: NEW_DEADLINE });
  });

  it('is the change model deadline on a todo, and nothing on any other kind', () => {
    expect(
      fromEntityCard(report, { field: 'target_date', from: null, to: NEW_DEADLINE }),
    ).toMatchObject({ type: 'todo', id: 't1', op: 'change', fields: { deadline: NEW_DEADLINE } });
    expect(() =>
      fromEntityCard(
        { id: 'n1', type: 'note', title: 'Dinner' },
        { field: 'target_date', from: null, to: NEW_DEADLINE },
      ),
    ).toThrow('That change did not go through.');
  });
});

describe('the request', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('tells the Worker this build understands deadlines exactly when the build says so', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ enabled: true, relation: moveDeadline }),
    })) as any;
    await expect(fetchDropRelation('the report deadline got pushed back')).resolves.toMatchObject({
      kind: 'edit',
      change: { field: 'target_date', to: NEW_DEADLINE },
    });
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.type).toBe('minddrop-relate');
    // held off until James reads the gate; on, the request carries deadlines: true
    expect(body.deadlines).toBe(RELATE_SENDS_DEADLINES ? true : undefined);
  });
});
