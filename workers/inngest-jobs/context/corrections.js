/**
 * Corrections: when a person says something Gremly holds is wrong, the fact is
 * marked corrected with their words, and every place that repeated it is
 * rewritten straight away: today's DCO, Life Map threads, the profile text,
 * world cards and any live date anchors. Later runs see the correction and
 * cannot bring the old claim back.
 *
 * A model decides which facts and passages the correction is about and writes
 * the replacement wording. Code applies exactly what it returns, to the ids it
 * was shown, and nothing else.
 */

import { CARE_RULES, WRITING_RULES, personBlock } from '../careRules';
import { db, userTimezone, localDate, personIdentity } from './db';
import { jsonCall, modelFor } from './llm';
import { refreshLifeMapStory } from './story';
import { invalidateChatCache } from './cache';

export const CORRECTION_PROMPT_VERSION = 'correction-2026-09-30';

const CORRECTION_SCHEMA = {
  type: 'object',
  properties: {
    understood: { type: 'string' },
    corrected_facts: {
      type: 'array',
      items: {
        type: 'object',
        properties: { fact_ref: { type: 'string' }, why: { type: 'string' } },
        required: ['fact_ref', 'why'],
      },
    },
    new_facts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          statement: { type: 'string' },
          subject: { type: 'string' },
          about_date: { type: 'string', nullable: true },
          state: { type: 'string', enum: ['current', 'planned', 'happened'] },
        },
        required: ['statement', 'subject', 'state'],
      },
    },
    rewrites: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          passage_ref: { type: 'string' },
          new_text: { type: 'string', nullable: true },
        },
        required: ['passage_ref'],
      },
    },
    retire_anchor_refs: { type: 'array', items: { type: 'string' } },
  },
  required: ['understood', 'corrected_facts', 'new_facts', 'rewrites', 'retire_anchor_refs'],
};

function systemPrompt(today, person) {
  return `The person has told Gremly that something it holds about their life is wrong. Your job is to apply their correction everywhere, exactly and only where it applies.

TODAY'S DATE: ${today}

${personBlock(person)}

${CARE_RULES}

WHAT TO DO
- Read what the person said, and the conversation around it when given. Work out precisely what they say is wrong and, if they say it, what is true instead.
- Mark every fact in the ledger that their correction contradicts. Do not mark facts it does not touch.
- If they stated what is true, record it as a new fact in their words.
- For each passage of Gremly-written text that repeats or relies on the wrong claim, write a replacement that removes it and reads naturally, keeping everything else in the passage as it was. If nothing would be left worth saying, return null for that passage so it is cleared. Leave untouched any passage the correction does not concern; do not list it.
- Retire any date anchor that only exists because of the wrong claim.
- Never argue with the correction and never keep the old claim in softened form.

${WRITING_RULES}`;
}

