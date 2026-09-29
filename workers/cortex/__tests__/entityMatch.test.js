/**
 * @jest-environment node
 *
 * The entity matcher: candidate ranking, turning the model's answer into a
 * card (or nothing), the prompt section, and the extraction's edits job.
 */
import {
  rankCandidates,
  candidatesFor,
  decideCard,
  buildEntityMatchInput,
  entityCardPromptSection,
  applyEntityCardToTriage,
  recentCardPromptSection,
  relatedItemsPromptSection,
  theirItemsPromptSection,
  attentionItems,
  todayIsoIn,
  noteDay,
  matchEntity,
  CONFIDENCE_FLOOR,
  VIEW_FLOOR,
} from '../entityMatch.js';
import {
  editsToPillItems,
  mentionEditItem,
  withoutCardDuplicates,
  reconcileWithExisting,
  mergePillItems,
  withEditsRule,
  withEvidenceRule,
  buildChatExtractionPrompt,
} from '../chatPrompts.js';
import { configureModels } from '../models.js';

const items = [
  { id: 'aaaa1111-0000', type: 'todo', title: 'Dentist', due_day: '2026-09-30', due_time: '14:00' },
  {
    id: 'bbbb2222-0000',
    type: 'todo',
    title: 'Book flights to Berlin',
    due_day: null,
    due_time: null,
  },
  { id: 'cccc3333-0000', type: 'habit', title: 'Morning run', frequency: 'weekdays' },
  {
    id: 'dddd4444-0000',
    type: 'habit',
    title: 'Strength at Live Fit',
    frequency: '3 times a week',
  },
  { id: 'eeee5555-0000', type: 'note', title: 'Packing list for Costa Rica' },
];

afterEach(() => configureModels({}));

test('rankCandidates picks items whose words the message uses, best first', () => {
  const r = rankCandidates('can you move my dentist appointment to thursday', items);
  expect(r[0].title).toBe('Dentist');
  expect(r.map((x) => x.title)).not.toContain('Morning run');
  const g = rankCandidates('rename the gym habit to strength', items);
  expect(g.map((x) => x.title)).toContain('Strength at Live Fit');
  expect(rankCandidates('how are you today', items)).toEqual([]);
});

test('decideCard: a confident edit becomes an edit card with from and to', () => {
  const cands = rankCandidates('move my dentist to thursday', items);
  const card = decideCard(
    {
      refers: true,
      entity_id: 'aaaa1111-0000',
      intent: 'edit',
      change: { field: 'due_day', value: '2026-10-01' },
      confidence: 92,
      ask: false,
    },
    cands,
  );
  expect(card).toMatchObject({
    kind: 'edit',
    entity: { id: 'aaaa1111-0000', type: 'todo' },
    change: { field: 'due_day', from: '2026-09-30', to: '2026-10-01' },
  });
});

test('decideCard: below the floor it asks, an unknown id or refers false is nothing, a bad date is a view', () => {
  const cands = rankCandidates('move my dentist to thursday', items);
  const low = decideCard(
    {
      refers: true,
      entity_id: 'aaaa1111-0000',
      intent: 'edit',
      change: { field: 'due_day', value: '2026-10-01' },
      confidence: CONFIDENCE_FLOOR - 1,
      ask: false,
    },
    cands,
  );
  expect(low.kind).toBe('choose');
  expect(low.candidates[0].id).toBe('aaaa1111-0000');
  expect(
    decideCard({ refers: true, entity_id: 'nope', intent: 'edit', confidence: 99 }, cands),
  ).toBeNull();
  expect(
    decideCard({ refers: false, entity_id: null, intent: 'none', confidence: 0 }, cands),
  ).toBeNull();
  const bad = decideCard(
    {
      refers: true,
      entity_id: 'aaaa1111-0000',
      intent: 'edit',
      change: { field: 'due_day', value: 'Thursday' },
      confidence: 95,
    },
    cands,
  );
  expect(bad.kind).toBe('view');
  expect(bad.intent).toBe('edit');
  const wrongField = decideCard(
    {
      refers: true,
      entity_id: 'aaaa1111-0000',
      intent: 'edit',
      change: { field: 'frequency', value: 'daily' },
      confidence: 95,
    },
    cands,
  );
  expect(wrongField.kind).toBe('view');
});

