/**
 * People (data fabric stage 2): one record for each person in someone's life.
 *
 * The reader says, for each fact it makes, which people the fact is about: a
 * known person by ref, or someone new by the name the record uses, or by who
 * they are to the person when the record gives no name. It gives who someone
 * is only when the person states it, in their words. It can propose that two
 * known people are one, and never treats them as one. The first fill does the
 * same over the facts held before people records existed.
 *
 * Code turns that into records: it makes a record for someone new, adds a
 * name it has not seen for them, sets who they are from the fact the person
 * stated it in, ties facts to people, and keeps a proposal to merge. It never
 * merges by itself, never matches names, and never writes over a field the
 * person wrote. A merge happens only when the person says yes, and records
 * what it moved so it can be undone (mergePeople, undoMerge).
 */

import { db } from './db';
import { jsonCall, modelFor } from './llm';
import { personBlock, CARE_RULES } from '../careRules';

export const PEOPLE_PROMPT_VERSION = 'people-2026-10-08m';

/** Known people shown to a prompt at most. */
const MAX_KNOWN = 150;

export const PEOPLE_RULES = `PEOPLE
- The people Gremly knows in the person's life are listed with refs: the names used for each, and who each is to the person when the person has said it.
- For each fact, list each person it is about once, other than the person: a known person by ref, or someone not yet known by the name the record uses, or, when the record names no one, by who they are to the person.
- Give someone not yet known a new_ref of your own making, starting with n, the same for every mention of that one person in what you are shown and different for anyone else.
- Each entry is one human being in their life. Several people spoken of together are never one entry: list each one the record names, and nothing for those it does not.
- A name is what someone is called. Who they are to the person, or a group they belong to, is never a name.
- Use a known person's ref only when the record makes clear it is that person. When you are unsure which known person someone is, or whether they are one, give them once as someone not yet known, with maybe_ref, and give no known ref for them.
- Give who someone is only when the person states it in this record, in their own words. Give it from the person's side, as who they are to the person, in words that name only that relationship. When the record says only who they are to someone else, give that instead, naming that someone as the person would. Never infer it from a name, an activity, an occasion, their being with the person, or anything else.
- Who someone is is shown to the person, so no part of it ever refers to the person, by name or in any other way.
- When the record gives a known person a name the list does not have for them, give that name with their ref.
- When a record gives someone's name together with who they are to the person, and the ledger does not hold that, make a fact that says only that, about that person, even when the rest of the record only confirms or updates facts.
- When someone you give as not yet known may be a known person, give that person's ref as maybe_ref, with why. They stay two until the person says they are one.
- When two known people seem to be one person, say so in same_people with your reason. Never treat them as one.`;

/** The schema for the people of one fact. */
export const FACT_PEOPLE_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      ref: { type: 'string', nullable: true },
      new_ref: { type: 'string', nullable: true },
      name: { type: 'string', nullable: true },
      relationship: { type: 'string', nullable: true },
      maybe_ref: { type: 'string', nullable: true },
      maybe_why: { type: 'string', nullable: true },
    },
    required: ['ref', 'new_ref', 'name', 'relationship', 'maybe_ref', 'maybe_why'],
  },
};

export const SAME_PEOPLE_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      ref_a: { type: 'string' },
      ref_b: { type: 'string' },
      why: { type: 'string' },
    },
    required: ['ref_a', 'ref_b', 'why'],
  },
};

function clean(text, n = 80) {
  const s = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  return s ? s.slice(0, n) : null;
}

const lower = (s) => String(s || '').toLowerCase();

/**
 * Whether text the model gave as a name or as who someone is holds one of the
 * refs code made for the prompt (p1, n1, f3 and the like). Those are code's
 * own labels for the model, never words about anyone, so a name or a who that
 * holds one is refused. Compares against the refs alone; it never reads what
 * the words mean.
 */
export function mentionsRef(text, refs) {
  if (!text || !refs?.size) return false;
  return lower(text)
    .split(/[^a-z0-9]+/)
    .some((t) => t && refs.has(t));
}

/**
 * This person's known people, newest first, with every name each has been
 * called. Someone they hid is still someone: hidden is about what is shown,
 * so the reader still knows them and does not make them again.
 */
export async function loadPeople(d, userId) {
  const people = await d.select(
    `life_people?user_id=eq.${userId}&merged_into=is.null&select=id,name,name_by,relationship,relationship_by,relationship_fact_id,hidden_at,created_at&order=updated_at.desc&limit=${MAX_KNOWN}`,
  );
  if (!people.length) return [];
  const names = await d.select(
    `life_person_names?user_id=eq.${userId}&person_id=in.(${people.map((p) => p.id).join(',')})&select=person_id,name&order=created_at.asc`,
  );
  const byPerson = new Map();
  for (const n of names) byPerson.set(n.person_id, [...(byPerson.get(n.person_id) || []), n.name]);
  return people.map((p) => ({ ...p, names: byPerson.get(p.id) || [] }));
}

/** The known people as prompt lines, and the refs that name them. */
export function peopleLines(people) {
  const ref = new Map();
  const lines = (people || []).map((p, i) => {
    const r = `p${i + 1}`;
    ref.set(r, p);
    const others = (p.names || []).filter((n) => lower(n) !== lower(p.name));
    const name = p.name ? p.name : '(no name given yet)';
    const also = others.length ? ` | also called ${others.join(', ')}` : '';
    const who = p.relationship
      ? ` | ${p.relationship}, ${p.relationship_by === 'understood' ? 'as Gremly understood it from the records, never said by them' : 'as they said'}`
      : '';
    const hidden = p.hidden_at ? ' | hidden from their people page by them' : '';
    return `${r} | ${name}${also}${who}${hidden}`;
  });
  return { lines, ref };
}

