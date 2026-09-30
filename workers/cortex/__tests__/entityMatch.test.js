/**
 * @jest-environment node
 *
 * The entity matcher's plumbing: the item list the model sees, turning its
 * answer into a card (or nothing), the prompt sections, and the pill's edits.
 * Nothing here judges meaning; that is the model's, and the scenario replay
 * in scripts/chat-audit covers it with the real models.
 */
import {
  candidatesFor,
  decideCard,
  aboutItems,
  dayInWords,
  checkNewAgainstTracked,
  buildEntityMatchInput,
  entityCardPromptSection,
  applyEntityCardToTriage,
  recentCardPromptSection,
  theirItemsPromptSection,
  attentionItems,
  noteDay,
  matchEntity,
  CONFIDENCE_FLOOR,
  RECENT_CARD_TURNS,
  habitProgressWords,
  weekStartOf,
  addDays,
} from '../entityMatch.js';
import {
  editsToPillItems,
  cardTrackedNote,
  aboutTrackedNote,
  reconcileSameAs,
  mergePillItems,
  buildPillPrompt,
  buildSummaryPrompt,
  lateCardFrom,
  newItemsOnly,
  withEditsRule,
  withEvidenceRule,
  buildChatExtractionPrompt,
} from '../chatPrompts.js';
import { configureModels, models } from '../models.js';

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

test('decideCard: a confident edit becomes an edit card with from and to', () => {
  const cands = candidatesFor('move my dentist to thursday', items, null);
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
  const cands = candidatesFor('move my dentist to thursday', items, null);
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
  // not sure enough to propose a change, and no alternatives named: the one
  // item is shown and Gremly checks it is the one; never a list padded with
  // whatever happens to be next on the list
  expect(low).toMatchObject({ kind: 'view', intent: 'confirm', entity: { id: 'aaaa1111-0000' } });
  expect(entityCardPromptSection(low)).toContain('may be the one they mean');
  expect(applyEntityCardToTriage({ mode: 'update' }, low).mode).toBe('entity_card');
  expect(
    decideCard(
      {
        refers: true,
        entity_id: 'aaaa1111-0000',
        intent: 'edit',
        change: null,
        confidence: CONFIDENCE_FLOOR - 1,
        candidates: ['aaaa1111-0000', 'bbbb2222'],
      },
      cands,
    ),
  ).toMatchObject({ kind: 'choose' });
  expect(
    decideCard(
      { refers: true, entity_id: 'aaaa1111-0000', intent: 'mention', confidence: 40 },
      cands,
    ),
  ).toBeNull();
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
  const cands = candidatesFor(
    'rename my strength habit',
    [
      ...items,
      { id: 'ffff6666-0000', type: 'habit', title: 'Strength stretches', frequency: 'daily' },
    ],
    null,
  );
  // the model may answer with the short keys it was shown or with full ids; the
  // "which one?" card needs no intent, only two known candidates
  const choose = decideCard(
    {
      refers: false,
      entity_id: null,
      intent: 'none',
      confidence: 0,
      ask: true,
      candidates: ['dddd4444', 'ffff6666-0000', 'zzz'],
    },
    cands,
  );
  expect(choose.kind).toBe('choose');
  expect(choose.candidates.map((c) => c.id)).toEqual(['dddd4444-0000', 'ffff6666-0000']);
  // asking with a single one named: that one is shown to confirm
  expect(
    decideCard({ refers: false, entity_id: null, ask: true, candidates: ['dddd4444'] }, cands),
  ).toMatchObject({ kind: 'view', intent: 'confirm', entity: { id: 'dddd4444-0000' } });
  expect(
    decideCard({ refers: false, entity_id: null, ask: true, candidates: [] }, cands),
  ).toBeNull();
  const done = decideCard(
    { refers: true, entity_id: 'aaaa1111', intent: 'complete', confidence: 90 },
    candidatesFor('dentist done', items, null),
  );
  expect(done).toMatchObject({
    kind: 'edit',
    entity: { id: 'aaaa1111-0000' },
    change: { field: 'completed', to: 'done' },
  });
});

