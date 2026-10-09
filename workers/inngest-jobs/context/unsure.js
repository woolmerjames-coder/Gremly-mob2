/**
 * What Gremly is not sure of yet, and who matters most (data fabric, after the
 * comparison of 8 Oct, decided by James on 8 Oct).
 *
 * Facts are what the person said. This is what Gremly thinks about their life
 * but no record states: who someone is to them, or anything else about their
 * life that matters. It is kept apart (life_unsure), so it is never read as a
 * fact: no screen shows it, and no writer of anything shown reads it. Gremly's
 * questions read it, and ask so the person can say whether it is so
 * (peopleQuestions.js). A yes becomes a fact in their words, a no closes it
 * for good, and one Gremly stops thinking fades.
 *
 * The weekly pass is its one writer, as the one writer that reads the whole
 * week, and it says who matters most to them now (life_people.matters_rank),
 * judged from the records, with how often and how lately each person comes up
 * as evidence. Code applies only what the pass gives, to the refs it was
 * given: never an entry resting on anything private or about health, never
 * who someone is when the people list records it, and never one that rests on
 * no record.
 */

/** What an entry is about: who someone is, or anything else about their life. */
export const UNSURE_KINDS = Object.freeze(['who', 'life']);

/** How sure Gremly is, as the pass says it. */
export const UNSURE_SURE = Object.freeze(['low', 'medium', 'high']);

/** Not given again by the weekly pass for this many days, an open entry fades. */
export const UNSURE_FADE_DAYS = 21;

/** At most this many entries from one weekly pass. */
export const UNSURE_MOST = 10;

/** At most this many people named as mattering most. */
export const WHO_MATTERS_MOST = 8;

/** The pass's output for this layer, as parts of the weekly schema. */
export const NOT_SURE_PROPERTIES = {
  // what Gremly thinks about their life but no record states
  not_sure: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        about_ref: { type: 'string' },
        kind: { type: 'string', enum: [...UNSURE_KINDS] },
        thinks: { type: 'string' },
        refs: { type: 'array', items: { type: 'string' } },
        sure: { type: 'string', enum: [...UNSURE_SURE] },
        same_as: { type: 'string' },
      },
      required: ['about_ref', 'kind', 'thinks', 'refs', 'sure', 'same_as'],
    },
  },
  // the people who matter most to them now, most first
  who_matters: { type: 'array', items: { type: 'string' } },
};

/** The pass's rules for this layer. Semantic only. */
export const NOT_SURE_RULES = `WHAT GREMLY IS NOT SURE OF YET
- Apart from the facts, Gremly keeps what it thinks about their life but no record states, so that it can ask them rather than guess. Nothing here is ever said as known, in this or any other field, and no other field rests on it.
- In not_sure, give what the records point to but no record states as such, where knowing it would help Gremly understand their life: who someone on the people list is to them, when the list does not record it, and anything else that shapes their life now or ahead, which someone who knows them well would know.
- For each person on the people list whose tie to them is not recorded, give who Gremly thinks they are whenever the records say enough to point to it.
- Each entry is one thing Gremly thinks. It says in thinks what Gremly thinks, in one plain sentence about them, cites in refs the records that point to it, and gives in sure how sure Gremly is from how strongly those records point to it.
- Only what the records point to, never what they merely leave open, and never what a record already states.
- Never anything private, about their health, or of a kind a person may keep to themselves, whatever it rests on, and never resting on a record marked private or about health.
- about_ref is the ref on the people list of the person it is about, or self when it is about them.
- What Gremly was not sure of before is listed by its own refs. Give again each one the records still point to, with same_as set to its ref, as the records now show it, and leave out any they no longer point to. same_as is empty for anything new.
- At most ten, those that matter most to understanding their life first, and none when nothing is worth asking.

WHO MATTERS MOST
- In who_matters, list by their refs on the people list the people who matter most in their life now, most first, judged from the records: how often and how lately they come up, and what the records show of them. At most eight, fewer when fewer stand out, and none when the records show too little to tell.`;

function clean(text, n) {
  const s = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > n ? s.slice(0, n) : s;
}

const dayOf = (x) => String(x || '').slice(0, 10);

function addDays(day, n) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The table a record the pass was given lives in, for rests_on. */
const TABLE_OF = { fact: 'life_facts', journal: 'notes', item: 'todos' };

/**
 * How often and how lately each person comes up, from the facts tied to them
 * that are neither private nor about health, and which of those facts the
 * pass was given, by ref. Pure.
 * @param ties [{ fact_id, person_id }]
 * @param facts Map fact id -> { id, private, health, state, observed_at }
 * @param refOfFact Map fact id -> the ref the pass sees it by
 * @param today YYYY-MM-DD
 * @returns Map person id -> { facts, lately, latest, refs }
 */
