/**
 * @jest-environment node
 *
 * The weekly summary written from the weekly pass (data fabric stage 5): the
 * plan as the writer's brief, the check on every card, and what stands after
 * it. Made up records only.
 */
import { factsForPlan, planBrief, summaryCheckRow, summaryFromPassMode } from '../summaryFromPass';
import {
  buildPlanWriterPrompt,
  checkDeck,
  deckParts,
  fallbackHero,
  finishDeck,
  recordLines,
  writePlannedDeck,
} from '../summaryPlanWriter';

jest.mock('../context/llm', () => ({ jsonCall: jest.fn() }));

const WEEK = [
  '2026-11-02',
  '2026-11-03',
  '2026-11-04',
  '2026-11-05',
  '2026-11-06',
  '2026-11-07',
  '2026-11-08',
];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function facts() {
  return {
    user: {
      user_id: 'u',
      tenure_days: 60,
      is_first_weekly: false,
      onboarding_at: null,
      current_tier: 'Hatchling',
      gremly_level: 3,
      name: 'Noor',
      pronouns: 'she/her',
    },
    week: {
      canonical_start: WEEK[0],
      canonical_end: WEEK[6],
      display_start: WEEK[0],
      display_end: WEEK[6],
      days_in_display: 7,
      date_lookup: Object.fromEntries(WEEK.map((d, i) => [d, DAYS[i]])),
    },
    fed: { days_in_window: 5, target: 7, graduated_this_window: false },
    totals: { drops: 12, journals: 2, todos_created: 0, todos_completed: 9 },
    durations: {
      days_since_onboarding: 60,
      consecutive_zero_fed_weeks: null,
      days_since_last_fed: 0,
    },
    entities: { user_name: 'Noor', user_address_rule: 'second person', other_people: [] },
    mood_arc: WEEK.map((d, i) => ({
      day_label: `${DAYS[i][0]} ${i + 2}`,
      date: d,
      day_of_week: DAYS[i],
      valence: null,
      moods: [],
    })),
    day_by_day: [],
    worlds: [],
    journal_quotes: [
      {
        id: 'q_2026-11-04_1',
        date: '2026-11-04',
        day_of_week: 'Wednesday',
        text: 'Walked to the river with Eli after work and felt lighter.',
        source: 'journal',
        note_id: 'n1',
      },
      {
        id: 'q_2026-11-06_2',
        date: '2026-11-06',
        day_of_week: 'Friday',
        text: 'A long day of packing boxes for the move.',
        source: 'journal',
        note_id: 'n2',
      },
    ],
    evidence: {
      rescheduled_todos: [],
      habit_cadence_mismatches: [],
      chapter_closures: [],
      aligned_worlds_count: 0,
    },
  };
}

const run = {
  id: 'run-1',
  model: 'claude-sonnet-5-5',
  prompt_version: 'weekly-2026-10-15a',
  status: 'applied',
  input_stats: {
    refs: [
      [
        'f1',
        {
          type: 'fact',
          id: 'a',
          statement: 'Noor is moving flat on 20 November.',
          about_date: '2026-11-20',
          state: 'planned',
          private: false,
          health: false,
        },
      ],
      [
        'f2',
        {
          type: 'fact',
          id: 'b',
          statement: 'Noor saw her doctor about her knee.',
          about_date: '2026-11-05',
          state: 'happened',
          private: true,
          health: true,
        },
      ],
      ['j1', { type: 'journal', id: 'n1', date: '2026-11-04' }],
      ['j2', { type: 'journal', id: 'n2', date: '2026-11-06' }],
      ['p1', { type: 'person', id: 'e', name: 'Eli', relationship: 'partner' }],
      ['p2', { type: 'person', id: 'm', name: 'Sam', relationship: null }],
      [
        'n1',
        {
          type: 'count',
          paths: ['week_counts.wrap_ups', 'week_counts.days'],
          line: 'wrap ups done on 4 of 7 days',
        },
      ],
    ],
    counts: { days: 7, wrap_ups: 4 },
  },
  output: {
    summary_plan: {
      character: 'A week of getting ready',
      through_line: 'Packing for the move, with time out by the river.',
      cards: [
        {
          about: 'The evening walk with Eli',
          refs: ['j1', 'p1'],
        },
        { about: 'The knee', refs: ['f2'] },
        {
          about: 'Packing for the move',
          refs: ['f1', 'j2', 'n1'],
        },
        { about: 'Packing with a sore knee', refs: ['f1', 'f2'] },
      ],
    },
  },
};

