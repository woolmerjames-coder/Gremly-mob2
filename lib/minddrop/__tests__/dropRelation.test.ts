/**
 * dropRelation: the words and checks for a drop about something the user
 * already has. Pure, no store.
 */
import {
  changeForEntity,
  fitsRelation,
  heldKindOf,
  isRelationPending,
  keepsDropAfterYes,
  parseRelation,
  rawChangeOf,
  addDays,
  relationButtons,
  relationLine,
  relationQuestion,
  type DropRelation,
  type HeldRelation,
  type RelationEntity,
} from '../dropRelation';

const todo: RelationEntity = {
  id: 't1',
  type: 'todo',
  title: 'Send Q3 deck to Priya',
  due_day: '2026-10-01',
  due_time: null,
};
const note: RelationEntity = {
  id: 'n1',
  type: 'note',
  title: 'Pepper Vet Appointment',
  due_day: '2026-10-02',
  due_time: null,
  target_date: '2026-10-02',
};
const habit: RelationEntity = {
  id: 'h1',
  type: 'habit',
  title: 'Walk Pepper',
  frequency: 'daily',
  logged_days: ['2026-09-29'],
};
const TODAY = '2026-09-30';

const classified = {
  bucket: 'todo' as const,
  subtype: null,
  habitSubtype: null,
  needsClarification: false,
  ambiguityType: null,
  clarificationQuestion: null,
  clarificationOptions: null,
};

const every: DropRelation[] = [
  { kind: 'same', intent: 'same', entity: todo, others: [], confidence: 95, extra: null },
  {
    kind: 'edit',
    intent: 'edit',
    entity: note,
    others: [],
    confidence: 95,
    change: {
      field: 'due_day',
      from: '2026-10-02',
      to: '2026-10-01',
      time_from: null,
      time_to: '16:00',
    },
  },
  {
    kind: 'edit',
    intent: 'add',
    entity: note,
    others: [],
    confidence: 90,
    change: { field: 'body_add', from: null, to: 'Cut back on coffee' },
  },
  {
    kind: 'edit',
    intent: 'complete',
    entity: todo,
    others: [],
    confidence: 95,
    change: { field: 'completed', from: null, to: 'done' },
  },
  {
    kind: 'edit',
    intent: 'logged',
    entity: habit,
    others: [],
    confidence: 95,
    change: { field: 'logged', from: null, to: TODAY },
  },
  { kind: 'remove', intent: 'remove', entity: note, others: [], confidence: 95 },
  {
    kind: 'choose',
    intent: 'edit',
    candidates: [todo, note],
    change: { field: 'due_day', value: '2026-10-02' },
    value: '2026-10-02',
    confidence: 85,
  },
];

describe('parseRelation', () => {
  it('accepts every shape the Worker sends', () => {
    for (const r of every) expect(parseRelation(JSON.parse(JSON.stringify(r)))).not.toBeNull();
  });

  it('treats anything malformed as no relation', () => {
    expect(parseRelation(null)).toBeNull();
    expect(parseRelation({ kind: 'same', intent: 'new', entity: todo })).toBeNull();
    expect(
      parseRelation({
        kind: 'same',
        intent: 'same',
        entity: { id: 'x', type: 'space', title: 'y' },
      }),
    ).toBeNull();
    expect(
      parseRelation({ kind: 'edit', intent: 'edit', entity: todo, change: { field: 'due_day' } }),
    ).toBeNull();
    expect(parseRelation({ kind: 'choose', intent: 'same', candidates: [todo] })).toBeNull();
  });

  it('drops an empty extra', () => {
    const r = parseRelation({
      kind: 'same',
      intent: 'same',
      entity: todo,
      others: [],
      confidence: 90,
      extra: '  ',
    });
    expect(r && r.kind === 'same' && r.extra).toBeNull();
  });
});

describe('words', () => {
  it('has a line, a question and buttons for every kind, with no dashes', () => {
    for (const r of every) {
      const b = relationButtons(r);
      const all = [relationLine(r), relationQuestion(r), b.primary, b.secondary, b.hint || ''].join(
        ' ',
      );
      expect(all).not.toMatch(/[–—]/);
      expect(relationLine(r).length).toBeGreaterThan(10);
      expect(relationQuestion(r).endsWith('?')).toBe(true);
    }
  });

  it('matches the canvas copy', () => {
    expect(relationQuestion(every[0])).toBe('Same as this one?');
    expect(relationButtons(every[0])).toMatchObject({
      primary: 'Keep just one',
      secondary: 'Keep both',
    });
    expect(relationButtons(every[2])).toMatchObject({
      primary: 'Add to note',
      secondary: 'Keep separate',
    });
    expect(relationButtons(every[3]).primary).toBe('Yes, mark it done');
    expect(relationButtons(every[5])).toMatchObject({
      primary: 'Yes, remove it',
      secondary: 'Keep it',
    });
    expect(relationLine(every[3])).toBe('Mark “Send Q3 deck to Priya” done? Tap to check');
  });

  it('names the item in a yes or no about it, from its title now, and logs with Log it (final check item 23)', () => {
    expect(relationQuestion(every[4], { title: 'Run', today: TODAY })).toBe('Log today’s Run?');
    expect(relationButtons(every[4]).primary).toBe('Log it');
    const yesterday = {
      ...every[4],
      change: { field: 'logged', from: null, to: addDays(TODAY, -1) },
    } as (typeof every)[4];
    expect(relationQuestion(yesterday, { title: 'Run', today: TODAY })).toBe(
      'Log yesterday’s Run?',
    );
    expect(relationQuestion(every[3], { title: 'Send the deck' })).toBe('Mark Send the deck done?');
  });
});

