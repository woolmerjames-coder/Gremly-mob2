/**
 * Worlds & Chapters writer (Phase 1b)
 *
 * Consumes a ClassifierOutput and commits it idempotently to the Supabase
 * tables: public.worlds, public.chapters, public.life_contexts,
 * public.chapter_world_links, public.events.
 *
 * Idempotency contract: each entity is matched case-insensitively by name
 * (worlds, life_contexts) or by title+primary_world_id (chapters). Matches
 * skip the INSERT and increment the "existing" counter.
 *
 * reclassification_proposals and evolution_proposals are NOT applied to
 * entity tables in this iteration. They are stored as public.events rows
 * with kind 'worlds.reclassification_proposed' / 'worlds.evolution_proposed'
 * so a future UI pass can surface them for user confirmation.
 *
 * Hard boundary: does NOT call classifyWorldsWeekly. Only consumes output.
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type { ClassifierOutput } from './worldsClassifier';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface WriterEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
}

export interface WriteResult {
  run_id: string;
  worlds: { inserted: number; existing: number };
  chapters: { inserted: number; existing: number; updated: number; closed: number };
  life_contexts: { inserted: number; existing: number };
  velocity_updates: number;
  chapter_world_links_inserted: number;
  worlds_summary_written: boolean;
  applied: { reactivation_proposals: number };
  deferred: { reclassification_proposals: number; evolution_proposals: number };
  errors: string[];
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Write a ClassifierOutput to Supabase.
 *
 * Step 0: generate run_id, build Supabase service-role client.
 * Step 1: load existing worlds / chapters / life_contexts for this owner.
 * Step 2: insert new world candidates (skip confidence < 0.5 and duplicates).
 * Step 3: insert new chapter candidates + chapter_world_links.
 * Step 4: insert new life_context candidates.
 * Step 5: apply chapter_updates (extend / close).
 * Step 6: apply velocity_updates (patch worlds table).
 * Step 7: apply reactivation_proposals (dormant → active).
 * Step 8: defer reclassification + evolution proposals as events.
 * Step 9: write worlds.classifier_run_completed event for observability.
 * Step 10: return WriteResult.
 */
