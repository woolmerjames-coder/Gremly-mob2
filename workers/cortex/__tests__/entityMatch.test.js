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
  anchorFrom,
  anchorPromptSection,
  turnItemSections,
  offerLateCard,
  LATE_CARD_CHECK_PROMPT,
  ENTITY_MATCH_SYSTEM_PROMPT,
  CONFIDENCE_FLOOR,
  RECENT_CARD_TURNS,
  habitProgressWords,
  addDays,
} from '../entityMatch.js';
import {
  editsToPillItems,
  cardTrackedNote,
  aboutTrackedNote,
  reconcileSameAs,
  mergePillItems,
  buildPillPrompt,
  buildTitlePrompt,
  lateCardFrom,
  lateCardCandidate,
  trackedItemsBlock,
  trackedRowsFromItems,
  newItemsOnly,
  withEditsRule,
  withEvidenceRule,
  buildChatExtractionPrompt,
  withValidDays,
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
  expect(open).toContain('"Dentist", due tomorrow, Wednesday 30 September at 14:00');
});

test('days are said in words the reply will not get wrong', () => {
  expect(dayInWords('2026-09-29', '2026-09-29')).toBe('today, Tuesday 29 September');
  expect(dayInWords('2026-09-30', '2026-09-29')).toBe('tomorrow, Wednesday 30 September');
  expect(dayInWords('2026-09-28', '2026-09-29')).toBe('yesterday, Monday 28 September');
  expect(dayInWords('2026-10-02', '2026-09-29')).toBe('Friday 2 October');
  // further away the weekday still comes with it, so the reply never works it out
  expect(dayInWords('2026-10-06', '2026-09-29')).toBe('Tuesday 6 October');
  expect(dayInWords('2027-01-01', '2026-09-29')).toBe('Friday 1 January 2027');
  expect(dayInWords('2026-10-06', null)).toBe('Tuesday 6 October');
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
      title: 'Pepper vet appointment',
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
  expect(line).toContain('[note] Pepper vet appointment (note, no day set)');
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
  expect(editSec).toContain('move it to Friday 2 October');
  expect(editSec).toContain('do not use a list');
});