function trim(text, n) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/** Collect every Gremly-written passage that could carry the wrong claim. */
async function loadPassages(env, userId, today) {
  const d = db(env);
  const [dcoRows, lifeMapRows, profileRows, worlds, anchors, chapters, storyItems] = await Promise.all([
    d.select(`user_daily_state?user_id=eq.${userId}&date=gte.${today}&select=id,date,dco`),
    d.select(`user_life_map?user_id=eq.${userId}&select=id,life_map`),
    d.select(`user_profiles?user_id=eq.${userId}&select=user_id,profile_text`),
    d.select(`worlds?owner_id=eq.${userId}&phase=in.(candidate,active,evolving,dormant)&select=id,display_name,name,card_subtitle,summary,key_priorities`),
    d.select(`user_temporal_anchors?user_id=eq.${userId}&status=eq.active&select=id,title,description,resolved_date,source_message`),
    d.select(`chapters?owner_id=eq.${userId}&select=id,title,card_subtitle,summary,epigraph&limit=80`),
    d.select(`story_items?user_id=eq.${userId}&state=eq.current&select=id,kind,title,body,fact_ids&limit=200`),
  ]);

  const passages = [];
  const add = (kind, locator, text) => {
    if (!text || typeof text !== 'string' || !text.trim()) return;
    passages.push({ ref: `p${passages.length + 1}`, kind, locator, text });
  };

  for (const row of dcoRows) {
    const dco = row.dco || {};
    add('dco', { id: row.id, path: ['brief_headline'] }, dco.brief_headline);
    add('dco', { id: row.id, path: ['lead_story', 'what'] }, dco.lead_story?.what);
    add('dco', { id: row.id, path: ['lead_story', 'why_today'] }, dco.lead_story?.why_today);
    add('dco', { id: row.id, path: ['voice_note'] }, dco.voice_note);
    add('dco', { id: row.id, path: ['life_moment'] }, dco.life_moment);
    (dco.today_focus || []).forEach((t, i) => add('dco', { id: row.id, path: ['today_focus', i] }, t));
    (dco.also_matters || []).forEach((t, i) => add('dco', { id: row.id, path: ['also_matters', i] }, t));
    add('dco', { id: row.id, path: ['brief', 'headline'] }, dco.brief?.headline);
    add('dco', { id: row.id, path: ['brief', 'day_shape'] }, dco.brief?.day_shape);
    add('dco', { id: row.id, path: ['brief', 'reach', 'why'] }, dco.brief?.reach?.why);
    add('dco', { id: row.id, path: ['brief', 'return', 'note'] }, dco.brief?.return?.note);
    (dco.brief?.claims || []).forEach((c, i) => add('dco', { id: row.id, path: ['brief', 'claims', i, 'why'] }, c?.why));
    add('dco', { id: row.id, path: ['worlds_summary', 'headline'] }, dco.worlds_summary?.headline);
  }

  const lm = lifeMapRows?.[0];
  add('life_map', { id: lm?.id, path: ['story', 'story_so_far'] }, lm?.life_map?.story?.story_so_far);
  add('life_map', { id: lm?.id, path: ['story', 'story_for_them'] }, lm?.life_map?.story?.story_for_them);
  if (lm?.life_map?.domains) {
    lm.life_map.domains.forEach((dom, di) => {
      (dom.threads || []).forEach((t, ti) => {
        add('life_map', { id: lm.id, path: ['domains', di, 'threads', ti, 'summary'] }, t.summary);
        add('life_map', { id: lm.id, path: ['domains', di, 'threads', ti, 'recent_update'] }, t.recent_update);
      });
    });
  }

  const prof = profileRows?.[0];
  if (prof?.profile_text) add('profile', { user_id: prof.user_id, field: 'profile_text' }, prof.profile_text);

  for (const w of worlds) {
    add('world', { id: w.id, field: 'card_subtitle' }, w.card_subtitle);
    add('world', { id: w.id, field: 'summary' }, w.summary);
    (Array.isArray(w.key_priorities) ? w.key_priorities : []).forEach((k, i) =>
      add('world', { id: w.id, field: 'key_priorities', index: i }, typeof k === 'string' ? k : k?.text),
    );
  }

  for (const c of chapters || []) {
    add('chapter', { id: c.id, field: 'card_subtitle' }, c.card_subtitle);
    add('chapter', { id: c.id, field: 'summary' }, c.summary);
    add('chapter', { id: c.id, field: 'epigraph' }, c.epigraph);
  }
  for (const s of storyItems || []) {
    add('story', { id: s.id, field: 'title' }, s.title);
    add('story', { id: s.id, field: 'body' }, s.body);
  }

  const anchorRefs = new Map();
  const anchorLines = anchors.map((a, i) => {
    const ref = `a${i + 1}`;
    anchorRefs.set(ref, a);
    return `${ref} | ${a.resolved_date || 'no date'} | ${a.title}${a.description ? `: ${a.description}` : ''}`;
  });

  return { passages, anchorRefs, anchorLines, lifeMap: lm, worlds, dcoRows, storyItems: storyItems || [] };
}

