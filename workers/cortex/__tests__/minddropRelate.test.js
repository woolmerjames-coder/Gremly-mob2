/**
 * minddropRelate.js: is a Mind Drop about something the user already has?
 */
import {
  MINDDROP_RELATE_PROMPT,
  MINDDROP_RELATE_PROMPT_DEADLINES,
  RELATE_CONFIDENCE_FLOOR,
  relatePromptFor,
  buildRelateInput,
  changeFor,
  decideRelation,
  relateDrop,
  shapeItems,
  withKeys,
} from '../minddropRelate.js';
import { configureModels } from '../models.js';
import deadlineCheck from './fixtures/relate-deadlines.json';

const TODAY = '2026-09-30';
const items = withKeys([
  {
    id: 'todo-food-0001',
    type: 'todo',
    title: 'Order more of Pepper’s food',
    due_day: null,
    due_time: null,
  },
  {
    id: 'todo-deck-0002',
    type: 'todo',
    title: 'Send Q3 deck',
    due_day: '2026-10-01',
    due_time: null,
  },
  {
    id: 'note-vet-00003',
    type: 'note',
    title: 'Pepper vet appointment',
    due_day: '2026-10-02',
    due_time: null,
    target_date: '2026-10-02',
  },
  {
    id: 'note-doc-00004',
    type: 'note',
    title: 'Doctors appointment',
    due_day: null,
    due_time: null,
  },
  {
    id: 'habit-walk-005',
    type: 'habit',
    title: 'Walk Pepper',
    habit_kind: 'build',
    frequency: 'daily',
    logged_days: ['2026-09-29'],
  },
  {
    id: 'habit-quit-006',
    type: 'habit',
    title: 'Quit smoking',
    habit_kind: 'break',
    frequency: 'daily',
    logged_days: [],
  },
  {
    id: 'note-vet2-0007',
    type: 'note',
    title: 'Vet: Milo check up',
    due_day: '2026-10-05',
    due_time: null,
    target_date: '2026-10-05',
  },
]);
const key = (id) => items.find((i) => i.id === id).key;
const answer = (o) => ({
  confidence: 90,
  considered: [],
  ask: false,
  candidates: [],
  change: null,
  ...o,
});

describe('prompt', () => {
  it.each([
    ['the prompt', MINDDROP_RELATE_PROMPT],
    ['the deadline prompt', MINDDROP_RELATE_PROMPT_DEADLINES],
  ])('%s has no examples, no word lists and no dashes (house rules)', (_name, prompt) => {
    expect(prompt).not.toMatch(/[–—]/);
    expect(prompt).not.toMatch(
      /\bexamples?\b|\be\.g\.|\bsuch as\b|\bfor instance\b|\bfor example\b/i,
    );
    const rules = prompt.split('Return ONLY JSON')[0];
    expect(rules).not.toMatch(/\([^)]*,[^)]*,[^)]*\)/);
    expect(rules).not.toMatch(/"[^"]+"\s*,\s*"[^"]+"\s*,\s*"[^"]+"/); // no quoted phrase lists
  });

  it('is the same for every user and day, so it can be cached', () => {
    expect(MINDDROP_RELATE_PROMPT).not.toMatch(/20\d\d-\d\d-\d\d/);
    expect(MINDDROP_RELATE_PROMPT_DEADLINES).not.toMatch(/20\d\d-\d\d-\d\d/);
  });

  it('gives the deadline prompt only to a build that understands deadlines (final check item 6)', () => {
    expect(relatePromptFor(false)).toBe(MINDDROP_RELATE_PROMPT);
    expect(relatePromptFor(true)).toBe(MINDDROP_RELATE_PROMPT_DEADLINES);
    // the deadline prompt tells a todo's two dates apart and lets an edit move the deadline
    expect(MINDDROP_RELATE_PROMPT_DEADLINES).toContain('target_date');
    expect(MINDDROP_RELATE_PROMPT).not.toContain('target_date');
    // the rest of the prompt is the same text
    expect(MINDDROP_RELATE_PROMPT_DEADLINES).toContain(MINDDROP_RELATE_PROMPT.slice(-400));
  });

  it('never holds the made up deadline check: no drop and no item of it is in either prompt', () => {
    const { todos, habits, notes } = deadlineCheck.items;
    const words = [
      ...deadlineCheck.drops.map((d) => d.text),
      ...[...todos, ...habits, ...notes].map((x) => x.name || x.title),
    ];
    for (const prompt of [MINDDROP_RELATE_PROMPT, MINDDROP_RELATE_PROMPT_DEADLINES]) {
      for (const w of words) expect(prompt.toLowerCase()).not.toContain(w.toLowerCase());
    }
    // it covers what the gate asks for
    const covers = new Set(deadlineCheck.drops.map((d) => d.covers));
    for (const c of [
      'deadline moved',
      'planned day moved',
      'deadline only todo, same',
      'deadline only todo, done',
      'could mean either',
    ])
      expect(covers).toContain(c);
  });

  it('puts today, the drop and every item in the user turn', () => {
    const input = buildRelateInput({ todayIso: TODAY, text: 'vet moved', candidates: items });
    expect(input).toContain('Today is Wednesday 2026-09-30.');
    expect(input).toContain('DROP:\nvet moved');
    for (const i of items) expect(input).toContain(`- id ${i.key} [${i.type}]`);
    expect(input).toContain('a habit to cut out');
  });
});

