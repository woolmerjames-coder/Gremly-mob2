/**
 * The weekly replay's made up weeks (data fabric stage 5): each is a person's
 * database as the weekly pass reads it on their weekly day, and what the pass
 * and the summary written from it must get right. Every name, place and record
 * here is made up.
 *
 *   full    a full week, with someone whose relationship was never stated
 *   quiet   a week with few records
 *   return  a week back after three weeks away
 *   health  a week that turns on a private matter of health
 *   unsure  a week whose records point to who someone is, and to more of
 *           her life, than they state (what Gremly is not sure of yet)
 */

export const USER = '00000000-0000-4000-8000-0000000000bb';
export const TZ = 'America/New_York';

// New York is four hours behind UTC until 1 November 2026, five after
const offsetHours = (day) => (day < '2026-11-01' ? 4 : 5);
export function at(day, hhmm = '12:00') {
  const [h, m] = hhmm.split(':').map(Number);
  const [y, mo, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h + offsetHours(day), m)).toISOString();
}

let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

const fact = (key, statement, over = {}) => ({
  id: uuid(),
  key,
  user_id: USER,
  statement,
  subject: null,
  kind: 'event',
  timing: 'day',
  state: 'happened',
  about_date: null,
  about_date_end: null,
  private: false,
  health: false,
  observed_at: at('2026-11-01'),
  last_confirmed_at: at('2026-11-01'),
  updated_at: at('2026-11-01'),
  state_reason: null,
  source_table: null,
  source_id: null,
  correction_text: null,
  corrected_at: null,
  ...over,
});
const journal = (key, day, time, title, body) => ({
  id: uuid(),
  key,
  owner_id: USER,
  subtype: 'journal',
  journal_subtype: null,
  canonical_type: 'log',
  title,
  body,
  mood: null,
  date: day,
  captured_at: at(day, time),
  archived: false,
  created_at: at(day, time),
});
const said = (day, time, content) => ({
  id: uuid(),
  user_id: USER,
  role: 'user',
  content,
  metadata_json: null,
  created_at: at(day, time),
});
const todo = (title, made, over = {}) => ({
  id: uuid(),
  owner_id: USER,
  title,
  name: title,
  due_day: null,
  status: 'active',
  completed_at: null,
  created_at: at(made, '09:00'),
  ...over,
});
const person = (key, name, relationship) => ({
  id: uuid(),
  key,
  user_id: USER,
  name,
  relationship,
  merged_into: null,
  hidden_at: null,
  updated_at: at('2026-11-01'),
});
/** Which facts are about which people, by their keys. */
const ties = (facts, people, pairs) =>
  pairs.map(([factKey, personKey]) => ({
    fact_id: facts.find((f) => f.key === factKey).id,
    person_id: people.find((p) => p.key === personKey).id,
    user_id: USER,
  }));