describe('changeForEntity (the item the user picked instead)', () => {
  it('moves a day and keeps a new time with it', () => {
    expect(
      changeForEntity(
        'edit',
        todo,
        { field: 'due_day', value: '2026-10-02', time: '09:30' },
        TODAY,
      ),
    ).toEqual({
      field: 'due_day',
      from: '2026-10-01',
      to: '2026-10-02',
      time_from: null,
      time_to: '09:30',
    });
  });

  it('asks nothing when the item already has that value', () => {
    expect(
      changeForEntity('edit', todo, { field: 'due_day', value: '2026-10-01' }, TODAY),
    ).toBeNull();
  });

  it('refuses a field that kind of item does not have', () => {
    expect(
      changeForEntity('edit', habit, { field: 'due_day', value: '2026-10-02' }, TODAY),
    ).toBeNull();
    expect(changeForEntity('edit', todo, { field: 'frequency', value: 'daily' }, TODAY)).toBeNull();
  });

  it('only marks todos done and only logs habits', () => {
    expect(changeForEntity('complete', note, null, TODAY)).toBeNull();
    expect(changeForEntity('complete', todo, null, TODAY)).toMatchObject({ field: 'completed' });
    expect(changeForEntity('logged', todo, { value: TODAY }, TODAY)).toBeNull();
  });

  it('does not log a day already logged, a future day or one too long ago', () => {
    expect(changeForEntity('logged', habit, { value: '2026-09-29' }, TODAY)).toBeNull();
    expect(changeForEntity('logged', habit, { value: '2026-10-01' }, TODAY)).toBeNull();
    expect(changeForEntity('logged', habit, { value: '2026-09-01' }, TODAY)).toBeNull();
    expect(changeForEntity('logged', habit, { value: null }, TODAY)).toMatchObject({ to: TODAY });
  });

  it('never adds a line to a habit', () => {
    expect(changeForEntity('add', habit, { value: 'x' }, TODAY)).toBeNull();
    expect(fitsRelation('add', note, { value: 'x' }, TODAY)).toBe(true);
  });

  it('reads the card back as the raw change for another item', () => {
    expect(rawChangeOf(every[1])).toEqual({ field: 'due_day', value: '2026-10-01', time: '16:00' });
    expect(rawChangeOf(every[6])).toMatchObject({ field: 'due_day', value: '2026-10-02' });
  });
});