/**
 * What the model said about people, as the writes code makes. Pure: the known
 * people are not changed. facts: [{ factId, people: [{ ref, name, relationship }] }].
 */
export function planPeople({
  known,
  facts,
  same = [],
  userId,
  runId,
  refs = [],
  newId = () => crypto.randomUUID(),
}) {
  const plan = {
    creates: [],
    updates: new Map(),
    names: [],
    ties: [],
    merges: [],
    rejected: 0,
    refused_refs: 0,
  };
  // every ref the prompt or the answer used: the known people's, the new ones
  // the model made, and any the caller gave (records, facts)
  const refSet = new Set(
    [
      ...known.keys(),
      ...(facts || []).flatMap((f) => (f.people || []).map((e) => e?.new_ref)),
      ...refs,
    ]
      .filter(Boolean)
      .map(lower),
  );
  const state = new Map(); // person id -> what this plan has made of them so far
  const view = (p) => {
    if (!state.has(p.id))
      state.set(p.id, {
        ...p,
        names: new Set((p.names || []).map(lower)),
        pending: new Set(),
      });
    return state.get(p.id);
  };
  const fresh = new Map(); // a new person's key -> their record
  const tied = new Set();
  const maybes = [];

  for (const f of facts || []) {
    for (const [i, e] of (f.people || []).entries()) {
      let name = clean(e?.name);
      let relationship = clean(e?.relationship, 60);
      if (mentionsRef(name, refSet)) {
        name = null;
        plan.refused_refs++;
      }
      if (mentionsRef(relationship, refSet)) {
        relationship = null;
        plan.refused_refs++;
      }
      let p;
      if (e?.ref) {
        const k = known.get(e.ref);
        if (!k) {
          plan.rejected++;
          continue;
        }
        p = view(k);
      } else {
        if (!name && !relationship) {
          plan.rejected++;
          continue;
        }
        // The model's own ref for someone new joins their mentions in this read.
        // Without one, each mention is a record of its own: code never matches names.
        const key = e.new_ref ? `k:${String(e.new_ref)}` : `m:${f.factId}:${i}`;
        if (!fresh.has(key)) {
          const created = {
            id: newId(),
            user_id: userId,
            name: name || null,
            relationship: name ? null : relationship,
            relationship_fact_id: name ? null : f.factId,
            run_id: runId,
            name_by: 'gremly',
            relationship_by: 'gremly',
            // set by the check; every row carries it, so one insert holds them all
            who_checked_at: null,
          };
          plan.creates.push(created);
          fresh.set(key, created);
          view({ ...created, names: [] });
        }
        p = state.get(fresh.get(key).id);
        // someone new who may be someone known: a proposal, never a merge
        const maybe = e.maybe_ref ? known.get(e.maybe_ref) : null;
        if (maybe && maybe.id !== p.id) maybes.push({ known: maybe, fresh: p, why: e.maybe_why });
      }

      const tie = `${f.factId}:${p.id}`;
      if (!tied.has(tie)) {
        tied.add(tie);
        plan.ties.push({ fact_id: f.factId, person_id: p.id, user_id: userId, run_id: runId });
      }

      if (name && !p.names.has(lower(name)) && !p.pending.has(lower(name))) {
        p.pending.add(lower(name));
        plan.names.push({
          person_id: p.id,
          user_id: userId,
          name,
          fact_id: f.factId,
          run_id: runId,
        });
        if (!p.name && p.name_by !== 'person') {
          p.name = name;
          patchOf(plan, p).name = name;
        }
      }
      // Who they are: only as the person stated it, and never over their own
      // words. Someone known only by who they are keeps it: it is who they are.
      // What Gremly only understood from the records gives way to what a fact
      // states, even the same words: it is then theirs, read by Gremly.
      if (
        relationship &&
        p.relationship_by !== 'person' &&
        (p.name || !p.relationship) &&
        (lower(p.relationship) !== lower(relationship) || p.relationship_by === 'understood')
      ) {
        const was = p.relationship_by;
        p.relationship = relationship;
        p.relationship_fact_id = f.factId;
        p.relationship_by = 'gremly';
        Object.assign(patchOf(plan, p), {
          relationship,
          relationship_fact_id: f.factId,
          ...(was === 'understood' ? { relationship_by: 'gremly' } : {}),
        });
      }
    }
  }

  // A proposal to merge, between two different known people; the older is kept
  for (const s of same || []) {
    const a = known.get(s?.ref_a);
    const b = known.get(s?.ref_b);
    if (!a || !b || a.id === b.id) {
      plan.rejected++;
      continue;
    }
    // the older is kept; two made together are ordered by id, so a pair is always the same way round
    const order = (x) => `${x.created_at || ''}|${x.id}`;
    const [kept, merged] = order(a) <= order(b) ? [a, b] : [b, a];
    plan.merges.push({
      user_id: userId,
      kept_id: kept.id,
      merged_id: merged.id,
      status: 'proposed',
      reason: clean(s.why, 300),
      run_id: runId,
    });
  }

  const proposed = new Set(plan.merges.map((m) => `${m.kept_id}:${m.merged_id}`));
  for (const m of maybes) {
    const pair = `${m.known.id}:${m.fresh.id}`;
    if (proposed.has(pair)) continue;
    proposed.add(pair);
    plan.merges.push({
      user_id: userId,
      kept_id: m.known.id,
      merged_id: m.fresh.id,
      status: 'proposed',
      reason: clean(m.why, 300),
      run_id: runId,
    });
  }

  // A new person's fields go in with the record, not as a patch
  const freshIds = new Set(plan.creates.map((c) => c.id));
  for (const c of plan.creates) {
    const p = state.get(c.id);
    c.name = p.name || null;
    c.relationship = p.relationship || null;
    c.relationship_fact_id = p.relationship ? p.relationship_fact_id : null;
  }
  for (const id of [...plan.updates.keys()]) if (freshIds.has(id)) plan.updates.delete(id);
  return plan;
}

