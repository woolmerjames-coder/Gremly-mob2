/**
 * The check's one question in words (data fabric stage 3). Code holds the
 * values a record keeps in its own fields; what a sentence says in words is
 * read by a small model, given only that sentence and the records it rests on.
 * It is asked one thing: does the sentence say anything about who someone is,
 * when something is, or how many or how much, that these records do not hold?
 *
 * The request is built here and sent by the worker that runs the check, so
 * both workers ask it the same way.
 */

export const WORDS_PROMPT_VERSION = 'check-words-2026-10-18a';

export const WORDS_SCHEMA = {
  type: 'object',
  properties: {
    not_held: { type: 'boolean' },
    what: { type: 'string', nullable: true },
  },
  required: ['not_held', 'what'],
};

const SYSTEM = `You check one sentence that Gremly, a companion app, wrote for a person, against the records it rests on. The person it is written for is known; everyone else is known only from the records. Answer one question: does the sentence say anything about who someone is, when something is, or how many or how much, that these records do not hold?

- Who someone is means their name and who they are to the person or to anyone else.
- When something is means its day, its date, its time, how far off it is, and whether it is past, happening or ahead, read against today's date as given.
- How many or how much means a number, count, length, amount or measure the sentence states, in digits or in words.
- A record holds what its line says. The sentence may say less than its records, or say it in other words, and that is held: everyday words for what the records say hold, even when they are looser. It is not held when a careful reader would come away believing something about who, when or how many that the records do not say.
- What the sentence suggests or invites the person to do is not a claim; what it says is, was or will be is. Judgements the sentence makes about the records, of what matters most, how things fit together, or how full or open a stretch of time is, are not part of the question. Nor is what things are or what they are called, nor anything else it says.
- When it is not held, say in what in a few plain words. Otherwise leave what empty.`;

function clean(text, n) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, n);
}

function weekday(date) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(
    new Date(`${date}T12:00:00Z`),
  );
}

/**
 * The request for one sentence.
 * @param today YYYY-MM-DD, the person's day
 * @param records the records the sentence rests on, each with its label
 * @param moment when in the day the sentence is read, in a few words
 * @param person who the sentence is written for, by first name when known,
 *   and the pronouns they gave when they gave them
 */
export function wordsRequest({ sentence, records, today, moment = null, person = null }) {
  // each record's label is the line the writer was shown, its ref included
  const lines = (records || []).map((r) => clean(r.label, 400));
  const name = clean(person?.first_name, 60);
  // the pronouns they gave for themselves, so a sentence using them is never read as a guess
  const pronouns = clean(person?.pronouns, 40);
  return {
    system: SYSTEM,
    user: `TODAY: ${weekday(today)} ${today}${moment ? `, ${clean(moment, 80)}` : ''}.\nTHE PERSON: ${name ? `their first name is ${name}` : 'their name is not known'}${pronouns ? `, and their pronouns are ${pronouns}` : ''}.\n\nRECORDS:\n${lines.join('\n') || '(none)'}\n\nSENTENCE: ${clean(sentence.text, 600)}`,
    schema: WORDS_SCHEMA,
  };
}

/**
 * The answer as a problem, or null when the sentence holds. An answer that is
 * not one is for the caller to treat as no answer (run.js leaves it out).
 */
export function wordsProblem(output) {
  if (!output || output.not_held !== true) return null;
  const what = clean(output.what, 200);
  return {
    step: 'words',
    say: `it says something its records do not hold${what ? `: ${what}` : ''}`,
  };
}