test('the switch is off unless it says beside or on', () => {
  expect(summaryFromPassMode({})).toBe('off');
  expect(summaryFromPassMode({ SUMMARY_FROM_PASS: 'beside' })).toBe('beside');
  expect(summaryFromPassMode({ SUMMARY_FROM_PASS: 'ON' })).toBe('on');
  expect(summaryFromPassMode({ SUMMARY_FROM_PASS: 'yes' })).toBe('off');
});

test('the plan as the brief: private and health facts never reach the writer', () => {
  const built = planBrief(run, facts(), 'u');
  expect(built.brief.source).toBe('plan');
  expect(built.brief.week_shape.classification).toBe('A week of getting ready');
  expect(built.brief.observations.map((o) => o.id)).toEqual(['p1', 'p2']);
  // a card that rests on anything private is not written, whatever else it rests on
  expect(built.dropped).toEqual([
    { about: 'The knee', why: 'it rests on what is private or about health' },
    { about: 'Packing with a sore knee', why: 'it rests on what is private or about health' },
  ]);
  const packing = built.brief.observations[1].evidence_snapshot;
  expect(packing.facts.map((f) => f.statement)).toEqual(['Noor is moving flat on 20 November.']);
  expect(packing.moments).toEqual([{ quote_id: 'q_2026-11-06_2', date: '2026-11-06' }]);
  expect(packing.counts).toEqual([
    { line: 'wrap ups done on 4 of 7 days', paths: ['week_counts.wrap_ups', 'week_counts.days'] },
  ]);
  expect(JSON.stringify(built.brief)).not.toContain('knee');
  expect(built.people).toEqual([{ name: 'Eli', relationship: 'partner' }]);
  expect(built.planned[1].refs).toEqual(['f1', 'j2', 'n1']);
});

test('a journal entry a private fact was read from is kept from the writer too', () => {
  const r = JSON.parse(JSON.stringify(run));
  r.input_stats.refs[1][1].note_id = 'n1';
  const built = planBrief(r, facts(), 'u');
  // the walk card rests on the private entry, so it is not written at all
  expect(built.planned.map((p) => p.about)).toEqual(['Packing for the move']);
  expect(built.dropped[0]).toEqual({
    about: 'The evening walk with Eli',
    why: 'it rests on what is private or about health',
  });
  expect(JSON.stringify(built.brief)).not.toContain('q_2026-11-04_1');
  const f = factsForPlan(facts(), built, r);
  expect(f.journal_quotes.map((q) => q.id)).toEqual(['q_2026-11-06_2']);
});

test('the figures carry the plan people, its dates and the counts', () => {
  const built = planBrief(run, facts(), 'u');
  const f = factsForPlan(facts(), built, run);
  expect(f.entities.other_people).toEqual([
    { name: 'Eli', relationship: 'partner', source: 'people_record' },
  ]);
  expect(f.week.date_lookup['2026-11-20']).toBe('Friday');
  expect(f.week_counts).toEqual({ days: 7, wrap_ups: 4, habits: [] });
  const prompt = buildPlanWriterPrompt(built.brief, f);
  expect(prompt).toContain('PLANNED CARDS, IN ORDER');
  expect(prompt).toContain('"wrap_ups": 4');
  expect(prompt).not.toMatch(/analyst/i);
});