function setPath(obj, path, value) {
  let cur = obj;
  for (let i = 0; i < path.length - 1; i++) {
    if (cur[path[i]] == null) return false;
    cur = cur[path[i]];
  }
  const last = path[path.length - 1];
  if (Array.isArray(cur) && value == null) {
    cur.splice(last, 1, null);
  } else {
    cur[last] = value;
  }
  return true;
}

function compactArrays(obj, paths) {
  for (const p of paths) {
    let cur = obj;
    for (const k of p) cur = cur?.[k];
    if (Array.isArray(cur)) {
      const kept = cur.filter((x) => x != null);
      cur.length = 0;
      cur.push(...kept);
    }
  }
}

/**
 * Take corrected facts out of the structured parts of a DCO: date anchors,
 * the coming-up list, brief claims and the reach. Keeps the copies of the
 * focus and lead story in daily_focus in step with the top-level fields.
 */
function scrubDco(dco, corrected, retiredTitles = []) {
  const ids = new Set(corrected.map((f) => f.id));
  const statements = new Set([...corrected.map((f) => f.statement), ...retiredTitles]);
  if (Array.isArray(dco.named_anchors)) {
    dco.named_anchors = dco.named_anchors.filter((a) => !ids.has(a?.fact_id) && !statements.has(a?.title) && !statements.has(a?.label));
  }
  if (Array.isArray(dco.active_today?.upcoming_in_7d)) {
    dco.active_today.upcoming_in_7d = dco.active_today.upcoming_in_7d.filter((u) => !statements.has(u?.title));
  }
  if (dco.brief) {
    if (Array.isArray(dco.brief.claims)) {
      dco.brief.claims = dco.brief.claims.filter((c) => c && !(c.type === 'fact' && ids.has(c.id)) && c.why !== null);
    }
    const r = dco.brief.reach;
    if (r && ((r.type === 'fact' && ids.has(r.id)) || (r.facts || []).some((f) => ids.has(f.id)) || r.why === null)) dco.brief.reach = null;
    if (dco.brief.return && dco.brief.return.note === null) dco.brief.return = null;
  }
  if (dco.lead_story && dco.lead_story.what == null) dco.lead_story = null;
  if (dco.lead_story && dco.lead_story.detail != null && dco.lead_story.what !== dco.lead_story.detail && dco.pipeline === 'dco-v4') {
    dco.lead_story.detail = dco.lead_story.what;
  }
  if (dco.daily_focus) {
    dco.daily_focus.today_focus = dco.today_focus || [];
    dco.daily_focus.lead_story = dco.lead_story || null;
  }
}

/**
 * Apply one correction. Returns a summary of what changed.
 */