function patchOf(plan, p) {
  if (!plan.updates.has(p.id)) plan.updates.set(p.id, {});
  return plan.updates.get(p.id);
}

/** Write a plan. Counts what it wrote. */
export async function writePeople(d, userId, plan) {
  const nowIso = new Date().toISOString();
  if (plan.creates.length) await d.insertQuiet('life_people', plan.creates);
  let changed = 0;
  for (const [id, patch] of plan.updates) {
    // a field the person wrote is never written over
    const guards = [
      patch.name ? '&name_by=eq.gremly' : '',
      patch.relationship ? '&relationship_by=neq.person' : '',
    ].join('');
    const rows = await d.update(`life_people?id=eq.${id}&user_id=eq.${userId}${guards}`, {
      ...patch,
      updated_at: nowIso,
    });
    // counted only where the database changed the row
    if (Array.isArray(rows)) changed += rows.length;
  }
  if (plan.names.length) await d.insertIgnore('life_person_names', plan.names, 'person_id,name');
  if (plan.ties.length) await d.insertIgnore('life_fact_people', plan.ties, 'fact_id,person_id');
  if (plan.merges.length)
    await d.insertIgnore('person_merges', plan.merges, 'user_id,kept_id,merged_id');
  return {
    people_new: plan.creates.length,
    people_changed: changed,
    people_names: plan.names.length,
    people_ties: plan.ties.length,
    people_merges_proposed: plan.merges.length,
    people_rejected: plan.rejected,
    people_refused_refs: plan.refused_refs || 0,
    people_who_cleared: plan.who_cleared || 0,
    people_names_cleared: plan.names_cleared || 0,
    people_dropped: plan.dropped || 0,
  };
}

// ── The check on who someone is (data fabric stage 4c) ─────────────────────

export const WHO_CHECK_VERSION = 'who-check-2026-10-07h';

const WHO_CHECK_RULES = `CHECKING WHO SOMEONE IS
- Gremly keeps records of the people in a person's life. For each record you are given the name Gremly would call them by and who Gremly would say they are to the person, each with the person's own words it comes from.
- who_holds is true only when the person's own words given for it themselves state that this person is that to them, or to the someone else the words name. Words state it when they say it outright, when the person calls someone by a word that itself says who they are to them, or when they say where the person knows someone from and the who says no more than that. Words that only mention someone, or leave who they are to be guessed from a name, an activity, an occasion or their being there, do not state it. When no words are kept for it, it does not hold. Anything in it that is not plain words about people, such as a code or a label, never holds.
- Who someone is is shown to the person, so a who that refers to the person by their name never holds, even when their words state the rest of it.
- name_holds is true only when the name is what this person is called, as the person's words use it. A word that says who someone is to the person, such as a family tie or a role in their life, is never a name, even when the person calls them by it, and nor is a group they belong to.
- Only the person's own words count. Anything in them marked as Gremly's is there for context and states nothing.
- Answer null only for a name or a who the record does not have.
- Judge only from the words given, never from what you might expect.`;

const WHO_CHECK_SCHEMA = {
  type: 'object',
  properties: {
    checks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ref: { type: 'string' },
          who_holds: { type: 'boolean', nullable: true },
          name_holds: { type: 'boolean', nullable: true },
        },
        required: ['ref', 'who_holds', 'name_holds'],
      },
    },
  },
  required: ['checks'],
};

/** Records checked in one call, so every answer fits what the model may write. */
const CHECK_BATCH = 40;
// a whole record, so the words that state a name or who are never cut away
const WORDS_CHARS = 12000;

/**
 * Check names and who someone is against the person's own words, a batch of
 * records to a call. entries: [{ id, name, nameWords, relationship, whoWords }].
 * @returns Map of id to { who_holds, name_holds }, for the ids it answered,
 * each true, false, or null when the record has none or the check gave no
 * answer for it. What a null means is for the caller to say.
 */
export async function checkWho(env, { person = null, entries }) {
  const list = (entries || []).filter((e) => e && (e.name || e.relationship));
  const verdicts = new Map();
  for (let i = 0; i < list.length; i += CHECK_BATCH) {
    const batch = list.slice(i, i + CHECK_BATCH);
    const refs = new Map();
    const quoted = (words) => {
      const text = clean(words, WORDS_CHARS);
      return text ? `"${text}"` : 'none kept';
    };
    const lines = batch.map((e, j) => {
      const ref = `r${j + 1}`;
      refs.set(ref, e);
      const name = e.name
        ? `name "${clean(e.name)}", from their words ${quoted(e.nameWords)}`
        : 'no name';
      const who = e.relationship
        ? `who "${clean(e.relationship, 60)}", from their words ${quoted(e.whoWords)}`
        : 'no who';
      return `${ref} | ${name} | ${who}`;
    });
    let output;
    try {
      ({ output } = await jsonCall(env, {
        primary: modelFor(env, 'check'),
        fallback: modelFor(env, 'checkFallback'),
        system: {
          fixed: `You check Gremly's records of the people in someone's life.\n\n${WHO_CHECK_RULES}`,
          varying: personBlock(person),
        },
        user: `RECORDS (ref | name and the words it comes from | who and the words it comes from):\n${lines.join('\n')}`,
        schema: WHO_CHECK_SCHEMA,
        maxTokens: 4000,
        effort: 'low',
        thinking: 'low',
      }));
    } catch (err) {
      // these records get no answer, and are left unchecked; the rest go on
      console.warn(
        `[ALERT][People] who someone is could not be checked for ${batch.length} records, left unchecked: ${err?.message || err}`,
      );
      continue;
    }
    for (const c of output?.checks || []) {
      const e = refs.get(c?.ref);
      if (!e || verdicts.has(e.id)) continue;
      verdicts.set(e.id, {
        who_holds: e.relationship && typeof c.who_holds === 'boolean' ? c.who_holds : null,
        name_holds: e.name && typeof c.name_holds === 'boolean' ? c.name_holds : null,
      });
    }
  }
  return verdicts;
}