test('the model sees every live item, the last card first, journal entries left out, each with a short key', () => {
  const list = [
    ...items,
    {
      id: 'jjjj7777-0000',
      type: 'note',
      subtype: 'journal',
      title: 'Felt tired',
      due_day: '2026-09-20',
    },
    { id: 'aaaa1111-9999', type: 'todo', title: 'Dentist bill' }, // same first 8 chars as Dentist
  ];
  const all = candidatesFor('anything at all', list, null);
  expect(all.map((c) => c.id)).toEqual([
    'aaaa1111-0000',
    'bbbb2222-0000',
    'cccc3333-0000',
    'dddd4444-0000',
    'eeee5555-0000',
    'aaaa1111-9999',
  ]);
  expect(all[0].key).toBe('aaaa1111');
  expect(all[5].key).toBe('aaaa1111-'); // lengthened past the clash
  // the item on the last card comes first and is marked, live fields and all
  const recent = { id: 'cccc3333-0000', type: 'habit', title: 'Morning run' };
  const withRecent = candidatesFor('move it', list, recent);
  expect(withRecent[0]).toMatchObject({ id: 'cccc3333-0000', shown: true, frequency: 'weekdays' });
  expect(withRecent.filter((c) => c.id === 'cccc3333-0000')).toHaveLength(1);
  // a recent item the fetch did not return still counts
  const gone = candidatesFor('rename it', list, {
    id: 'zzzz9999-0000',
    type: 'todo',
    title: 'Old',
  });
  expect(gone[0]).toMatchObject({ id: 'zzzz9999-0000', title: 'Old', shown: true });
  expect(candidatesFor('x', list, { id: 'x', type: 'space', title: 'Nope' })[0].id).toBe(
    'aaaa1111-0000',
  );
  expect(
    buildEntityMatchInput({ todayStr: 'x', message: 'move it', candidates: withRecent }),
  ).toContain(
    '- id cccc3333 [habit] Morning run (weekdays; nothing logged lately) [shown on the card in the last reply]',
  );
});

test('the reply hears the items the model says the message is about, the referred one first', () => {
  const cands = candidatesFor('m', items, null);
  const decision = { kind: 'mention', entity: cands[1] };
  const about = aboutItems(
    { about: ['aaaa1111', 'bbbb2222-0000', 'nope', 'eeee5555'] },
    cands,
    decision,
  );
  expect(about.map((c) => c.id)).toEqual(['bbbb2222-0000', 'aaaa1111-0000', 'eeee5555-0000']);
  expect(about[0].referred).toBe(true);
  expect(aboutItems({}, cands, null)).toEqual([]);
  // a feelings turn passes on only the item they themselves brought up
  const strict = theirItemsPromptSection({ related: about, attention: [] }, '2026-09-29', {
    mode: 'emotional',
  });
  expect(strict).toContain('"Book flights to Berlin"');
  expect(strict).not.toContain('"Dentist"');
  const open = theirItemsPromptSection({ related: about, attention: [] }, '2026-09-29', {
    mode: 'update',
  });
  expect(open).toContain('"Dentist", due tomorrow (2026-09-30) 14:00');
});

test('days are said in words the reply will not get wrong', () => {
  expect(dayInWords('2026-09-29', '2026-09-29')).toBe('today (2026-09-29)');
  expect(dayInWords('2026-09-30', '2026-09-29')).toBe('tomorrow (2026-09-30)');
  expect(dayInWords('2026-09-28', '2026-09-29')).toBe('yesterday (2026-09-28)');
  expect(dayInWords('2026-10-02', '2026-09-29')).toBe('Friday (2026-10-02)');
  expect(dayInWords('2026-10-06', '2026-09-29')).toBe('2026-10-06'); // a week away: the date
  expect(dayInWords('2026-10-06', null)).toBe('2026-10-06');
  expect(dayInWords(null, '2026-09-29')).toBe('');
});

