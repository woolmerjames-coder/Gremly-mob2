/**
 * A made up person's week, for the weekly review's tests: Maya, a teacher,
 * whose weekly day is Sunday. Sunday 4 October 2026 is her weekly day, and the
 * review plans Monday 5 to Sunday 11 October. Nothing here is anyone's real
 * data.
 */
import type { WeekRead, WeekReviewRow } from '../../../repo/weekReviewRepo';

export const SUN = '2026-10-04';
export const MON = '2026-10-05';
export const TUE = '2026-10-06';
export const WED = '2026-10-07';
export const THU = '2026-10-08';
export const SAT = '2026-10-10';
export const NEXT_SUN = '2026-10-11';
export const WEEK_START = MON;

export const ID = {
  reports: '11111111-1111-4111-8111-111111111111',
  marking: '22222222-2222-4222-8222-222222222222',
  boiler: '33333333-3333-4333-8333-333333333333',
  swim: '44444444-4444-4444-8444-444444444444',
  fair: '55555555-5555-4555-8555-555555555555',
  parents: '66666666-6666-4666-8666-666666666666',
};

export function madeUpRead(over: Partial<WeekRead> = {}): WeekRead {
  return {
    version: 'week-read-test',
    made_at: '2026-10-04T15:00:00.000Z',
    made_on: SUN,
    model: 'gpt-6-luna',
    effort: 'medium',
    first: MON,
    last: NEXT_SUN,
    figures: { open: 14, hours: 9, old: 3, moved: 2, gone: 1, dated: 4, listed: 14 },
    challenge: {
      headline: 'Reports are due while the week is already full.',
      why: 'Three evenings are taken, and the marking has moved twice.',
    },
    evidence: [
      { figure: '14', label: 'things waiting' },
      { figure: '3', label: 'added over three months ago' },
      { figure: '9 hours', label: 'of todos, all told' },
    ],
    coming_off: 'A short week with the school trip in it.',
    coming_up: [
      { when: THU, what: 'Parents evening', item: { type: 'note', id: ID.parents } },
      { when: SAT, what: 'School fair', item: { type: 'note', id: ID.fair } },
      { when: '2026-10-23', what: 'Reports due', item: null },
    ],
    priority_options: [
      {
        text: 'Get the reports started',
        why: 'They are due on the 23rd.',
        gremly_pick: true,
        item_ids: [ID.reports],
      },
      {
        text: 'Clear the marking',
        why: 'It has moved twice.',
        gremly_pick: true,
        item_ids: [ID.marking],
      },
      {
        text: 'Sort the boiler',
        why: 'It is getting colder.',
        gremly_pick: false,
        item_ids: [ID.boiler],
      },
      { text: 'Two swims', why: 'One last week.', gremly_pick: false, item_ids: [] },
    ],
    intention_drafts: [
      'Start the reports before Thursday.',
      'Leave school by five twice.',
      'Fewer things, finished.',
    ],
    free_hours_guess: {
      normal_day: 2,
      busy_day: 0.5,
      weekend_day: 4,
      reason: 'Three evenings are taken this week.',
    },
    busy_days: [TUE, THU],
    milestones: [
      {
        goal: 'Reports handed in',
        date: '2026-10-23',
        about: { type: 'note', id: ID.reports, title: 'Reports due' },
        steps: [
          { title: 'Gather the grades', by: MON, minutes: 30, kind: 'todo' },
          { title: 'Draft the first ten', by: '2026-10-12', minutes: 60, kind: 'todo' },
          { title: 'How are the reports going?', by: '2026-10-16', kind: 'check_in' },
        ],
      },
    ],
    needs_you: [
      {
        item_ids: [ID.boiler],
        title: 'Sort the boiler',
        stuck_because: 'It has moved six times since August.',
        question: 'What is making this one hard to get done?',
      },
      {
        item_ids: [ID.marking],
        title: 'The Year 9 marking',
        stuck_because: 'It keeps slipping to the weekend.',
        question: 'What would make this one easier?',
      },
    ],
    habit_days: [{ habit_id: ID.swim, days: [MON, SAT], reason: 'The pool is quiet then.' }],
    dropped: 0,
    ...over,
  };
}

export function madeUpRow(over: Partial<WeekReviewRow> = {}): WeekReviewRow {
  return {
    id: 'row-1',
    owner_id: 'maya',
    week_start: WEEK_START,
    span_start: WEEK_START,
    status: 'ready',
    kind: 'weekly',
    read: madeUpRead(),
    answers: {},
    spread: null,
    checkins: [],
    prompt_versions: { read: 'week-read-test' },
    created_at: '2026-10-04T15:00:00.000Z',
    completed_at: null,
    ...over,
  };
}