test('decideCard: ask with two known candidates gives a choose card; complete marks a todo done', () => {
  const cands = rankCandidates('rename my strength habit', [
    ...items,
    { id: 'ffff6666-0000', type: 'habit', title: 'Strength stretches', frequency: 'daily' },
  ]);
  const choose = decideCard(
    {
      refers: false,
      entity_id: null,
      intent: 'edit',
      confidence: 40,
      ask: true,
      candidates: ['dddd4444-0000', 'ffff6666-0000', 'zzz'],
    },
    cands,
  );
  expect(choose.kind).toBe('choose');
  expect(choose.candidates.map((c) => c.id)).toEqual(['dddd4444-0000', 'ffff6666-0000']);
  const done = decideCard(
    { refers: true, entity_id: 'aaaa1111-0000', intent: 'complete', confidence: 90 },
    rankCandidates('dentist done', items),
  );
  expect(done).toMatchObject({ kind: 'edit', change: { field: 'completed', to: 'done' } });
});

test('the matcher input lists candidates with their details and the date', () => {
  const s = buildEntityMatchInput({
    todayStr: 'Tuesday, September 29, 2026',
    message: 'move dentist',
    previousExchange: null,
    candidates: items.slice(0, 3),
  });
  expect(s).toContain('Today is Tuesday, September 29, 2026.');
  expect(s).toContain('- id aaaa1111-0000 [todo] Dentist (due 2026-09-30 at 14:00)');
  expect(s).toContain('- id cccc3333-0000 [habit] Morning run (weekdays)');
});

test('the prompt section never lets the reply claim a change', () => {
  const card = {
    kind: 'edit',
    entity: { type: 'todo', title: 'Dentist' },
    change: { field: 'due_day', from: '2026-09-30', to: '2026-10-01' },
  };
  const sec = entityCardPromptSection(card);
  expect(sec).toContain('=== ENTITY CARD ===');
  expect(sec.toLowerCase()).toContain('never say you have changed');
  expect(entityCardPromptSection(null)).toBe('');
  expect(entityCardPromptSection({ kind: 'choose', candidates: [{}, {}] })).toContain(
    '2 of their items',
  );
});

test('matchEntity is off unless ENTITY_CARDS=on, and never throws', async () => {
  configureModels({});
  expect(
    await matchEntity({ env: {}, userId: 'u', message: 'move dentist', todayStr: 'x', items }),
  ).toBeNull();
  configureModels({ ENTITY_CARDS: 'on', OPENAI_API_KEY: 'k' });
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content:
                '{"refers":true,"entity_id":"aaaa1111-0000","intent":"edit","change":{"field":"due_day","value":"2026-10-01"},"confidence":95,"ask":false}',
            },
          },
        ],
      }),
      { status: 200 },
    );
  const match = await matchEntity({
    env: {},
    userId: 'u',
    message: 'move my dentist to thursday',
    todayStr: 'Tuesday, September 29, 2026',
    items,
  });
  expect(match.card.kind).toBe('edit');
  expect(match.mention).toBeNull();
  expect(match.related.map((c) => c.id)).toContain('aaaa1111-0000');
  globalThis.fetch = async () => {
    throw new Error('network');
  };
  expect(
    await matchEntity({
      env: {},
      userId: 'u',
      message: 'move my dentist to thursday',
      todayStr: 'x',
      items,
    }),
  ).toBeNull();
  delete globalThis.fetch;
});