function deck(over = {}) {
  return {
    classification: 'A week of getting ready',
    through_line: 'Packing, with time by the river',
    cards: [
      {
        shape: 'hero',
        eyebrow: 'Getting ready',
        headline: 'A week of getting ready',
        body: {
          subtitle: 'Boxes, and an evening by the river.',
          classification_chip: 'Getting ready',
          mood_arc: facts().mood_arc.map((c) => ({
            day_label: c.day_label,
            day_of_week: c.day_of_week,
            valence: null,
          })),
          stat_strip: [
            {
              value: '5',
              label: 'days fed',
              source: { type: 'hard_fact', path: 'fed.days_in_window' },
            },
          ],
          sources: [{ type: 'observation', id: 'p1' }],
        },
      },
      {
        shape: 'moment',
        eyebrow: 'November 4',
        body: {
          quote: 'Walked to the river with Eli',
          attribution: 'November 4, after work',
          source_journal_quote_id: 'q_2026-11-04_1',
          source_observation_id: 'p1',
        },
        anchor: { subject: 'the walk', observation_id: 'p1' },
      },
      {
        shape: 'stat',
        eyebrow: 'Wrap ups',
        body: {
          number: '4',
          unit: 'evenings',
          context: 'You closed out four evenings.',
          source: { type: 'hard_fact', path: 'week_counts.wrap_ups' },
        },
        anchor: { subject: 'wrap ups', observation_id: 'p2' },
      },
      {
        shape: 'letter',
        eyebrow: 'From your Gremly',
        body: {
          paragraphs: [
            {
              text: 'The river walk with Eli stood out.',
              sources: [{ type: 'observation', id: 'p1' }],
            },
            { text: 'The move is close now.', sources: [{ type: 'observation', id: 'p2' }] },
          ],
          signature: { name: 'Your Gremly', level: 3, state: 'content' },
        },
      },
    ],
    surfaced_anchors: [
      { subject: 'the walk', observation_id: 'p1', card_index: 1, card_shape: 'moment' },
      { subject: 'wrap ups', observation_id: 'p2', card_index: 2, card_shape: 'stat' },
    ],
    ...over,
  };
}

function setup() {
  const built = planBrief(run, facts(), 'u');
  return { brief: built.brief, f: factsForPlan(facts(), built, run) };
}

test('each card, and each paragraph of the letter, is asked about with only what it cites', () => {
  const { brief, f } = setup();
  const parts = deckParts(deck());
  expect(parts.map((p) => p.key)).toEqual(['0', '1', '2', '3.p0', '3.p1']);
  // the quote is their own words and is not asked about; the attribution is
  expect(parts[1].text).toContain('November 4, after work');
  expect(parts[1].text).not.toContain('Walked to the river');
  const lines = recordLines(parts[2].sources, brief, f);
  expect(lines).toContain('figure week_counts.wrap_ups: 4');
  expect(lines).toContain('counted by code: wrap ups done on 4 of 7 days');
  expect(recordLines(parts[1].sources, brief, f)).toContain('person: Eli, their partner');
});

test('a clean deck stands as written', async () => {
  const { brief, f } = setup();
  const ask = jest.fn(async () => ({ not_held: false, what: null }));
  const c = await checkDeck(deck(), brief, f, {
    ask,
    today: WEEK[6],
    person: { first_name: 'Noor' },
  });
  expect(c.deck).toEqual([]);
  expect([...c.parts.keys()]).toEqual([]);
  expect(ask).toHaveBeenCalledTimes(5);
  expect(ask.mock.calls[0][0].user).toContain('TODAY: Sunday 2026-11-08');
});

test('a card that did not hold goes back alone, and is left out when it still does not', async () => {
  const { brief, f } = setup();
  // the whole deck first; then each card that did not hold, alone, as it was
  const write = jest.fn(async (u) => {
    if (!u.rest) return deck();
    const at = Number(/card (\d+),/.exec(u.rest)[1]);
    return deck().cards[at];
  });
  // the stat card and the second paragraph say what their records do not hold, every time
  const ask = jest.fn(async (req) => ({
    not_held: /four evenings|close now/.test(req.user),
    what: 'not held',
  }));
  const r = await writePlannedDeck({}, brief, f, {
    ask,
    write,
    today: WEEK[6],
    person: { first_name: 'Noor' },
  });
  // one deck, then the stat card and the letter, each alone
  expect(write).toHaveBeenCalledTimes(3);
  const alone = write.mock.calls.slice(1).map((c) => c[0].rest);
  expect(alone.some((x) => x.includes('card 2, stat') && x.includes('not held'))).toBe(true);
  expect(alone.some((x) => x.includes('card 3, letter') && x.includes('paragraph 1:'))).toBe(true);
  expect(alone.every((x) => !x.includes('card 1,'))).toBe(true);
  expect(r.attempts).toBe(2);
  // the second check asks only about what was written again: the stat card and the letter's two paragraphs
  expect(ask).toHaveBeenCalledTimes(5 + 3);
  expect(r.deck.cards.map((c) => c.shape)).toEqual(['hero', 'moment', 'letter']);
  expect(r.deck.cards[2].body.paragraphs).toHaveLength(1);
  expect(r.left_out.map((x) => x.key)).toEqual(['2', '3.p1']);
  expect(r.deck.surfaced_anchors).toEqual([
    { subject: 'the walk', observation_id: 'p1', card_index: 1, card_shape: 'moment' },
  ]);
  const row = summaryCheckRow('u', WEEK[6], r);
  expect(row).toMatchObject({ job: 'weekly-summary', checked: 5, left_out: 2 });
  expect(JSON.stringify(row)).not.toContain('four evenings');
});