export async function applyCorrection(env, correctionId, runId) {
  const d = db(env);
  const [correction] = await d.select(`user_corrections?id=eq.${correctionId}&select=*`);
  if (!correction) throw new Error(`Correction ${correctionId} not found`);
  if (correction.status === 'applied') return { skipped: 'already_applied' };
  const userId = correction.user_id;
  // A retry after a partial failure starts clean: facts this correction added
  // are removed (states it set to corrected stay corrected, which is right).
  await d.remove(`life_facts?user_id=eq.${userId}&run_id=eq.${encodeURIComponent(runId)}`);
  await d.remove(`life_fact_changes?user_id=eq.${userId}&run_id=eq.${encodeURIComponent(runId)}`);
  const tz = await userTimezone(env, userId);
  const today = localDate(tz);

  // Context: the chat around the correction, when it came from a chat.
  let conversation = '';
  if (correction.chat_id) {
    const msgs = await d.select(
      `scope_chat_messages?chat_id=eq.${correction.chat_id}&created_at=lte.${encodeURIComponent(correction.created_at)}&select=role,content,created_at&order=created_at.desc&limit=8`,
    );
    conversation = msgs
      .reverse()
      .map((m) => `${m.role === 'user' ? 'Person' : 'Gremly'}: ${trim(m.content, 500)}`)
      .join('\n');
  }

  const facts = correction.fact_ids?.length
    ? await d.select(`life_facts?id=in.(${correction.fact_ids.join(',')})&user_id=eq.${userId}&select=id,statement,about_date,state`)
    : await d.select(`life_facts?user_id=eq.${userId}&state=in.(current,planned,unconfirmed,happened)&select=id,statement,about_date,state&order=last_confirmed_at.desc&limit=300`);
  const factRefs = new Map();
  const factLines = facts.map((f, i) => {
    const ref = `f${i + 1}`;
    factRefs.set(ref, f);
    return `${ref} | ${f.state} | ${f.about_date || 'no date'} | ${f.statement}`;
  });

  const { passages, anchorRefs, anchorLines, lifeMap, worlds, dcoRows, storyItems } = await loadPassages(env, userId, today);
  const passageRefs = new Map(passages.map((p) => [p.ref, p]));

  const user = `WHAT THE PERSON SAID (${correction.surface}${correction.target_kind ? `, about ${correction.target_kind}` : ''}):
"${trim(correction.said, 1500)}"
${correction.target_ref?.text ? `\nTHE TEXT THEY MARKED AS NOT RIGHT:\n"${trim(correction.target_ref.text, 800)}"\n` : ''}
${conversation ? `CONVERSATION AROUND IT:\n${conversation}\n` : ''}
LEDGER FACTS (ref | state | date | statement):
${factLines.join('\n') || '(none)'}

GREMLY-WRITTEN PASSAGES (ref | where | text):
${passages.map((p) => `${p.ref} | ${p.kind} | ${trim(p.text, 4000)}`).join('\n') || '(none)'}

LIVE DATE ANCHORS (ref | date | title):
${anchorLines.join('\n') || '(none)'}`;

  const { output, model } = await jsonCall(env, {
    primary: modelFor(env, 'rewrite'),
    fallback: modelFor(env, 'rewriteFallback'),
    system: systemPrompt(today, await personIdentity(env, userId)),
    user,
    schema: CORRECTION_SCHEMA,
    maxTokens: 8000,
    thinking: 'medium',
    effort: 'medium',
  });

  const nowIso = new Date().toISOString();
  const result = { understood: output.understood, model, facts_corrected: 0, facts_added: 0, passages_rewritten: 0, anchors_retired: 0 };
  const correctedIds = [];
  const correctedFacts = [];

  for (const c of output.corrected_facts || []) {
    const f = factRefs.get(c.fact_ref);
    if (!f || correctedIds.includes(f.id)) continue;
    await d.update(`life_facts?id=eq.${f.id}&user_id=eq.${userId}`, {
      state: 'corrected',
      correction_text: trim(correction.said, 600),
      corrected_at: nowIso,
      state_reason: trim(c.why, 400),
      updated_at: nowIso,
    });
    await d.insertQuiet('life_fact_changes', [
      { fact_id: f.id, user_id: userId, from_state: f.state, to_state: 'corrected', reason: trim(c.why, 400), source_table: 'user_corrections', source_id: correction.id, run_id: runId },
    ]);
    correctedIds.push(f.id);
    correctedFacts.push(f);
    result.facts_corrected++;
  }

  const newFactRows = (output.new_facts || [])
    .filter((f) => f.statement)
    .map((f) => ({
      user_id: userId,
      statement: trim(f.statement, 400),
      subject: f.subject ? trim(f.subject, 80) : null,
      about_date: /^\d{4}-\d{2}-\d{2}$/.test(f.about_date || '') ? f.about_date : null,
      date_confidence: /^\d{4}-\d{2}-\d{2}$/.test(f.about_date || '') ? 'exact' : 'unknown',
      state: ['current', 'planned', 'happened'].includes(f.state) ? f.state : 'current',
      said_by: 'user',
      source_table: 'user_corrections',
      source_id: correction.id,
      source_quote: trim(correction.said, 300),
      observed_at: correction.created_at,
      run_id: runId,
      model,
    }));
  if (newFactRows.length) {
    await d.insertQuiet('life_facts', newFactRows);
    result.facts_added = newFactRows.length;
  }

  // Passage rewrites, grouped by the row they live in.
  const dcoEdits = new Map();
  const lifeMapCopy = lifeMap ? JSON.parse(JSON.stringify(lifeMap.life_map)) : null;
  let lifeMapChanged = false;
  const worldPatches = new Map();
  const chapterPatches = new Map();
  const storyPatches = new Map();
  let profilePatch = null;
  for (const r of output.rewrites || []) {
    const p = passageRefs.get(r.passage_ref);
    if (!p) continue;
    const text = r.new_text == null ? null : trim(r.new_text, 4000);
    if (p.kind === 'dco') {
      if (!dcoEdits.has(p.locator.id)) dcoEdits.set(p.locator.id, []);
      dcoEdits.get(p.locator.id).push({ path: p.locator.path, text });
    } else if (p.kind === 'life_map' && lifeMapCopy) {
      setPath(lifeMapCopy, p.locator.path, text);
      lifeMapChanged = true;
    } else if (p.kind === 'profile') {
      profilePatch = text || '';
    } else if (p.kind === 'chapter') {
      const patch = chapterPatches.get(p.locator.id) || {};
      patch[p.locator.field] = text;
      chapterPatches.set(p.locator.id, patch);
    } else if (p.kind === 'story') {
      const patch = storyPatches.get(p.locator.id) || {};
      patch[p.locator.field] = text;
      storyPatches.set(p.locator.id, patch);
    } else if (p.kind === 'world') {
      const w = worlds.find((x) => x.id === p.locator.id);
      if (!w) continue;
      const patch = worldPatches.get(w.id) || {};
      if (p.locator.field === 'key_priorities') {
        const list = patch.key_priorities || JSON.parse(JSON.stringify(w.key_priorities || []));
        const item = list[p.locator.index];
        if (text == null) list[p.locator.index] = null;
        else if (item && typeof item === 'object') list[p.locator.index] = { ...item, text };
        else list[p.locator.index] = text;
        patch.key_priorities = list;
      } else {
        patch[p.locator.field] = text;
      }
      worldPatches.set(w.id, patch);
    }
    result.passages_rewritten++;
  }

  for (const [chapterId, patch] of chapterPatches) {
    const body = { updated_at: nowIso };
    for (const field of ['card_subtitle', 'summary', 'epigraph']) {
      if (field in patch) Object.assign(body, { [field]: patch[field], [`${field}_source`]: 'user', [`${field}_updated_at`]: nowIso });
    }
    await d.update(`chapters?id=eq.${chapterId}&owner_id=eq.${userId}`, body);
  }

  // Story items: rewritten, or retired when nothing true is left, and retired
  // when every fact they rest on was corrected.
  let storyChanged = false;
  const corrected = new Set(correctedIds);
  for (const s of storyItems) {
    const patch = storyPatches.get(s.id);
    const allCorrected = Array.isArray(s.fact_ids) && s.fact_ids.length > 0 && s.fact_ids.every((id) => corrected.has(id));
    if (allCorrected || (patch && (patch.title === null || patch.body === null))) {
      await d.update(`story_items?id=eq.${s.id}&user_id=eq.${userId}`, { state: 'corrected', correction_text: trim(correction.said, 600), updated_at: nowIso });
      storyChanged = true;
    } else if (patch) {
      const body = { updated_at: nowIso, correction_text: trim(correction.said, 600) };
      if (patch.title) body.title = patch.title;
      if (patch.body) body.body = patch.body;
      await d.update(`story_items?id=eq.${s.id}&user_id=eq.${userId}`, body);
      storyChanged = true;
    }
  }

  const retiredTitles = [];
  for (const ref of output.retire_anchor_refs || []) {
    const a = anchorRefs.get(ref);
    if (!a) continue;
    await d.update(`user_temporal_anchors?id=eq.${a.id}&user_id=eq.${userId}`, { status: 'resolved', updated_at: nowIso });
    retiredTitles.push(a.title);
    result.anchors_retired++;
  }

  const dcoRowIds = new Set([...dcoEdits.keys(), ...(correctedFacts.length || retiredTitles.length ? dcoRows.map((r) => r.id) : [])]);
  for (const rowId of dcoRowIds) {
    const [row] = await d.select(`user_daily_state?id=eq.${rowId}&select=dco,dco_shadow`);
    if (!row) continue;
    const dco = row.dco || {};
    for (const e of dcoEdits.get(rowId) || []) setPath(dco, e.path, e.text);
    compactArrays(dco, [['today_focus'], ['also_matters'], ['brief', 'claims']]);
    scrubDco(dco, correctedFacts, retiredTitles);
    dco.corrections_applied = [...(dco.corrections_applied || []), { correction_id: correction.id, at: nowIso }];
    const patch = { dco, updated_at: nowIso };
    // The shadow DCO is scrubbed of corrected facts too, so comparisons stay fair.
    if (row.dco_shadow && (correctedFacts.length || retiredTitles.length)) {
      const sh = row.dco_shadow;
      scrubDco(sh, correctedFacts, retiredTitles);
      patch.dco_shadow = sh;
    }
    await d.update(`user_daily_state?id=eq.${rowId}`, patch);
  }
  // Life Map evidence that rests on a corrected fact goes too.
  if (lifeMapCopy && correctedFacts.length) {
    const ids = new Set(correctedIds);
    for (const dom of lifeMapCopy.domains || []) {
      for (const t of dom?.threads || []) {
        if (!Array.isArray(t?.evidence)) continue;
        const kept = t.evidence.filter((e) => !ids.has(e?.fact_id));
        if (kept.length !== t.evidence.length) {
          t.evidence = kept;
          lifeMapChanged = true;
        }
      }
    }
  }
  if (lifeMapChanged) {
    lifeMapCopy.updated_at = nowIso;
    await d.update(`user_life_map?id=eq.${lifeMap.id}`, { life_map: lifeMapCopy, updated_at: nowIso });
  }
  if (storyChanged) await refreshLifeMapStory(env, userId);
  if (profilePatch !== null) {
    await d.update(`user_profiles?user_id=eq.${userId}`, { profile_text: profilePatch });
  }
  for (const [worldId, patch] of worldPatches) {
    const body = { updated_at: nowIso };
    if ('card_subtitle' in patch) {
      body.card_subtitle = patch.card_subtitle;
      body.card_subtitle_source = 'user';
      body.card_subtitle_updated_at = nowIso;
    }
    if ('summary' in patch) {
      body.summary = patch.summary;
      body.summary_source = 'user';
      body.summary_updated_at = nowIso;
    }
    if ('key_priorities' in patch) body.key_priorities = patch.key_priorities.filter((x) => x != null);
    await d.update(`worlds?id=eq.${worldId}&owner_id=eq.${userId}`, body);
  }

  // Chat reads the corrected versions from its very next message.
  await invalidateChatCache(env, userId);
  await d.update(`user_corrections?id=eq.${correction.id}`, {
    status: 'applied',
    applied_at: nowIso,
    fact_ids: correctedIds.length ? correctedIds : correction.fact_ids,
    result,
  });
  return result;
}

/** Corrections the person made recently, for every later prompt to honour. */
export async function recentCorrections(env, userId, days = 120) {
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const rows = await db(env).select(
    `life_facts?user_id=eq.${userId}&state=eq.corrected&corrected_at=gte.${encodeURIComponent(since)}&select=statement,correction_text,corrected_at&order=corrected_at.desc&limit=50`,
  );
  return rows;
}