test('edits from extraction become pill items only when grounded, valid and different', () => {
  const tracked = new Map([
    [
      'aaaa1111',
      {
        id: 'aaaa1111-0000',
        type: 'todo',
        title: 'Dentist',
        due_day: '2026-09-30',
        due_time: '14:00',
        frequency: null,
      },
    ],
    [
      'cccc3333',
      {
        id: 'cccc3333-0000',
        type: 'habit',
        title: 'Morning run',
        due_day: null,
        due_time: null,
        frequency: 'weekdays',
      },
    ],
  ]);
  const userTexts = [
    'ugh the dentist got pushed to thursday, same time',
    'I want to run only three days a week now',
  ];
  const out = editsToPillItems(
    [
      {
        entity_id: 'aaaa1111',
        type: 'todo',
        field: 'due_day',
        value: '2026-10-01',
        evidence: 'the dentist got pushed to thursday',
      },
      {
        entity_id: 'cccc3333',
        type: 'habit',
        field: 'frequency',
        value: 'three days a week',
        evidence: 'run only three days a week now',
      },
      {
        entity_id: 'cccc3333',
        type: 'habit',
        field: 'frequency',
        value: 'weekdays',
        evidence: 'run only three days a week now',
      },
      {
        entity_id: 'aaaa1111',
        type: 'todo',
        field: 'due_day',
        value: 'thursday',
        evidence: 'the dentist got pushed to thursday',
      },
      { entity_id: 'zzzz', field: 'name', value: 'x', evidence: 'the dentist got pushed' },
      {
        entity_id: 'aaaa1111',
        type: 'todo',
        field: 'name',
        value: 'Dentist checkup',
        evidence: 'Gremly said rename it',
      },
    ],
    tracked,
    userTexts,
  );
  expect(out.map((o) => [o.entity_id, o.field, o.from, o.to])).toEqual([
    ['aaaa1111-0000', 'due_day', '2026-09-30', '2026-10-01'],
    ['cccc3333-0000', 'frequency', 'weekdays', 'three days a week'],
  ]);
  expect(out[0]).toMatchObject({
    type: 'edit',
    entity_type: 'todo',
    entity_title: 'Dentist',
    title: 'Update Dentist',
  });
});

test('withEditsRule adds the rule and the edits field to the JSON shape', () => {
  const base = withEvidenceRule(
    buildChatExtractionPrompt({
      todayStr: 'today',
      runningSummary: null,
      conversationText: 'User: hi',
      handledIds: [],
      existingItemsBlock: '',
    }),
  );
  const p = withEditsRule(base);
  expect(p).toContain('EDITS: An item already tracked above');
  expect(p).toContain('"edits":[{"entity_id":"<id from the list>"');
  expect(p.indexOf('EVIDENCE:')).toBeLessThan(p.indexOf('EDITS:'));
});

test('the item on the last card is always a candidate, so "move it" has something to mean', () => {
  const recent = { id: 'aaaa1111-0000', type: 'todo', title: 'Dentist' };
  expect(candidatesFor("Let's move it to Friday", items, null)).toHaveLength(0);
  const withRecent = candidatesFor("Let's move it to Friday", items, recent);
  expect(withRecent).toHaveLength(1);
  expect(withRecent[0].id).toBe('aaaa1111-0000');
  expect(withRecent[0].shown).toBe(true);
  expect(withRecent[0].due_time).toBe('14:00'); // the live item, not the app's copy
  // a recent item the app knows but the fetch did not return still counts
  const gone = candidatesFor('rename it to teeth', items, {
    id: 'zzzz9999-0000',
    type: 'todo',
    title: 'Old dentist',
  });
  expect(gone[0].title).toBe('Old dentist');
  // the ranking still comes first when the message names something else
  const named = candidatesFor('move my morning run to weekends', items, recent);
  expect(named[0].id).toBe('aaaa1111-0000');
  expect(named.map((c) => c.id)).toContain('cccc3333-0000');
  expect(candidatesFor('move it', items, { id: 'x', type: 'space', title: 'Nope' })).toHaveLength(
    0,
  );
  const s = buildEntityMatchInput({
    todayStr: 'Tuesday, September 29, 2026',
    message: "Let's move it to Friday",
    previousExchange: null,
    candidates: withRecent,
  });
  expect(s).toContain('[shown on the card in the last reply]');
});