export function peopleEvidence({ ties, facts, refOfFact = new Map(), today }) {
  const since = addDays(today, -30);
  const out = new Map();
  for (const t of ties || []) {
    const f = facts.get(t.fact_id);
    // a fact put right was never so, and one set aside no longer counts
    if (!f || f.private || f.health || ['corrected', 'set_aside'].includes(f.state)) continue;
    const e = out.get(t.person_id) || { facts: 0, lately: 0, latest: null, refs: [] };
    const on = dayOf(f.observed_at);
    e.facts++;
    if (on && on >= since) e.lately++;
    if (on && (!e.latest || on > e.latest)) e.latest = on;
    const ref = refOfFact.get(f.id);
    if (ref && !e.refs.includes(ref)) e.refs.push(ref);
    out.set(t.person_id, e);
  }
  return out;
}

/** How a person comes up, as the pass is shown it. Pure. */
export function evidenceWords(e) {
  if (!e || !e.facts) return 'not yet in any fact that can be shown';
  const refs = e.refs.length ? `: ${e.refs.slice(0, 8).join(', ')}` : '';
  return `in ${e.facts} ${e.facts === 1 ? 'fact' : 'facts'}, ${e.lately} recorded in the last 30 days, latest ${e.latest}${refs}`;
}

/**
 * What the pass is given of what Gremly was not sure of before: each open
 * entry about them or about someone on the people list, by a ref of its own
 * that is never a record. Pure.
 * @param open open entries [{ id, person_id, kind, thinks, sure, created_at }]
 * @param personRef Map person id -> the ref the pass sees them by
 * @param add (prefix, obj) => ref
 */
export function unsureLines(open, personRef, add) {
  const lines = [];
  for (const u of open || []) {
    const about = u.person_id ? personRef.get(u.person_id) : 'self';
    // someone no longer on the list cannot be given again: theirs fades
    if (!about) continue;
    const ref = add('u', { type: 'unsure', id: u.id, person_id: u.person_id || null, kind: u.kind });
    lines.push(`${ref} | ${about} | ${u.kind === 'who' ? 'who they are' : 'about their life'} | ${clean(u.thinks, 240)} | ${u.sure} | since ${dayOf(u.created_at)}`);
  }
  return lines;
}

/**
 * What the pass's not_sure and who_matters do, as writes. Pure.
 * @param p.output the pass's output
 * @param p.refs Map ref -> what the pass was given (refsSnapshot)
 * @param p.open open entries [{ id, person_id, kind, seen_at }]
 * @param p.people Map person id -> { relationship, merged_into, hidden_at }
 * @param p.asking ids of entries an open question is asking about
 * @returns {{ inserts, updates, fades, dropped, matters }}
 */
export function unsurePlan({ output, refs, open = [], people = new Map(), asking = new Set(), today }) {
  const inserts = [];
  const updates = [];
  const dropped = [];
  const touched = new Set();
  const openById = new Map((open || []).map((u) => [u.id, u]));
  const openWho = new Map(
    (open || []).filter((u) => u.kind === 'who' && u.person_id).map((u) => [u.person_id, u]),
  );
  const live = (id) => {
    const p = people.get(id);
    return !!p && !p.merged_into && !p.hidden_at;
  };
  const given = Array.isArray(output?.not_sure) ? output.not_sure.slice(0, UNSURE_MOST) : [];
  given.forEach((x, i) => {
    const drop = (why) => dropped.push({ i, why, thinks: clean(x?.thinks, 200) });
    if (!x || !UNSURE_KINDS.includes(x.kind)) return drop('no kind');
    const thinks = clean(x.thinks, 300);
    if (!thinks) return drop('says nothing');
    let personId = null;
    if (x.about_ref !== 'self') {
      const p = refs.get(x.about_ref);
      if (p?.type !== 'person' || !p.id) return drop('about no one it was given');
      personId = p.id;
      if (!live(personId)) return drop('about someone no longer on the list');
    }
    if (x.kind === 'who') {
      if (!personId) return drop('who, about no one');
      // who someone is, once it is recorded, is not a guess
      if (people.get(personId)?.relationship || refs.get(x.about_ref)?.relationship)
        return drop('who they are is recorded');
    }
    const cited = (Array.isArray(x.refs) ? x.refs : []).map((r) => refs.get(r)).filter(Boolean);
    if (cited.some((r) => r.private || r.health)) return drop('rests on something private or about health');
    const restsOn = [];
    for (const r of cited)
      if (TABLE_OF[r.type] && r.id && !restsOn.some((y) => y.id === r.id))
        restsOn.push({ table: TABLE_OF[r.type], id: r.id });
    if (!restsOn.length) return drop('rests on no record');
    const sure = UNSURE_SURE.includes(x.sure) ? x.sure : 'low';
    // the one it gives again: by its own ref, or the open guess at who this person is
    const before = refs.get(x.same_as);
    let was = before?.type === 'unsure' ? openById.get(before.id) : null;
    if (was && (was.kind !== x.kind || (was.person_id || null) !== personId)) was = null;
    if (!was && x.kind === 'who') was = openWho.get(personId) || null;
    if (was && touched.has(was.id)) return drop('given twice');
    const fields = { thinks, rests_on: restsOn, sure };
    if (was) {
      touched.add(was.id);
      updates.push({ id: was.id, patch: fields });
    } else {
      if (x.kind === 'who' && inserts.some((r) => r.kind === 'who' && r.person_id === personId))
        return drop('given twice');
      inserts.push({ person_id: personId, kind: x.kind, ...fields });
    }
  });
  // what Gremly no longer thinks fades: given again by no pass for a while,
  // about someone gone from the list, or who someone is now that it is recorded.
  // One a question is asking about waits for the answer.
  const fadeBefore = addDays(today, -UNSURE_FADE_DAYS);
  const fades = [];
  for (const u of open || []) {
    if (touched.has(u.id) || asking.has(u.id)) continue;
    if (u.person_id && !live(u.person_id)) fades.push({ id: u.id, why: 'no longer on the list' });
    else if (u.kind === 'who' && people.get(u.person_id)?.relationship)
      fades.push({ id: u.id, why: 'recorded' });
    else if (dayOf(u.seen_at) < fadeBefore) fades.push({ id: u.id, why: 'not given again' });
  }
  const matters = [];
  for (const r of Array.isArray(output?.who_matters) ? output.who_matters : []) {
    const p = refs.get(r);
    if (p?.type !== 'person' || !p.id || !live(p.id) || matters.some((m) => m.person_id === p.id))
      continue;
    matters.push({ person_id: p.id, rank: matters.length + 1 });
    if (matters.length >= WHO_MATTERS_MOST) break;
  }
  return { inserts, updates, fades, dropped, matters };
}