/**
 * What a plan gives each person it makes or changes, with the facts it comes
 * from, for checkWho. Pure. wordsOf(factId) gives the person's own words kept
 * with a fact, or null.
 */
export function whoEntries(plan, wordsOf) {
  const nameFact = (id, name) =>
    plan.names.find((n) => n.person_id === id && lower(n.name) === lower(name))?.fact_id || null;
  const out = [];
  for (const c of plan.creates)
    out.push({
      id: c.id,
      name: c.name || null,
      nameWords: c.name ? wordsOf(nameFact(c.id, c.name)) : null,
      relationship: c.relationship || null,
      whoWords: c.relationship ? wordsOf(c.relationship_fact_id) : null,
    });
  for (const [id, patch] of plan.updates) {
    if (!patch.name && !patch.relationship) continue;
    out.push({
      id,
      name: patch.name || null,
      nameWords: patch.name ? wordsOf(nameFact(id, patch.name)) : null,
      relationship: patch.relationship || null,
      whoWords: patch.relationship ? wordsOf(patch.relationship_fact_id) : null,
    });
  }
  return out.filter((e) => e.name || e.relationship);
}

/**
 * Apply the check to a plan before it is written: who someone is, or a name,
 * that the person's words do not state is not written. Blank is better than
 * wrong. Someone new left with neither is not made, and their ties and any
 * merge proposed for them go with them; the facts stay. A new record the
 * check answered for is marked checked. Changes the plan; returns it.
 */
export function applyWhoCheck(plan, verdicts, at = new Date().toISOString()) {
  const dropName = (id, name) => {
    plan.names = plan.names.filter((n) => !(n.person_id === id && lower(n.name) === lower(name)));
    plan.names_cleared = (plan.names_cleared || 0) + 1;
  };
  const dropped = new Set();
  for (const c of plan.creates) {
    const v = verdicts.get(c.id);
    if (!v) continue;
    // something new is kept only when the check says it holds
    if (c.relationship && v.who_holds !== true) {
      c.relationship = null;
      c.relationship_fact_id = null;
      plan.who_cleared = (plan.who_cleared || 0) + 1;
    }
    if (c.name && v.name_holds !== true) {
      dropName(c.id, c.name);
      c.name = null;
    }
    c.who_checked_at = at;
    if (!c.name && !c.relationship) dropped.add(c.id);
  }
  for (const [id, patch] of plan.updates) {
    const v = verdicts.get(id);
    if (!v) continue;
    if (patch.relationship && v.who_holds !== true) {
      delete patch.relationship;
      delete patch.relationship_fact_id;
      plan.who_cleared = (plan.who_cleared || 0) + 1;
    }
    if (patch.name && v.name_holds !== true) {
      dropName(id, patch.name);
      delete patch.name;
    }
    if (!Object.keys(patch).length) plan.updates.delete(id);
  }
  if (dropped.size) {
    plan.creates = plan.creates.filter((c) => !dropped.has(c.id));
    plan.ties = plan.ties.filter((t) => !dropped.has(t.person_id));
    plan.names = plan.names.filter((n) => !dropped.has(n.person_id));
    plan.merges = plan.merges.filter((m) => !dropped.has(m.kept_id) && !dropped.has(m.merged_id));
    plan.dropped = (plan.dropped || 0) + dropped.size;
  }
  return plan;
}

/**
 * Check a plan against the person's words before it is written. A check that
 * cannot be made leaves the plan as it is, unchecked, for the weekly pipe to
 * check later (recheckPeople), and says so.
 */
export async function checkPlan(env, plan, { person = null, wordsOf }) {
  const entries = whoEntries(plan, wordsOf);
  if (!entries.length) return plan;
  try {
    const verdicts = await checkWho(env, { person, entries });
    const unanswered = entries.filter((e) => !verdicts.has(e.id)).length;
    if (unanswered) plan.unchecked = unanswered;
    return applyWhoCheck(plan, verdicts);
  } catch (err) {
    console.warn(
      `[ALERT][People] who someone is could not be checked, left for the weekly check: ${err?.message || err}`,
    );
    plan.unchecked = entries.length;
    return plan;
  }
}

/**
 * Check the records made before the check existed, or left unchecked: each
 * once. What the person wrote is theirs and is not checked. Who someone is,
 * or a name, that their words do not state is cleared; one the check gives no
 * answer for is left, unchecked, for the next run. A record left with neither
 * goes, with its ties (the facts stay), only when nothing on it is the
 * person's: not hidden by them, in no merge they decided, in no Chapter they
 * put them in, and no record was merged into it. Otherwise it stays as it is
 * and is raised. In shadow nothing is written and what would change is
 * returned.
 */