test('decideCard: a change with no value is a view card that asks; dated notes edit like todos', () => {
  const cands = rankCandidates('change the dentist', items);
  const asks = decideCard(
    { refers: true, entity_id: 'aaaa1111-0000', intent: 'edit', change: null, confidence: 90 },
    cands,
  );
  expect(asks).toEqual({ kind: 'view', entity: cands[0], intent: 'edit' });
  const mention = decideCard(
    { refers: true, entity_id: 'aaaa1111-0000', intent: 'view', change: null, confidence: 90 },
    cands,
  );
  expect(mention.intent).toBe('view');
  const note = [
    {
      id: 'nnnn0000-0000',
      type: 'note',
      title: 'Bella vet appointment',
      due_day: null,
      due_time: null,
    },
  ];
  const moved = decideCard(
    {
      refers: true,
      entity_id: 'nnnn0000-0000',
      intent: 'edit',
      change: { field: 'due_day', value: '2026-10-02' },
      confidence: 92,
    },
    note,
  );
  expect(moved.kind).toBe('edit');
  expect(moved.change).toEqual({ field: 'due_day', from: null, to: '2026-10-02' });
  const line = buildEntityMatchInput({ todayStr: 'x', message: 'm', candidates: note });
  expect(line).toContain('[note] Bella vet appointment (note, no day set)');
});

test('a card that asks something takes over the reply mode; a plain mention leaves triage alone', () => {
  const triage = { mode: 'action_ready', depth: 'standard', search: 'maybe', personal: 'light' };
  const entity = { id: 'a', type: 'todo', title: 'Dentist' };
  const edit = applyEntityCardToTriage(triage, {
    kind: 'edit',
    entity,
    change: { field: 'due_day', from: null, to: '2026-10-02' },
  });
  expect(edit).toMatchObject({
    mode: 'entity_card',
    modeBeforeCard: 'action_ready',
    depth: 'brief',
    search: 'none',
    personal: 'light',
  });
  expect(applyEntityCardToTriage(triage, { kind: 'view', entity, intent: 'edit' }).mode).toBe(
    'entity_card',
  );
  expect(applyEntityCardToTriage(triage, { kind: 'choose', candidates: [entity] }).mode).toBe(
    'entity_card',
  );
  expect(applyEntityCardToTriage(triage, { kind: 'view', entity, intent: 'view' })).toBe(triage);
  expect(applyEntityCardToTriage(triage, null)).toBe(triage);
  const sec = entityCardPromptSection({ kind: 'view', entity, intent: 'edit' });
  expect(sec).toContain('have not said what to');
  expect(sec).toContain('asking what should change');
  expect(sec).not.toContain('Refer to it naturally');
  const editSec = entityCardPromptSection({
    kind: 'edit',
    entity,
    change: { field: 'due_day', from: null, to: '2026-10-02' },
  });
  expect(editSec).toContain('move it to 2026-10-02');
  expect(editSec).toContain('do not use a list');
});

test('the pill can move a dated note, and skips fields a note does not have', () => {
  const tracked = new Map([
    [
      'nnnn0000',
      {
        id: 'nnnn0000-0000',
        type: 'note',
        title: 'Bella vet appointment',
        due_day: null,
        due_time: null,
      },
    ],
  ]);
  const items = editsToPillItems(
    [
      {
        entity_id: 'nnnn0000',
        field: 'due_day',
        value: '2026-10-02',
        evidence: "let's move it to friday",
      },
      {
        entity_id: 'nnnn0000',
        field: 'frequency',
        value: 'weekly',
        evidence: "let's move it to friday",
      },
    ],
    tracked,
    ['The vet appointment needs to move', "Let's move it to Friday"],
  );
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({ entity_type: 'note', field: 'due_day', to: '2026-10-02' });
  // an edit to something the user never spoke about is not offered
  expect(
    editsToPillItems(
      [
        {
          entity_id: 'nnnn0000',
          field: 'due_day',
          value: '2026-10-02',
          evidence: "let's move it to friday",
        },
      ],
      tracked,
      ["Let's move it to Friday"],
    ),
  ).toHaveLength(0);
});

