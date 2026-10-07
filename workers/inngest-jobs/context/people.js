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

export const PEOPLE_PROMPT_VERSION = 'people-2026-10-08f';

/** Known people shown to a prompt at most. */
const MAX_KNOWN = 150;

export const PEOPLE_RULES = `PEOPLE
- The people Gremly knows in the person's life are listed with refs: the names used for each, and who each is to the person when the person has said it.
- For each fact, list each person it is about once, other than the person: a known person by ref, or someone not yet known by the name the record uses, or, when the record names no one, by who they are to the person.
- Give someone not yet known a new_ref of your own making, starting with n, the same for every mention of that one person in what you are shown and different for anyone else.
- Each entry is one human being in their life. Several people spoken of together are never one entry: list each one the record names, and nothing for those it does not.
- A name is what someone is called. Who they are to the person, or a group they belong to, is never a name.
- Use a known person's ref only when the record makes clear it is that person. When you are unsure which known person someone is, or whether they are one, give them once as someone not yet known, with maybe_ref, and give no known ref for them.
- Give who someone is only when the person states it in this record, in their own words, and always as who they are to the person, without the person's own name. When the record says only who they are to someone else, give it that way, naming that someone. Never infer it from a name, an activity, an occasion, their being with the person, or anything else.
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
    const who = p.relationship ? ` | ${p.relationship}, as they said` : '';
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
  newId = () => crypto.randomUUID(),
}) {
  const plan = { creates: [], updates: new Map(), names: [], ties: [], merges: [], rejected: 0 };
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
      const name = clean(e?.name);
      const relationship = clean(e?.relationship, 60);
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
      if (
        relationship &&
        p.relationship_by !== 'person' &&
        (p.name || !p.relationship) &&
        lower(p.relationship) !== lower(relationship)
      ) {
        p.relationship = relationship;
        p.relationship_fact_id = f.factId;
        Object.assign(patchOf(plan, p), { relationship, relationship_fact_id: f.factId });
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
      patch.relationship ? '&relationship_by=eq.gremly' : '',
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
  };
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
    `life_facts?user_id=eq.${userId}&state=not.in.(corrected,superseded)&created_at=lt.${encodeURIComponent(before)}&select=id,statement,source_quote,created_at,life_fact_people(person_id)&life_fact_people=is.null&order=created_at.asc&limit=${FILL_PER_CALL * maxCalls}`,
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
    const plan = planPeople({
      known: personRef,
      facts: (output.facts || [])
        .filter((x) => factRef.has(x.ref))
        .map((x) => ({ factId: factRef.get(x.ref).id, people: x.people })),
      same: output.same_people,
      userId,
      runId,
    });
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