test('an explicit add to a note is a card; details said in passing are left to the pill', () => {
  const note = candidatesFor(
    'm',
    [{ id: 'nnnn0000-0000', type: 'note', title: 'Lisbon trip ideas' }],
    null,
  );
  const asked = decideCard(
    {
      refers: true,
      entity_id: 'nnnn0000',
      intent: 'edit',
      change: { field: 'body_add', value: 'Porto' },
      confidence: 95,
    },
    note,
  );
  expect(asked).toMatchObject({
    kind: 'edit',
    change: { field: 'body_add', from: null, to: 'Porto' },
  });
  expect(entityCardPromptSection(asked)).toContain('add to it: Porto');
  const passing = decideCard(
    {
      refers: true,
      entity_id: 'nnnn0000',
      intent: 'mention',
      change: { field: 'body_add', value: 'Porto' },
      confidence: 95,
    },
    note,
  );
  expect(passing).toMatchObject({ kind: 'mention', change: null });
  // a todo keeps notes too, so an explicit add is a card there as well; a habit has nothing to add to
  expect(
    decideCard(
      {
        refers: true,
        entity_id: 'aaaa1111',
        intent: 'edit',
        change: { field: 'body_add', value: 'x' },
        confidence: 95,
      },
      candidatesFor('m', items, null),
    ),
  ).toMatchObject({ kind: 'edit', change: { field: 'body_add', to: 'x' } });
  expect(
    decideCard(
      {
        refers: true,
        entity_id: 'cccc3333',
        intent: 'edit',
        change: { field: 'body_add', value: 'x' },
        confidence: 95,
      },
      candidatesFor('m', items, null),
    ),
  ).toMatchObject({ kind: 'view', intent: 'edit' });
});

test('the extractor is told what this turn is about and what the card already covers', () => {
  const card = {
    entity: { id: 'wwww0000-0000', type: 'todo', title: 'Build Mind Drop Widget' },
    change: { field: 'due_day', from: '2026-07-27', to: '2026-10-02' },
  };
  const note = cardTrackedNote(card);
  expect(note).toContain(
    "THIS TURN'S CARD: the app has just shown the user a card for [todo id:wwww0000] Build Mind Drop Widget and has already offered to change its due_day to 2026-10-02",
  );
  expect(
    cardTrackedNote({ entity: card.entity, change: { field: 'completed', to: 'done' } }),
  ).toContain('offered to mark it done');
  expect(cardTrackedNote(null)).toBe('');
  const about = aboutTrackedNote([
    { id: 'mmmm0000-0000', type: 'note', title: 'Clarify Mexico trip plans' },
    { id: 'x', type: 'todo', title: '' },
  ]);
  expect(about).toContain(
    'THE LATEST MESSAGE IS ABOUT THESE TRACKED ITEMS:\n- [note id:mmmm0000] Clarify Mexico trip plans',
  );
  expect(about).toContain('anything else the message brings up is judged on its own');
  expect(aboutTrackedNote([])).toBe('');
});

test('a new item the extractor marks as an existing one becomes an add-to for a note and nothing for a todo', () => {
  const tracked = new Map([
    ['mmmm0000', { id: 'mmmm0000-0000', type: 'note', title: 'Clarify Mexico trip plans' }],
    ['wwww0000', { id: 'wwww0000-0000', type: 'todo', title: 'Build Mind Drop Widget' }],
  ]);
  const out = reconcileSameAs(
    [
      {
        type: 'event',
        title: 'Mexico trip',
        body: 'late November',
        evidence: 'x',
        same_as: 'mmmm0000',
      },
      { type: 'todo', title: 'Finish the widget', evidence: 'y', same_as: 'wwww0000' },
      { type: 'todo', title: 'Buy milk', evidence: 'z' },
      { type: 'todo', title: 'Unknown', evidence: 'z', same_as: 'nope' },
    ],
    tracked,
  );
  expect(out.map((e) => `${e.type}:${e.title}`)).toEqual([
    'edit:Add to Clarify Mexico trip plans',
    'todo:Buy milk',
    'todo:Unknown',
  ]);
  expect(out[0]).toMatchObject({
    field: 'body_add',
    entity_id: 'mmmm0000-0000',
    to: 'Mexico trip: late November',
  });
  // one add-to per note, the extractor's own wins; edits never repeat
  const own = {
    type: 'edit',
    field: 'body_add',
    entity_id: 'mmmm0000-0000',
    title: 'Add to Clarify Mexico trip plans',
    to: 'their words',
  };
  const merged = mergePillItems(out, [own, { ...own }]);
  expect(merged.filter((e) => e.type === 'edit')).toHaveLength(1);
  expect(merged.find((e) => e.type === 'edit').to).toBe('their words');
  expect(reconcileSameAs([], tracked)).toEqual([]);
});