test('the pill can move a dated note, and skips fields a note does not have', () => {
  const tracked = new Map([
    [
      'nnnn0000',
      {
        id: 'nnnn0000-0000',
        type: 'note',
        title: 'Pepper vet appointment',
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
  const base = { id: 'n1', type: 'note', title: 'Pepper Vet Appointment' };
  expect(recentCardPromptSection(null)).toBe('');
  expect(recentCardPromptSection({ ...base, status: 'declined' })).toContain(
    'not the one they meant',
  );
  const done = recentCardPromptSection({
    ...base,
    status: 'applied',
    summary: 'Done. Pepper Vet Appointment is now Fri 2 Oct.',
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
        value: 'Mexico City, Sagres and Zipolite, with Theo',
        evidence: 'mexico city, puerto escondido and then zipolite. i will be with theo',
      },
      {
        entity_id: 'mmmm0000',
        field: 'body',
        value: 'replace everything',
        evidence: 'mexico city',
      },
    ],
    tracked,
    ['Yes I was thinking Mexico City, Sagres and then Zipolite. I will be with Theo'],
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
    { id: 'e', type: 'note', title: 'Pepper vet', due_day: '2026-10-02' },
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
    'What they are talking about:\n- todo "Old one", was due Thursday 16 July (overdue)',
  );
  expect(sec).toContain('Overdue or coming up this week:');
  expect(sec).not.toMatch(/Overdue or coming up this week:[\s\S]*"Old one"/); // not listed twice
  expect(sec).toContain('- note "Pepper vet", Friday 2 October');
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
  // the title on its own: the running summary is written once, elsewhere
  const title = buildTitlePrompt({
    runningSummary: 'Earlier: trip ideas.',
    conversationText: 'User: hi',
  });
  expect(title).toContain('SUMMARY OF EARLIER MESSAGES');
  expect(title).toContain('Earlier: trip ideas.');
  expect(title).toContain('{"chat_summary":{"title":"..."}}');
  expect(title).not.toContain('"summary"');
  expect(buildTitlePrompt({ runningSummary: null, conversationText: 'User: hi' })).not.toContain(
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
  expect(entityCardPromptSection(fresh)).toContain('log it for Tuesday 29 September');
  expect(entityCardPromptSection(fresh, { todayIso: '2026-09-29' })).toContain(
    'log it for today, Tuesday 29 September',
  );
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
    'nothing logged this week (target 3), last Sunday 20 September',
  );
  expect(
    habitProgressWords(
      { ...run, cadence: 'daily', logged_days: ['2026-09-29', '2026-09-27', '2026-09-20'] },
      '2026-09-29',
    ),
  ).toBe('logged 2 of the last 7 days, last today, Tuesday 29 September');
  expect(
    theirItemsPromptSection({ related: [{ ...run, referred: true }], attention: [] }, '2026-09-29'),
  ).toContain('- habit "10k training run", 3 times a week, logged this week: yesterday (1 of 3)');
  // a Sunday person's week ends on Sunday: on Sunday 27 September the Saturday before counts
  expect(habitProgressWords(run, '2026-09-27')).toBe('logged this week: yesterday (1 of 3)');
  expect(habitProgressWords(run, '2026-09-29', 0)).toBe(habitProgressWords(run, '2026-09-29'));
  expect(addDays('2026-09-29', -14)).toBe('2026-09-15');
});

test("a habit's count this week is made in the person's own week", () => {
  // logged on Monday 28 and Saturday 26 September; today is Tuesday 29 September
  const run = {
    id: 'h1000000-0000',
    type: 'habit',
    title: '10k training run',
    frequency: '3 times a week',
    target_per_period: 3,
    period_unit: 'week',
    logged_days: ['2026-09-28', '2026-09-26'],
  };
  const today = '2026-09-29';
  // their weekly day is Wednesday, so their week began on Thursday 24 September
  expect(habitProgressWords(run, today, 3)).toBe('logged this week: yesterday, Saturday (2 of 3)');
  // the day before it began is last week's
  expect(habitProgressWords({ ...run, logged_days: ['2026-09-23'] }, today, 3)).toBe(
    'nothing logged this week (target 3), last Wednesday 23 September',
  );
  // on their weekly day the week is the seven days that end today
  expect(habitProgressWords(run, '2026-09-30', 3)).toBe(
    'logged this week: Monday, Saturday (2 of 3)',
  );
  // and the day after, a new week has begun
  expect(habitProgressWords(run, '2026-10-01', 3)).toBe(
    'nothing logged this week (target 3), last Monday 28 September',
  );
  // a daily habit is counted over the last seven days whatever their weekly day
  const daily = { ...run, cadence: 'daily', logged_days: ['2026-09-29', '2026-09-27'] };
  expect(habitProgressWords(daily, today, 3)).toBe(habitProgressWords(daily, today));
  // what the reply is told, wherever the habit's line is written
  const line =
    '- habit "10k training run", 3 times a week, logged this week: yesterday, Saturday (2 of 3)';
  const match = { related: [{ ...run, referred: true }], attention: [] };
  expect(theirItemsPromptSection(match, today, { weeklyDay: 3 })).toContain(line);
  expect(anchorPromptSection(run, today, { weeklyDay: 3 })).toContain(line);
  const turn = turnItemSections({
    match,
    anchor: run,
    mode: 'general',
    todayIso: today,
    weeklyDay: 3,
  });
  expect(turn.split(line)).toHaveLength(3);
  // an app that does not send their week is a Sunday person's
  const sunday = turnItemSections({ match, anchor: run, mode: 'general', todayIso: today });
  expect(sunday).not.toContain(line);
  expect(
    sunday.split(
      '- habit "10k training run", 3 times a week, logged this week: yesterday (1 of 3)',
    ),
  ).toHaveLength(3);
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
      to: 'Sagres',
    },
  ];
  // the one about what the message was about wins; else the first
  expect(lateCardFrom(edits, tracked, { aboutIds: ['mmmm0000-0000'] })).toMatchObject({
    kind: 'edit',
    late: true,
    entity: { id: 'mmmm0000-0000', type: 'note', title: 'Clarify Mexico trip plans' },
    change: { field: 'body_add', to: 'Sagres' },
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
      title: 'Send Out Orbit Future Deck',
      due_day: '2026-10-01',
    },
    {
      id: 's2000000-0000',
      type: 'todo',
      title: 'Create Two Orbit Case Studies',
      due_day: '2026-07-16',
    },
    { id: 's3000000-0000', type: 'note', title: 'Orbit Future On April 28' },
    { id: 'zzzz0000-0000', type: 'todo', title: 'Buy milk' },
  ];
  const declined = {
    id: 's1000000-0000',
    type: 'todo',
    title: 'Send Out Orbit Future Deck',
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

// ── The anchor: a chat opened about one item ("Talk it through") ────────────

test('an anchor from the app is an id, a kind of item and a title, or nothing', () => {
  expect(anchorFrom({ id: 'aaaa1111-0000', type: 'todo', title: ' Dentist ' })).toEqual({
    id: 'aaaa1111-0000',
    type: 'todo',
    title: 'Dentist',
  });
  expect(anchorFrom(null)).toBeNull();
  expect(anchorFrom({ id: 'aaaa1111-0000', type: 'journal', title: 'x' })).toBeNull();
  expect(anchorFrom({ id: 'aaaa1111-0000', type: 'todo', title: '' })).toBeNull();
  // the id goes into a lookup, so anything that is not an id is refused
  expect(anchorFrom({ id: 'x&owner_id=eq.y', type: 'todo', title: 'x' })).toBeNull();
});

test('the anchored item is always a candidate, marked, after the item on the last card', () => {
  const journal = { id: 'jjjj0000-0000', type: 'note', subtype: 'journal', title: 'Rough Monday' };
  const list = [...items, journal];
  const anchored = candidatesFor('m', list, null, 700, { ...items[2], title: 'stale title' });
  expect(anchored[0]).toMatchObject({ id: items[2].id, anchored: true, title: 'Morning run' });
  expect(anchored.filter((c) => c.id === items[2].id)).toHaveLength(1);
  // a journal entry is left out of the list, except the one the chat is about
  expect(candidatesFor('m', list, null).some((c) => c.id === journal.id)).toBe(false);
  expect(candidatesFor('m', list, null, 700, journal)[0]).toMatchObject({
    id: journal.id,
    anchored: true,
  });
  // the item on the last card stays first
  const recent = { id: items[0].id, type: 'todo', title: 'Dentist', status: 'pending' };
  const both = candidatesFor('m', list, recent, 700, items[2]);
  expect(both[0]).toMatchObject({ id: items[0].id, shown: true });
  expect(both[1]).toMatchObject({ id: items[2].id, anchored: true });
  // the same item on the last card and anchored carries both marks
  const same = candidatesFor('m', list, recent, 700, items[0]);
  expect(same[0]).toMatchObject({ id: items[0].id, shown: true, anchored: true });
  // an anchor that is gone is not a candidate
  expect(
    candidatesFor('m', items, null, 700, { ...items[2], gone: true }).some((c) => c.anchored),
  ).toBe(false);
  const input = buildEntityMatchInput({
    todayStr: 'x',
    message: 'm',
    candidates: same,
  });
  expect(input).toContain(
    '[this chat was opened about this item; shown on the card in the last reply]',
  );
});

test('matchEntity resolves the anchor as it is now, and says when it is gone', async () => {
  configureModels({ ENTITY_CARDS: 'on', OPENAI_API_KEY: 'k' });
  const answer = (content) =>
    new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
  globalThis.fetch = async () =>
    answer('{"refers":true,"entity_id":"cccc3333","intent":"mention","confidence":90}');
  const match = await matchEntity({
    env: {},
    userId: 'u',
    message: 'I keep skipping it',
    todayStr: 'x',
    items,
    anchor: { id: items[2].id, type: 'habit', title: 'Old name' },
  });
  expect(match.anchor).toMatchObject({ id: items[2].id, title: 'Morning run' });
  expect(match.anchor.gone).toBeUndefined();
  expect(match.related[0]).toMatchObject({ id: items[2].id, anchored: true });
  // not among the items the caller passed: it is no longer theirs
  const gone = await matchEntity({
    env: {},
    userId: 'u',
    message: 'hello',
    todayStr: 'x',
    items,
    anchor: { id: '1234abcd-0000', type: 'todo', title: 'Walk Pepper' },
  });
  expect(gone.anchor).toMatchObject({ id: '1234abcd-0000', gone: true });
  delete globalThis.fetch;
});

test('an anchor the list fetch did not reach is looked up on its own', async () => {
  configureModels({ ENTITY_CARDS: 'on', OPENAI_API_KEY: 'k' });
  const env = { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 's' };
  const seen = [];
  const reply = (body) => new Response(JSON.stringify(body), { status: 200 });
  const serve = (row) => async (url) => {
    const u = String(url);
    seen.push(u);
    if (u.includes('/rest/v1/todos?id=eq.')) return reply(row ? [row] : []);
    if (u.includes('/rest/v1/')) return reply([]);
    return reply({
      choices: [{ message: { content: '{"refers":false,"about":[],"confidence":0}' } }],
    });
  };
  globalThis.fetch = serve({ id: 'ffff6666-0000', name: 'Walk Pepper', due_day: '2026-09-30' });
  const found = await matchEntity({
    env,
    userId: 'u',
    message: 'hello',
    todayStr: 'x',
    todayIso: '2026-09-29',
    anchor: { id: 'ffff6666-0000', type: 'todo', title: 'Walk Pepper' },
  });
  expect(
    seen.some((u) => u.includes('todos?id=eq.ffff6666-0000&owner_id=eq.u&completed_at=is.null')),
  ).toBe(true);
  expect(found.anchor).toMatchObject({
    id: 'ffff6666-0000',
    title: 'Walk Pepper',
    due_day: '2026-09-30',
  });
  // it joins the list the extraction reuses
  expect(found.all.some((i) => i.id === 'ffff6666-0000')).toBe(true);
  // done, archived or deleted: gone
  globalThis.fetch = serve(null);
  const gone = await matchEntity({
    env,
    userId: 'u',
    message: 'hello',
    todayStr: 'x',
    todayIso: '2026-09-29',
    anchor: { id: 'ffff6666-0000', type: 'todo', title: 'Walk Pepper' },
  });
  expect(gone.anchor).toMatchObject({ gone: true });
  delete globalThis.fetch;
});

test('the reply knows what the chat is about and never calls that item news', () => {
  const walk = { id: 'ffff6666-0000', type: 'todo', title: 'Walk Pepper', due_day: '2026-09-29' };
  const sec = anchorPromptSection(walk, '2026-09-29');
  expect(sec).toContain('=== WHAT THIS CHAT IS ABOUT ===');
  expect(sec).toContain('todo "Walk Pepper"');
  expect(sec).toContain('never tell them it is on their list');
  expect(sec).toContain('follow them');
  expect(sec).toContain('- todo "Walk Pepper", due today');
  // a card that took the turn over keeps its reply short: only what they know
  const short = anchorPromptSection(walk, '2026-09-29', { mode: 'entity_card' });
  expect(short).toContain('never tell them it is on their list');
  expect(short).not.toContain('follow them');
  expect(anchorPromptSection({ ...walk, gone: true }, '2026-09-29')).toContain(
    'no longer among their current items',
  );
  expect(
    anchorPromptSection({ id: 'j', type: 'note', subtype: 'journal', title: 'Rough Monday' }),
  ).toContain('journal entry "Rough Monday"');
  expect(anchorPromptSection(null)).toBe('');
  // said in passing about the anchored item: an offer, not news that it is on their list
  const card = {
    kind: 'edit',
    inPassing: true,
    entity: walk,
    change: { field: 'due_day', from: '2026-09-29', to: '2026-10-01' },
  };
  expect(entityCardPromptSection(card, { anchorId: walk.id })).not.toContain(
    'already on their list',
  );
  expect(entityCardPromptSection(card, { anchorId: walk.id })).toContain('offer to move it to');
  expect(entityCardPromptSection(card)).toContain('already on their list');
  // the items section counts it as known and marks it
  const theirs = theirItemsPromptSection(
    { related: [{ ...walk, anchored: true }], attention: [] },
    '2026-09-29',
    { mode: 'update', anchor: walk },
  );
  expect(theirs).toContain('This chat was opened about their todo "Walk Pepper"');
  expect(theirs).toContain('(the item this chat was opened about)');
  const plain = theirItemsPromptSection({ related: [walk], attention: [] }, '2026-09-29', {
    mode: 'update',
  });
  expect(plain).not.toContain('opened about');
});

// ── What the reply is told, in words it will not get wrong ──────────────────

test('a card names the item as it is set now, and the change, in words', () => {
  const vet = {
    id: 'v1',
    type: 'note',
    title: 'Pepper Vet Appointment',
    due_day: '2026-10-02',
    due_time: '15:00',
  };
  const timeCard = {
    kind: 'edit',
    entity: vet,
    change: { field: 'due_time', from: '15:00', to: '16:00' },
  };
  const sec = entityCardPromptSection(timeCard, { todayIso: '2026-09-29' });
  // the reply knows the day a time change is on
  expect(sec).toContain('note "Pepper Vet Appointment" (Friday 2 October at 15:00)');
  expect(sec).toContain('change its time to 16:00 on Friday 2 October');
  const todo = { id: 't1', type: 'todo', title: 'Call Kim and Andrew', due_day: '2026-09-29' };
  const move = entityCardPromptSection(
    {
      kind: 'edit',
      entity: todo,
      change: { field: 'due_day', from: '2026-09-29', to: '2026-10-02' },
    },
    { todayIso: '2026-09-29' },
  );
  expect(move).toContain('todo "Call Kim and Andrew" (due today, Tuesday 29 September)');
  expect(move).toContain('move it to Friday 2 October');
  expect(
    entityCardPromptSection(
      { kind: 'view', intent: 'view', entity: { id: 'x', type: 'todo', title: 'Undated' } },
      { todayIso: '2026-09-29' },
    ),
  ).toContain('todo "Undated" (no day set)');
  expect(
    entityCardPromptSection(
      {
        kind: 'view',
        intent: 'view',
        entity: { id: 'h', type: 'habit', title: 'Run', frequency: 'weekly' },
      },
      {},
    ),
  ).toContain('habit "Run" (weekly)');
});

test('a last card that only showed the item is not waiting on a tap', () => {
  const base = { id: 'v1', type: 'note', title: 'Pepper Vet Appointment', status: 'pending' };
  // older apps send only the status: as before
  expect(recentCardPromptSection(base)).toContain('waiting on their tap');
  expect(recentCardPromptSection({ ...base, card: { kind: 'edit' } })).toContain(
    'waiting on their tap',
  );
  const already = recentCardPromptSection({
    ...base,
    card: { kind: 'view', intent: 'view', already: true },
  });
  expect(already).toContain('already set the way they asked');
  expect(already).not.toContain('waiting on their tap');
  const shown = recentCardPromptSection({ ...base, card: { kind: 'view', intent: 'view' } });
  expect(shown).toContain('proposed no change');
  expect(shown).not.toContain('waiting on their tap');
  expect(recentCardPromptSection({ ...base, card: { kind: 'view', intent: 'confirm' } })).toContain(
    'check it was the one they meant',
  );
  expect(recentCardPromptSection({ ...base, card: { kind: 'view', intent: 'edit' } })).toContain(
    'without saying what to',
  );
});

test('the reply never offers a change an item already has, nor calls a look alike theirs', () => {
  const sec = theirItemsPromptSection({ related: [], attention: [] }, '2026-09-29', {
    mode: 'update',
  });
  expect(sec).toContain('Never offer to change an item to what it already is');
  expect(sec).toContain('only shares a word or a subject with what they said is a different thing');
});

test('the same-thing check has the last word on each item it answers for', async () => {
  configureModels({ ENTITY_CARDS: 'on', OPENAI_API_KEY: 'k' });
  const list = [{ id: 'e6fdc1b7-0000', type: 'todo', title: 'Plan Christmas In California' }];
  const answer = (content) => async () =>
    new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
  // the extractor was unsure and pointed at a listed item; the check says it is new
  globalThis.fetch = answer('{"results":[{"index":0,"same_as":null}]}');
  const cleared = await checkNewAgainstTracked(
    [{ type: 'todo', title: 'Renew passport', same_as: 'e6fdc1b7', evidence: 'x' }],
    list,
  );
  expect(cleared[0].same_as).toBeUndefined();
  // the check agrees: it stays that item
  globalThis.fetch = answer('{"results":[{"index":0,"same_as":"e6fdc1b7"}]}');
  const kept = await checkNewAgainstTracked(
    [{ type: 'todo', title: 'Plan a California Christmas', same_as: 'e6fdc1b7', evidence: 'x' }],
    list,
  );
  expect(kept[0].same_as).toBe('e6fdc1b7');
  // no answer for an item (the check failed): the extractor's mark stands
  globalThis.fetch = answer('{"results":[]}');
  const untouched = await checkNewAgainstTracked(
    [{ type: 'todo', title: 'x', same_as: 'e6fdc1b7', evidence: 'x' }],
    list,
  );
  expect(untouched[0].same_as).toBe('e6fdc1b7');
  delete globalThis.fetch;
});

// ── Several days in one check-in, and the check before a late card ─────────

test('a check-in for several days is one card with every day not yet logged', () => {
  const run = {
    id: 'hhhh0000-0000',
    type: 'habit',
    title: 'Strength',
    frequency: 'weekly',
    logged_days: ['2026-09-27'],
  };
  const cands = candidatesFor('m', [run], null);
  const answer = (value) => ({
    refers: true,
    entity_id: 'hhhh0000',
    intent: 'logged',
    change: { field: 'logged', value },
    confidence: 95,
  });
  const two = decideCard(answer(['2026-09-29', '2026-09-28']), cands);
  expect(two).toMatchObject({
    kind: 'edit',
    inPassing: true,
    change: { field: 'logged', to: '2026-09-29', days: ['2026-09-28', '2026-09-29'] },
  });
  // a day already logged drops out; one day left is a plain one day card
  const one = decideCard(answer(['2026-09-27', '2026-09-29']), cands);
  expect(one.change).toEqual({ field: 'logged', from: null, to: '2026-09-29' });
  // every day already logged: no card, the reply says so
  expect(decideCard(answer(['2026-09-27']), cands)).toMatchObject({
    kind: 'mention',
    loggedAlready: '2026-09-27',
  });
  // a single day as before
  expect(decideCard(answer('2026-09-29'), cands).change).toEqual({
    field: 'logged',
    from: null,
    to: '2026-09-29',
  });
  expect(entityCardPromptSection(two, { todayIso: '2026-09-29' })).toContain(
    'log it for yesterday, Monday 28 September and today, Tuesday 29 September',
  );
  expect(ENTITY_MATCH_SYSTEM_PROMPT).toContain('or a list of those days');
});

test('the extraction: check-ins on several days are one late card, logged days drop out', () => {
  const { tracked } = trackedItemsBlock(
    trackedRowsFromItems([
      { id: 'hhhh0000-0000', type: 'habit', title: 'Strength', logged_days: ['2026-09-27'] },
    ]),
    { editsOn: true },
  );
  const edit = (value) => ({
    entity_id: 'hhhh0000',
    field: 'logged',
    value,
    evidence: 'I did strength yesterday and today',
  });
  const { lateCard } = lateCardCandidate(
    { extractions: [], edits: [edit('2026-09-29'), edit('2026-09-28'), edit('2026-09-27')] },
    tracked,
    ['I did strength yesterday and today'],
  );
  expect(lateCard.change).toEqual({
    field: 'logged',
    from: null,
    to: '2026-09-29',
    days: ['2026-09-28', '2026-09-29'],
  });
});

test('the tracked items block is one builder for the Worker and the runner', () => {
  const rows = trackedRowsFromItems([
    {
      id: 'aaaa1111-0000',
      type: 'todo',
      title: 'Dentist',
      due_day: '2026-09-30',
      due_time: '14:00',
    },
    { id: 'cccc3333-0000', type: 'habit', title: 'Morning run', frequency: 'weekdays' },
    { id: 'nnnn0000-0000', type: 'note', title: 'Vet', due_day: '2026-10-02', due_time: '15:00' },
  ]);
  const { block, tracked } = trackedItemsBlock(rows, { editsOn: true });
  expect(block).toContain('- [todo id:aaaa1111] Dentist (due 2026-09-30 14:00)');
  expect(block).toContain('- [habit id:cccc3333] Morning run (weekdays)');
  expect(block).toContain('- [note id:nnnn0000] Vet (dated 2026-10-02 15:00)');
  expect(block).toContain('something is one of these only when it is the same thing');
  expect(tracked.get('aaaa1111')).toMatchObject({ id: 'aaaa1111-0000', type: 'todo' });
  // without entity cards: no ids, nothing tracked
  const plain = trackedItemsBlock(rows, { editsOn: false });
  expect(plain.block).toContain('- [todo] Dentist');
  expect(plain.tracked.size).toBe(0);
  expect(trackedItemsBlock({}, {}).block).toBe('');
});

test('what the reply is told about their items is built in one place, in order', () => {
  const cands = candidatesFor('m', items, null);
  const card = {
    kind: 'edit',
    inPassing: true,
    entity: cands[0],
    change: { field: 'due_day', from: null, to: '2026-10-01' },
  };
  const out = turnItemSections({
    match: { related: [cands[0]], attention: [] },
    card,
    recent: { ...cands[1], status: 'applied' },
    anchor: { id: 'zz', type: 'todo', title: 'Walk Pepper' },
    mode: 'update',
    todayIso: '2026-09-29',
  });
  const at = (h) => out.indexOf(h);
  expect(at('=== ENTITY CARD ===')).toBeGreaterThan(-1);
  expect(at('=== ENTITY CARD ===')).toBeLessThan(at('=== LAST CARD ==='));
  expect(at('=== LAST CARD ===')).toBeLessThan(at('=== WHAT THIS CHAT IS ABOUT ==='));
  expect(at('=== WHAT THIS CHAT IS ABOUT ===')).toBeLessThan(at('=== WHAT THEY HAVE ON ==='));
  // no anchor, no card: only what applies
  const bare = turnItemSections({
    match: { related: [], attention: [] },
    mode: 'update',
    todayIso: '2026-09-29',
  });
  expect(bare).not.toContain('=== ENTITY CARD ===');
  expect(bare).not.toContain('=== WHAT THIS CHAT IS ABOUT ===');
  expect(bare).toContain('=== WHAT THEY HAVE ON ===');
});

test('a late card is offered only when the check says their words asked for it', async () => {
  configureModels({ ENTITY_CARDS: 'on', OPENAI_API_KEY: 'k' });
  const card = {
    kind: 'edit',
    late: true,
    entity: { id: 'v1', type: 'note', title: 'Pepper Vet Appointment', due_day: '2026-10-02' },
    change: { field: 'body_add', from: null, to: 'I am busy tomorrow' },
  };
  let sent = null;
  const answer = (content) => async (_url, init) => {
    sent = JSON.parse(init.body);
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
  };
  const args = {
    card,
    message: 'I am busy tomorrow',
    exchanges: [{ userMsg: 'hi', assistantMsg: 'hello' }],
    todayStr: 'Tuesday, September 29, 2026',
    todayIso: '2026-09-29',
  };
  globalThis.fetch = answer('{"offer":false}');
  expect(await offerLateCard(args)).toBe(false);
  const input = sent.messages[1].content;
  expect(sent.messages[0].content).toBe(LATE_CARD_CHECK_PROMPT);
  expect(input).toContain('LATEST MESSAGE:\nI am busy tomorrow');
  expect(input).toContain('THEIR ITEM: their note "Pepper Vet Appointment" (Friday 2 October)');
  expect(input).toContain('PROPOSED CHANGE: add to it: I am busy tomorrow');
  expect(input).toContain('User: hi');
  globalThis.fetch = answer('{"offer":true}');
  expect(await offerLateCard(args)).toBe(true);
  // a failed check offers nothing
  globalThis.fetch = async () => {
    throw new Error('network');
  };
  expect(await offerLateCard(args)).toBe(false);
  expect(await offerLateCard({ ...args, card: null })).toBe(false);
  delete globalThis.fetch;
});

test('a tapped card says what it changed, from how the item was, with days in words', () => {
  const recent = {
    id: '1c947bef-0959-42f6-8844-6d65a693b539',
    type: 'todo',
    title: 'Call the Plumber',
    due_day: null,
    status: 'applied',
    summary: 'Done. Call the Plumber is now Tomorrow.',
    turns_ago: 1,
    card: { kind: 'edit', change: { field: 'due_day', from: null, to: '2026-10-01' } },
  };
  const s = recentCardPromptSection(recent, '2026-09-30');
  expect(s).toContain('=== LAST CARD ===');
  expect(s).toContain('"Call the Plumber" (no day set)');
  expect(s).toContain('move it to tomorrow, Thursday 1 October');
  expect(s).toContain('tapped Yes');
  expect(s).toContain('answer that yes');
  expect(s).toContain('how it was before');
  // the app's closing line was written when they tapped; the change itself is said instead
  expect(s).not.toContain('is now Tomorrow');
  // the same through the sections every chat path builds
  const all = turnItemSections({
    match: null,
    card: null,
    recent,
    anchor: null,
    mode: 'general',
    todayIso: '2026-09-30',
  });
  expect(all).toContain('move it to tomorrow, Thursday 1 October');
});

test('a tapped card from an older app, or with a change that cannot be right, uses the app’s words', () => {
  const base = {
    id: 't1',
    type: 'todo',
    title: 'Call the Plumber',
    due_day: null,
    status: 'applied',
    summary: 'Done. Call the Plumber is now Thu 1 Oct.',
  };
  for (const card of [
    undefined,
    { kind: 'edit' },
    { kind: 'edit', change: { field: 'due_day', to: 'Thursday' } },
    { kind: 'edit', change: { field: 'colour', to: 'red' } },
  ]) {
    const s = recentCardPromptSection({ ...base, card }, '2026-09-30');
    expect(s).toContain('Thu 1 Oct');
    expect(s).toContain('answer that yes');
    expect(s).not.toContain('proposing to');
  }
});

test('a tapped check-in for several days names each day', () => {
  const s = recentCardPromptSection(
    {
      id: 'h1',
      type: 'habit',
      title: 'Run',
      frequency: 'daily',
      status: 'applied',
      card: {
        kind: 'edit',
        change: {
          field: 'logged',
          from: null,
          to: '2026-09-30',
          days: ['2026-09-29', '2026-09-30'],
        },
      },
    },
    '2026-09-30',
  );
  expect(s).toContain('"Run" (daily)');
  expect(s).toContain(
    'log it for yesterday, Tuesday 29 September and today, Wednesday 30 September',
  );
});

test('the matcher is told a change they said yes to has been made, so a follow up asks for nothing new', () => {
  const items = [
    {
      id: 'aaaa1111-0000',
      type: 'todo',
      title: 'Plan Christmas In California',
      due_day: '2026-12-25',
    },
    { id: 'bbbb2222-0000', type: 'todo', title: 'Call Kim and Andrew', due_day: '2026-10-02' },
  ];
  const recent = {
    id: 'aaaa1111-0000',
    type: 'todo',
    title: 'Plan Christmas In California',
    status: 'applied',
    card: {
      kind: 'edit',
      change: { field: 'body_add', from: null, to: "Theo's parents are in from the 22nd" },
    },
  };
  const input = buildEntityMatchInput({
    todayStr: 'Wednesday, September 30, 2026',
    message: 'Did you do it?',
    previousExchange: null,
    exchanges: [],
    candidates: candidatesFor('Did you do it?', items, recent),
  });
  expect(input).toContain(
    "[shown on the card in the last reply, where they said yes to add to it: Theo's parents are in from the 22nd, which has been made]",
  );
  expect(ENTITY_MATCH_SYSTEM_PROMPT).toContain(
    'that change has been made, so a message that only follows up on it asks for nothing new',
  );
  // still waiting, or from an app that sends no change: shown only
  for (const r of [
    { ...recent, status: 'pending' },
    { ...recent, card: { kind: 'edit' } },
  ]) {
    const plain = buildEntityMatchInput({
      todayStr: 'Wednesday, September 30, 2026',
      message: 'Did you do it?',
      previousExchange: null,
      exchanges: [],
      candidates: candidatesFor('Did you do it?', items, r),
    });
    expect(plain).toContain('[shown on the card in the last reply]');
  }
});

test("the pill gives a new todo the day their words give, and a todo's day is a calendar day or nothing", () => {
  const prompt = buildPillPrompt({
    todayStr: 'Wednesday, September 30, 2026',
    conversationText: 'User: hi',
    existingItemsBlock: '',
  });
  expect(prompt).toContain(
    'WHEN, for todos: due_date is the one calendar day their words give for doing it',
  );
  expect(prompt).toContain(
    'When they settle on a day later in the conversation, the day is the one they settled on.',
  );
  expect(
    withValidDays([
      { type: 'todo', title: 'Call Mum', due_date: '2026-10-04' },
      { type: 'todo', title: 'Send the invoice', due_date: 'Friday' },
      { type: 'todo', title: 'Pension', due_date: null },
      { type: 'note', title: 'Idea' },
    ]).map((e) => e.due_date ?? null),
  ).toEqual(['2026-10-04', null, null, null]);
  expect(withValidDays(null)).toEqual([]);
});

test('a todo with a deadline and no day planned is due on its deadline and overdue after (stage 2c)', () => {
  const items = [
    { id: 'due', type: 'todo', title: 'Send the report', due_day: null, deadline: '2026-09-30' },
    { id: 'passed', type: 'todo', title: 'Pay the bill', due_day: null, deadline: '2026-09-27' },
    { id: 'none', type: 'todo', title: 'No day', due_day: null, deadline: null },
  ];
  const attention = attentionItems(items, '2026-09-29');
  expect(attention.map((c) => [c.id, c.overdue])).toEqual([
    ['due', false],
    ['passed', true],
  ]);
  const sec = theirItemsPromptSection({ related: [], attention }, '2026-09-29');
  expect(sec).toContain('"Send the report", due tomorrow');
  expect(sec).toContain(', its deadline, no day set');
  expect(sec).toContain('(overdue)');
});