test('a mere mention gets no card: view needs a high confidence, and a note body is not a card field', () => {
  const cands = rankCandidates('thinking about the mexico trip', [
    { id: 'mmmm0000-0000', type: 'note', title: 'Clarify Mexico trip plans' },
  ]);
  const low = decideCard(
    {
      refers: true,
      entity_id: 'mmmm0000-0000',
      intent: 'view',
      change: null,
      confidence: VIEW_FLOOR - 1,
    },
    cands,
  );
  expect(low).toBeNull();
  const none = decideCard(
    { refers: true, entity_id: 'mmmm0000-0000', intent: 'none', change: null, confidence: 95 },
    cands,
  );
  expect(none).toBeNull();
  // details for a note are the pill's job (body_add), never a card that interrupts the chat
  const body = decideCard(
    {
      refers: true,
      entity_id: 'mmmm0000-0000',
      intent: 'edit',
      change: { field: 'body', value: 'Mexico City then Zipolite' },
      confidence: 95,
    },
    cands,
  );
  expect(body.kind).toBe('view');
  expect(body.intent).toBe('edit');
});

test('the last card and what became of it reach the reply prompt', () => {
  const base = { id: 'n1', type: 'note', title: 'Bella Vet Appointment' };
  expect(recentCardPromptSection(null)).toBe('');
  expect(recentCardPromptSection({ ...base, status: 'declined' })).toBe('');
  const done = recentCardPromptSection({
    ...base,
    status: 'applied',
    summary: 'Done. Bella Vet Appointment is now Fri 2 Oct.',
  });
  expect(done).toContain('=== LAST CARD ===');
  expect(done).toContain('tapped Yes');
  expect(done).toContain('Fri 2 Oct');
  expect(recentCardPromptSection({ ...base, status: 'pending' })).toContain('have not tapped');
  expect(recentCardPromptSection({ ...base, status: 'undone' })).toContain('undid it');
  expect(recentCardPromptSection({ ...base, type: 'space', status: 'applied' })).toBe('');
});

test("a note's day comes from its column or from the copy MindDrop keeps in views", () => {
  expect(noteDay({ target_date: '2026-10-02', views: { target_date: '2026-09-30' } })).toBe(
    '2026-10-02',
  );
  expect(noteDay({ target_date: null, views: { target_date: '2026-09-30' } })).toBe('2026-09-30');
  expect(noteDay({ target_date: null, views: null })).toBeNull();
  expect(noteDay(undefined)).toBeNull();
});

test('details shared about a note become an add to the note in the pill, never a replacement', () => {
  const tracked = new Map([
    ['mmmm0000', { id: 'mmmm0000-0000', type: 'note', title: 'Clarify Mexico trip plans' }],
  ]);
  const items = editsToPillItems(
    [
      {
        entity_id: 'mmmm0000',
        field: 'body_add',
        value: 'Mexico City, Puerto Escondido and Zipolite, with Dave',
        evidence: 'mexico city, puerto escondido and then zipolite. i will be with dave',
      },
      {
        entity_id: 'mmmm0000',
        field: 'body',
        value: 'replace everything',
        evidence: 'mexico city',
      },
    ],
    tracked,
    ['Yes I was thinking Mexico City, Puerto Escondido and then Zipolite. I will be with Dave'],
  );
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({
    field: 'body_add',
    from: null,
    title: 'Add to Clarify Mexico trip plans',
  });
  expect(
    withEditsRule(
      buildChatExtractionPrompt({
        todayStr: 'x',
        runningSummary: null,
        conversationText: '',
        handledIds: [],
        existingItemsBlock: '',
      }),
    ),
  ).toContain('body_add');
});