test('the same-thing check sets same_as from the model and never throws', async () => {
  configureModels({ ENTITY_CARDS: 'on', OPENAI_API_KEY: 'k' });
  const list = [{ id: 'mmmm0000-0000', type: 'note', title: 'Clarify Mexico trip plans' }];
  const news = [
    { type: 'event', title: 'Mexico trip', evidence: 'x' },
    { type: 'todo', title: 'Buy milk', evidence: 'z' },
  ];
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: '{"results":[{"index":0,"same_as":"mmmm0000"},{"index":1,"same_as":null}]}',
            },
          },
        ],
      }),
      { status: 200 },
    );
  const out = await checkNewAgainstTracked(news, list);
  expect(out[0].same_as).toBe('mmmm0000');
  expect(out[1].same_as).toBeUndefined();
  globalThis.fetch = async () => {
    throw new Error('network');
  };
  expect(await checkNewAgainstTracked([{ type: 'todo', title: 'x' }], list)).toEqual([
    { type: 'todo', title: 'x' },
  ]);
  expect(await checkNewAgainstTracked([], list)).toEqual([]);
  delete globalThis.fetch;
});

test('the matcher input lists candidates with their details and the date', () => {
  const s = buildEntityMatchInput({
    todayStr: 'Tuesday, September 29, 2026',
    message: 'move dentist',
    previousExchange: null,
    candidates: candidatesFor('move dentist', items.slice(0, 3), null),
  });
  expect(s).toContain('Today is Tuesday, September 29, 2026.');
  expect(s).toContain('THEIR ITEMS (everything they have):');
  expect(s).toContain('- id aaaa1111 [todo] Dentist (due 2026-09-30 at 14:00)');
  expect(s).toContain('- id cccc3333 [habit] Morning run (weekdays; nothing logged lately)');
  expect(s).not.toContain('LAST EXCHANGES');
  const withHistory = buildEntityMatchInput({
    todayStr: 'x',
    message: 'yes',
    exchanges: [
      { userMsg: 'one', assistantMsg: 'a1' },
      { userMsg: 'two', assistantMsg: 'a2' },
      { userMsg: 'three', assistantMsg: 'a3' },
      { userMsg: 'four', assistantMsg: 'a4' },
    ],
    candidates: [],
  });
  expect(withHistory).toContain('LAST EXCHANGES, oldest first:');
  expect(withHistory).not.toContain('User: one'); // only the last three
  expect(withHistory.indexOf('User: two')).toBeLessThan(withHistory.indexOf('User: four'));
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
  expect(match.related.map((c) => c.id)).toEqual(['aaaa1111-0000']); // the referred item
  expect(match.related[0].referred).toBe(true);
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
  expect(p).toContain('EDITS: The list of items already tracked above');
  expect(p).toContain('"same_as"');
  expect(p).toContain('"edits":[{"entity_id":"<id from the list>"');
  expect(p.indexOf('EVIDENCE:')).toBeLessThan(p.indexOf('EDITS:'));
});

test('decideCard: a change with no value is a view card that asks; dated notes edit like todos', () => {
  const cands = candidatesFor('change the dentist', items, null);
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
  // the evidence rule is the guard: the user's own words, not the item's title
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
  ).toHaveLength(1);
});

