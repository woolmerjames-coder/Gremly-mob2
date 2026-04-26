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

/**
 * Options passed to writeClassifierOutput to control write permissions.
 *
 * closure_write_allowlist: Set of chapter IDs that are permitted to receive
 *   writes in this run EVEN IF the chapter's closed_at is already set in the
 *   database. Used by the Inngest chapter-close handler to write closure
 *   artifacts (epigraph, key_moments, slip_events) to a chapter that was
 *   just closed by the user via the UI.
 *
 * user_rewrite_fields: Map from chapter ID to the set of field names the
 *   user has explicitly requested be rewritten. Only these fields on those
 *   chapters are allowed to overwrite existing content from a closed chapter.
 *   Used by the Phase D "write my chapter" button and epigraph regenerate.
 */
export interface RunOptions {
  closure_write_allowlist?: Set<string>;
  user_rewrite_fields?: Map<string, Set<string>>;
}

export class ClosedChapterWriteError extends Error {
  constructor(chapterId: string, fieldName: string) {
    super(
      `Attempted to write field '${fieldName}' to closed chapter '${chapterId}' without user-rewrite or closure-allowlist permission`,
    );
    this.name = 'ClosedChapterWriteError';
  }
}

/**
 * Guard that enforces closed-chapter immutability.
 *
 * The chapter argument reflects the DB state loaded at the START of this run.
 * Three permission paths allow a write to proceed:
 *   1. Chapter was open at start-of-run (closed_at === null in snapshot).
 *      The weekly run may legally close this chapter and write all its
 *      closure artifacts in one pass, because the in-memory snapshot still
 *      shows closed_at as null throughout this run.
 *   2. Chapter is in the closure_write_allowlist. Used when the Inngest
 *      chapter-close handler is writing closure artifacts to a chapter that
 *      the user already marked closed via the UI (closed_at is set at
 *      start-of-run).
 *   3. Chapter-field pair is in user_rewrite_fields. Used for user-triggered
 *      single-field rewrites on an already-closed chapter, such as the
 *      "write my chapter" button and epigraph regenerate.
 *
 * Any other write attempt to a chapter with closed_at set at start-of-run
 * throws ClosedChapterWriteError.
 */
