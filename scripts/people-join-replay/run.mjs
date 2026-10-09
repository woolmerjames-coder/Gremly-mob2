/**
 * The people join replay (workers/inngest-jobs/context/peopleJoin.js, 18 Oct):
 * pairs of made up people records Gremly proposed might be one person, judged
 * by the model and prompt that ship. A pair it calls same is joined without a
 * question; any other is asked. It passes when every pair the records make
 * plainly one is same, every pair they set apart is never same, and a pair
 * whose names differ with nothing stating they are one is never same.
 *
 *   node <bundle> [--repeat n]   (scripts/people-join-replay/run.sh)
 *
 * Every name and fact is made up. OPENAI_API_KEY and GEMINI_TEST_API_KEY come
 * from the environment.
 */

import { joinRequest, PEOPLE_JOIN_VERSION } from '../../workers/inngest-jobs/context/peopleJoin.js';
import { jsonCall, modelFor } from '../../workers/inngest-jobs/context/llm.js';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const repeat = Math.max(1, Number(flag('--repeat') || 3));
const PERSON = { first_name: 'Alex', pronouns: null, identity: {} };

const rec = (names, relationship, relationship_by, facts) => ({
  names,
  relationship,
  relationship_by,
  facts: facts.map((statement) => ({ statement })),
});

// want: same (must be joined), never (must not be joined)
const PAIRS = [
  {
    id: 'same-name-partner',
    want: 'same',
    kept: rec(['Theo'], 'husband', 'understood', ['Alex and Theo celebrated their wedding anniversary at home.', 'Alex said he loves Theo.', 'Alex and Theo planned a trip to Porto in November.']),
    merged: rec(['Theo'], null, 'gremly', ["Theo's birthday is 27 April."]),
  },
  {
    id: 'same-name-more',
    want: 'same',
    kept: rec(['Mira'], 'friend', 'person', ['Alex had dinner with Mira on Friday.', 'Mira is turning 40 in London in October.']),
    merged: rec(['Mira'], null, 'gremly', ['Alex wants to find flights for Mira’s party.', 'Alex has not decided whether to go to Mira’s 40th.']),
  },
  {
    id: 'named-and-tie-stated',
    want: 'same',
    kept: rec([], 'sister', 'gremly', ['Alex expected his sister to visit with her family for four nights.']),
    merged: rec(['Ana'], null, 'gremly', ['Alex and his sister Ana spent the afternoon at the beach with her children.']),
  },
  {
    id: 'same-name-set-apart',
    want: 'never',
    kept: rec(['Sam'], 'brother', 'person', ['Alex’s brother Sam is moving to Leeds.', 'Alex helped Sam pack on Saturday.']),
    merged: rec(['Sam'], null, 'gremly', ['Sam at work said the reorg is happening next week.', 'Alex and Sam present the quarterly numbers to the board.']),
  },
  {
    id: 'two-at-once',
    want: 'never',
    kept: rec(['Kit'], 'friend', 'person', ['Alex went climbing with Kit.']),
    merged: rec(['Kit'], null, 'gremly', ['Alex introduced Kit from climbing to Kit from the book club; they laughed about the name.']),
  },
  {
    id: 'different-names-unstated',
    want: 'never',
    kept: rec(['Theo'], 'husband', 'understood', ['Alex and Theo celebrated their anniversary.']),
    merged: rec(['Theodore'], null, 'gremly', ['Alex needs to email Theodore about the account plan by Friday.']),
  },
  {
    id: 'tie-only-unstated',
    want: 'never',
    kept: rec([], 'cousin', 'gremly', ['Alex’s cousin is getting married in June.']),
    merged: rec(['Jules'], null, 'gremly', ['Alex is buying a gift for Jules’s wedding in June.']),
  },
];

async function runOnce() {
  const env = { OPENAI_API_KEY: process.env.OPENAI_API_KEY, GEMINI_API_KEY: process.env.GEMINI_TEST_API_KEY };
  const pairs = PAIRS.map((p) => ({ merge: { id: p.id }, kept: p.kept, merged: p.merged }));
  const { system, user, refs } = joinRequest({ pairs, person: PERSON });
  const { output } = await jsonCall(env, {
    primary: modelFor(env, 'reader'),
    fallback: modelFor(env, 'readerFallback'),
    system,
    user,
    schema: {
      type: 'object',
      properties: {
        pairs: {
          type: 'array',
          items: {
            type: 'object',
            properties: { ref: { type: 'string' }, verdict: { type: 'string', enum: ['same', 'different', 'unclear'] }, why: { type: 'string' } },
            required: ['ref', 'verdict', 'why'],
          },
        },
      },
      required: ['pairs'],
    },
    maxTokens: 4000,
    effort: 'medium',
    thinking: 'medium',
  });
  const got = new Map();
  for (const v of output?.pairs || []) {
    const pair = refs.get(v.ref);
    if (pair && !got.has(pair.merge.id)) got.set(pair.merge.id, v);
  }
  return PAIRS.map((p) => {
    const v = got.get(p.id);
    const ok = p.want === 'same' ? v?.verdict === 'same' : v?.verdict !== 'same';
    return { id: p.id, want: p.want, verdict: v?.verdict || 'none', why: v?.why || '', ok };
  });
}

console.log(`${PEOPLE_JOIN_VERSION}: ${PAIRS.length} pairs, ${repeat} runs`);
const runs = await Promise.all(Array.from({ length: repeat }, runOnce));
let right = 0;
let total = 0;
let wrongJoins = 0;
runs.forEach((r, i) => {
  console.log(`run ${i + 1}`);
  for (const x of r) {
    total += 1;
    if (x.ok) right += 1;
    if (x.want === 'never' && x.verdict === 'same') wrongJoins += 1;
    console.log(`  ${x.ok ? 'ok  ' : 'FAIL'} ${x.id}: ${x.verdict} (want ${x.want}) ${x.why}`);
  }
});
console.log(`\n${right} of ${total} right, ${wrongJoins} wrong joins`);