describe('a todo with a deadline (final check item 6)', () => {
  const todos = withKeys(
    shapeItems({
      todos: [
        { id: 'todo-rep-0001', name: 'Send the report', target_date: '2026-10-09' },
        {
          id: 'todo-gym-0002',
          name: 'Book the gym class',
          due_day: '2026-10-01',
          due_time: '07:30:00',
          target_date: '2026-10-03',
        },
        { id: 'todo-nil-0003', name: 'Fix the shelf' },
        { id: 'todo-sch-0004', name: 'Call the bank', scheduled_date: '2026-10-02' },
      ],
    }),
  );
  const tkey = (id) => todos.find((i) => i.id === id).key;

  it('writes both dates in plain words for a build that understands deadlines', () => {
    const input = buildRelateInput({
      todayIso: TODAY,
      text: 'x',
      candidates: todos,
      deadlines: true,
    });
    expect(input).toContain(
      `- id ${tkey('todo-rep-0001')} [todo] Send the report (no day planned; deadline 2026-10-09)`,
    );
    expect(input).toContain(
      `- id ${tkey('todo-gym-0002')} [todo] Book the gym class (planned for 2026-10-01 at 07:30; deadline 2026-10-03)`,
    );
    expect(input).toContain(
      `- id ${tkey('todo-nil-0003')} [todo] Fix the shelf (no day planned; no deadline)`,
    );
    expect(input).toContain(
      `- id ${tkey('todo-sch-0004')} [todo] Call the bank (planned for 2026-10-02; no deadline)`,
    );
  });

  it('leaves the item line exactly as before for a build that does not', () => {
    const input = buildRelateInput({ todayIso: TODAY, text: 'x', candidates: todos });
    expect(input).toContain(`- id ${tkey('todo-rep-0001')} [todo] Send the report (no due day)`);
    expect(input).toContain(
      `- id ${tkey('todo-gym-0002')} [todo] Book the gym class (due 2026-10-01 at 07:30)`,
    );
    expect(input).not.toContain('deadline');
  });

  it('accepts a deadline change only with the flag, and never as the planned day', () => {
    const moved = answer({
      relation: 'edit',
      entity_id: tkey('todo-rep-0001'),
      change: { field: 'target_date', value: '2026-10-10' },
    });
    expect(decideRelation(moved, todos, TODAY)).toBeNull();
    const rel = decideRelation(moved, todos, TODAY, { deadlines: true });
    expect(rel).toMatchObject({
      kind: 'edit',
      change: { field: 'target_date', from: '2026-10-09', to: '2026-10-10' },
      entity: { id: 'todo-rep-0001', target_date: '2026-10-09' },
    });
    // a deadline that is not a date, or already that day, asks nothing
    const bad = answer({ ...moved, change: { field: 'target_date', value: 'Friday' } });
    expect(decideRelation(bad, todos, TODAY, { deadlines: true })).toBeNull();
    const same = answer({ ...moved, change: { field: 'target_date', value: '2026-10-09' } });
    expect(decideRelation(same, todos, TODAY, { deadlines: true })).toBeNull();
  });

  it('answers an old request exactly as before: no deadline on the todo it shows', () => {
    const moved = answer({
      relation: 'edit',
      entity_id: tkey('todo-gym-0002'),
      change: { field: 'due_day', value: '2026-10-02' },
    });
    const rel = decideRelation(moved, todos, TODAY);
    expect(rel.entity).not.toHaveProperty('target_date');
    expect(rel.change).toEqual({ field: 'due_day', from: '2026-10-01', to: '2026-10-02' });
  });
});