export async function recheckPeople(
  env,
  userId,
  { person = null, shadow = false, limit = 150, onlyUnchecked = true } = {},
) {
  const d = db(env);
  // the shadow runner can check every record, checked or not, read only
  const which = onlyUnchecked || !shadow ? '&who_checked_at=is.null' : '';
  const rows =
    (await d.select(
      `life_people?user_id=eq.${userId}&merged_into=is.null${which}&select=id,name,name_by,relationship,relationship_by,relationship_fact_id,hidden_at&order=created_at.asc&limit=${limit}`,
    )) || [];
  const out = {
    records: rows.length,
    checked: 0,
    who_cleared: 0,
    names_cleared: 0,
    removed: 0,
    shadow,
  };
  if (!rows.length) return out;
  const ids = rows.map((r) => r.id);
  const names = [];
  for (const chunk of batches(ids))
    names.push(
      ...((await d.select(
        `life_person_names?user_id=eq.${userId}&person_id=in.(${chunk.join(',')})&select=person_id,name,fact_id`,
      )) || []),
    );
  const nameFact = (r) =>
    names.find((n) => n.person_id === r.id && lower(n.name) === lower(r.name))?.fact_id || null;
  const factIds = [
    ...new Set(rows.flatMap((r) => [r.relationship_fact_id, nameFact(r)]).filter(Boolean)),
  ];
  // every quote kept for a fact, from each record it was read in, so the
  // words are not only the one quote kept with the fact
  const quotes = new Map();
  const addQuote = (id, q) => {
    const t = clean(q, WORDS_CHARS);
    if (t && !(quotes.get(id) || []).includes(t)) quotes.set(id, [...(quotes.get(id) || []), t]);
  };
  for (const chunk of batches(factIds)) {
    for (const f of (await d.select(
      `life_facts?user_id=eq.${userId}&id=in.(${chunk.join(',')})&select=id,source_quote`,
    )) || [])
      addQuote(f.id, f.source_quote);
    for (const s of (await d.select(
      `life_fact_sources?user_id=eq.${userId}&fact_id=in.(${chunk.join(',')})&quote=not.is.null&select=fact_id,quote`,
    )) || [])
      addQuote(s.fact_id, s.quote);
  }
  const wordsOf = (id) => (id && quotes.get(id)?.length ? quotes.get(id).join(' ... ') : null);
  const gremlys = (r) => ({
    name: r.name && r.name_by === 'gremly' ? r.name : null,
    relationship: r.relationship && r.relationship_by === 'gremly' ? r.relationship : null,
  });
  const entries = rows
    .map((r) => {
      const g = gremlys(r);
      return {
        id: r.id,
        name: g.name,
        nameWords: g.name ? wordsOf(nameFact(r)) : null,
        relationship: g.relationship,
        whoWords: g.relationship ? wordsOf(r.relationship_fact_id) : null,
      };
    })
    .filter((e) => e.name || e.relationship);
  const verdicts = await checkWho(env, { person, entries });
  const at = new Date().toISOString();
  const changes = [];
  for (const r of rows) {
    const g = gremlys(r);
    const v = verdicts.get(r.id);
    // nothing of Gremly's to check: theirs, and checked
    if (!g.name && !g.relationship) {
      if (!shadow)
        await d.update(`life_people?id=eq.${r.id}&user_id=eq.${userId}`, { who_checked_at: at });
      continue;
    }
    // not answered for everything Gremly holds: left unchecked, for the next run
    if (!v || (g.name && v.name_holds === null) || (g.relationship && v.who_holds === null))
      continue;
    out.checked++;
    const whoFails = !!g.relationship && v.who_holds === false;
    const nameFails = !!g.name && v.name_holds === false;
    const keepsName = nameFails ? null : r.name;
    const keepsWho = whoFails ? null : r.relationship;
    const change = {
      id: r.id,
      name: r.name,
      relationship: r.relationship,
      who_fails: whoFails,
      name_fails: nameFails,
    };
    if (whoFails) out.who_cleared++;
    if (nameFails) out.names_cleared++;
    if (!keepsName && !keepsWho) {
      const theirs = await personsOwn(d, userId, r);
      if (theirs) {
        // a record cannot be left with neither, and this one cannot go: it
        // stays as it is, checked, and is raised once
        out.kept_theirs = (out.kept_theirs || 0) + 1;
        changes.push({ ...change, kept: theirs });
        console.warn(
          `[ALERT][People] ${r.id} holds nothing the person's words state, but ${theirs}: left as it is`,
        );
        if (!shadow)
          await d.update(`life_people?id=eq.${r.id}&user_id=eq.${userId}`, { who_checked_at: at });
        continue;
      }
      changes.push({ ...change, removed: true });
      if (shadow) {
        out.removed++;
        continue;
      }
      const gone = await d.remove(
        `life_people?id=eq.${r.id}&user_id=eq.${userId}&name_by=eq.gremly&relationship_by=eq.gremly&hidden_at=is.null`,
      );
      // counted only where the database removed it
      if (Array.isArray(gone) && gone.length) out.removed++;
      else
        console.warn(
          `[ALERT][People] ${r.id} holds nothing the person's words state, and could not be removed`,
        );
      continue;
    }
    if (whoFails || nameFails) changes.push(change);
    if (shadow) continue;
    const patch = { who_checked_at: at };
    if (whoFails) Object.assign(patch, { relationship: null, relationship_fact_id: null });
    if (nameFails) patch.name = null;
    // the order of the people the reader knows moves only when one changes
    if (whoFails || nameFails) patch.updated_at = at;
    await d.update(
      `life_people?id=eq.${r.id}&user_id=eq.${userId}${whoFails ? '&relationship_by=eq.gremly' : ''}${nameFails ? '&name_by=eq.gremly' : ''}`,
      patch,
    );
    if (nameFails)
      await d.remove(
        `life_person_names?person_id=eq.${r.id}&user_id=eq.${userId}&name=eq.${encodeURIComponent(r.name)}&by=eq.gremly`,
      );
  }
  if (shadow) out.changes = changes;
  return out;
}