const thread = (day, m = {}) => ({
  id: uuid(),
  user_id: USER,
  chat_type: 'daily',
  created_at: at(day, '06:00'),
  metadata_json: { ritual_day: day, seen_at: at(day, '07:30'), ...m },
});
const habit = (name, cadence, target) => ({
  id: uuid(),
  owner_id: USER,
  name,
  title: name,
  cadence,
  target_per_period: target,
  archived: false,
});
const days = (from, count) =>
  Array.from({ length: count }, (_, i) => {
    const d = new Date(`${from}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });

/** What every made up person has around their records. */
function base({ name, pronouns, tables, absence, onboarded = '2026-08-20', moods = {}, fed = {} }) {
  const all = {
    life_facts: [],
    life_fact_changes: [],
    notes: [],
    scope_chat_messages: [],
    todos: [],
    habits: [],
    habit_progress: [],
    habit_not_held: [],
    user_life_map: [],
    worlds: [],
    drop_world_links: [],
    gremly_questions: [],
    chapters: [],
    story_items: [],
    life_people: [],
    weekly_summaries: [],
    scope_chats: [],
    item_changes: [],
    notification_preferences: [{ user_id: USER, timezone: TZ }],
    user_profiles: [
      { user_id: USER, timezone: TZ, identity: { name, pronouns }, profile_text: `${name}.` },
    ],
    cortex_preferences: [
      {
        owner_id: USER,
        current_tier: 'Hatchling',
        gremly_age: 4,
        trial_started_at: at(onboarded),
        onboarding_completed_at: at(onboarded),
        day_boundary_hour: 3,
      },
    ],
    daily_ritual_progress: [],
    ...tables,
  };
  return {
    tables: all,
    identity: { first_name: name, pronouns, identity: {} },
    rpc: {
      absence_snapshot: () => absence,
      usage_rollup: () => ({ periods: [] }),
      summary_hero_spine: ({ p_week_start }) => ({
        drops: all.notes.length + all.todos.length,
        done: all.todos.filter((t) => t.completed_at).length,
        habits_active: all.habits.length,
        per_day_moods: days(p_week_start, 7).map((day) => ({ day, moods: moods[day] || [] })),
        worlds: all.worlds.map((w) => ({ name: w.name, delta: 'holding steady' })),
      }),
      summary_detect_reschedule_as_soft_no: () => ({}),
      summary_detect_cadence_calibration_mismatch: () => ({}),
      summary_detect_decisive_closure: () => ({}),
      summary_detect_cross_domain_alignment: () => ({}),
      person_identity: () => [{ first_name: name, pronouns, identity: {} }],
    },
    fed,
  };
}

const WEEK = days('2026-11-02', 7);

// ── full: a full week, with Sam, whose relationship was never stated ────────

function full() {
  const people = [
    person('eli', 'Eli', 'partner'),
    person('mira', 'Mira', 'sister'),
    person('priya', 'Priya', 'manager'),
    person('sam', 'Sam', null),
  ];
  const facts = [
    fact('hudson', 'Noor and Eli went away to Hudson for their anniversary weekend, 6 to 8 November.', {
      about_date: '2026-11-06',
      about_date_end: '2026-11-08',
    }),
    fact('anniv', "Noor and Eli's anniversary is on 12 November.", {
      timing: 'yearly',
      state: 'current',
      about_date: '2025-11-12',
    }),
    fact('mira-job', "Noor's sister Mira starts a new job at the museum on 9 November.", {
      state: 'planned',
      about_date: '2026-11-09',
    }),
    fact('mira-lunch', 'Noor had lunch with her sister Mira on 5 November.', { about_date: '2026-11-05' }),
    fact('grant', 'Noor is waiting to hear about the grant, with a decision expected by 13 November.', {
      state: 'planned',
      about_date: '2026-11-13',
    }),
    fact('swim', 'Noor swims before work most mornings.', { timing: 'standing', state: 'current' }),
    fact('lisbon', 'Noor is going to Lisbon for work from 17 to 20 November.', {
      state: 'planned',
      about_date: '2026-11-17',
      about_date_end: '2026-11-20',
    }),
    fact('deck', 'Noor finished and sent the Hartley pitch deck on 4 November.', { about_date: '2026-11-04' }),
    fact('desk', 'Sam helped Noor carry her new desk up the stairs on 7 November.', { about_date: '2026-11-07' }),
    fact('priya', "Noor's manager Priya praised the Hartley deck on 5 November.", { about_date: '2026-11-05' }),
    fact('physio', 'Noor has been seeing a physiotherapist for her shoulder.', {
      timing: 'standing',
      state: 'current',
      private: true,
      health: true,
    }),
    fact('argument', 'Noor and Eli argued about money on 3 November.', { about_date: '2026-11-03', private: true }),
    fact('river-run', 'Noor went for a run along the river on 1 November.', { about_date: '2026-11-01' }),
    // a race whose day has passed, still held as planned, behind a Chapter with no end set
    fact('river', 'Noor planned to run the Riverside 10K on 18 October.', {
      state: 'planned',
      about_date: '2026-10-18',
      observed_at: at('2026-09-01'),
      last_confirmed_at: at('2026-09-01'),
      updated_at: at('2026-09-01'),
    }),
  ];
  const swim = habit('Swim before work', 'weekly', 4);
  const call = habit('Call Mum', 'weekly', 1);
  const t1 = todo('Send the Hartley deck', '2026-10-30', { due_day: '2026-11-04', status: 'completed', completed_at: at('2026-11-04', '17:00') });
  const t2 = todo('Book flights to Lisbon', '2026-11-02', { due_day: '2026-11-06' });
  const t3 = todo('Find Eli an anniversary present', '2026-11-03', { due_day: '2026-11-07', status: 'completed', completed_at: at('2026-11-07', '15:00') });
  const t4 = todo('Renew passport photos', '2026-10-28', { due_day: '2026-11-05' });
  const s = base({
    name: 'Noor',
    pronouns: 'she/her',
    absence: { last_active_day: '2026-11-08', active_days_last_7: 7, active_days_last_30: 26 },
    moods: { '2026-11-04': ['relieved'], '2026-11-08': ['happy', 'rested'] },
    tables: {
      life_facts: facts,
      life_people: people,
      life_fact_people: ties(facts, people, [
        ['hudson', 'eli'],
        ['anniv', 'eli'],
        ['argument', 'eli'],
        ['mira-job', 'mira'],
        ['mira-lunch', 'mira'],
        ['priya', 'priya'],
        ['desk', 'sam'],
      ]),
      notes: [
        journal('j-deck', '2026-11-04', '21:00', 'Wednesday', 'Finally sent the Hartley deck. Walked home the long way along the river and felt lighter than I have in weeks.'),
        journal('j-mira', '2026-11-05', '22:00', 'Thursday', 'Lunch with Mira. She starts at the museum on Monday and she is so nervous. I told her she will be brilliant, because she will.'),
        journal('j-hudson', '2026-11-08', '10:00', 'Sunday', 'Hudson was exactly what we needed. Slept late, long walks, no laptop. Sam was a hero with the desk yesterday too.'),
      ],
      scope_chat_messages: [
        said('2026-11-03', '19:00', 'Long day. Mostly fighting with slides.'),
        said('2026-11-06', '08:00', 'Off to Hudson with Eli this afternoon!'),
      ],
      todos: [t1, t2, t3, t4],
      habits: [swim, call],
      habit_progress: [
        { habit_id: swim.id, occurred_day: '2026-11-02' },
        { habit_id: swim.id, occurred_day: '2026-11-03' },
        { habit_id: swim.id, occurred_day: '2026-11-05' },
      ],
      habit_not_held: [{ owner_id: USER, habit_id: call.id, day: '2026-11-08' }],
      scope_chats: [
        thread('2026-11-02', { answered_at: at('2026-11-02', '07:40'), plan_locked_at: at('2026-11-02', '07:45') }),
        thread('2026-11-03', { answered_at: at('2026-11-03', '07:35') }),
        thread('2026-11-04', {
          answered_at: at('2026-11-04', '07:50'),
          plan_locked_at: at('2026-11-04', '07:55'),
          sweep: { step: 'done', decisions: [{ out: 'kept' }, { out: 'let_go' }] },
        }),
        thread('2026-11-05', {
          answered_at: at('2026-11-05', '07:30'),
          sweep: { step: 'done', decisions: [{ out: 'kept' }, { out: 'kept' }] },
        }),
        thread('2026-11-07', { sweep: { step: 'done', decisions: [{ out: 'let_go' }] } }),
      ],
      item_changes: [
        { owner_id: USER, table_name: 'todos', row_id: t2.id, op: 'update', fields: ['due_day'], by: 'person', at: at('2026-11-05', '20:00') },
        { owner_id: USER, table_name: 'todos', row_id: t4.id, op: 'update', fields: ['due_day'], by: 'person', at: at('2026-11-04', '20:00') },
        { owner_id: USER, table_name: 'todos', row_id: t4.id, op: 'update', fields: ['due_day'], by: 'person', at: at('2026-11-06', '20:00') },
      ],
      worlds: [
        { id: uuid(), owner_id: USER, name: 'Work', display_name: 'Work', phase: 'active', card_subtitle: 'The Hartley deck', card_subtitle_source: 'words', summary: 'Noor works on client pitches.', summary_source: 'synthesis', key_priorities: [], last_signal_at: at('2026-11-04') },
        { id: uuid(), owner_id: USER, name: 'Family', display_name: 'Family', phase: 'active', card_subtitle: 'Mira and Mum', card_subtitle_source: 'words', summary: 'Noor is close to her sister Mira.', summary_source: 'synthesis', key_priorities: [], last_signal_at: at('2026-11-05') },
      ],
      chapters: [
        { id: uuid(), owner_id: USER, title: 'Lisbon work trip', title_source: 'user', chapter_type: 'trip', phase: 'upcoming', start_date: '2026-11-17', end_date: '2026-11-20', closed_at: null, card_subtitle: '', card_subtitle_source: null, summary: '', summary_source: null, epigraph: '', epigraph_source: null, key_priorities: [], current_phase_key: null, phase_labels: [] },
        // a Chapter shared with someone: Eli is part of it, through facts that can be shown
        { id: uuid(), key: 'hudson', owner_id: USER, title: 'Anniversary weekend in Hudson', title_source: 'user', chapter_type: 'trip', phase: 'closed', start_date: '2026-11-06', end_date: '2026-11-08', closed_at: at('2026-11-08', '20:00'), card_subtitle: '', card_subtitle_source: null, summary: '', summary_source: null, epigraph: '', epigraph_source: null, key_priorities: [], current_phase_key: null, phase_labels: [] },
        // still open with no end set, though the day it built towards has passed
        // and its earlier notes, like what was filed in it since, speak of a season of running and swimming
        { id: uuid(), key: 'river', owner_id: USER, title: 'Riverside 10K training', title_source: 'user', chapter_type: 'bounded', phase: 'active', start_date: '2026-08-15', end_date: null, end_date_source: null, closed_at: null, card_subtitle: 'Your runs by the river and swims before work', card_subtitle_source: 'words', summary: 'A season of running and swimming that began in August, with swims before work most mornings.', summary_source: 'synthesis', epigraph: '', epigraph_source: null, key_priorities: [], current_phase_key: 'Ongoing', phase_labels: [] },
      ],
      weekly_summaries: [
        {
          user_id: USER,
          week_start_date: '2026-10-26',
          content: {
            through_line: 'Back in the pool, waiting on the grant',
            cards: [
              { shape: 'hero' },
              { shape: 'stat', anchor: { subject: 'Swimming before work' } },
              { shape: 'question', anchor: { subject: 'The grant wait' } },
            ],
          },
        },
      ],
      daily_ritual_progress: WEEK.map((d, i) => ({
        owner_id: USER,
        ritual_day: d,
        is_fed: i !== 5,
        drops_count: 2,
        sweeps_count: [2, 3, 4].includes(i) ? 1 : 0,
      })),
    },
  });
  return {
    id: 'full',
    look: 'A full week: the plan picks a few real moments of it, names Sam without a relationship, and keeps the private and health facts off its character and line.',
    periodEnd: '2026-11-08',
    ...s,
    truth: {
      cards: [2, 5],
      private: ['physio', 'argument'],
      health: ['physio'],
      unstated: ['sam'],
      // what the last summary showed, which the plan moves on from
      shownBefore: ['swim'],
      // who is part of each Chapter
      chapterPeople: { hudson: ['eli'] },
      // the day each Chapter ends, from a fact it cites
      chapterEnds: { river: '2026-10-18' },
    },
  };
}

// ── quiet: a week with few records ──────────────────────────────────────────

function quiet() {
  const s = base({
    name: 'Omar',
    pronouns: 'he/him',
    absence: { last_active_day: '2026-11-07', active_days_last_7: 2, active_days_last_30: 14 },
    tables: {
      life_facts: [
        fact('garden', 'Omar planted bulbs in the back garden on 7 November.', { about_date: '2026-11-07' }),
        fact('job', 'Omar works as a nurse on night shifts.', { timing: 'standing', state: 'current' }),
      ],
      life_people: [person('lena', 'Lena', 'daughter')],
      notes: [journal('j-bulbs', '2026-11-07', '16:00', 'Saturday', 'Got the tulip bulbs in before the frost. Lena helped for an hour.')],
      todos: [todo('Buy tulip bulbs', '2026-11-03', { status: 'completed', completed_at: at('2026-11-06', '12:00'), due_day: '2026-11-06' })],
      scope_chats: [thread('2026-11-03', { answered_at: at('2026-11-03', '16:00') }), thread('2026-11-07')],
      daily_ritual_progress: WEEK.map((d, i) => ({ owner_id: USER, ritual_day: d, is_fed: i === 5, drops_count: i === 5 ? 2 : 0, sweeps_count: 0 })),
    },
  });
  return {
    id: 'quiet',
    look: 'A quiet week: one or two cards on what was really there, nothing padded, and the quiet never held against him.',
    periodEnd: '2026-11-08',
    ...s,
    truth: { cards: [1, 2], private: [], health: [], unstated: [] },
  };
}

// ── return: back after three weeks away ─────────────────────────────────────

function back() {
  const s = base({
    name: 'Ana',
    pronouns: 'she/her',
    absence: { last_active_day: '2026-11-08', active_days_last_7: 3, active_days_last_30: 3 },
    tables: {
      life_facts: [
        fact('away', 'Ana stayed with her dad in Leeds for three weeks, from 12 October to 1 November.', {
          about_date: '2026-10-12',
          about_date_end: '2026-11-01',
        }),
        fact('home', 'Ana came home from Leeds on 1 November.', { about_date: '2026-11-01' }),
        fact('studio', 'Ana went back to her pottery studio on 6 November.', { about_date: '2026-11-06' }),
        fact('dad', "Ana's dad is recovering from a hip operation.", { timing: 'standing', state: 'current', private: true, health: true }),
      ],
      life_people: [person('dad', 'Dad', 'father'), person('jo', 'Jo', 'friend')],
      notes: [
        journal('j-back', '2026-11-06', '18:00', 'Friday', 'First day back at the studio. My hands remembered more than I thought they would.'),
        journal('j-jo', '2026-11-08', '11:00', 'Sunday', 'Coffee with Jo. It is strange being home, everything looks the same and I feel different.'),
      ],
      scope_chat_messages: [said('2026-11-06', '09:00', 'I am back. Three weeks away, so much to catch up on.')],
      todos: [todo('Reply to the gallery about the spring show', '2026-11-06', { due_day: '2026-11-09' })],
      scope_chats: [
        thread('2026-11-06', { answered_at: at('2026-11-06', '09:00') }),
        thread('2026-11-07', { answered_at: at('2026-11-07', '08:30') }),
        thread('2026-11-08', {}),
      ],
      daily_ritual_progress: WEEK.map((d, i) => ({ owner_id: USER, ritual_day: d, is_fed: i >= 4, drops_count: i >= 4 ? 1 : 0, sweeps_count: 0 })),
    },
  });
  s.tables.life_fact_people = ties(s.tables.life_facts, s.tables.life_people, [
    ['away', 'dad'],
    ['dad', 'dad'],
  ]);
  return {
    id: 'return',
    look: 'A week back after three weeks away: the plan is about coming back, never about the weeks missed, and her dad’s health stays off its character and line.',
    periodEnd: '2026-11-08',
    ...s,
    truth: { cards: [1, 3], private: ['dad'], health: ['dad'], unstated: [] },
  };
}

// ── health: a week that turns on a private matter of health ─────────────────

function health() {
  // the ledger reads her list as it reads her notes: the physio todo becomes a
  // fact about her health, and the todo is marked as the fact is
  const physio = todo('Physio exercises', '2026-11-04', { due_day: '2026-11-06', status: 'completed', completed_at: at('2026-11-06', '10:00') });
  const s = base({
    name: 'Rosa',
    pronouns: 'she/her',
    absence: { last_active_day: '2026-11-08', active_days_last_7: 6, active_days_last_30: 24 },
    moods: { '2026-11-03': ['anxious'], '2026-11-05': ['tired'], '2026-11-08': ['grateful'] },
    tables: {
      life_facts: [
        fact('op', 'Rosa had an operation on her knee on 3 November.', {
          about_date: '2026-11-03',
          private: true,
          health: true,
          // read from her journal entry that day
          source_table: 'notes',
          source_id: 'note-op',
        }),
        fact('rest', 'Rosa is off work recovering until 16 November.', {
          state: 'planned',
          about_date: '2026-11-03',
          about_date_end: '2026-11-16',
          private: true,
          health: true,
        }),
        fact('soup', 'Rosa’s brother Tom brought her soup on 5 November.', { about_date: '2026-11-05' }),
        fact('book', 'Rosa finished reading a long novel on 7 November.', { about_date: '2026-11-07' }),
        fact('choir', 'Rosa sings in a community choir on Tuesdays.', { timing: 'standing', state: 'current' }),
        fact('physio', 'Rosa did her physio exercises on 6 November.', {
          about_date: '2026-11-06',
          health: true,
          source_table: 'todos',
          source_id: physio.id,
        }),
      ],
      life_people: [person('tom', 'Tom', 'brother')],
      notes: [
        { ...journal('j-op', '2026-11-03', '20:00', 'Tuesday', 'Knee op done. Groggy and sore but it went fine. Missed choir for the first time this year.'), id: 'note-op' },
        journal('j-tom', '2026-11-05', '19:00', 'Thursday', 'Tom turned up with soup and stayed for two episodes. I needed that more than the soup.'),
        journal('j-book', '2026-11-07', '21:00', 'Saturday', 'Finished the novel I have been carrying around since summer. Being stuck on the sofa has its uses.'),
      ],
      todos: [physio],
      scope_chats: days('2026-11-03', 6).map((d) => thread(d, { answered_at: at(d, '09:00') })),
      daily_ritual_progress: WEEK.map((d, i) => ({ owner_id: USER, ritual_day: d, is_fed: i > 0, drops_count: 1, sweeps_count: 0 })),
    },
  });
  s.tables.life_fact_people = ties(s.tables.life_facts, s.tables.life_people, [['soup', 'tom']]);
  return {
    id: 'health',
    look: 'A week that turns on a private matter of health: the plan finds what else was in it, and her health is never its character or its line.',
    periodEnd: '2026-11-08',
    ...s,
    truth: { cards: [1, 4], private: ['op', 'rest'], health: ['op', 'rest', 'physio'], unstated: [] },
  };
}

// ── unsure: records that point further than they state ─────────────────────

function unsure() {
  const people = [
    person('theo', 'Theo', null),
    person('ray', 'Ray', null),
    person('kit', 'Kit', 'friend'),
  ];
  const facts = [
    fact('swim', 'Bea took Theo to his swimming lesson on 3 November.', { about_date: '2026-11-03' }),
    fact('school', 'Bea dropped Theo at school with his lunch box on 4 November.', { about_date: '2026-11-04' }),
    fact('play', "Theo's school play is on 12 November.", { state: 'planned', about_date: '2026-11-12' }),
    fact('care', 'Bea visited Ray at the care home on 8 November.', { about_date: '2026-11-08' }),
    fact('ray-memory', "Ray's memory is getting worse.", { timing: 'standing', state: 'current', private: true, health: true }),
    fact('kit', 'Bea had coffee with Kit on 6 November.', { about_date: '2026-11-06' }),
    fact('run1', 'Bea ran 10 kilometres on 1 November.', { about_date: '2026-11-01' }),
    fact('run2', 'Bea ran 14 kilometres on 5 November.', { about_date: '2026-11-05' }),
    fact('run3', 'Bea ran 16 kilometres on 8 November.', { about_date: '2026-11-08' }),
    fact('ward', 'Bea finished a twelve hour shift on the ward on 2 November.', { about_date: '2026-11-02' }),
    fact('nights', 'Bea is on nights from 9 November.', { state: 'planned', about_date: '2026-11-09' }),
    fact('bristol', 'Bea lives in Bristol.', { timing: 'standing', state: 'current' }),
    fact('spanish', 'Bea had her weekly Spanish lesson on 3 November.', { about_date: '2026-11-03' }),
    fact('flats', 'Bea looked at flats to rent in Valencia on 6 November.', { about_date: '2026-11-06' }),
    fact('register', 'Bea emailed the nursing council about registering in Spain on 7 November.', { about_date: '2026-11-07' }),
    fact('counsellor', 'Bea has been seeing a counsellor since the separation.', {
      timing: 'standing',
      state: 'current',
      private: true,
      health: true,
    }),
  ];
  const s = base({
    name: 'Bea',
    pronouns: 'she/her',
    absence: { last_active_day: '2026-11-08', active_days_last_7: 6, active_days_last_30: 25 },
    tables: {
      life_facts: facts,
      life_people: people,
      life_fact_people: ties(facts, people, [
        ['swim', 'theo'],
        ['school', 'theo'],
        ['play', 'theo'],
        ['care', 'ray'],
        ['ray-memory', 'ray'],
        ['kit', 'kit'],
      ]),
      notes: [
        journal('j-tooth', '2026-11-04', '21:00', 'Wednesday', 'Theo lost his first tooth at dinner and wrote the tooth fairy a very serious letter.'),
        journal('j-run', '2026-11-08', '12:00', 'Sunday', 'Sixteen kilometres this morning, the longest yet. Legs heavy, and not long to go now.'),
      ],
      todos: [todo('Collect race number', '2026-11-05', { due_day: '2026-11-14' })],
      scope_chats: days('2026-11-02', 7).map((d) => thread(d, { answered_at: at(d, '08:00') })),
      daily_ritual_progress: WEEK.map((d) => ({ owner_id: USER, ritual_day: d, is_fed: true, drops_count: 2, sweeps_count: 0 })),
    },
  });
  return {
    id: 'unsure',
    look: 'Records that point further than they state: Gremly thinks Theo may be her son and that she may be planning a move to Spain, says neither as known anywhere, and never guesses from what is private.',
    periodEnd: '2026-11-08',
    ...s,
    truth: {
      cards: [2, 5],
      private: ['ray-memory', 'counsellor'],
      health: ['ray-memory', 'counsellor'],
      unstated: ['theo', 'ray'],
      // what Gremly should come to think but is not sure of
      unsure: { who: ['theo'], life: true },
    },
  };
}

export const SCENARIOS = [full(), quiet(), back(), health(), unsure()];
