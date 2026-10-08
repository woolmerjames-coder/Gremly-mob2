/**
 * The Ask Gremly replay's made up person (data fabric stage 4e): Noor from
 * the life replay (scripts/life-replay/life.mjs), with the months before her
 * weeks there, so Gremly knows more about her than one screen holds: where
 * she lives, what she does, her people, what she likes, a trip in the
 * summer, a hard anniversary. Every name, place and record here is made up.
 *
 * What a friend would know on the day (FRIEND) and which of it bears on each
 * message (MESSAGES) were set when this was written, from the records alone.
 */

import {
  USER,
  TZ,
  PERSON,
  TARGET,
  TABLES as BASE_TABLES,
  RECORDS as BASE_RECORDS,
  TRUTH,
  at,
  note,
  cal,
  chat,
} from '../life-replay/life.mjs';
import { noteRecord, chatRecord, calendarRecord } from '../../workers/inngest-jobs/context/records.js';

export { USER, TZ, PERSON, TARGET, at };

// ── the months before ───────────────────────────────────────────────────────

const NOTES = [
  note('x-flat', '2026-06-14', '21:00', 'journal', 'Sunday', 'Moved into the flat on Linden Street today. Boxes everywhere, but the light in the kitchen is lovely.'),
  note('x-pottery', '2026-07-19', '20:30', 'journal', 'Sunday', 'Eli spent the whole day at the pottery studio again and came home with three wonky mugs. He keeps saying he wants a proper glaze kit of his own.'),
  note('x-portugal', '2026-08-09', '19:00', 'journal', 'Home', 'Back from two weeks in Portugal with Eli. Porto was the highlight, we want to go back.'),
  note('x-run', '2026-09-06', '12:00', 'journal', 'Sunday', 'Long run with Sam again, 14k. The half marathon in March is starting to feel possible.'),
  note('x-book', '2026-09-23', '22:00', 'journal', 'Wednesday', 'Book club at Jo\'s tonight. We are reading The Overstory next. First Wednesday of the month, as always.'),
  note('x-dad', '2026-10-12', '21:00', 'journal', 'Monday', 'Dad would have been 72 today. Quiet day. Called Mum for a long time.'),
  note('x-sleep', '2026-10-27', '23:30', 'journal', 'Tuesday', 'Sleeping badly again with all the Hartley prep.'),
];

const CHATS = [
  { ...chat('x-design', '2026-05-20', '13:00', 'I\'m a designer at a small studio, mostly brand work.'), gremly: 'What do you do for work, by the way?' },
  { ...chat('x-cycle', '2026-06-20', '08:30', 'I cycle to work most days. It\'s the only exercise I actually enjoy apart from swimming.'), gremly: 'Morning. How are you getting in today?' },
  { ...chat('x-veg', '2026-07-02', '19:00', 'I\'m vegetarian, so skip anything with meat when you suggest recipes.'), gremly: 'Want a few quick dinner ideas for this week?' },
  { ...chat('x-priya', '2026-08-18', '18:30', 'My manager Priya wants me to lead the Hartley account from September. Bit terrified, bit excited.'), gremly: 'How was work today?' },
  { ...chat('x-party', '2026-09-15', '20:00', 'Mira is the one who always remembers birthdays, I\'m hopeless. She\'s throwing Mum\'s 70th at her place on Saturday 21 November.'), gremly: 'Anything on your mind this week?' },
  { ...chat('x-sam', '2026-11-01', '17:00', 'Sam\'s moving to Glasgow in January. Gutted, he\'s my running buddy.'), gremly: 'How was your weekend?' },
];

const CALENDAR = [
  cal('x-cal-party', at('2026-11-02', '09:00'), 'Mum\'s 70th at Mira\'s', '2026-11-21', '15:00', '20:00'),
  cal('x-cal-book', at('2026-11-04', '08:00'), 'Book club at Jo\'s', '2026-12-02', '19:30', '21:30'),
  cal('x-cal-flight', at('2026-11-05', '10:00'), 'Flight to Lisbon', '2026-11-17', '07:15', '09:30'),
  cal('x-cal-run', at('2026-11-09', '18:00'), 'Long run with Sam', '2026-11-15', '08:00', '10:00'),
];

export const TABLES = {
  notes: [...BASE_TABLES.notes, ...NOTES],
  todos: [...BASE_TABLES.todos],
  synced_calendar_events: [...BASE_TABLES.synced_calendar_events, ...CALENDAR],
};

/** Every record the reader reads, in the order they happened. */
export const RECORDS = [
  ...BASE_RECORDS,
  ...NOTES.map(noteRecord),
  ...CALENDAR.map((c) => calendarRecord(c, TZ)),
  ...CHATS.map((m) => chatRecord(m, m.gremly)),
].sort((a, b) => a.at.localeCompare(b.at));

/** Who the weekly pass would say she is, from the records alone. */
export const PROFILE =
  'Noor is a brand designer at a small studio who lives with her partner Eli. She swims and runs, and is close to her sister Mira and her mum.';

// ── what a friend would know on Thursday 12 November 2026 ───────────────────