/**
 * What the weekly pass needs to apply this layer: the open entries, the people
 * as they stand, and the entries a question is asking about now.
 */
export async function loadUnsureState(d, userId) {
  const [open, people, asking] = await Promise.all([
    d.select(
      `life_unsure?user_id=eq.${userId}&status=eq.open&select=id,person_id,kind,thinks,sure,seen_at,created_at&order=created_at.asc&limit=200`,
    ),
    d.select(
      `life_people?user_id=eq.${userId}&select=id,relationship,merged_into,hidden_at,matters_rank&limit=2000`,
    ),
    d.select(
      `gremly_questions?user_id=eq.${userId}&kind=in.(person,unsure)&status=in.(open,asked)&select=proposed_change`,
    ),
  ]);
  return {
    open: open || [],
    people: new Map((people || []).map((p) => [p.id, p])),
    asking: new Set((asking || []).map((q) => q.proposed_change?.unsure_id).filter(Boolean)),
  };
}

/** Apply the plan: new entries, those given again, those faded, and who matters. */
export async function applyUnsure(d, userId, plan, { runId, promptVersion, nowIso, people }) {
  if (plan.inserts.length)
    await d.insertQuiet(
      'life_unsure',
      plan.inserts.map((r) => ({
        user_id: userId,
        ...r,
        status: 'open',
        run_id: runId,
        prompt_version: promptVersion,
        seen_at: nowIso,
        updated_at: nowIso,
      })),
    );
  for (const u of plan.updates)
    await d.update(`life_unsure?id=eq.${u.id}&user_id=eq.${userId}&status=eq.open`, {
      ...u.patch,
      run_id: runId,
      prompt_version: promptVersion,
      seen_at: nowIso,
      updated_at: nowIso,
    });
  for (const f of plan.fades)
    await d.update(`life_unsure?id=eq.${f.id}&user_id=eq.${userId}&status=eq.open`, {
      status: 'faded',
      updated_at: nowIso,
    });
  // who matters: the ranks given, and none for anyone they no longer name
  const ranked = new Map(plan.matters.map((m) => [m.person_id, m.rank]));
  for (const [id, p] of people || [])
    if (p.matters_rank != null && !ranked.has(id))
      await d.update(`life_people?id=eq.${id}&user_id=eq.${userId}`, { matters_rank: null, matters_at: nowIso });
  for (const m of plan.matters)
    await d.update(`life_people?id=eq.${m.person_id}&user_id=eq.${userId}`, {
      matters_rank: m.rank,
      matters_at: nowIso,
    });
  return {
    added: plan.inserts.length,
    given_again: plan.updates.length,
    faded: plan.fades.length,
    dropped: plan.dropped.length,
    matters: plan.matters.length,
  };
}