test('said in passing: a concrete change is an edit card under a normal reply; a bare mention is context', async () => {
  const cands = rankCandidates('I should probably call Kim and Andrew by the end of the week', [
    { id: 'kkkk0000-0000', type: 'todo', title: 'Call Kim and Andrew', due_day: '2026-07-16' },
    { id: 'jjjj0000-0000', type: 'todo', title: 'Meet Kim and Andrew', due_day: null },
  ]);
  const heard = decideCard(
    {
      refers: true,
      entity_id: 'kkkk0000-0000',
      intent: 'mention',
      change: { field: 'due_day', value: '2026-10-02' },
      confidence: 92,
    },
    cands,
  );
  expect(heard).toEqual({
    kind: 'edit',
    entity: cands.find((c) => c.id === 'kkkk0000-0000'),
    change: { field: 'due_day', from: '2026-07-16', to: '2026-10-02' },
    confidence: 92,
    inPassing: true,
  });
  // the same value as today, or an unusable one, leaves a plain mention
  expect(
    decideCard(
      {
        refers: true,
        entity_id: 'kkkk0000-0000',
        intent: 'mention',
        change: { field: 'due_day', value: 'Friday' },
        confidence: 92,
      },
      cands,
    ),
  ).toMatchObject({ kind: 'mention', change: null });
  // an in-passing card never takes over the reply; an asked-for one does
  const triage = { mode: 'capture', depth: 'brief', search: 'none' };
  expect(applyEntityCardToTriage(triage, heard)).toBe(triage);
  expect(applyEntityCardToTriage(triage, { ...heard, inPassing: false }).mode).toBe('entity_card');
  const sec = entityCardPromptSection(heard);
  expect(sec).toContain('under your reply');
  expect(sec).toContain('the way you normally would');
  expect(sec).toContain('never say it is done');
  // the pill item helper still works for a mention that carries a change
  const item = mentionEditItem({ ...heard, kind: 'mention' });
  expect(item).toMatchObject({
    type: 'edit',
    entity_id: 'kkkk0000-0000',
    title: 'Update Call Kim and Andrew',
  });
  expect(mentionEditItem({ kind: 'mention', entity: heard.entity, change: null })).toBeNull();
  expect(mentionEditItem(null)).toBeNull();
  expect(todayIsoIn('America/Los_Angeles')).toMatch(/^\d{4}-\d{2}-\d{2}$/);

  // matchEntity carries the whole picture out, even with no wording match
  configureModels({ ENTITY_CARDS: 'on', OPENAI_API_KEY: 'k' });
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content:
                '{"refers":true,"entity_id":"kkkk0000-0000","intent":"mention","change":{"field":"due_day","value":"2026-10-02"},"confidence":92,"ask":false}',
            },
          },
        ],
      }),
      { status: 200 },
    );
  const list = [
    { id: 'kkkk0000-0000', type: 'todo', title: 'Call Kim and Andrew', due_day: '2026-07-16' },
    { id: 'pppp0000-0000', type: 'todo', title: 'Pay the plumber', due_day: '2026-10-01' },
  ];
  const match = await matchEntity({
    env: {},
    userId: 'u',
    message: 'I should probably call Kim and Andrew by the end of the week',
    todayStr: 'Tuesday, September 29, 2026',
    todayIso: '2026-09-29',
    items: list,
  });
  expect(match.card).toMatchObject({ kind: 'edit', inPassing: true });
  expect(match.mention).toBeNull();
  expect(match.all).toBe(list);
  expect(match.attention.map((c) => c.id)).toEqual(['pppp0000-0000']); // due this week; July's slip is too old to raise
  const quiet = await matchEntity({
    env: {},
    userId: 'u',
    message: 'how are you',
    todayStr: 'x',
    todayIso: '2026-09-29',
    items: list,
  });
  expect(quiet.card).toBeNull();
  expect(quiet.related).toHaveLength(0);
  expect(quiet.attention).toHaveLength(1);
  delete globalThis.fetch;
});