test('the last card and what became of it reach the reply prompt', () => {
  const base = { id: 'n1', type: 'note', title: 'Bella Vet Appointment' };
  expect(recentCardPromptSection(null)).toBe('');
  expect(recentCardPromptSection({ ...base, status: 'declined' })).toContain(
    'not the one they meant',
  );
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
  expect(quietSec).not.toContain('Overdue or coming up');
  expect(quietSec).not.toContain('"Dentist"');
  // the rules and the no-card statement hold even then
  expect(quietSec).toContain('No card goes with this reply');
  expect(attentionItems(items, null)).toEqual([]);
  const sec = theirItemsPromptSection(
    {
      related: [{ id: 'a', type: 'todo', title: 'Old one', due_day: '2026-07-16', referred: true }],
      attention: attentionItems(items, '2026-09-29'),
    },
    '2026-09-29',
  );
  expect(sec).toContain('=== WHAT THEY HAVE ON ===');
  expect(sec).toContain('You may offer the natural next step');
  expect(sec).toContain('never say a change has been made');
  expect(sec).toContain(
    'What they are talking about:\n- todo "Old one", was due 2026-07-16 (overdue)',
  );
  expect(sec).toContain('Overdue or coming up this week:');
  expect(sec).not.toMatch(/Overdue or coming up this week:[\s\S]*"Old one"/); // not listed twice
  expect(sec).toContain('- note "Bella vet", Friday (2026-10-02)');
  // nothing matched and nothing due: the block still tells the reply no card goes with it
  expect(theirItemsPromptSection({ related: [], attention: [] }, '2026-09-29')).toContain(
    'No card goes with this reply',
  );
  expect(theirItemsPromptSection(null, '2026-09-29')).toBe('');
});