export async function writeClassifierOutput(
  output: ClassifierOutput,
  ownerId: string,
  env: WriterEnv,
): Promise<WriteResult> {
  // ── Step 0: initialise ────────────────────────────────────────
  const run_id = randomUUID();
  const now = () => new Date().toISOString();

  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const result: WriteResult = {
    run_id,
    worlds: { inserted: 0, existing: 0 },
    chapters: { inserted: 0, existing: 0, updated: 0, closed: 0 },
    life_contexts: { inserted: 0, existing: 0 },
    velocity_updates: 0,
    chapter_world_links_inserted: 0,
    worlds_summary_written: false,
    applied: { reactivation_proposals: 0 },
    deferred: { reclassification_proposals: 0, evolution_proposals: 0 },
    errors: [],
  };

  // ── Step 1: load existing state ───────────────────────────────
  const [worldsRes, chaptersRes, lcRes] = await Promise.all([
    db
      .from('worlds')
      .select('id, name, card_subtitle_source, summary_source, mascot_slug, mascot_slug_source')
      .eq('owner_id', ownerId),
    db
      .from('chapters')
      .select('id, title, primary_world_id, card_subtitle_source, summary_source')
      .eq('owner_id', ownerId),
    db.from('life_contexts').select('id, name, kind').eq('owner_id', ownerId),
  ]);

  if (worldsRes.error) {
    result.errors.push(`load worlds: ${worldsRes.error.message}`);
  }
  if (chaptersRes.error) {
    result.errors.push(`load chapters: ${chaptersRes.error.message}`);
  }
  if (lcRes.error) {
    result.errors.push(`load life_contexts: ${lcRes.error.message}`);
  }

  // Map: normalised_name → id
  const existingWorlds = new Map<string, string>();
  for (const w of worldsRes.data ?? []) {
    existingWorlds.set((w.name as string).toLowerCase().trim(), w.id as string);
  }

  // Map: world_id → source protection flags
  const worldSourceProtection = new Map<
    string,
    { noCardSubtitle: boolean; noSummary: boolean; mascot_slug_source: string | null }
  >();
  for (const w of worldsRes.data ?? []) {
    worldSourceProtection.set(w.id as string, {
      noCardSubtitle: (w.card_subtitle_source as string | null) === 'user',
      noSummary: (w.summary_source as string | null) === 'user',
      mascot_slug_source: w.mascot_slug_source as string | null,
    });
  }

  // Map: `${normalised_title}::${primary_world_id ?? ''}` → id
  const existingChapters = new Map<string, string>();
  for (const c of chaptersRes.data ?? []) {
    const key = `${(c.title as string).toLowerCase().trim()}::${c.primary_world_id ?? ''}`;
    existingChapters.set(key, c.id as string);
  }

  // Map: chapter_id → source protection flags
  const chapterSourceProtection = new Map<
    string,
    { noCardSubtitle: boolean; noSummary: boolean }
  >();
  for (const c of chaptersRes.data ?? []) {
    chapterSourceProtection.set(c.id as string, {
      noCardSubtitle: (c.card_subtitle_source as string | null) === 'user',
      noSummary: (c.summary_source as string | null) === 'user',
    });
  }

  // Map: `${normalised_name}::${kind}` → id
  const existingLifeContexts = new Map<string, string>();
  for (const l of lcRes.data ?? []) {
    const key = `${(l.name as string).toLowerCase().trim()}::${l.kind}`;
    existingLifeContexts.set(key, l.id as string);
  }

  // ── Step 2: insert new worlds ─────────────────────────────────
  for (const candidate of output.new_world_candidates) {
    if (candidate.confidence < 0.5) continue;
    const key = candidate.proposed_name.toLowerCase().trim();
    if (existingWorlds.has(key)) {
      result.worlds.existing++;
      continue;
    }
    const { data, error } = await db
      .from('worlds')
      .insert({
        owner_id: ownerId,
        name: candidate.proposed_name,
        display_name: candidate.display_name,
        description: candidate.description,
        card_subtitle: candidate.card_subtitle,
        card_subtitle_source: 'classifier',
        card_subtitle_updated_at: now(),
        summary: candidate.summary,
        key_priorities: candidate.key_priorities,
        summary_source: 'classifier',
        summary_updated_at: now(),
        mascot_slug: candidate.mascot_slug,
        mascot_slug_source: 'classifier',
        mascot_slug_updated_at: now(),
        archetypes: candidate.archetypes,
        phase: 'candidate',
        source: 'classifier',
        confidence: candidate.confidence,
        first_signal_at: candidate.first_signal_at,
        last_signal_at: candidate.last_signal_at,
        module_layout: candidate.seed_module_layout,
        proposed_at: now(),
        last_run_id: run_id,
      })
      .select('id')
      .single();
    if (error || !data) {
      result.errors.push(
        `insert world '${candidate.proposed_name}': ${error?.message ?? 'no data'}`,
      );
      continue;
    }
    existingWorlds.set(key, data.id as string);
    result.worlds.inserted++;
  }

  // ── Step 3: insert new chapters ───────────────────────────────
  for (const candidate of output.new_chapter_candidates) {
    if (candidate.confidence < 0.5) continue;
    const primaryWorldId = existingWorlds.get(candidate.primary_world_name.toLowerCase().trim());
    if (primaryWorldId === undefined) {
      result.errors.push(
        `chapter '${candidate.proposed_title}' references unknown world '${candidate.primary_world_name}'`,
      );
      continue;
    }
    const key = `${candidate.proposed_title.toLowerCase().trim()}::${primaryWorldId}`;
    if (existingChapters.has(key)) {
      result.chapters.existing++;
      continue;
    }
    const { data: chapterData, error: chapterError } = await db
      .from('chapters')
      .insert({
        owner_id: ownerId,
        title: candidate.proposed_title,
        description: candidate.description,
        chapter_type: candidate.chapter_type,
        phase: 'suggested',
        start_date: candidate.start_date,
        end_date: candidate.end_date,
        primary_world_id: primaryWorldId,
        target_description: candidate.target_description,
        target_summary: candidate.target_summary,
        card_subtitle: candidate.card_subtitle,
        card_subtitle_source: 'classifier',
        card_subtitle_updated_at: now(),
        summary: candidate.summary,
        key_priorities: candidate.key_priorities,
        summary_source: 'classifier',
        summary_updated_at: now(),
        phase_labels: candidate.phase_labels,
        current_phase_key: candidate.current_phase_key,
        source: 'classifier',
        confidence: candidate.confidence,
        proposed_at: now(),
        last_run_id: run_id,
      })
      .select('id')
      .single();
    if (chapterError || !chapterData) {
      result.errors.push(
        `insert chapter '${candidate.proposed_title}': ${chapterError?.message ?? 'no data'}`,
      );
      continue;
    }
    result.chapters.inserted++;
    const chapterId = chapterData.id as string;

    // Primary world link (relevance_score = 1.0)
    const { error: linkError } = await db.from('chapter_world_links').insert({
      owner_id: ownerId,
      chapter_id: chapterId,
      world_id: primaryWorldId,
      relevance_score: 1.0,
    });
    if (linkError) {
      result.errors.push(
        `chapter_world_link primary for '${candidate.proposed_title}': ${linkError.message}`,
      );
    } else {
      result.chapter_world_links_inserted++;
    }

    // Related world links (relevance_score = 0.5)
    for (const relatedName of candidate.related_world_names ?? []) {
      const relatedId = existingWorlds.get(relatedName.toLowerCase().trim());
      if (!relatedId || relatedId === primaryWorldId) continue;
      const { error: relLinkError } = await db.from('chapter_world_links').insert({
        owner_id: ownerId,
        chapter_id: chapterId,
        world_id: relatedId,
        relevance_score: 0.5,
      });
      if (relLinkError) {
        result.errors.push(
          `chapter_world_link related '${relatedName}' for '${candidate.proposed_title}': ${relLinkError.message}`,
        );
      } else {
        result.chapter_world_links_inserted++;
      }
    }
  }

  // ── Step 4: insert new life_contexts ──────────────────────────
  for (const candidate of output.new_life_context_candidates) {
    if (candidate.confidence < 0.5) continue;
    const key = `${candidate.proposed_name.toLowerCase().trim()}::${candidate.kind}`;
    if (existingLifeContexts.has(key)) {
      result.life_contexts.existing++;
      continue;
    }
    const { data: lcData, error: lcError } = await db
      .from('life_contexts')
      .insert({
        owner_id: ownerId,
        name: candidate.proposed_name,
        description: candidate.description,
        kind: candidate.kind,
        start_date: candidate.start_date,
        end_date: candidate.end_date,
        active: true,
        source: 'signal_suggested',
        calendar_source: candidate.calendar_source,
        proposed_at: now(),
        last_run_id: run_id,
      })
      .select('id')
      .single();
    if (lcError || !lcData) {
      result.errors.push(
        `insert life_context '${candidate.proposed_name}': ${lcError?.message ?? 'no data'}`,
      );
      continue;
    }
    existingLifeContexts.set(key, lcData.id as string);
    result.life_contexts.inserted++;
  }

  // ── Step 5: apply chapter_updates ────────────────────────────
  for (const update of output.chapter_updates) {
    const patch: Record<string, unknown> = {
      updated_at: now(),
      last_run_id: run_id,
    };
    if (update.new_description != null) patch.description = update.new_description;
    if (update.new_end_date != null) patch.end_date = update.new_end_date;
    if (update.new_target_description != null) {
      patch.target_description = update.new_target_description;
    }
    if (update.new_target_summary != null) patch.target_summary = update.new_target_summary;
    if (update.new_phase_labels != null) patch.phase_labels = update.new_phase_labels;
    if (update.new_current_phase_key != null)
      patch.current_phase_key = update.new_current_phase_key;
    if (update.close_chapter) {
      patch.phase = 'closed';
      patch.closed_at = now();
    }
    const chapterProt = chapterSourceProtection.get(update.chapter_id);
    if (update.new_card_subtitle != null && !chapterProt?.noCardSubtitle) {
      patch.card_subtitle = update.new_card_subtitle;
      patch.card_subtitle_source = 'classifier';
      patch.card_subtitle_updated_at = now();
    }
    if (update.new_summary != null && !chapterProt?.noSummary) {
      patch.summary = update.new_summary;
      patch.key_priorities = update.new_key_priorities ?? [];
      patch.summary_source = 'classifier';
      patch.summary_updated_at = now();
    }
    const { error: updateError } = await db
      .from('chapters')
      .update(patch)
      .eq('id', update.chapter_id)
      .eq('owner_id', ownerId);
    if (updateError) {
      result.errors.push(`chapter_update '${update.chapter_id}': ${updateError.message}`);
      continue;
    }
    if (update.close_chapter) {
      result.chapters.closed++;
    } else {
      result.chapters.updated++;
    }
  }

  // ── Step 6: apply velocity_updates ───────────────────────────
  for (const vu of output.velocity_updates) {
    const patch: Record<string, unknown> = {
      signal_velocity: vu.signal_velocity,
      signal_velocity_delta: vu.signal_velocity_delta,
      last_signal_at: now(),
      last_run_id: run_id,
      updated_at: now(),
    };
    if (vu.recommend_dormant) {
      patch.phase = 'dormant';
    }
    const worldProt = worldSourceProtection.get(vu.world_id);
    if (vu.new_display_name != null && !worldProt?.noSummary) {
      patch.display_name = vu.new_display_name;
    }
    if (vu.new_card_subtitle != null && !worldProt?.noCardSubtitle) {
      patch.card_subtitle = vu.new_card_subtitle;
      patch.card_subtitle_source = 'classifier';
      patch.card_subtitle_updated_at = now();
    }
    if (vu.new_summary != null && !worldProt?.noSummary) {
      patch.summary = vu.new_summary;
      patch.key_priorities = vu.new_key_priorities ?? [];
      patch.summary_source = 'classifier';
      patch.summary_updated_at = now();
    }
    if (vu.new_mascot_slug != null && worldProt?.mascot_slug_source !== 'user') {
      patch.mascot_slug = vu.new_mascot_slug;
      patch.mascot_slug_source = 'classifier';
      patch.mascot_slug_updated_at = now();
    }
    const { error: vuError } = await db
      .from('worlds')
      .update(patch)
      .eq('id', vu.world_id)
      .eq('owner_id', ownerId);
    if (vuError) {
      result.errors.push(`velocity_update '${vu.world_id}': ${vuError.message}`);
      continue;
    }
    result.velocity_updates++;
  }

  // ── Step 7: apply reactivation_proposals ─────────────────────
  for (const proposal of output.reactivation_proposals) {
    const { error: reactError } = await db
      .from('worlds')
      .update({
        phase: 'active',
        last_signal_at: now(),
        last_run_id: run_id,
        updated_at: now(),
      })
      .eq('id', proposal.world_id)
      .eq('owner_id', ownerId)
      .eq('phase', 'dormant');
    if (reactError) {
      result.errors.push(`reactivation_proposal '${proposal.world_id}': ${reactError.message}`);
      continue;
    }
    result.applied.reactivation_proposals++;
  }

  // ── Step 8: defer reclassification + evolution proposals ──────
  for (const proposal of output.reclassification_proposals) {
    const { error: rclError } = await db.from('events').insert({
      owner_id: ownerId,
      kind: 'worlds.reclassification_proposed',
      payload_json: { ...proposal, run_id },
    });
    if (rclError) {
      result.errors.push(
        `defer reclassification_proposal '${proposal.world_id}': ${rclError.message}`,
      );
      continue;
    }
    result.deferred.reclassification_proposals++;
  }

  for (const proposal of output.evolution_proposals) {
    const { error: evoError } = await db.from('events').insert({
      owner_id: ownerId,
      kind: 'worlds.evolution_proposed',
      payload_json: { ...proposal, run_id },
    });
    if (evoError) {
      result.errors.push(`defer evolution_proposal '${proposal.event_type}': ${evoError.message}`);
      continue;
    }
    result.deferred.evolution_proposals++;
  }

  // ── Step 8b: write worlds_summary to user_daily_state ────────
  if (output.worlds_summary) {
    const today = now().slice(0, 10);
    const existingDsoRes = await db
      .from('user_daily_state')
      .select('dco')
      .eq('user_id', ownerId)
      .eq('date', today)
      .maybeSingle();
    const existingDco = (existingDsoRes.data?.dco as Record<string, unknown>) ?? {};
    const { error: dsError } = await db.from('user_daily_state').upsert(
      {
        user_id: ownerId,
        date: today,
        dco: { ...existingDco, worlds_summary: output.worlds_summary },
      },
      { onConflict: 'user_id,date' },
    );
    if (dsError) {
      result.errors.push(`worlds_summary upsert to user_daily_state: ${dsError.message}`);
    } else {
      result.worlds_summary_written = true;
    }
  }

  // ── Step 9: run-completed event ───────────────────────────────
  const { errors: _errors, ...counts } = result;
  await db.from('events').insert({
    owner_id: ownerId,
    kind: 'worlds.classifier_run_completed',
    payload_json: {
      run_id,
      run_metadata: output.run_metadata,
      counts,
    },
  });

  // ── Step 10: return ───────────────────────────────────────────
  return result;
}