/**
 * What on a record is the person's, so it may not go: their hiding it, a
 * field they wrote, a merge they decided, a Chapter they put them in, or a
 * record merged into it.
 * Null when there is nothing.
 */
async function personsOwn(d, userId, r) {
  if (r.hidden_at) return 'they hid it';
  if (r.name_by === 'person' || r.relationship_by === 'person') return 'they wrote part of it';
  const [merges, chapters, into] = await Promise.all([
    d.select(
      `person_merges?user_id=eq.${userId}&or=(kept_id.eq.${r.id},merged_id.eq.${r.id})&status=neq.proposed&select=id&limit=1`,
    ),
    d.select(
      `chapter_people?user_id=eq.${userId}&person_id=eq.${r.id}&written_by=eq.person&select=chapter_id&limit=1`,
    ),
    d.select(`life_people?user_id=eq.${userId}&merged_into=eq.${r.id}&select=id&limit=1`),
  ]);
  if ((into || []).length) return 'another record was merged into it';
  if ((merges || []).length) return 'it is in a merge they decided';
  if ((chapters || []).length) return 'they put them in a Chapter';
  return null;
}

/**
 * After a correction: who someone is came from a fact the person has now said
 * is wrong, so it is cleared. Blank is better than wrong; a later fact the
 * person states sets it again. Names stay. Someone known only by who they are
 * rested on that alone, so their record goes, with its ties: the facts stay,
 * and the next read that names them makes them again.
 */
export async function peopleAfterCorrection(d, userId, factIds) {
  if (!factIds?.length) return { cleared: 0, removed: 0 };
  const facts = `relationship_fact_id=in.(${factIds.join(',')})`;
  const removed = await d.remove(
    `life_people?user_id=eq.${userId}&relationship_by=eq.gremly&name=is.null&${facts}&select=id`,
  );
  const cleared = await d.update(
    `life_people?user_id=eq.${userId}&relationship_by=eq.gremly&name=not.is.null&${facts}`,
    { relationship: null, relationship_fact_id: null, updated_at: new Date().toISOString() },
  );
  return {
    cleared: Array.isArray(cleared) ? cleared.length : 0,
    removed: Array.isArray(removed) ? removed.length : 0,
  };
}

/**
 * Merge two people the person said are one: the merged record's names and
 * facts move to the kept one, the merged record points at it, and what moved
 * is kept on the merge first, so a retry carries on with the same plan and
 * undoMerge can put both back as they were. Called only for a merge the person
 * said yes to.
 */
export async function mergePeople(d, userId, mergeId) {
  const [m] = await d.select(`person_merges?id=eq.${mergeId}&user_id=eq.${userId}&select=*`);
  if (!m || m.status !== 'proposed')
    return { merged: false, reason: m ? `already ${m.status}` : 'not found' };
  let moved = m.moved;
  if (!moved) {
    const [kept, merged] = await Promise.all([
      d.select(`life_people?id=eq.${m.kept_id}&user_id=eq.${userId}&select=*`).then((r) => r[0]),
      d.select(`life_people?id=eq.${m.merged_id}&user_id=eq.${userId}&select=*`).then((r) => r[0]),
    ]);
    if (!kept || !merged) return { merged: false, reason: 'a record is gone' };
    const [names, ties, keptNames, keptTies] = await Promise.all([
      d.select(
        `life_person_names?person_id=eq.${merged.id}&user_id=eq.${userId}&select=name,fact_id,by`,
      ),
      d.select(`life_fact_people?person_id=eq.${merged.id}&user_id=eq.${userId}&select=fact_id`),
      d.select(`life_person_names?person_id=eq.${kept.id}&user_id=eq.${userId}&select=name`),
      d.select(`life_fact_people?person_id=eq.${kept.id}&user_id=eq.${userId}&select=fact_id`),
    ]);
    const haveName = new Set(keptNames.map((n) => lower(n.name)));
    const haveFact = new Set(keptTies.map((t) => t.fact_id));
    const keptPatch = {};
    const keptBefore = {};
    if (!kept.relationship && merged.relationship) {
      Object.assign(keptPatch, {
        relationship: merged.relationship,
        relationship_fact_id: merged.relationship_fact_id,
        relationship_by: merged.relationship_by,
      });
      Object.assign(keptBefore, {
        relationship: kept.relationship,
        relationship_fact_id: kept.relationship_fact_id,
        relationship_by: kept.relationship_by,
      });
    }
    if (!kept.name && merged.name) {
      Object.assign(keptPatch, { name: merged.name, name_by: merged.name_by });
      Object.assign(keptBefore, { name: kept.name, name_by: kept.name_by });
    }
    moved = {
      names: names.filter((n) => !haveName.has(lower(n.name))),
      facts: ties.map((t) => t.fact_id).filter((id) => !haveFact.has(id)),
      kept_patch: keptPatch,
      kept_before: keptBefore,
    };
    // the plan is kept before anything moves
    await d.update(`person_merges?id=eq.${m.id}&user_id=eq.${userId}`, { moved });
  }
  const nowIso = new Date().toISOString();
  if (moved.names.length)
    await d.insertIgnore(
      'life_person_names',
      moved.names.map((n) => ({
        person_id: m.kept_id,
        user_id: userId,
        name: n.name,
        fact_id: n.fact_id,
        by: n.by,
      })),
      'person_id,name',
    );
  if (moved.facts.length)
    await d.insertIgnore(
      'life_fact_people',
      moved.facts.map((fact_id) => ({ fact_id, person_id: m.kept_id, user_id: userId })),
      'fact_id,person_id',
    );
  if (Object.keys(moved.kept_patch).length)
    await d.update(`life_people?id=eq.${m.kept_id}&user_id=eq.${userId}`, {
      ...moved.kept_patch,
      updated_at: nowIso,
    });
  await d.update(`life_people?id=eq.${m.merged_id}&user_id=eq.${userId}`, {
    merged_into: m.kept_id,
    updated_at: nowIso,
  });
  await d.update(`person_merges?id=eq.${m.id}&user_id=eq.${userId}`, {
    status: 'merged',
    decided_at: nowIso,
  });
  return { merged: true, names: moved.names.length, facts: moved.facts.length };
}