describe('a todo deadline (final check item 6)', () => {
  const withDeadline: RelationEntity = { ...todo, target_date: '2026-10-05' };
  const moveDeadline = {
    kind: 'edit',
    intent: 'edit',
    entity: withDeadline,
    others: [],
    confidence: 90,
    change: { field: 'target_date', from: '2026-10-05', to: '2026-10-09' },
  } as DropRelation;

  it('parseRelation accepts a deadline change for a todo', () => {
    expect(parseRelation(JSON.parse(JSON.stringify(moveDeadline)))).toMatchObject({
      kind: 'edit',
      intent: 'edit',
      change: { field: 'target_date', to: '2026-10-09' },
    });
  });

  it('moves the deadline and leaves the planned day alone', () => {
    expect(
      changeForEntity('edit', withDeadline, { field: 'target_date', value: '2026-10-09' }, TODAY),
    ).toEqual({ field: 'target_date', from: '2026-10-05', to: '2026-10-09' });
    // a todo with no deadline yet gets one
    expect(
      changeForEntity('edit', todo, { field: 'target_date', value: '2026-10-09' }, TODAY),
    ).toEqual({ field: 'target_date', from: null, to: '2026-10-09' });
  });

  it('asks nothing for the deadline it already has, a day it cannot read, or a note', () => {
    expect(
      changeForEntity('edit', withDeadline, { field: 'target_date', value: '2026-10-05' }, TODAY),
    ).toBeNull();
    expect(
      changeForEntity('edit', withDeadline, { field: 'target_date', value: 'Friday' }, TODAY),
    ).toBeNull();
    // a note's day is its own target_date, moved as due_day as before
    expect(
      changeForEntity('edit', note, { field: 'target_date', value: '2026-10-09' }, TODAY),
    ).toBeNull();
    expect(fitsRelation('edit', habit, { field: 'target_date', value: '2026-10-09' }, TODAY)).toBe(
      false,
    );
  });

  it('asks in plain deadline words, naming the item and the day', () => {
    const day = (d: string) => (d === '2026-10-09' ? 'Fri' : d === TODAY ? 'Today' : 'Thu 1 Oct');
    expect(relationQuestion(moveDeadline, { title: 'Send the deck', today: TODAY, day })).toBe(
      'Move the deadline for Send the deck to Fri?',
    );
    const today = {
      ...moveDeadline,
      change: { field: 'target_date', from: null, to: TODAY },
    } as DropRelation;
    expect(relationQuestion(today, { title: 'Send the deck', day })).toBe(
      'Move the deadline for Send the deck to today?',
    );
    // no day words given: still a plain question, never a raw date
    expect(relationQuestion(moveDeadline, { title: 'Send the deck' })).toBe(
      'Move the deadline for Send the deck?',
    );
    expect(relationButtons(moveDeadline)).toEqual({
      primary: 'Move the deadline',
      secondary: 'Not that one',
      hint: null,
    });
    expect(relationLine(moveDeadline)).toBe(
      'Move the deadline for “Send Q3 deck to Priya”? Tap to check',
    );
    const all = [
      relationLine(moveDeadline),
      relationQuestion(moveDeadline, { day }),
      relationButtons(moveDeadline).primary,
    ].join(' ');
    expect(all).not.toMatch(/[–—]/);
  });

  it('a planned day moved is still a day change, worded as before', () => {
    const moveDay = {
      ...moveDeadline,
      change: { field: 'due_day', from: '2026-10-01', to: '2026-10-02' },
    } as DropRelation;
    expect(relationButtons(moveDay).primary).toBe('Yes, move it');
    expect(relationQuestion(moveDay, { title: 'Send the deck' })).toBe('Is this the one?');
  });
});

describe('held drops', () => {
  const held = (
    over: Partial<HeldRelation['classified']> = {},
    status: HeldRelation['status'] = 'pending',
  ): HeldRelation => ({
    ...(every[0] as Extract<DropRelation, { kind: 'same' }>),
    status,
    classified: { ...classified, ...over },
  });

  it('is pending only while waiting for a tap', () => {
    expect(isRelationPending({ relation: held() })).toBe(true);
    expect(isRelationPending({ relation: held({}, 'kept') })).toBe(false);
    expect(isRelationPending({})).toBe(false);
    expect(isRelationPending(null)).toBe(false);
  });

  it('shows the kind the drop would have been', () => {
    expect(heldKindOf(held())).toEqual({ kind: 'todo', subtype: null });
    expect(heldKindOf(held({ bucket: 'log', subtype: 'event' }))).toEqual({
      kind: 'note',
      subtype: 'event',
    });
  });

  it('keeps a journal entry after a yes, and only a journal entry', () => {
    expect(keepsDropAfterYes(held({ bucket: 'log', subtype: 'journal' }))).toBe(true);
    expect(keepsDropAfterYes(held({ bucket: 'log', subtype: 'general' }))).toBe(false);
    expect(keepsDropAfterYes(held())).toBe(false);
  });

  it('after ticking off or logging, keeps the drop only when it says more than that it happened', () => {
    const done = (own_entry: boolean | null | undefined, over = {}): HeldRelation => ({
      kind: 'edit',
      intent: 'complete',
      entity: todo,
      others: [],
      confidence: 95,
      change: { field: 'completed', from: null, to: 'done' },
      own_entry,
      status: 'pending',
      classified: { ...classified, bucket: 'log', subtype: 'journal', ...over },
    });
    expect(keepsDropAfterYes(done(false))).toBe(false);
    expect(keepsDropAfterYes(done(true))).toBe(true);
    expect(keepsDropAfterYes(done(true, { subtype: 'general' }))).toBe(true);
    // held before the check said so: the journal rule
    expect(keepsDropAfterYes(done(undefined))).toBe(true);
    expect(keepsDropAfterYes(done(null, { bucket: 'todo', subtype: null }))).toBe(false);
  });

  it('reads whether the drop is its own entry from the Worker', () => {
    const r = parseRelation({
      kind: 'edit',
      intent: 'complete',
      entity: todo,
      others: [],
      confidence: 95,
      change: { field: 'completed', from: null, to: 'done' },
      own_entry: false,
    });
    expect(r).toMatchObject({ own_entry: false });
    expect(parseRelation({ ...r, own_entry: 'yes' })).toMatchObject({ own_entry: null });
  });
});