describe('items', () => {
  it('leaves out journal entries and drops still waiting on this step', () => {
    const shaped = shapeItems({
      notes: [
        { id: 'n1', title: 'Feeling low', subtype: 'journal' },
        {
          id: 'n2',
          title: 'Vet moved',
          subtype: 'catchall',
          views: { relation: { status: 'pending' } },
        },
        { id: 'n3', title: 'Trip ideas', subtype: 'idea' },
      ],
    });
    expect(shaped.map((i) => i.id)).toEqual(['n3']);
  });
});

describe('decideRelation', () => {
  it('asks nothing for a new drop, an unsure answer or an unknown id', () => {
    expect(decideRelation(answer({ relation: 'new' }), items, TODAY)).toBeNull();
    expect(
      decideRelation(
        answer({
          relation: 'same',
          entity_id: key('todo-food-0001'),
          confidence: RELATE_CONFIDENCE_FLOOR - 1,
        }),
        items,
        TODAY,
      ),
    ).toBeNull();
    expect(
      decideRelation(answer({ relation: 'same', entity_id: 'nope' }), items, TODAY),
    ).toBeNull();
    expect(decideRelation(null, items, TODAY)).toBeNull();
    expect(
      decideRelation(
        answer({ relation: 'something else', entity_id: key('todo-food-0001') }),
        items,
        TODAY,
      ),
    ).toBeNull();
  });

  it('proposes a day change, with a time when one comes with it', () => {
    const r = decideRelation(
      answer({
        relation: 'edit',
        entity_id: key('note-vet-00003'),
        change: { field: 'due_day', value: '2026-10-01', time: '16:00' },
      }),
      items,
      TODAY,
    );
    expect(r).toMatchObject({
      kind: 'edit',
      intent: 'edit',
      change: { field: 'due_day', from: '2026-10-02', to: '2026-10-01', time_to: '16:00' },
    });
    expect(r.entity).toMatchObject({
      id: 'note-vet-00003',
      type: 'note',
      title: 'Pepper vet appointment',
    });
    expect(r.entity.key).toBeUndefined();
  });

  it('asks nothing when the item already has that value, or the value is not valid', () => {
    expect(
      decideRelation(
        answer({
          relation: 'edit',
          entity_id: key('note-vet-00003'),
          change: { field: 'due_day', value: '2026-10-02' },
        }),
        items,
        TODAY,
      ),
    ).toBeNull();
    expect(
      decideRelation(
        answer({
          relation: 'edit',
          entity_id: key('note-vet-00003'),
          change: { field: 'due_day', value: 'Thursday' },
        }),
        items,
        TODAY,
      ),
    ).toBeNull();
    expect(
      decideRelation(
        answer({
          relation: 'edit',
          entity_id: key('habit-walk-005'),
          change: { field: 'due_day', value: '2026-10-01' },
        }),
        items,
        TODAY,
      ),
    ).toBeNull();
  });

  it('marks a todo done, and only a todo', () => {
    expect(
      decideRelation(
        answer({ relation: 'complete', entity_id: key('todo-deck-0002') }),
        items,
        TODAY,
      ),
    ).toMatchObject({ kind: 'edit', change: { field: 'completed', to: 'done' } });
    expect(
      decideRelation(
        answer({ relation: 'complete', entity_id: key('note-doc-00004') }),
        items,
        TODAY,
      ),
    ).toBeNull();
  });

  it('says whether a done or logged drop stands as their own entry, and only for those', () => {
    const done = (own_entry) =>
      decideRelation(
        answer({ relation: 'complete', entity_id: key('todo-deck-0002'), own_entry }),
        items,
        TODAY,
      );
    expect(done(false)).toMatchObject({ kind: 'edit', own_entry: false });
    expect(done(true)).toMatchObject({ kind: 'edit', own_entry: true });
    expect(done(undefined)).toMatchObject({ kind: 'edit', own_entry: null });
    expect(
      decideRelation(
        answer({
          relation: 'edit',
          entity_id: key('note-vet-00003'),
          change: { field: 'due_day', value: '2026-10-01' },
          own_entry: true,
        }),
        items,
        TODAY,
      ),
    ).toMatchObject({ kind: 'edit', own_entry: null });
  });

  it('logs a habit for the day, never twice, never a habit to cut out, never the future', () => {
    expect(
      decideRelation(
        answer({
          relation: 'logged',
          entity_id: key('habit-walk-005'),
          change: { field: 'logged', value: TODAY },
        }),
        items,
        TODAY,
      ),
    ).toMatchObject({ kind: 'edit', change: { field: 'logged', to: TODAY } });
    expect(
      decideRelation(
        answer({ relation: 'logged', entity_id: key('habit-walk-005'), change: null }),
        items,
        TODAY,
      ),
    ).toMatchObject({ change: { to: TODAY } });
    expect(
      decideRelation(
        answer({
          relation: 'logged',
          entity_id: key('habit-walk-005'),
          change: { field: 'logged', value: '2026-09-29' },
        }),
        items,
        TODAY,
      ),
    ).toBeNull();
    expect(
      decideRelation(
        answer({ relation: 'logged', entity_id: key('habit-quit-006') }),
        items,
        TODAY,
      ),
    ).toBeNull();
    expect(
      decideRelation(
        answer({
          relation: 'logged',
          entity_id: key('habit-walk-005'),
          change: { field: 'logged', value: '2026-10-03' },
        }),
        items,
        TODAY,
      ),
    ).toBeNull();
  });

  it('adds a line to a note or a todo, never to a habit', () => {
    expect(
      decideRelation(
        answer({
          relation: 'add',
          entity_id: key('note-doc-00004'),
          change: { field: 'body_add', value: 'Cut back on coffee' },
        }),
        items,
        TODAY,
      ),
    ).toMatchObject({ kind: 'edit', change: { field: 'body_add', to: 'Cut back on coffee' } });
    expect(
      decideRelation(
        answer({
          relation: 'add',
          entity_id: key('habit-walk-005'),
          change: { field: 'body_add', value: 'x' },
        }),
        items,
        TODAY,
      ),
    ).toBeNull();
  });

  it('offers the same thing with anything new the drop adds', () => {
    const r = decideRelation(
      answer({
        relation: 'same',
        entity_id: key('todo-food-0001'),
        change: { field: 'extra', value: 'the salmon one' },
      }),
      items,
      TODAY,
    );
    expect(r).toMatchObject({ kind: 'same', extra: 'the salmon one' });
    expect(
      decideRelation(answer({ relation: 'same', entity_id: key('todo-food-0001') }), items, TODAY)
        .extra,
    ).toBeNull();
  });

  it('offers removal of an item no longer happening', () => {
    expect(
      decideRelation(
        answer({ relation: 'remove', entity_id: key('note-vet-00003') }),
        items,
        TODAY,
      ),
    ).toMatchObject({ kind: 'remove', entity: { id: 'note-vet-00003' } });
  });

  it('lets the user pick when two fit, keeping only ones the change could apply to', () => {
    const r = decideRelation(
      answer({
        relation: 'edit',
        ask: true,
        candidates: [key('note-vet-00003'), key('note-vet2-0007')],
        change: { field: 'due_day', value: '2026-10-01' },
      }),
      items,
      TODAY,
    );
    expect(r.kind).toBe('choose');
    expect(r.candidates.map((c) => c.id)).toEqual(['note-vet-00003', 'note-vet2-0007']);
    expect(r.change).toMatchObject({ field: 'due_day', value: '2026-10-01' });
  });

  it('only offers a which-one when the change can be made to the items', () => {
    const r = decideRelation(
      answer({
        relation: 'edit',
        ask: true,
        candidates: [key('note-vet-00003'), key('note-vet2-0007')],
        change: { field: 'due_day', value: null },
        confidence: 60,
      }),
      items,
      TODAY,
    );
    expect(r).toBeNull();
  });

  it('tells the app which habits are ones to cut out', () => {
    const r = decideRelation(
      answer({ relation: 'same', entity_id: key('habit-quit-006') }),
      items,
      TODAY,
    );
    expect(r.entity.habit_kind).toBe('break');
  });

  it('keeps the other items it considered for "Not that one"', () => {
    const r = decideRelation(
      answer({
        relation: 'remove',
        entity_id: key('note-vet-00003'),
        considered: [key('note-vet-00003'), key('note-vet2-0007')],
      }),
      items,
      TODAY,
    );
    expect(r.others.map((o) => o.id)).toEqual(['note-vet2-0007']);
  });
});