/** In batches small enough for a URL. */
function batches(list, n = 100) {
  const out = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
}

/**
 * Undo a merge: both records as they were before it. A field of the kept
 * record goes back only where it still holds what the merge put there and
 * the person has not written it since.
 */
export async function undoMerge(d, userId, mergeId) {
  const [m] = await d.select(`person_merges?id=eq.${mergeId}&user_id=eq.${userId}&select=*`);
  if (!m || m.status !== 'merged') return { undone: false, reason: m ? 'not merged' : 'not found' };
  const moved = m.moved || {};
  const nowIso = new Date().toISOString();
  for (const n of moved.names || [])
    await d.remove(
      `life_person_names?person_id=eq.${m.kept_id}&user_id=eq.${userId}&name=eq.${encodeURIComponent(n.name)}`,
    );
  for (const ids of batches(moved.facts || []))
    await d.remove(
      `life_fact_people?person_id=eq.${m.kept_id}&user_id=eq.${userId}&fact_id=in.(${ids.join(',')})`,
    );
  const patch = moved.kept_patch || {};
  if (Object.keys(patch).length) {
    const [kept] = await d.select(`life_people?id=eq.${m.kept_id}&user_id=eq.${userId}&select=*`);
    const back = {};
    if ('name' in patch && kept?.name === patch.name && kept?.name_by !== 'person')
      Object.assign(back, { name: moved.kept_before.name, name_by: moved.kept_before.name_by });
    if (
      'relationship' in patch &&
      kept?.relationship === patch.relationship &&
      kept?.relationship_by !== 'person'
    )
      Object.assign(back, {
        relationship: moved.kept_before.relationship,
        relationship_fact_id: moved.kept_before.relationship_fact_id,
        relationship_by: moved.kept_before.relationship_by,
      });
    if (Object.keys(back).length)
      await d.update(`life_people?id=eq.${m.kept_id}&user_id=eq.${userId}`, {
        ...back,
        updated_at: nowIso,
      });
  }
  await d.update(`life_people?id=eq.${m.merged_id}&user_id=eq.${userId}`, {
    merged_into: null,
    updated_at: nowIso,
  });
  await d.update(`person_merges?id=eq.${m.id}&user_id=eq.${userId}`, {
    status: 'undone',
    decided_at: nowIso,
  });
  return { undone: true };
}

// ── The first fill: people from the facts held before people records ──────

/** Facts sent in one call of the first fill. */
export const FILL_PER_CALL = 120;

const FILL_SCHEMA = {
  type: 'object',
  properties: {
    facts: {
      type: 'array',
      items: {
        type: 'object',
        properties: { ref: { type: 'string' }, people: FACT_PEOPLE_SCHEMA },
        required: ['ref', 'people'],
      },
    },
    same_people: SAME_PEOPLE_SCHEMA,
  },
  required: ['facts', 'same_people'],
};

function fillSystemPrompt(person) {
  return `You find the people in one person's life for Gremly, a companion app. You are shown facts from their ledger, each with the person's own words it was taken from, and the people Gremly already knows. Say which people each fact is about.

${personBlock(person)}

${CARE_RULES}

${PEOPLE_RULES}
- Here a fact's record is the person's own words given with it, which are often only part of what they wrote. Give who someone is only when those words themselves state it. The fact's statement is Gremly's wording, and is never where who someone is comes from.
- A fact about no one but the person lists no people.

Return each fact you are shown once, by its ref. Return only the structured result.`;
}

/** The request for one batch of the first fill. */
export function fillRequest({ person, facts, known }) {
  const { lines, ref: personRef } = peopleLines(known);
  const factRef = new Map();
  const factLines = facts.map((f, i) => {
    const r = `f${i + 1}`;
    factRef.set(r, f);
    const words = f.source_quote
      ? ` | their words: "${clean(f.source_quote, 300)}"`
      : ' | their words: none kept';
    return `${r} | ${clean(f.statement, 300)}${words}`;
  });
  const user = `PEOPLE GREMLY KNOWS (ref | name | other names | who they are):
${lines.length ? lines.join('\n') : '(none yet)'}

FACTS (ref | statement | their words):
${factLines.join('\n')}`;
  return { system: fillSystemPrompt(person), user, factRef, personRef };
}

/**
 * The first fill for one person: the facts made before this run with no
 * people tied to them, a batch at a time, each batch seeing the people the
 * last one found. In shadow nothing is written and the people found are
 * returned for reading.
 */
/**
 * The fill's answer as facts for planPeople. Who someone is comes only from the
 * person's own words, so for a fact with none kept, who the model says someone
 * is cannot rest on anything and is not kept: the statement is Gremly's wording.
 * Returns how many were left out, so the run says so.
 */