function assertChapterWritable(
  chapter: { id: string; closed_at: string | null },
  fieldName: string,
  runOptions: RunOptions,
): void {
  if (chapter.closed_at === null) return;
  if (runOptions.closure_write_allowlist?.has(chapter.id)) return;
  const userFields = runOptions.user_rewrite_fields?.get(chapter.id);
  if (userFields?.has(fieldName)) return;
  throw new ClosedChapterWriteError(chapter.id, fieldName);
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Strip em dashes, en dashes, and double hyphens (replace with commas), collapse
 * whitespace, and enforce a max character length by truncating at the last
 * sentence or clause boundary above 60 percent of the max.
 *
 * Applied to every authored field before upsert: chapter title, world name,
 * world summary, chapter target_summary, chapter epigraph, worlds_summary
 * headline.
 */
function sanitizeAuthored(raw: string | null | undefined, maxChars: number): string | null {
  if (!raw) return null;
  let s = raw;
  s = s.replace(/[\u2014\u2013]/g, ','); // em dash (U+2014), en dash (U+2013)
  s = s.replace(/--/g, ','); // double hyphen
  s = s.replace(/,\s*,/g, ','); // collapse doubled commas from the above
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length <= maxChars) return s;
  const cutoff = s.slice(0, maxChars);
  const lastSentence = cutoff.lastIndexOf('. ');
  const lastClause = cutoff.lastIndexOf(', ');
  const breakAt = Math.max(lastSentence, lastClause);
  if (breakAt > maxChars * 0.6) {
    return cutoff.slice(0, breakAt).trim();
  }
  return cutoff.trim();
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
  runOptions: RunOptions = {},
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
      .select(
        'id, name, card_subtitle_source, summary_source, world_type_source, mascot_slug, mascot_slug_source',
      )
      .eq('owner_id', ownerId),
    db
      .from('chapters')
      .select(
        'id, title, primary_world_id, closed_at, card_subtitle_source, summary_source, title_source, arc_shape_source, epigraph_source, slip_events_source, key_moments_source, start_date_source, end_date_source, current_phase_key_source, target_description_source, phase_labels_source, key_priorities_source',
      )
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
    {
      noCardSubtitle: boolean;
      noSummary: boolean;
      noWorldType: boolean;
      mascot_slug_source: string | null;
    }
  >();
  for (const w of worldsRes.data ?? []) {
    worldSourceProtection.set(w.id as string, {
      noCardSubtitle: (w.card_subtitle_source as string | null) === 'user',
      noSummary: (w.summary_source as string | null) === 'user',
      noWorldType: (w.world_type_source as string | null) === 'user',
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
    {
      noCardSubtitle: boolean;
      noSummary: boolean;
      noTitle: boolean;
      noArcShape: boolean;
      noEpigraph: boolean;
      noSlipEvents: boolean;
      noKeyMoments: boolean;
      noStartDate: boolean;
      noEndDate: boolean;
      noCurrentPhaseKey: boolean;
      noTargetDescription: boolean;
      noPhaseLabels: boolean;
      noKeyPriorities: boolean;
    }
  >();
  for (const c of chaptersRes.data ?? []) {
    chapterSourceProtection.set(c.id as string, {
      noCardSubtitle: (c.card_subtitle_source as string | null) === 'user',
      noSummary: (c.summary_source as string | null) === 'user',
      noTitle: (c.title_source as string | null) === 'user',
      noArcShape: (c.arc_shape_source as string | null) === 'user',
      noEpigraph: (c.epigraph_source as string | null) === 'user',
      noSlipEvents: (c.slip_events_source as string | null) === 'user',
      noKeyMoments: (c.key_moments_source as string | null) === 'user',
      noStartDate: (c.start_date_source as string | null) === 'user',
      noEndDate: (c.end_date_source as string | null) === 'user',
      noCurrentPhaseKey: (c.current_phase_key_source as string | null) === 'user',
      noTargetDescription: (c.target_description_source as string | null) === 'user',
      noPhaseLabels: (c.phase_labels_source as string | null) === 'user',
      noKeyPriorities: (c.key_priorities_source as string | null) === 'user',
    });
  }

  // Map: chapter_id → closed_at
  const chapterClosedAt = new Map<string, string | null>();
  for (const c of chaptersRes.data ?? []) {
    chapterClosedAt.set(c.id as string, (c.closed_at as string | null) ?? null);
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
        name: sanitizeAuthored(candidate.proposed_name, 22) ?? candidate.proposed_name,
        display_name: candidate.display_name,
        description: candidate.description,
        card_subtitle: candidate.card_subtitle,
        card_subtitle_source: 'classifier',
        card_subtitle_updated_at: now(),
        summary: sanitizeAuthored(candidate.summary, 160),
        key_priorities: candidate.key_priorities,
        summary_source: 'classifier',
        summary_updated_at: now(),
        mascot_slug: candidate.mascot_slug,
        mascot_slug_source: 'classifier',
        mascot_slug_updated_at: now(),
        archetypes: candidate.archetypes,
        world_type: candidate.world_type,
        world_type_source: 'classifier',
        world_type_updated_at: now(),
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
        title: sanitizeAuthored(candidate.proposed_title, 42) ?? candidate.proposed_title,
        title_source: 'classifier',
        title_updated_at: now(),
        description: candidate.description,
        chapter_type: candidate.chapter_type,
        phase: 'suggested',
        start_date: candidate.start_date,
        end_date: candidate.end_date,
        primary_world_id: primaryWorldId,
        target_description: candidate.target_description,
        target_summary: sanitizeAuthored(candidate.target_summary, 240),
        card_subtitle: candidate.card_subtitle,
        card_subtitle_source: 'classifier',
        card_subtitle_updated_at: now(),
        summary: candidate.summary,
        key_priorities: candidate.key_priorities,
        summary_source: 'classifier',
        summary_updated_at: now(),
        phase_labels: candidate.phase_labels,
        current_phase_key: candidate.current_phase_key,
        arc_shape: candidate.arc_shape,
        arc_shape_source: 'classifier',
        arc_shape_updated_at: now(),
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
    try {
      const closedAt = chapterClosedAt.get(update.chapter_id) ?? null;
      const chapter = { id: update.chapter_id, closed_at: closedAt };
      const chapterProt = chapterSourceProtection.get(update.chapter_id);

      const patch: Record<string, unknown> = {
        updated_at: now(),
        last_run_id: run_id,
      };

      if (update.new_description != null) {
        assertChapterWritable(chapter, 'description', runOptions);
        patch.description = update.new_description;
      }
      if (update.new_end_date != null && chapterProt?.noEndDate !== true) {
        assertChapterWritable(chapter, 'end_date', runOptions);
        patch.end_date = update.new_end_date;
        patch.end_date_source = 'classifier';
        patch.end_date_updated_at = now();
      }
      if (update.new_target_description != null && chapterProt?.noTargetDescription !== true) {
        assertChapterWritable(chapter, 'target_description', runOptions);
        patch.target_description = update.new_target_description;
        patch.target_description_source = 'classifier';
        patch.target_description_updated_at = now();
      }
      if (update.new_target_summary != null) {
        assertChapterWritable(chapter, 'target_summary', runOptions);
        patch.target_summary = sanitizeAuthored(update.new_target_summary, 240);
      }
      if (update.new_phase_labels != null && chapterProt?.noPhaseLabels !== true) {
        assertChapterWritable(chapter, 'phase_labels', runOptions);
        patch.phase_labels = update.new_phase_labels;
        patch.phase_labels_source = 'classifier';
        patch.phase_labels_updated_at = now();
      }
      if (update.new_current_phase_key != null && chapterProt?.noCurrentPhaseKey !== true) {
        assertChapterWritable(chapter, 'current_phase_key', runOptions);
        patch.current_phase_key = update.new_current_phase_key;
        patch.current_phase_key_source = 'classifier';
        patch.current_phase_key_updated_at = now();
      }

      // New Phase A fields — guarded, source-protected, sanitized where text
      if (update.new_arc_shape != null && chapterProt?.noArcShape !== true) {
        assertChapterWritable(chapter, 'arc_shape', runOptions);
        patch.arc_shape = update.new_arc_shape;
        patch.arc_shape_source = 'classifier';
        patch.arc_shape_updated_at = now();
      }
      if (update.new_epigraph != null && chapterProt?.noEpigraph !== true) {
        assertChapterWritable(chapter, 'epigraph', runOptions);
        const clean = sanitizeAuthored(update.new_epigraph, 400);
        if (clean) {
          patch.epigraph = clean;
          patch.epigraph_source = 'classifier';
          patch.epigraph_updated_at = now();
        }
      }
      if (update.new_key_moments != null && chapterProt?.noKeyMoments !== true) {
        assertChapterWritable(chapter, 'key_moments', runOptions);
        patch.key_moments = update.new_key_moments;
        patch.key_moments_source = 'classifier';
        patch.key_moments_updated_at = now();
      }
      if (update.new_slip_events != null && chapterProt?.noSlipEvents !== true) {
        assertChapterWritable(chapter, 'slip_events', runOptions);
        patch.slip_events = update.new_slip_events;
        patch.slip_events_source = 'classifier';
        patch.slip_events_updated_at = now();
      }

      // Source-protected fields
      if (update.new_card_subtitle != null && !chapterProt?.noCardSubtitle) {
        assertChapterWritable(chapter, 'card_subtitle', runOptions);
        patch.card_subtitle = update.new_card_subtitle;
        patch.card_subtitle_source = 'classifier';
        patch.card_subtitle_updated_at = now();
      }
      if (update.new_summary != null && !chapterProt?.noSummary) {
        assertChapterWritable(chapter, 'summary', runOptions);
        patch.summary = update.new_summary;
        patch.summary_source = 'classifier';
        patch.summary_updated_at = now();
      }
      if (update.new_key_priorities != null && chapterProt?.noKeyPriorities !== true) {
        assertChapterWritable(chapter, 'key_priorities', runOptions);
        patch.key_priorities = update.new_key_priorities;
        patch.key_priorities_source = 'classifier';
        patch.key_priorities_updated_at = now();
      }

      // Close MUST be last — flips closed_at for subsequent runs
      if (update.close_chapter) {
        patch.phase = 'closed';
        patch.closed_at = now();
      }

      // Defense-in-depth: for open chapters, guard against concurrent user-close races
      let query = db
        .from('chapters')
        .update(patch)
        .eq('id', update.chapter_id)
        .eq('owner_id', ownerId);
      if (closedAt === null && !update.close_chapter) {
        query = query.is('closed_at', null);
      }

      const { error: updateError } = await query;
      if (updateError) {
        result.errors.push(`chapter_update '${update.chapter_id}': ${updateError.message}`);
        continue;
      }
      if (update.close_chapter) {
        result.chapters.closed++;
      } else {
        result.chapters.updated++;
      }
    } catch (err) {
      if (err instanceof ClosedChapterWriteError) {
        result.errors.push(err.message);
        continue;
      }
      throw err;
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
      patch.display_name = sanitizeAuthored(vu.new_display_name, 22) ?? vu.new_display_name;
    }
    if (vu.new_card_subtitle != null && !worldProt?.noCardSubtitle) {
      patch.card_subtitle = vu.new_card_subtitle;
      patch.card_subtitle_source = 'classifier';
      patch.card_subtitle_updated_at = now();
    }
    if (vu.new_summary != null && !worldProt?.noSummary) {
      patch.summary = sanitizeAuthored(vu.new_summary, 160);
      patch.key_priorities = vu.new_key_priorities ?? [];
      patch.summary_source = 'classifier';
      patch.summary_updated_at = now();
    }
    if (vu.new_mascot_slug != null && worldProt?.mascot_slug_source !== 'user') {
      patch.mascot_slug = vu.new_mascot_slug;
      patch.mascot_slug_source = 'classifier';
      patch.mascot_slug_updated_at = now();
    }
    if (vu.new_world_type != null && !worldProt?.noWorldType) {
      patch.world_type = vu.new_world_type;
      patch.world_type_source = 'classifier';
      patch.world_type_updated_at = now();
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