test('what needs attention: due this week first, then the most recently overdue todos, no habits', () => {
  const items = [
    { id: 'a', type: 'todo', title: 'Old one', due_day: '2026-07-16' },
    { id: 'b', type: 'todo', title: 'Older one', due_day: '2026-06-01' },
    { id: 'c', type: 'todo', title: 'Tomorrow', due_day: '2026-09-30' },
    { id: 'd', type: 'todo', title: 'Next month', due_day: '2026-10-20' },
    { id: 'e', type: 'note', title: 'Bella vet', due_day: '2026-10-02' },
    { id: 'f', type: 'note', title: 'Old event', due_day: '2026-09-01' },
    { id: 'g', type: 'habit', title: 'Run', frequency: 'daily', due_day: '2026-09-29' },
    { id: 'h', type: 'todo', title: 'No day' },
  ];
  // July's backlog is the sweep's business; only what slipped in the last month is raised
  expect(attentionItems(items, '2026-09-29').map((c) => c.id)).toEqual(['c', 'e']);
  expect(
    attentionItems(
      [{ id: 'r', type: 'todo', title: 'Recent slip', due_day: '2026-09-20' }],
      '2026-09-29',
    ).map((c) => c.id),
  ).toEqual(['r']);
  // an emotional turn hears only what the user named
  const quietSec = theirItemsPromptSection(
    { related: [], attention: attentionItems(items, '2026-09-29') },
    '2026-09-29',
    { mode: 'emotional' },
  );
  expect(quietSec).toBe('');
  expect(attentionItems(items, null)).toEqual([]);
  const sec = theirItemsPromptSection(
    {
      related: [
        {
          id: 'a',
          type: 'todo',
          title: 'Old one',
          due_day: '2026-07-16',
          score: 1.3,
          hits: 2,
          share: 1,
        },
      ],
      attention: attentionItems(items, '2026-09-29'),
    },
    '2026-09-29',
  );
  expect(sec).toContain('=== WHAT THEY HAVE ON ===');
  expect(sec).toContain('You may offer the natural next step');
  expect(sec).toContain('never say a change has been made');
  expect(sec).toContain(
    'Matching what they just said:\n- todo "Old one", was due 2026-07-16 (overdue)',
  );
  expect(sec).toContain('Overdue or coming up this week:');
  expect(sec).not.toMatch(/Overdue or coming up this week:[\s\S]*"Old one"/); // not listed twice
  expect(sec).toContain('- note "Bella vet", 2026-10-02');
  expect(theirItemsPromptSection({ related: [], attention: [] }, '2026-09-29')).toBe('');
  expect(theirItemsPromptSection(null, '2026-09-29')).toBe('');
});

test('a short yes points at what Gremly named in its last reply', () => {
  const items = [
    { id: 'kkkk0000-0000', type: 'todo', title: 'Call Kim and Andrew', due_day: '2026-07-16' },
    { id: 'zzzz0000-0000', type: 'todo', title: 'Buy milk' },
  ];
  const prev = {
    userMsg: 'I need to call Kim and Andrew this week',
    assistantMsg:
      'That call to Kim and Andrew has been on your list since July. Want it moved to Friday?',
  };
  const cands = candidatesFor('yes please', items, null, 6, prev);
  expect(cands.map((c) => c.id)).toEqual(['kkkk0000-0000']);
  expect(cands[0].named).toBe(true);
  expect(
    buildEntityMatchInput({
      todayStr: 'x',
      message: 'yes please',
      previousExchange: prev,
      candidates: cands,
    }),
  ).toContain('[named in your last reply]');
  // a message with words of its own is ranked on those words
  expect(candidatesFor('buy milk tonight', items, null, 6, prev)[0].id).toBe('zzzz0000-0000');
});