export function fillFacts(judged, factRef) {
  let unsourced = 0;
  const facts = (judged || [])
    .filter((x) => factRef.has(x.ref))
    .map((x) => {
      const fact = factRef.get(x.ref);
      if (fact.source_quote) return { factId: fact.id, people: x.people };
      const people = (x.people || []).map((e) => {
        if (!e?.relationship) return e;
        unsourced++;
        return { ...e, relationship: null };
      });
      return { factId: fact.id, people };
    });
  return { facts, unsourced };
}

export async function fillPeople(
  env,
  userId,
  {
    person,
    before = new Date().toISOString(),
    shadow = false,
    maxCalls = 8,
    runId = `people-fill-${userId.slice(0, 8)}`,
  } = {},
) {
  const d = db(env);
  // the facts with no people tied yet, filtered by the database so the limit
  // counts only those
  const untied = await d.select(
    `life_facts?user_id=eq.${userId}&state=not.in.(corrected,superseded,set_aside)&created_at=lt.${encodeURIComponent(before)}&select=id,statement,source_quote,created_at,life_fact_people(person_id)&life_fact_people=is.null&order=created_at.asc&limit=${FILL_PER_CALL * maxCalls}`,
  );
  const existing = await loadPeople(d, userId);
  let known = existing;
  const out = {
    facts: untied.length,
    calls: 0,
    people_new: 0,
    people_names: 0,
    people_ties: 0,
    people_merges_proposed: 0,
    people_rejected: 0,
    people_who_without_words: 0,
    shadow,
  };
  const found = shadow ? { people: new Map(), ties: [], merges: [] } : null;
  for (let i = 0; i < untied.length; i += FILL_PER_CALL) {
    const batch = untied.slice(i, i + FILL_PER_CALL);
    const { system, user, factRef, personRef } = fillRequest({ person, facts: batch, known });
    const { output } = await jsonCall(env, {
      primary: modelFor(env, 'reader'),
      fallback: modelFor(env, 'readerFallback'),
      system,
      user,
      schema: FILL_SCHEMA,
      maxTokens: 16000,
      // once a person, over their whole ledger: worth more care than a read
      effort: 'medium',
      thinking: 'medium',
    });
    out.calls++;
    const { facts: judged, unsourced } = fillFacts(output.facts, factRef);
    out.people_who_without_words += unsourced;
    const quoteOf = new Map(batch.map((f) => [f.id, f.source_quote || null]));
    const plan = await checkPlan(
      env,
      planPeople({
        known: personRef,
        facts: judged,
        same: output.same_people,
        userId,
        runId,
        refs: [...factRef.keys()],
      }),
      { person, wordsOf: (id) => quoteOf.get(id) || null },
    );
    if (shadow) {
      // the people as this batch leaves them, for the next batch and for reading
      for (const c of plan.creates) found.people.set(c.id, { ...c, names: [] });
      for (const [id, patch] of plan.updates) {
        const p = found.people.get(id) || known.find((k) => k.id === id);
        if (p) found.people.set(id, { ...p, ...patch });
      }
      for (const n of plan.names) {
        const p = found.people.get(n.person_id) || known.find((k) => k.id === n.person_id);
        if (p) found.people.set(n.person_id, { ...p, names: [...(p.names || []), n.name] });
      }
      found.ties.push(...plan.ties);
      found.merges.push(...plan.merges);
      // as live reloads them: everyone known before, as this run has left them
      const byId = new Map(existing.map((p) => [p.id, p]));
      for (const [id, p] of found.people) byId.set(id, p);
      known = [...byId.values()];
      Object.assign(out, sumCounts(out, countsOf(plan)));
    } else {
      Object.assign(out, sumCounts(out, await writePeople(d, userId, plan)));
      known = await loadPeople(d, userId);
    }
  }
  if (shadow) {
    const statementOf = new Map(untied.map((f) => [f.id, f]));
    out.found = [...found.people.values()].map((p) => ({
      name: p.name,
      names: p.names || [],
      relationship: p.relationship,
      relationship_from: p.relationship_fact_id
        ? statementOf.get(p.relationship_fact_id)?.source_quote ||
          statementOf.get(p.relationship_fact_id)?.statement ||
          null
        : null,
      facts: found.ties
        .filter((t) => t.person_id === p.id)
        .map((t) => statementOf.get(t.fact_id)?.statement),
    }));
    out.proposed_merges = found.merges.map((m) => ({
      kept: found.people.get(m.kept_id)?.name || found.people.get(m.kept_id)?.relationship,
      merged: found.people.get(m.merged_id)?.name || found.people.get(m.merged_id)?.relationship,
      reason: m.reason,
    }));
  }
  return out;
}

function countsOf(plan) {
  return {
    people_new: plan.creates.length,
    people_changed: plan.updates.size,
    people_names: plan.names.length,
    people_ties: plan.ties.length,
    people_merges_proposed: plan.merges.length,
    people_rejected: plan.rejected,
    people_refused_refs: plan.refused_refs || 0,
    people_who_cleared: plan.who_cleared || 0,
    people_names_cleared: plan.names_cleared || 0,
    people_dropped: plan.dropped || 0,
  };
}

function sumCounts(a, b) {
  const out = {};
  for (const k of Object.keys(b)) out[k] = (a[k] || 0) + (b[k] || 0);
  return out;
}

/** Everyone with facts, for the one time fill, a page at a time. */
export async function usersWithFacts(env) {
  const d = db(env);
  const users = new Set();
  for (let offset = 0; ; offset += 1000) {
    const rows = await d.select(
      `life_facts?select=user_id&order=user_id.asc&limit=1000&offset=${offset}`,
    );
    for (const r of rows) users.add(r.user_id);
    if (rows.length < 1000) break;
  }
  return [...users];
}
