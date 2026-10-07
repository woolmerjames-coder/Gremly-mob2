/**
 * The check (data fabric stage 3), the parts done in code: every sentence a
 * writer gives names the records it rests on and lists what it states, and
 * code holds both to the records the writer was given.
 *
 * 1. The refs are real: a ref the writer was never given is dropped.
 * 2. The stated values match: each time, date, number or person on the list is
 *    compared with the record it names, where that record holds one of its
 *    kind. Where it holds none, the value is left to the words question
 *    (words.js), which reads the record as written.
 * 3. Nothing in digits slips past: every number written in digits in the
 *    sentence must be one the list states. This is the one place code looks at
 *    text, and it looks only at Gremly's own sentence, only for digits.
 * 4. A glanceable line never rests on a private or health record.
 *
 * A record, as each writer builds it from what it showed the model:
 *   { ref, label, times: ['HH:MM'], dates: ['YYYY-MM-DD'], spans: [[from, to]],
 *     numbers: [n], names: [name], exact: ['time', ...], private, health }
 * where label is the line the writer was shown, times are on a 24 hour clock
 * and names are a person's name and other names. exact names the kinds whose
 * fields hold all the record says of that kind: worked out in code, kept in
 * its own field, or a person's names. A value of an exact kind that matches
 * none of them is wrong. Where a record also has words that could hold a value
 * (a title, a fact's statement), a value that matches no field is left to the
 * words question, because code never reads those words.
 */

export const STATED_KINDS = ['time', 'date', 'number', 'person'];

/** One sentence as a writer gives it: its words, its records, what it states. */
export const SENTENCE_SCHEMA = {
  type: 'object',
  properties: {
    text: { type: 'string' },
    refs: { type: 'array', items: { type: 'string' } },
    stated: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: STATED_KINDS },
          value: { type: 'string' },
          ref: { type: 'string' },
        },
        required: ['kind', 'value', 'ref'],
      },
    },
  },
  required: ['text', 'refs', 'stated'],
};

/** The rule every writer under the check carries. Semantic only. */
export const STATED_RULES = `REFS AND WHAT EACH SENTENCE STATES
- With every sentence, list in refs the records it rests on, by the refs given in the input. Refs go only in refs, never in the text.
- List in stated every time, date, number and person the sentence states, each with the ref of the record that holds it: a time as HH:MM on a 24 hour clock, a date as YYYY-MM-DD, a number in digits, and a person by the name the sentence uses for them. A day named in words, whether relative or by name, is a date. A time or a number said in words is listed the same way, and so is a number that is part of a name or title the sentence uses. These forms are for the list only. In the sentence itself, a time is written as a person says it aloud, on the 12 hour clock, and a date as a person says it; neither is ever written in the list's form.
- State nothing that no record holds. A sentence that rests on no record states nothing.`;

const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A stated time in the agreed form, as HH:MM, or null. */
export function normalTime(value) {
  const m = TIME.exec(String(value || '').trim());
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}