test('asking for what it already is: a view card that says so, not an edit', () => {
  const cands = rankCandidates('move the dentist to wednesday', items);
  const same = decideCard(
    {
      refers: true,
      entity_id: 'aaaa1111-0000',
      intent: 'edit',
      change: { field: 'due_day', value: '2026-09-30' },
      confidence: 95,
    },
    cands,
  );
  expect(same).toMatchObject({ kind: 'view', intent: 'view', already: true });
  expect(entityCardPromptSection(same)).toContain('already set the way they asked');
});

test('the reply only hears items that really match the wording, not one shared word', () => {
  const list = [
    { id: 'v', type: 'note', title: 'Bella Vet Appointment', due_day: '2026-09-30' },
    { id: 'b', type: 'todo', title: 'Book Appointment', due_day: '2026-07-17' },
    { id: 'w', type: 'todo', title: 'Walk with Bella' },
  ];
  const related = rankCandidates("I don't have time for Bellas appointment tomorrow", list);
  const sec = theirItemsPromptSection({ related, attention: [] }, '2026-09-29');
  expect(sec).toContain('"Bella Vet Appointment"');
  expect(sec).not.toContain('"Book Appointment"');
  expect(sec).not.toContain('"Walk with Bella"');
  expect(sec).toContain('never offer to change several at once');
});

test('the pill reconciles against what they already have before offering anything new', () => {
  const tracked = new Map([
    ['mmmm0000', { id: 'mmmm0000-0000', type: 'note', title: 'Clarify Mexico trip plans' }],
    ['wwww0000', { id: 'wwww0000-0000', type: 'todo', title: 'Build Mind Drop Widget' }],
  ]);
  const card = { entity: { id: 'wwww0000-0000', type: 'todo', title: 'Build Mind Drop Widget' } };
  const last = 'Yeah I should probably get the widget done by eow too';
  // the item on this turn's card is not a new item too
  const afterCard = withoutCardDuplicates(
    [
      {
        type: 'event',
        title: 'Complete the Gremly widget',
        evidence: 'get the widget done by eow',
      },
      {
        type: 'event',
        title: 'Finish Mind Drop and chat',
        evidence: 'the mind drop and chat finished by end of week',
      },
      { type: 'todo', title: 'Buy milk', evidence: 'buy milk' },
    ],
    card,
    last,
  );
  expect(afterCard.map((e) => e.title)).toEqual(['Finish Mind Drop and chat', 'Buy milk']);
  // something a note already covers becomes an add-to; something a todo covers is dropped
  const reconciled = reconcileWithExisting(
    [
      {
        type: 'event',
        title: 'Mexico trip for Thanksgiving',
        body: 'late November',
        evidence: 'x',
      },
      { type: 'event', title: 'Finish Mind Drop and chat', evidence: 'y' },
      { type: 'todo', title: 'Buy milk', evidence: 'z' },
    ],
    tracked,
  );
  expect(reconciled.map((e) => `${e.type}:${e.title}`)).toEqual([
    'edit:Add to Clarify Mexico trip plans',
    'todo:Buy milk',
  ]);
  expect(reconciled[0]).toMatchObject({
    field: 'body_add',
    entity_id: 'mmmm0000-0000',
    to: 'Mexico trip for Thanksgiving: late November',
  });
  // the extractor's own add-to wins over a converted one, and edits never repeat
  const own = {
    type: 'edit',
    field: 'body_add',
    entity_id: 'mmmm0000-0000',
    title: 'Add to Clarify Mexico trip plans',
    to: 'their words',
  };
  const merged = mergePillItems(reconciled, [own, { ...own }]);
  expect(merged.filter((e) => e.type === 'edit')).toHaveLength(1);
  expect(merged.find((e) => e.type === 'edit').to).toBe('their words');
  expect(reconcileWithExisting([], tracked)).toEqual([]);
  expect(reconcileWithExisting([{ type: 'todo', title: 'Buy milk' }], new Map())).toHaveLength(1);
});