test('a card put right alone stands, and a deck wrong as a whole is written again whole', async () => {
  const { brief, f } = setup();
  const fixed = deck().cards[2];
  fixed.body.context = 'Wrap ups closed out your evenings.';
  const write = jest.fn(async (u) =>
    !u.rest ? deck() : u.rest.includes('ONE CARD') ? fixed : deck(),
  );
  const ask = jest.fn(async (req) => ({ not_held: /four evenings/.test(req.user), what: 'x' }));
  const r = await writePlannedDeck({}, brief, f, { ask, write, today: WEEK[6], person: null });
  expect(r.left_out).toEqual([]);
  expect(r.deck.cards[2].body.context).toBe('Wrap ups closed out your evenings.');
  // no hero: the deck is wrong as a whole and is written again whole
  const noHero = deck();
  noHero.cards.shift();
  const write2 = jest.fn(async (u) => (u.rest ? deck() : noHero));
  const r2 = await writePlannedDeck({}, brief, f, {
    ask: async () => ({ not_held: false, what: null }),
    write: write2,
    today: WEEK[6],
    person: null,
  });
  expect(write2.mock.calls[1][0].rest).toContain('WHAT WAS WRONG WITH THE LAST DECK');
  expect(r2.deck.cards[0].shape).toBe('hero');
});

test('the hero and the letter are asked about against the whole plan and the figures', async () => {
  const { brief, f } = setup();
  const ask = jest.fn(async () => ({ not_held: false, what: null }));
  await checkDeck(deck(), brief, f, { ask, today: WEEK[6], person: null });
  const hero = ask.mock.calls[0][0].user;
  expect(hero).toContain('person: Eli, their partner');
  expect(hero).toContain('fact (planned; the day it is about 2026-11-20): Noor is moving flat on 20 November.');
  expect(hero).toContain("the week's figures, worked out by code");
  expect(hero).toContain('fed on 5 of them');
  // the moment card rests on its own planned card only
  const moment = ask.mock.calls[1][0].user;
  expect(moment).not.toContain('moving flat');
});

test('a hero still wrong means no deck at all', () => {
  const { brief } = setup();
  const done = finishDeck(
    deck(),
    { deck: [], parts: new Map([['0', [{ step: 'words', say: 'x' }]]]), checked: 5 },
    brief,
  );
  expect(done.deck).toBeNull();
  expect(done.none).toMatch(/hero/);
});

test('a value code cannot find is laid on the card that wrote it', async () => {
  const { brief, f } = setup();
  const bad = deck();
  bad.cards[2].body.context = 'You closed out 17 evenings.';
  const c = await checkDeck(bad, brief, f, {
    ask: async () => ({ not_held: false, what: null }),
    today: WEEK[6],
    person: null,
  });
  expect(c.parts.get('2')?.[0]).toMatchObject({ step: 'code', say: 'fabricated number: 17' });
  expect(c.deck).toEqual([]);
});

test('a words question that cannot be asked leaves its part out', async () => {
  const { brief, f } = setup();
  const r = await writePlannedDeck({}, brief, f, {
    write: async () => deck(),
    ask: async (req) => {
      if (req.user.includes('four evenings')) throw new Error('down');
      return { not_held: false, what: null };
    },
    today: WEEK[6],
    person: null,
  });
  expect(r.left_out.map((x) => x.key)).toEqual(['2']);
  expect(r.tries[1].parts['2'][0].step).toBe('unasked');
});

test('the day of the week the mood arc echoes is not read as prose beside a date', async () => {
  const { brief, f } = setup();
  const d = deck();
  // a date in the subtitle sits near the arc's Monday once the hero is read as one text
  d.cards[0].body.subtitle = 'Boxes all week, and the move set for November 20.';
  const ask = jest.fn(async () => ({ not_held: false, what: null }));
  const c = await checkDeck(d, brief, f, { ask, today: WEEK[6], person: { first_name: 'Noor' } });
  const said = [...c.parts.values()].flat().map((p) => p.say);
  expect(said.filter((x) => /weekday\/date mismatch/.test(x))).toEqual([]);
});