/** Everything a friend would know, all true (key | what). */
export const FRIEND = {
  anniversary: 'Today, Thursday 12 November, is Noor and Eli\'s anniversary. Noor had a todo to book a table for dinner tonight and still needed a present for Eli.',
  gig: 'Last night, Wednesday 11 November, Noor went to see Big Thief at the Anthem.',
  grant: 'Noor expects to hear about the grant decision by tomorrow, Friday 13 November.',
  mum70: 'Noor\'s mum turns 70 on Friday 20 November.',
  party: 'Mira is throwing Mum\'s 70th at her place on Saturday 21 November, 3pm to 8pm.',
  lisbon: 'Noor has a work trip to Lisbon from Tuesday 17 to Friday 20 November; the flight out is at 7:15am on the 17th.',
  clash: 'Noor will still be in Lisbon on Mum\'s actual birthday, Friday 20 November.',
  mira: 'Noor\'s sister Mira started a new job at the museum on Monday 9 November and was nervous about it.',
  tired: 'Noor was wiped out after a client pitch on Tuesday 10 November.',
  sleep: 'Noor has been sleeping badly with the Hartley prep (said privately in her journal).',
  swim: 'Noor swims before work and has been keeping it up.',
  early: 'Noor asked Gremly not to suggest anything before 9am; she hates early meetings.',
  eli_pottery: 'Eli is into pottery and keeps saying he wants a proper glaze kit of his own.',
  veg: 'Noor is vegetarian.',
  sam: 'Sam is Noor\'s running buddy; they do long Sunday runs, there is one on Sunday 15 November at 8am, and Sam moves to Glasgow in January.',
  half: 'Noor is training for a half marathon in March.',
  hartley: 'Noor leads the Hartley account for her manager Priya, and has an invoice to Hartley and Co due today.',
  portugal: 'Noor and Eli spent two weeks in Portugal in the summer; Porto was the highlight and they want to go back.',
  bookclub: 'Noor\'s book club meets at Jo\'s on the first Wednesday of the month; the next is 2 December, and they are reading The Overstory.',
  flat: 'Noor moved into a flat on Linden Street in June.',
  work: 'Noor is a brand designer at a small studio.',
  cycle: 'Noor cycles to work most days.',
  dad: 'Noor\'s dad has died; his birthday was 12 October.',
  day_items: 'Today Noor has team standup at 10am and a 1:1 with Priya at 2pm, an invoice to send to Hartley and Co, and a table to book for dinner tonight.',
  saturday_free: 'Nothing is on Noor\'s calendar on Saturday 14 November.',
};

/** Their day and week as their own records hold them: all true, and fine to name. */
export const DAY = [
  ...TRUTH.day,
  'Sunday 15 November: long run with Sam, 8am to 10am.',
  'Tuesday 17 November: flight to Lisbon, 7:15am.',
  'Saturday 21 November: Mum\'s 70th at Mira\'s, 3pm to 8pm.',
  'Wednesday 2 December: book club at Jo\'s, 7:30pm.',
  'Nothing is on their calendar on Saturday 14 November.',
];

export const NEVER = [
  'The anniversary is on any day but 12 November.',
  'Anything about Noor or her people that the records do not hold, stated as fact.',
  'Her dad, or his death, brought up when she has not raised him.',
  'Her sleep brought up as anything but her own words, or opened with.',
];

/**
 * The messages, each sent as the first message of a new Ask Gremly chat at
 * its time on Thursday 12 November. bears: what a friend would bring up in
 * reply, by weight. must: the reply misses the person without it. should: a
 * friend would. could: worth a word if it fits.
 */
export const MESSAGES = [
  { id: 'morning', at: '07:30', text: 'Morning!', bears: { must: ['anniversary'], should: ['gig'], could: ['grant'] } },
  { id: 'today', at: '07:35', text: 'What have I got on today?', bears: { must: ['anniversary', 'day_items'], should: [], could: ['grant', 'gig'] } },
  { id: 'present', at: '07:40', text: 'I\'ve left Eli\'s present way too late. Any ideas?', bears: { must: ['anniversary'], should: ['eli_pottery'], could: ['portugal'] } },
  { id: 'swim', at: '07:45', text: 'Should I swim before work tomorrow?', bears: { must: [], should: ['swim'], could: ['grant', 'gig', 'tired'] } },
  { id: 'shattered', at: '12:30', text: 'I\'m shattered today', bears: { must: [], should: ['gig', 'tired'], could: ['anniversary', 'sleep'] } },
  { id: 'next-week', at: '12:35', text: 'Help me think about next week', bears: { must: ['lisbon'], should: ['clash'], could: ['mum70', 'party', 'sam', 'grant'] } },
  { id: 'mira', at: '13:00', text: 'Any idea how Mira\'s getting on?', bears: { must: ['mira'], should: [], could: ['party'] } },
  { id: 'mum', at: '13:05', text: 'When\'s Mum\'s birthday again?', bears: { must: ['mum70'], should: ['party'], could: ['clash'] } },
  { id: 'saturday', at: '13:10', text: 'Am I free on Saturday?', bears: { must: ['saturday_free'], should: [], could: ['sam'] } },
  { id: 'dinner', at: '18:00', text: 'What should I make for dinner?', bears: { must: ['anniversary'], should: ['veg'], could: [] } },
  { id: 'podcast', at: '18:10', text: 'Recommend me a podcast for my run on Sunday', bears: { must: [], should: ['sam'], could: ['half'] } },
  { id: 'home', at: '21:45', text: 'Home. What a day.', bears: { must: ['anniversary'], should: [], could: ['grant'] } },
];
