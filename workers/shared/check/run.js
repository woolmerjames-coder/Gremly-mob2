/**
 * The check's outcome (data fabric stage 3): every sentence a writer gives
 * goes through the code steps (stated.js) and the words question (words.js).
 * A sentence that passes stands. One that fails goes back once to the model
 * that wrote it, alone, with only its own records and what was wrong. The
 * rewrite is checked the same way, against those records only. One that
 * fails again is left out: blank is better than wrong.
 *
 * Two kinds of sentence are left out without a second try: one seen at a
 * glance that rests on something private or about health, since the only
 * record it could be written again from is that one, and one whose words
 * question could not be asked or came back without an answer.
 *
 * The worker gives two functions, so both workers run it the same way:
 *   ask(request) answers the words question for one sentence (it throws when
 *     no model could be asked);
 *   rewrite({ key, sentence, records, problems }) returns the sentence again,
 *     or null. problems are the words the writer is shown.
 */

import { codeCheck } from './stated.js';
import { wordsRequest, wordsProblem, WORDS_PROMPT_VERSION } from './words.js';

export { WORDS_PROMPT_VERSION };

/** At most this many model calls at once. */
const AT_ONCE = 6;

async function inTurn(items, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(AT_ONCE, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

function recordsOf(refs, records) {
  return refs.map((r) => ({ ref: r, ...records.get(r) }));
}

const short = (err) => String(err?.message || err).slice(0, 120);

/** One sentence through every step. Never throws: a step that breaks is a problem. */
async function checkOne(sentence, records, { glanceable, today, moment, person, ask }) {
  let code;
  try {
    code = codeCheck(sentence, records, { glanceable });
  } catch (err) {
    return {
      sentence: { text: '', refs: [], stated: [] },
      problems: [{ step: 'broken', say: `it could not be read: ${short(err)}` }],
      final: true,
    };
  }
  if (!code.sentence.text) return { ...code, problems: [] };
  if (code.problems.length) return { ...code, final: code.sensitive };
  let output;
  try {
    output = await ask(
      wordsRequest({
        sentence: code.sentence,
        records: recordsOf(code.sentence.refs, records),
        today,
        moment,
        person,
      }),
    );
  } catch (err) {
    return {
      ...code,
      problems: [{ step: 'unasked', say: `the words question could not be asked: ${short(err)}` }],
      final: true,
    };
  }
  // an answer that is not one is no answer: the sentence cannot be shown to hold
  if (typeof output?.not_held !== 'boolean')
    return {
      ...code,
      problems: [{ step: 'unasked', say: 'the words question came back without an answer' }],
      final: true,
    };
  const words = wordsProblem(output);
  return words ? { ...code, problems: [words] } : code;
}

const says = (problems) => problems.map((p) => p.say);
const steps = (problems) => [...new Set(problems.map((p) => p.step))];

/**
 * Run the check over a writer's sentences.
 * @param items [{ key, sentence, glanceable }]
 * @param records Map ref -> record, everything the writer was given
 * @returns {{ results: Map, counts: { checked, sent_back, left_out }, details: [] }}
 *   results: key -> { outcome: 'pass' | 'rewritten' | 'left_out' | 'empty',
 *   sentence (the words that stand, or null), refs }
 *   details, for each sentence that did not pass at once: its key, outcome,
 *   what was wrong each time, and the words of each try
 */
export async function runCheck({
  items,
  records,
  today,
  moment = null,
  person = null,
  ask,
  rewrite,
}) {
  const first = await inTurn(items, (it) =>
    checkOne(it.sentence, records, { glanceable: it.glanceable, today, moment, person, ask }),
  );
  const results = new Map();
  const details = [];
  const again = [];
  items.forEach((it, i) => {
    const r = first[i];
    if (!r.sentence.text && !r.problems.length) {
      results.set(it.key, { outcome: 'empty', sentence: null, refs: [] });
      return;
    }
    if (!r.problems.length) {
      results.set(it.key, { outcome: 'pass', sentence: r.sentence, refs: r.sentence.refs });
      return;
    }
    if (r.final) {
      results.set(it.key, { outcome: 'left_out', sentence: null, refs: [] });
      details.push({
        key: it.key,
        outcome: 'left_out',
        first: r.problems,
        texts: [r.sentence.text],
        refs: [r.sentence.refs],
      });
      return;
    }
    again.push({ it, r });
  });

  const second = await inTurn(again, async ({ it, r }) => {
    // only the records it rested on, and nothing else
    const own = new Map(r.sentence.refs.map((ref) => [ref, records.get(ref)]));
    let redone = null;
    try {
      redone = await rewrite({
        key: it.key,
        sentence: r.sentence,
        records: recordsOf(r.sentence.refs, records),
        problems: says(r.problems),
      });
    } catch (err) {
      return {
        problems: [{ step: 'rewrite', say: `it could not be written again: ${short(err)}` }],
      };
    }
    if (!redone || !String(redone.text || '').trim())
      return { problems: [{ step: 'rewrite', say: 'it was written again with nothing in it' }] };
    return checkOne(redone, own, { glanceable: it.glanceable, today, moment, person, ask });
  });

  again.forEach(({ it, r }, i) => {
    const s = second[i];
    const ok = s.sentence?.text && !s.problems.length;
    results.set(
      it.key,
      ok
        ? { outcome: 'rewritten', sentence: s.sentence, refs: s.sentence.refs }
        : { outcome: 'left_out', sentence: null, refs: [] },
    );
    details.push({
      key: it.key,
      outcome: ok ? 'rewritten' : 'left_out',
      first: r.problems,
      ...(ok ? {} : { second: s.problems }),
      // the words of each try, for a person reviewing a replay; never logged
      texts: [r.sentence.text, s.sentence?.text || ''],
      refs: [r.sentence.refs, s.sentence?.refs || []],
    });
  });

  // in the order the writer gave its sentences
  const order = new Map(items.map((it, i) => [it.key, i]));
  details.sort((a, b) => order.get(a.key) - order.get(b.key));
  const checked = [...results.values()].filter((x) => x.outcome !== 'empty').length;
  return {
    results,
    counts: {
      checked,
      sent_back: again.length,
      left_out: [...results.values()].filter((x) => x.outcome === 'left_out').length,
    },
    details,
  };
}

/** What was wrong each time, in the words the writer was shown, for a person reading a run. */
export function problemList(detail) {
  return [...says(detail?.first || []), ...says(detail?.second || [])];
}

export function problemWords(detail) {
  return problemList(detail).join('; ');
}

/**
 * The row a check run leaves in public.check_runs: for each sentence that did
 * not pass at once, its field, its outcome and which steps found it wrong.
 * Never its words, nor the words of what was wrong.
 */
export function checkRunRow({ userId, job, day = null, counts, details, model = null }) {
  return {
    user_id: userId,
    job,
    day,
    checked: counts.checked,
    sent_back: counts.sent_back,
    left_out: counts.left_out,
    details: details.map((d) => ({
      field: d.key,
      outcome: d.outcome,
      first: steps(d.first || []),
      ...(d.second ? { second: steps(d.second) } : {}),
    })),
    words_prompt_version: WORDS_PROMPT_VERSION,
    model,
  };
}
