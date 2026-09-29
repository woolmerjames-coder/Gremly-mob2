/**
 * @jest-environment node
 *
 * The entity matcher: candidate ranking, turning the model's answer into a
 * card (or nothing), the prompt section, and the extraction's edits job.
 */
import {
  rankCandidates,
  decideCard,
  buildEntityMatchInput,
  entityCardPromptSection,
  matchEntity,
  CONFIDENCE_FLOOR,
} from '../entityMatch.js';
import {
  editsToPillItems,
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
  expect(sec).toContain('never say you have changed');
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
  const card = await matchEntity({
    env: {},
    userId: 'u',
    message: 'move my dentist to thursday',
    todayStr: 'Tuesday, September 29, 2026',
    items,
  });
  expect(card.kind).toBe('edit');
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
  expect(p).toContain("EDITS: When the user's own words say");
  expect(p).toContain('"edits":[{"entity_id":"<id from the list>"');
  expect(p.indexOf('EVIDENCE:')).toBeLessThan(p.indexOf('EDITS:'));
});
