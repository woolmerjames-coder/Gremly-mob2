/**
 * The deadline check for the already have it check (final check item 6):
 * made up drops against made up items, from the test fixture
 * workers/cortex/__tests__/fixtures/relate-deadlines.json, through the
 * request a build that understands deadlines sends (deadlines: true): the
 * deadline prompt, the same input and the same checks as the Worker. Only
 * the made up fixture goes to the model; nothing from it is in the prompt.
 * Output: results/deadlines-<variant>-<run>.jsonl, one line per drop, with
 * the expected answer and whether it was met.
 *   scripts/relate-replay/deadlines.sh --run 1
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  relatePromptFor,
  RELATE_ITEMS_MAX,
  shapeItems,
  withKeys,
  buildRelateInput,
  parseJson,
  decideRelation,
} from '../../workers/cortex/minddropRelate.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const args = process.argv.slice(2);
const arg = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const RUN = arg('run', '1');
// the variant the check runs on (stage 1): Luna with low reasoning
const MODEL = 'gpt-6-luna';
const EFFORT = 'low';

const keys = {};
const kf = join(ROOT, '.audit-keys.local');
if (existsSync(kf))
  for (const line of readFileSync(kf, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m) keys[m[1]] = m[2];
  }
const OPENAI = process.env.OPENAI_API_KEY || keys.OPENAI_API_KEY;

const fixture = JSON.parse(
  readFileSync(join(ROOT, 'workers/cortex/__tests__/fixtures/relate-deadlines.json'), 'utf8'),
);
const today = fixture.today;
const candidates = withKeys(
  shapeItems({
    todos: fixture.items.todos,
    habits: fixture.items.habits,
    notes: fixture.items.notes,
    logged: new Map(),
  }),
  RELATE_ITEMS_MAX,
);
const PROMPT = relatePromptFor(true);
const titleOf = new Map(
  ['todos', 'habits', 'notes'].flatMap((k) =>
    fixture.items[k].map((x) => [x.id, x.name || x.title]),
  ),
);

async function callOpenAI(system, user) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_completion_tokens: 1200,
      reasoning_effort: EFFORT,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) return { ok: false, status: res.status, error: (await res.text()).slice(0, 300) };
  const j = await res.json();
  return { ok: true, content: j.choices?.[0]?.message?.content || '' };
}

/** Whether the answer meets what the fixture expects. */
function meets(expect, rel) {
  if (expect.nochange) {
    // any answer but a change to a date
    const field = rel?.change?.field;
    return !(rel?.kind === 'edit' && (field === 'due_day' || field === 'target_date'));
  }
  if (expect.relation === null) return !rel;
  if (!rel || rel.kind === 'choose' || rel.intent !== expect.relation) return false;
  if (rel.entity?.id !== expect.entity) return false;
  if (expect.field) return rel.change?.field === expect.field && rel.change?.to === expect.value;
  return true;
}

async function one(drop) {
  const user = buildRelateInput({ todayIso: today, text: drop.text, candidates, deadlines: true });
  let r;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      r = await callOpenAI(PROMPT, user);
    } catch (e) {
      r = { ok: false, error: String(e).slice(0, 200) };
    }
    if (r.ok || (r.status && r.status < 429 && r.status !== 408)) break;
    await new Promise((s) => setTimeout(s, 2000 * (attempt + 1)));
  }
  const answer = r.ok ? parseJson(r.content) : null;
  const rel = answer ? decideRelation(answer, candidates, today, { deadlines: true }) : null;
  return {
    id: drop.id,
    covers: drop.covers,
    text: drop.text,
    expect: drop.expect,
    ok: !!r.ok,
    error: r.ok ? null : r.error,
    answer,
    kind: rel?.kind || null,
    intent: rel?.intent || null,
    entity: rel?.entity?.id || null,
    title: rel?.entity?.id ? titleOf.get(rel.entity.id) : null,
    candidates: rel?.candidates ? rel.candidates.map((c) => c.id) : null,
    change: rel?.change || null,
    met: r.ok ? meets(drop.expect, rel) : null,
  };
}

const results = await Promise.all(fixture.drops.map(one));
const outDir = join(HERE, 'results');
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, `deadlines-luna-low-${RUN}.jsonl`);
writeFileSync(outFile, results.map((x) => JSON.stringify(x)).join('\n') + '\n');
const met = results.filter((x) => x.met).length;
const failed = results.filter((x) => !x.ok).length;
console.log(
  `[relate-deadlines] run ${RUN}: ${met} of ${results.length} as expected${failed ? `, ${failed} calls failed` : ''}`,
);
for (const x of results)
  console.log(`  ${x.met ? 'ok  ' : 'MISS'} ${x.id} ${x.covers}: ${x.kind || 'new'} ${x.intent || ''} ${x.title || ''} ${x.change ? JSON.stringify(x.change) : ''}`);