/** A stated date in the agreed form, or null. */
export function normalDate(value) {
  const s = String(value || '').trim();
  const m = DATE.exec(s);
  if (!m) return null;
  const d = new Date(`${s}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s;
}

/** A stated number in the agreed form, or null. */
export function normalNumber(value) {
  const s = String(value || '').trim();
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}

function nameKey(s) {
  return String(s || '')
    .trim()
    .toLowerCase();
}

/**
 * The numbers a stated value accounts for in the sentence's text: a time's
 * hour on either clock and its minutes, a date's year, month and day, and a
 * number itself with each run of digits it is written with.
 */
export function numbersOf(item) {
  if (!item) return [];
  if (item.kind === 'time') {
    const t = normalTime(item.value);
    if (!t) return [];
    const [h, m] = t.split(':').map(Number);
    return [h, h % 12 || 12, m];
  }
  if (item.kind === 'date') {
    const d = normalDate(item.value);
    if (!d) return [];
    const [y, mo, day] = d.split('-').map(Number);
    return [y, y % 100, mo, day];
  }
  if (item.kind === 'number') {
    const n = normalNumber(item.value);
    if (n == null) return [];
    // 1.5 is written with 1 and 5; 1200 may be written 1,200
    const runs = (s) => (s.match(/\d+/g) || []).map(Number);
    return [n, ...runs(String(item.value)), ...runs(n.toLocaleString('en-US'))];
  }
  return [];
}

/** Every run of digits in Gremly's sentence, each as a number. */
export function digitsIn(text) {
  return (String(text || '').match(/\d+/g) || []).map(Number);
}

/** Whether a stated value is one of the record's own fields of its kind. */
function inFields(item, record) {
  switch (item.kind) {
    case 'time': {
      const t = normalTime(item.value);
      return (record.times || []).map(normalTime).includes(t);
    }
    case 'date': {
      const d = normalDate(item.value);
      if ((record.dates || []).includes(d)) return true;
      return (record.spans || []).some((s) => s && s[0] && d >= s[0] && d <= (s[1] || s[0]));
    }
    case 'number':
      return (record.numbers || []).includes(normalNumber(item.value));
    case 'person':
      return (record.names || []).map(nameKey).includes(nameKey(item.value));
    default:
      return false;
  }
}

function wellFormed(item) {
  switch (item.kind) {
    case 'time':
      return normalTime(item.value) != null;
    case 'date':
      return normalDate(item.value) != null;
    case 'number':
      return normalNumber(item.value) != null;
    case 'person':
      return nameKey(item.value) !== '';
    default:
      return false;
  }
}

/**
 * Compare one stated value with the record it names. Returns 'match',
 * 'differs' (its kind is exact on the record and no field holds it),
 * 'malformed', or 'unheld' (left to the words question).
 */
export function compareValue(item, record) {
  if (!wellFormed(item)) return 'malformed';
  if (inFields(item, record)) return 'match';
  return (record.exact || []).includes(item.kind) ? 'differs' : 'unheld';
}

function clean(text, n = 600) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, n);
}

const list = (x) => (Array.isArray(x) ? x : []);

/**
 * The code steps for one sentence. Returns the sentence with only real refs,
 * the problems found and the values code could not compare. Each problem is
 * { step, say }: which step found it, and what was wrong in words the writer
 * is shown when the sentence goes back. Only the step is ever logged.
 *
 * @param sentence { text, refs, stated }
 * @param records Map ref -> record, everything the writer was given
 * @param opts.glanceable the line can be seen without the person opening anything
 */
export function codeCheck(sentence, records, { glanceable = false } = {}) {
  const text = clean(sentence?.text);
  const problems = [];
  const given = (r) => typeof r === 'string' && records.has(r);
  const cited = list(sentence?.refs);
  const refs = [...new Set(cited.filter(given))];
  // a ref the writer was never given is dropped, and the sentence goes back:
  // it rests on something no record holds
  const droppedRefs = cited.filter((r) => !given(r));
  if (droppedRefs.length) problems.push({ step: 'ref', say: 'it cites a record it was not given' });
  const stated = list(sentence?.stated).filter((x) => x && STATED_KINDS.includes(x.kind));
  const unheld = [];
  for (const item of stated) {
    if (!given(item.ref)) {
      problems.push({
        step: 'ref',
        say: `it states ${item.kind} ${clean(item.value, 60)} from a record it was not given`,
      });
      continue;
    }
    if (!refs.includes(item.ref)) refs.push(item.ref);
    const result = compareValue(item, records.get(item.ref));
    if (result === 'differs')
      problems.push({
        step: 'value',
        say: `it states ${item.kind} ${clean(item.value, 60)}, which its record does not hold`,
      });
    else if (result === 'malformed')
      problems.push({
        step: 'form',
        say: `it lists ${item.kind} ${clean(item.value, 60)} in a form that is not agreed`,
      });
    else if (result === 'unheld') unheld.push(item);
  }
  const accounted = new Set(stated.flatMap(numbersOf));
  const loose = digitsIn(text).filter((n) => !accounted.has(n));
  if (loose.length)
    problems.push({
      step: 'digits',
      say: `it has ${loose.join(', ')} in digits, which it does not list as stated`,
    });
  let sensitive = false;
  if (glanceable && text) {
    if (refs.some((r) => records.get(r)?.private || records.get(r)?.health)) {
      sensitive = true;
      problems.push({
        step: 'glanceable',
        say: 'it rests on something private or about health, which never goes on a line seen at a glance',
      });
    }
    // a line seen at a glance always rests on something it names
    if (!refs.length)
      problems.push({ step: 'unfounded', say: 'a line seen at a glance rests on no record' });
  }
  return {
    sentence: { text, refs, stated },
    droppedRefs,
    problems,
    unheld,
    sensitive,
  };
}
