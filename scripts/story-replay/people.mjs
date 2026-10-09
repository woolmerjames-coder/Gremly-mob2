/**
 * A made up person for the story replay (run.mjs). Nothing here is anyone
 * real. Noor's year: a trip that ended, a flat move that ended, a half
 * marathon in training, her sister's wedding coming up, and one Chapter
 * Gremly suggested that she never accepted.
 */

export const USER = 'replay-noor';
export const TODAY = '2026-10-01';

let n = 0;
const fact = (statement, observed, more = {}) => ({
  id: `f-${++n}`,
  user_id: USER,
  statement,
  subject: more.subject ?? 'self',
  timing: more.timing ?? 'day',
  about_date: 'about' in more ? more.about : observed.slice(0, 10),
  about_date_end: more.end ?? null,
  state: more.state ?? 'happened',
  observed_at: `${observed}T09:00:00Z`,
  private: !!more.private,
  correction_text: null,
  corrected_at: null,
});

const FACTS = [
  fact('Noor works as a primary school teacher in Leeds', '2026-01-05', { timing: 'standing', state: 'current', about: null }),
  fact('Noor started running three mornings a week', '2026-01-12', { timing: 'standing', state: 'current', about: null }),
  fact('Noor finds it hard to run when it rains and skips those days', '2026-02-03', { timing: 'standing', state: 'current', about: null }),
  fact('Noor booked a trip to Lisbon with her friend Jo', '2026-02-20', { about: '2026-04-10', state: 'planned' }),
  fact('Noor and Jo spent five days in Lisbon', '2026-04-16', { timing: 'span', about: '2026-04-10', end: '2026-04-15' }),
  fact('Noor tried custard tarts at a bakery in Belem and loved them', '2026-04-14'),
  fact('Noor said the Lisbon trip was the first holiday she had taken in three years', '2026-04-16'),
  fact('Noor signed a lease on a new flat in Headingley', '2026-05-02'),
  fact('Noor moved into the new flat', '2026-05-30', { about: '2026-05-30' }),
  fact('Noor painted the spare room green', '2026-06-08'),
  fact('Noor finished unpacking the last boxes', '2026-06-21'),
  fact('Noor signed up for the Leeds Half Marathon on 25 October', '2026-07-01', { about: '2026-10-25', state: 'planned' }),
  fact('Noor ran 10 km without stopping for the first time', '2026-08-09'),
  fact('Noor ran 16 km on a Sunday long run', '2026-09-13'),
  fact('Noor journals most evenings before bed', '2026-03-01', { timing: 'standing', state: 'current', about: null }),
  fact('Noor rarely cooks on weekdays and orders in', '2026-03-10', { timing: 'standing', state: 'current', about: null }),
  fact('Noor\'s sister Amira is getting married on 14 November', '2026-08-20', { subject: 'Amira', about: '2026-11-14', state: 'planned' }),
  fact('Noor is giving a speech at Amira\'s wedding', '2026-09-02', { about: '2026-11-14', state: 'planned' }),
  fact('Jo is Noor\'s closest friend from university', '2026-02-20', { subject: 'Jo', timing: 'standing', state: 'current', about: null }),
  fact('Noor applied for a deputy head role at another school', '2026-09-18', { private: true }),
  fact('Noor was asked to lead the school reading club this term', '2026-09-05'),
  fact('Noor said running has made her mornings calmer', '2026-09-20', { timing: 'standing', state: 'current', about: null }),
];

const chapter = (id, title, type, phase, start, end, summary) => ({
  id,
  owner_id: USER,
  title,
  chapter_type: type,
  phase,
  start_date: start,
  end_date: end,
  summary,
  card_subtitle: null,
});

const CHAPTERS = [
  chapter('ch-lisbon', 'Lisbon with Jo', 'bounded', 'closed', '2026-04-10', '2026-04-15', 'Five days in Lisbon with Jo, her first holiday in three years.'),
  chapter('ch-move', 'Moving to Headingley', 'bounded', 'closed', '2026-05-02', '2026-06-21', 'Signing the lease, the move and unpacking the new flat.'),
  chapter('ch-half', 'Leeds Half Marathon', 'milestone', 'active', '2026-07-01', '2026-10-25', 'Training for the half marathon on 25 October.'),
  chapter('ch-wedding', "Amira's wedding", 'milestone', 'upcoming', '2026-08-20', '2026-11-14', 'Her sister\'s wedding, with a speech to write.'),
  chapter('ch-cook', 'Learning to cook', 'season', 'suggested', null, null, 'A season of cooking more at home.'),
];

const SYNTHESIS = [
  { user_id: USER, kind: 'weekly', status: 'applied', period_end: '2026-04-19', created_at: '2026-04-20T08:00:00Z', week_note: 'Back from Lisbon and glad she went.' },
  { user_id: USER, kind: 'weekly', status: 'applied', period_end: '2026-06-07', created_at: '2026-06-08T08:00:00Z', week_note: 'A week of boxes and paint in the new flat.' },
  { user_id: USER, kind: 'weekly', status: 'applied', period_end: '2026-09-13', created_at: '2026-09-14T08:00:00Z', week_note: 'Her longest run yet, and the wedding speech on her mind.' },
];

export const TABLES = {
  notification_preferences: [{ user_id: USER, timezone: 'Europe/London' }],
  user_profiles: [{ user_id: USER, timezone: 'Europe/London' }],
  life_facts: FACTS,
  chapters: CHAPTERS,
  synthesis_runs: SYNTHESIS,
  story_items: [],
};

export const RPC = {
  person_identity: () => [{ first_name: 'Noor', pronouns: 'she/her', identity: {} }],
  usage_rollup: () => ({
    periods: [
      { period_start: '2026-09-01', active_days: 24, drops: 80, todos_done: 31, habit_checkins: 40, journals: 18, chat_messages: 120 },
      { period_start: '2026-08-01', active_days: 20, drops: 64, todos_done: 22, habit_checkins: 35, journals: 15, chat_messages: 90 },
    ],
    current: { gremly_age: 3, fed_days_total: 140 },
  }),
};

/** The Chapter refs that are not hers: one Gremly suggested and she never took. */
export const NOT_HERS = ['ch-cook'];
export const KIND_WORDS = /\b(bounded|season|milestone chapter)\b/i;