test('asking for what it already is: a view card that says so, not an edit', () => {
  const cands = candidatesFor('move the dentist to wednesday', items, null);
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

test("the split pill call asks one question and keeps the single call's field names; the summary is its own call", () => {
  const pill = buildPillPrompt({
    todayStr: 'Tuesday, September 29, 2026',
    conversationText: 'User: I need to get the flea treatment sorted',
    existingItemsBlock: '- [todo id:abcd1234] Book the vaccination\n',
  });
  expect(pill).toContain('Today is Tuesday, September 29, 2026.');
  expect(pill).toContain("what in it is new to the user's list, and what has changed");
  expect(pill).toContain('[todo id:abcd1234] Book the vaccination');
  expect(pill).toContain('Progress on something is not completion.');
  expect(pill).toContain('"same_as"');
  expect(pill).toContain('"edits":[{"entity_id":"<id from the list>"');
  expect(pill).toContain('"date_range_end"');
  expect(pill).not.toContain('chat_summary');
  expect(pill).not.toContain('e.g.');
  const summary = buildSummaryPrompt({
    runningSummary: 'Earlier: trip ideas.',
    conversationText: 'User: hi',
  });
  expect(summary).toContain('SUMMARY OF EARLIER MESSAGES');
  expect(summary).toContain('Earlier: trip ideas.');
  expect(summary).toContain('{"chat_summary":{"title":"...","summary":"..."}}');
  expect(buildSummaryPrompt({ runningSummary: null, conversationText: 'User: hi' })).not.toContain(
    'SUMMARY OF EARLIER MESSAGES',
  );
  configureModels({ CHAT_PILL_SPLIT: 'on' });
  expect(models().flags.pillSplit).toBe(true);
  configureModels({});
  expect(models().flags.pillSplit).toBe(false);
});

test('a card that proposes nothing never repeats for the item on the last card; a new change still does', async () => {
  configureModels({ ENTITY_CARDS: 'on', OPENAI_API_KEY: 'k' });
  const list = [{ id: 'aaaa1111-0000', type: 'todo', title: 'Dentist', due_day: '2026-10-04' }];
  const answerWith = (content) => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
  };
  const recent = {
    id: 'aaaa1111-0000',
    type: 'todo',
    title: 'Dentist',
    status: 'applied',
    turns_ago: 0,
  };
  // "thanks" read as already set: no card, the reply just hears the item
  answerWith(
    '{"refers":true,"entity_id":"aaaa1111","intent":"edit","change":{"field":"due_day","value":"2026-10-04"},"confidence":95}',
  );
  const thanks = await matchEntity({
    env: {},
    userId: 'u',
    message: 'Amazing, thanks!',
    todayStr: 'x',
    items: list,
    recent,
  });
  expect(thanks.card).toBeNull();
  expect(thanks.mention).toMatchObject({ entity: { id: 'aaaa1111-0000' } });
  // a different change to the same item is a new card
  answerWith(
    '{"refers":true,"entity_id":"aaaa1111","intent":"edit","change":{"field":"due_day","value":"2026-10-05"},"confidence":95}',
  );
  const again = await matchEntity({
    env: {},
    userId: 'u',
    message: 'actually Monday',
    todayStr: 'x',
    items: list,
    recent,
  });
  expect(again.card).toMatchObject({ kind: 'edit', change: { to: '2026-10-05' } });
  // long enough ago, a view card is fine again
  answerWith('{"refers":true,"entity_id":"aaaa1111","intent":"view","confidence":95}');
  const later = await matchEntity({
    env: {},
    userId: 'u',
    message: 'show me the dentist one',
    todayStr: 'x',
    items: list,
    recent: { ...recent, turns_ago: RECENT_CARD_TURNS + 1 },
  });
  expect(later.card).toMatchObject({ kind: 'view' });
  delete globalThis.fetch;
});

test("when unsure, the which-one card is the model's own considered set, and a turned-down item is never offered again", () => {
  const list = [
    { id: 'c1000000-0000', type: 'todo', title: 'Fix Calendar Entry Field' },
    { id: 'c2000000-0000', type: 'todo', title: 'Sort All Calendar Service Issues Properly' },
    { id: 'c3000000-0000', type: 'todo', title: 'Sort the Microsoft Calendar Submission' },
    { id: 'zzzz0000-0000', type: 'todo', title: 'Buy milk' },
  ];
  const cands = candidatesFor('push the calendar fix to friday', list, null);
  const unsure = decideCard(
    {
      considered: ['c1000000', 'c2000000', 'c3000000'],
      refers: true,
      entity_id: 'c1000000',
      intent: 'edit',
      change: { field: 'due_day', value: '2026-10-02' },
      confidence: 55,
      ask: false,
      candidates: [],
    },
    cands,
  );
  expect(unsure.kind).toBe('choose');
  expect(unsure.candidates.map((c) => c.id)).toEqual([
    'c1000000-0000',
    'c2000000-0000',
    'c3000000-0000',
  ]);
  // after "not that one" on the first, it is marked and excluded, however the model answers
  const declined = {
    id: 'c1000000-0000',
    type: 'todo',
    title: 'Fix Calendar Entry Field',
    status: 'declined',
    turns_ago: 0,
  };
  const after = candidatesFor('not that one', list, declined);
  expect(after[0]).toMatchObject({ id: 'c1000000-0000', declined: true });
  expect(after[0].shown).toBeUndefined();
  expect(buildEntityMatchInput({ todayStr: 'x', message: 'm', candidates: after })).toContain(
    'the user said this was not the one they meant',
  );
  expect(
    decideCard(
      {
        refers: true,
        entity_id: 'c1000000',
        intent: 'edit',
        change: { field: 'due_day', value: '2026-10-02' },
        confidence: 95,
      },
      after,
    ),
  ).toBeNull();
  const rest = decideCard(
    {
      considered: ['c1000000', 'c2000000', 'c3000000'],
      refers: true,
      entity_id: 'c2000000',
      intent: 'edit',
      change: null,
      confidence: 50,
    },
    after,
  );
  expect(rest.candidates.map((c) => c.id)).toEqual(['c2000000-0000', 'c3000000-0000']);
  expect(recentCardPromptSection(declined)).toContain('not the one they meant');
  // a card turn carries no item list
  expect(
    theirItemsPromptSection({ related: [after[1]], attention: [] }, '2026-09-29', {
      mode: 'entity_card',
    }),
  ).toBe('');
});

test('a habit check-in is a card under a normal reply, unless that day is already logged', () => {
  const run = {
    id: 'h1000000-0000',
    type: 'habit',
    title: '10k training run',
    frequency: '3 times a week',
    target_per_period: 3,
    period_unit: 'week',
    logged_days: ['2026-09-28', '2026-09-26'],
  };
  const cands = candidatesFor('did my run', [run], null);
  const fresh = decideCard(
    {
      refers: true,
      entity_id: 'h1000000',
      intent: 'logged',
      change: { field: 'logged', value: '2026-09-29' },
      confidence: 95,
    },
    cands,
  );
  expect(fresh).toMatchObject({
    kind: 'edit',
    inPassing: true,
    change: { field: 'logged', from: null, to: '2026-09-29' },
  });
  expect(entityCardPromptSection(fresh)).toContain('log it for 2026-09-29');
  expect(applyEntityCardToTriage({ mode: 'celebration' }, fresh).mode).toBe('celebration');
  const counted = decideCard(
    {
      refers: true,
      entity_id: 'h1000000',
      intent: 'logged',
      change: { field: 'logged', value: '2026-09-28' },
      confidence: 95,
    },
    cands,
  );
  expect(counted).toMatchObject({ kind: 'mention', change: null, loggedAlready: '2026-09-28' });
  expect(
    decideCard(
      {
        refers: true,
        entity_id: 'h1000000',
        intent: 'logged',
        change: { field: 'logged', value: 'Monday' },
        confidence: 95,
      },
      cands,
    ),
  ).toMatchObject({ kind: 'mention', change: null });
  // what the model and the reply are told about the habit
  expect(buildEntityMatchInput({ todayStr: 'x', message: 'm', candidates: cands })).toContain(
    '[habit] 10k training run (3 times a week; logged 2026-09-28, 2026-09-26)',
  );
  expect(habitProgressWords(run, '2026-09-29')).toBe('logged this week: yesterday (1 of 3)');
  expect(habitProgressWords({ ...run, logged_days: ['2026-09-20'] }, '2026-09-29')).toBe(
    'nothing logged this week (target 3), last 2026-09-20',
  );
  expect(
    habitProgressWords(
      { ...run, cadence: 'daily', logged_days: ['2026-09-29', '2026-09-27', '2026-09-20'] },
      '2026-09-29',
    ),
  ).toBe('logged 2 of the last 7 days, last today (2026-09-29)');
  expect(
    theirItemsPromptSection({ related: [{ ...run, referred: true }], attention: [] }, '2026-09-29'),
  ).toContain('- habit "10k training run", 3 times a week, logged this week: yesterday (1 of 3)');
  expect(weekStartOf('2026-09-29')).toBe('2026-09-28');
  expect(weekStartOf('2026-09-27')).toBe('2026-09-21');
  expect(addDays('2026-09-29', -14)).toBe('2026-09-15');
});

test('existing means card, new means pill: one late card from the changes the extraction found', () => {
  const tracked = new Map([
    ['mmmm0000', { id: 'mmmm0000-0000', type: 'note', title: 'Clarify Mexico trip plans' }],
    [
      'wwww0000',
      { id: 'wwww0000-0000', type: 'todo', title: 'Build Mind Drop Widget', due_day: '2026-07-27' },
    ],
  ]);
  const edits = [
    {
      entity_id: 'wwww0000-0000',
      entity_type: 'todo',
      entity_title: 'Build Mind Drop Widget',
      field: 'due_day',
      from: '2026-07-27',
      to: '2026-10-02',
    },
    {
      entity_id: 'mmmm0000-0000',
      entity_type: 'note',
      entity_title: 'Clarify Mexico trip plans',
      field: 'body_add',
      from: null,
      to: 'Puerto Escondido',
    },
  ];
  // the one about what the message was about wins; else the first
  expect(lateCardFrom(edits, tracked, { aboutIds: ['mmmm0000-0000'] })).toMatchObject({
    kind: 'edit',
    late: true,
    entity: { id: 'mmmm0000-0000', type: 'note', title: 'Clarify Mexico trip plans' },
    change: { field: 'body_add', to: 'Puerto Escondido' },
  });
  expect(lateCardFrom(edits, tracked, {})).toMatchObject({
    entity: { id: 'wwww0000-0000', due_day: '2026-07-27' },
    change: { field: 'due_day', from: '2026-07-27', to: '2026-10-02' },
  });
  // never this turn's card item, never the one just turned down
  expect(
    lateCardFrom(edits, tracked, { cardEntityId: 'wwww0000-0000', declinedId: 'mmmm0000-0000' }),
  ).toBeNull();
  expect(lateCardFrom([], tracked, {})).toBeNull();
  // the pill keeps only the new things
  expect(
    newItemsOnly([
      { type: 'todo', title: 'Buy milk' },
      { type: 'edit', field: 'body_add', title: 'Add to X' },
      { type: 'event', title: 'Trip' },
    ]).map((e) => e.title),
  ).toEqual(['Buy milk', 'Trip']);
});

test('after "not that one", the others the model considered are the choice, one is a confirm, none is nothing', () => {
  const list = [
    {
      id: 's1000000-0000',
      type: 'todo',
      title: 'Send Out Sage Future Deck',
      due_day: '2026-10-01',
    },
    {
      id: 's2000000-0000',
      type: 'todo',
      title: 'Create Two Sage Case Studies',
      due_day: '2026-07-16',
    },
    { id: 's3000000-0000', type: 'note', title: 'Sage Future On April 28' },
    { id: 'zzzz0000-0000', type: 'todo', title: 'Buy milk' },
  ];
  const declined = {
    id: 's1000000-0000',
    type: 'todo',
    title: 'Send Out Sage Future Deck',
    status: 'declined',
    turns_ago: 0,
  };
  const after = candidatesFor('not that one', list, declined);
  // the model saw the others but did not pick or ask: the decline says what they want
  const shrug = {
    considered: ['s1000000', 's2000000', 's3000000'],
    refers: false,
    entity_id: null,
    intent: 'none',
    change: null,
    about: [],
    confidence: 90,
    ask: false,
    candidates: [],
  };
  expect(decideCard(shrug, after)).toBeNull();
  const choose = decideCard(shrug, after, { afterDecline: true });
  expect(choose.kind).toBe('choose');
  expect(choose.candidates.map((c) => c.id)).toEqual(['s2000000-0000', 's3000000-0000']);
  // one other left: shown to confirm
  const one = decideCard({ ...shrug, considered: ['s1000000', 's2000000'] }, after, {
    afterDecline: true,
  });
  expect(one).toMatchObject({ kind: 'view', intent: 'confirm', entity: { id: 's2000000-0000' } });
  // nothing else fits: no card, the reply says so
  expect(
    decideCard({ ...shrug, considered: ['s1000000'] }, after, { afterDecline: true }),
  ).toBeNull();
  expect(decideCard({ ...shrug, considered: [] }, after, { afterDecline: true })).toBeNull();
  // the model asks but names the turned-down one among two: the one left is a confirm
  const askTwo = { ...shrug, ask: true, candidates: ['s1000000', 's2000000'] };
  expect(decideCard(askTwo, after)).toMatchObject({
    kind: 'view',
    intent: 'confirm',
    entity: { id: 's2000000-0000' },
  });
  // the model asks with nothing usable named but a considered set: the set is the choice
  const askLoose = {
    ...shrug,
    ask: true,
    candidates: [],
    considered: ['s2000000', 's3000000', 'zzzz0000'],
  };
  expect(decideCard(askLoose, after).candidates.map((c) => c.id)).toEqual([
    's2000000-0000',
    's3000000-0000',
    'zzzz0000-0000',
  ]);
  // an ordinary turn, not after a decline: refers false stays nothing
  expect(decideCard(shrug, candidatesFor('m', list, null))).toBeNull();
});

test('the reply is told every turn what it can see and whether a card goes with the reply', () => {
  const cands = candidatesFor('m', items, null);
  // nothing matched, no card: the rules still stand and the reply cannot claim or promise a change
  const none = theirItemsPromptSection({ related: [], attention: [] }, '2026-09-29', {
    mode: 'update',
  });
  expect(none).toContain('=== WHAT THEY HAVE ON ===');
  expect(none).toContain('none of their items, as far as the app can tell');
  expect(none).toContain('No card goes with this reply');
  expect(none).toContain('is history');
  // an in-passing card sits under the reply: the card section speaks for it
  const withCard = theirItemsPromptSection({ related: [cands[0]], attention: [] }, '2026-09-29', {
    mode: 'update',
    card: {
      kind: 'edit',
      inPassing: true,
      entity: cands[0],
      change: { field: 'due_day', from: null, to: '2026-10-01' },
    },
  });
  expect(withCard).toContain('"Dentist"');
  expect(withCard).not.toContain('No card goes with this reply');
  // a card that took the reply over, or no matcher at all: nothing
  expect(
    theirItemsPromptSection({ related: [], attention: [] }, '2026-09-29', { mode: 'entity_card' }),
  ).toBe('');
  expect(theirItemsPromptSection(null, '2026-09-29', { mode: 'update' })).toBe('');
});