test('a fact names the day it is about apart from the day it was recorded', () => {
  const r = JSON.parse(JSON.stringify(run));
  r.input_stats.refs[0][1].observed_at = '2026-11-03T10:00:00Z';
  const built = planBrief(r, facts(), 'u');
  const f = factsForPlan(facts(), built, r);
  const lines = recordLines([{ type: 'observation', id: 'p2' }], built.brief, f);
  expect(lines).toContain(
    'fact (planned; the day it is about 2026-11-20; recorded 2026-11-03): Noor is moving flat on 20 November.',
  );
});

test('what they added to their list or did is a record a card rests on, unless it is marked', () => {
  const r = JSON.parse(JSON.stringify(run));
  r.input_stats.refs.push(
    ['t1', { type: 'item', id: 'i1', title: 'Pack the kitchen', added: '2026-11-03', done: '2026-11-06' }],
    ['t2', { type: 'item', id: 'i2', title: 'Book a check up', added: '2026-11-04', done: null, health: true }],
  );
  r.output.summary_plan.cards = [
    { about: 'Packing the kitchen', refs: ['t1'] },
    { about: 'A booking', refs: ['t2', 'f1'] },
  ];
  const built = planBrief(r, facts(), 'u');
  expect(built.planned.map((p) => p.about)).toEqual(['Packing the kitchen']);
  expect(built.dropped).toEqual([{ about: 'A booking', why: 'it rests on what is private or about health' }]);
  const f = factsForPlan(facts(), built, r);
  expect(recordLines([{ type: 'observation', id: 'p1' }], built.brief, f)).toEqual([
    'on their list: Pack the kitchen (added 2026-11-03; done 2026-11-06)',
  ]);
});

test('a hero that still does not hold is written three times more, alone and at once, before it falls back', async () => {
  const { brief, f } = setup();
  const write = jest.fn(async (u) => (u.rest ? deck().cards[0] : deck()));
  let heroAsked = 0;
  const ask = jest.fn(async (req) => {
    const hero = req.user.includes('Boxes, and an evening by the river.');
    if (hero) heroAsked += 1;
    return { not_held: hero && heroAsked < 3, what: 'not held' };
  });
  const r = await writePlannedDeck({}, brief, f, { ask, write, today: WEEK[6], person: null });
  // the deck, the hero alone, then three heroes alone at once; the first of them holds
  expect(write).toHaveBeenCalledTimes(5);
  expect(write.mock.calls.slice(1).every((c) => c[0].rest.includes('card 0, hero'))).toBe(true);
  expect(heroAsked).toBe(3);
  expect(r.attempts).toBe(3);
  expect(r.deck).not.toBeNull();
  expect(r.left_out).toEqual([]);
});

test('a number code cannot find is laid only on the parts whose own words hold it', async () => {
  const { brief, f } = setup();
  const d = deck();
  // the stat card says 17; the hero's arc and the moment's date hold 17 only in fields code fills
  d.cards[2].body.number = '17';
  d.cards[0].body.mood_arc[0].day_label = 'T 17';
  const ask = jest.fn(async () => ({ not_held: false, what: null }));
  const c = await checkDeck(d, brief, f, { ask, today: WEEK[6], person: null });
  const owners = [...c.parts.entries()]
    .filter(([, list]) => list.some((p) => /fabricated number: 17/.test(p.say)))
    .map(([k]) => k);
  expect(owners).toEqual(['2']);
  expect(c.deck).toEqual([]);
});


// ── stage 7: the summary always reaches the person ─────────────────────────