describe('changeFor (after a pick)', () => {
  it('builds the change for the item the user picked', () => {
    const vet2 = items.find((i) => i.id === 'note-vet2-0007');
    expect(changeFor('edit', vet2, { field: 'due_day', value: '2026-10-01' }, TODAY)).toEqual({
      field: 'due_day',
      from: '2026-10-05',
      to: '2026-10-01',
    });
  });
});

describe('relateDrop: its own model setting', () => {
  const realFetch = globalThis.fetch;
  const raw = [
    {
      id: 'todo-run-00001',
      type: 'todo',
      title: 'Book the dentist',
      due_day: null,
      due_time: null,
    },
  ];
  function stubFetch() {
    const calls = [];
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(init.body) });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            { message: { content: '{"relation":"new","entity_id":null,"confidence":90}' } },
          ],
        }),
      };
    };
    return calls;
  }
  afterEach(() => {
    globalThis.fetch = realFetch;
    configureModels({});
  });

  it('sends the deadline prompt and item lines only for a build that says it understands deadlines', async () => {
    configureModels({
      OPENAI_API_KEY: 'k',
      HELPER_MODEL: 'gpt-6-luna',
      MODEL_DROP_RELATE: 'gpt-6-luna',
    });
    const calls = stubFetch();
    await relateDrop({ env: {}, text: 'dentist', todayIso: TODAY, items: raw });
    await relateDrop({ env: {}, text: 'dentist', todayIso: TODAY, items: raw, deadlines: true });
    expect(calls[0].body.messages[0].content).toBe(MINDDROP_RELATE_PROMPT);
    expect(calls[0].body.messages[1].content).toContain('(no due day)');
    expect(calls[1].body.messages[0].content).toBe(MINDDROP_RELATE_PROMPT_DEADLINES);
    expect(calls[1].body.messages[1].content).toContain('(no day planned; no deadline)');
  });

  it('runs on MODEL_DROP_RELATE at low reasoning, apart from the chat matcher', async () => {
    configureModels({
      OPENAI_API_KEY: 'k',
      HELPER_MODEL: 'gpt-6-luna',
      MODEL_ENTITY_MATCH: 'gemini-3.8-flash',
      MODEL_DROP_RELATE: 'gpt-6-luna',
    });
    const calls = stubFetch();
    await relateDrop({ env: {}, text: 'dentist', todayIso: TODAY, items: raw });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.openai.com/v1/chat/completions');
    expect(calls[0].body.model).toBe('gpt-6-luna');
    expect(calls[0].body.reasoning_effort).toBe('low');
  });

  it('falls back to the shared helper model, never to the chat matcher, when unset', async () => {
    configureModels({
      OPENAI_API_KEY: 'k',
      HELPER_MODEL: 'gpt-6-luna',
      MODEL_ENTITY_MATCH: 'gemini-3.8-flash',
    });
    const calls = stubFetch();
    await relateDrop({ env: {}, text: 'dentist', todayIso: TODAY, items: raw });
    expect(calls[0].body.model).toBe('gpt-6-luna');
  });
});