test('a second reader of another family is asked only when the first says a card does not hold, and its yes keeps the card', async () => {
  const { brief, f } = setup();
  const ask = jest.fn(async (req) => ({ not_held: /four evenings/.test(req.user), what: 'not held' }));
  const confirm = jest.fn(async () => ({ not_held: false, what: null }));
  const c = await checkDeck(deck(), brief, f, { ask, confirm, today: WEEK[6], person: null });
  expect(confirm).toHaveBeenCalledTimes(1);
  expect([...c.parts.keys()]).toEqual([]);
  expect(c.held_by_second).toEqual(['2']);
  // both say it does not hold: it does not
  const c2 = await checkDeck(deck(), brief, f, { ask, confirm: async () => ({ not_held: true, what: 'x' }), today: WEEK[6], person: null });
  expect([...c2.parts.keys()]).toEqual(['2']);
  // the second cannot be asked: the first answer stands
  const c3 = await checkDeck(deck(), brief, f, { ask, confirm: async () => { throw new Error('down'); }, today: WEEK[6], person: null });
  expect([...c3.parts.keys()]).toEqual(['2']);
});

test('a card the first reader finds wrong is written again before the second reader is asked, which keeps it only then', async () => {
  const { brief, f } = setup();
  // the card still reads the same after its rewrite: the second reader decides
  const write = jest.fn(async (u) => (!u.rest ? deck() : deck().cards[2]));
  const ask = async (req) => ({ not_held: /four evenings/.test(req.user), what: 'not held' });
  const confirm = jest.fn(async () => ({ not_held: false, what: null }));
  const r = await writePlannedDeck({}, brief, f, { ask, confirm, write, today: WEEK[6], person: null });
  expect(write).toHaveBeenCalledTimes(2);
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(r.left_out).toEqual([]);
  expect(r.held_by_second).toEqual(['2']);
});

test('a card sent back alone is told to change only the words that do not hold', async () => {
  const { brief, f } = setup();
  const write = jest.fn(async (u) => (!u.rest ? deck() : deck().cards[2]));
  const ask = async (req) => ({ not_held: /four evenings/.test(req.user), what: 'not held' });
  await writePlannedDeck({}, brief, f, { ask, write, today: WEEK[6], person: null });
  expect(write.mock.calls[1][0].rest).toContain('changing only the words that do not hold, as little as you can');
});

test('a hero that still does not hold is written three times more at once, and the first that holds is kept', async () => {
  const { brief, f } = setup();
  let heroTries = 0;
  const write = jest.fn(async (u) => {
    if (!u.rest) return deck();
    heroTries += 1;
    const hero = deck().cards[0];
    // the third try holds
    hero.body.subtitle = heroTries === 3 ? 'Boxes packed.' : 'Boxes every single day.';
    return hero;
  });
  const ask = async (req) => ({ not_held: /every single day|an evening by the river/.test(req.user), what: 'not held' });
  const r = await writePlannedDeck({}, brief, f, { ask, write, today: WEEK[6], person: null });
  // the deck, the hero alone, then three heroes at once
  expect(write).toHaveBeenCalledTimes(5);
  expect(r.deck.cards[0].body.subtitle).toBe('Boxes packed.');
  expect(r.hero_fell_back).toBeUndefined();
});

test("a hero no try can make true falls back to the plan's character and the week's figures, and the deck is sent", async () => {
  const { brief, f } = setup();
  const write = jest.fn(async (u) => (!u.rest ? deck() : deck().cards[0]));
  const ask = async (req) => ({ not_held: /an evening by the river|Getting ready/.test(req.user), what: 'not held' });
  const r = await writePlannedDeck({}, brief, f, { ask, write, today: WEEK[6], person: null });
  expect(r.hero_fell_back).toBe(true);
  expect(r.deck).not.toBeNull();
  const hero = r.deck.cards[0];
  expect(hero).toMatchObject({ shape: 'hero', eyebrow: '', headline: '' });
  expect(hero.body).toMatchObject({ subtitle: '', classification_chip: 'A week of getting ready', fallback: true });
  expect(hero.body.stat_strip).toEqual(deck().cards[0].body.stat_strip);
  expect(r.deck.cards.map((c) => c.shape)).toEqual(['hero', 'moment', 'stat', 'letter']);
  const row = summaryCheckRow('u', WEEK[6], r);
  expect(row.details.find((d) => d.field === 'card_0').outcome).toBe('fell_back');
});

test('the fallback hero keeps only what code wrote, beside the character', () => {
  const hero = fallbackHero(deck().cards[0], 'A week of getting ready');
  expect(hero.body.mood_arc).toEqual(deck().cards[0].body.mood_arc);
  expect(hero.body.sources).toEqual(deck().cards[0].body.sources);
  expect(JSON.stringify(hero)).not.toContain('river');
});
