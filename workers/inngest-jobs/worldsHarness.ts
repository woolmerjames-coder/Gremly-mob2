/**
 * Worlds & Chapters v2 — rolling harness (Phase 1, step 4 · Phase 1b revision)
 *
 * Runs the classifier across sequential 4-week windows from the user's earliest
 * drop to today, feeding each window's output into the next as activeWorlds
 * AND activeChapters. Validates cluster stability, exercises velocity tracking,
 * evolution mechanics, chapter dedup, and the life_contexts decision against
 * real data.
 *
 * Phase 1b changes vs step 4:
 *   - Tracks a chapter_book across windows, mirroring world_book. Active
 *     chapters are passed to each classifier call so the classifier can
 *     chapter_update or skip instead of re-proposing the same arc.
 *   - Handles new_life_context_candidates and tracks them in a
 *     life_context_book for the harness output.
 *   - Handles chapter_updates: closes, extends, or modifies active chapters
 *     in the chapter_book.
 *
 * Writes nothing to the database. Synthetic IDs in the world_book and
 * chapter_book are scoped to the harness run. Output is returned as JSON.
 *
 * Hard boundary: no imports from Life Map pipeline functions.
 *
 * References: spec §7 (signals), §8 (pipeline), §9b (evolution), §14,
 *             handover §8, audit §7.3
 */

import {
  collectSignalForBackfillClassifier,
  type SignalBundle,
} from './signalCollector';
import {
  classifyWorldsWeekly,
  type ActiveWorldInput,
  type ActiveChapterInput,
  type ArchetypeWeight,
  type ChapterType,
  type ChapterPhase,
  type ClassifierOutput,
  type LifeContextKind,
} from './worldsClassifier';

export interface HarnessEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  ANTHROPIC_API_KEY: string;
}

export interface HarnessOptions {
  userId: string;
  startDate: string | null;  // null = auto-detect from earliest drop
  endDate: string | null;    // null = today
  windowDays: number;
  strideDays: number;
}

export interface WindowRun {
  window_index: number;
  window_start: string;
  window_end: string;
  bundle_counts: Record<string, number>;
  calendar_summary: {
    total_events: number;
    meetings_per_week: number;
    top_title_sample: string | null;
  };
  active_worlds_in: number;
  active_chapters_in: number;
  output: ClassifierOutput;
}

export interface HarnessWorldBookEntry {
  id: string;
  current_name: string;
  original_name: string;
  description: string;
  archetypes: ArchetypeWeight[];
  phase: 'active' | 'dormant' | 'archived';
  emerged_in_window: number;
  first_signal_at: string;
  last_signal_at: string;
  renamed_history: Array<{ window_index: number; from: string; to: string }>;
}

export interface HarnessChapterBookEntry {
  id: string;
  title: string;
  description: string;
  chapter_type: ChapterType;
  phase: ChapterPhase;
  start_date: string | null;
  end_date: string | null;
  primary_world_name: string;
  related_world_names: string[];
  target_description: string | null;
  proposed_in_window: number;
  updated_in_windows: number[];
  closed_in_window: number | null;
  confidence: number;
}

export interface HarnessLifeContextBookEntry {
  id: string;
  name: string;
  description: string;
  kind: LifeContextKind;
  calendar_source: string | null;
  start_date: string | null;
  end_date: string | null;
  proposed_in_window: number;
  confidence: number;
}

export type HarnessEventType =
  | 'emerged'
  | 'velocity_update'
  | 'dormancy_recommended'
  | 'world_reactivated'
  | 'world_reclassified'
  | 'chapter_proposed'
  | 'chapter_updated'
  | 'chapter_closed'
  | 'life_context_proposed'
  | 'evolution_split'
  | 'evolution_emerge'
  | 'evolution_transform'
  | 'evolution_absorb';

export interface HarnessEvent {
  window_index: number;
  window_start: string;
  window_end: string;
  event_type: HarnessEventType;
  world_name: string;
  world_id: string;
  confidence?: number;
  detail?: unknown;
}

export interface HarnessSummary {
  total_worlds_emerged: number;
  worlds_still_active: number;
  worlds_dormant: number;
  worlds_archived: number;
  total_chapters_proposed: number;
  total_chapter_updates: number;
  total_chapters_closed: number;
  total_distinct_chapters: number;
  total_life_contexts_proposed: number;
  total_reactivations: number;
  unexpected_new_vs_reactivate: number;
  total_reclassifications: number;
  total_evolution_proposals: number;
  total_velocity_updates: number;
  total_dormancy_recommendations: number;
  stability_by_name: Record<
    string,
    { windows_present: number; first_window: number; name_changes: number }
  >;
  total_input_tokens: number;
  total_output_tokens: number;
  estimated_cost_usd: number;
}

export interface HarnessResult {
  user_id: string;
  start_date: string;
  end_date: string;
  window_days: number;
  stride_days: number;
  total_windows: number;
  runs: WindowRun[];
  world_book: HarnessWorldBookEntry[];
  chapter_book: HarnessChapterBookEntry[];
  life_context_book: HarnessLifeContextBookEntry[];
  events: HarnessEvent[];
  summary: HarnessSummary;
}

// ─── Helpers (exported so the Inngest wrapper can call them step-by-step) ───

export async function findEarliestDropDate(
  userId: string,
  env: HarnessEnv,
): Promise<string> {
  const headers = {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
  };
  const urls = [
    `${env.SUPABASE_URL}/rest/v1/notes?owner_id=eq.${userId}&select=created_at&order=created_at.asc&limit=1`,
    `${env.SUPABASE_URL}/rest/v1/todos?owner_id=eq.${userId}&select=created_at&order=created_at.asc&limit=1`,
    `${env.SUPABASE_URL}/rest/v1/habits?owner_id=eq.${userId}&select=created_at&order=created_at.asc&limit=1`,
    `${env.SUPABASE_URL}/rest/v1/space_chats?user_id=eq.${userId}&select=created_at&order=created_at.asc&limit=1`,
  ];
  const results = await Promise.all(
    urls.map(async (url) => {
      const res = await fetch(url, { headers });
      if (!res.ok) return null;
      const rows = (await res.json()) as Array<{ created_at: string }>;
      return rows[0]?.created_at ?? null;
    }),
  );
  const dates = results.filter((d): d is string => d !== null).sort();
  if (dates.length === 0) {
    throw new Error(
      `findEarliestDropDate: no drop signal found for user ${userId}.`,
    );
  }
  return dates[0];
}

export function computeWindows(
  start: string,
  end: string,
  windowDays: number,
  strideDays: number,
): Array<{ index: number; start: string; end: string }> {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const windowMs = windowDays * dayMs;
  const strideMs = strideDays * dayMs;

  const out: Array<{ index: number; start: string; end: string }> = [];
  let cursor = startMs;
  let index = 0;
  while (cursor < endMs) {
    const wEnd = Math.min(cursor + windowMs, endMs);
    out.push({
      index,
      start: new Date(cursor).toISOString(),
      end: new Date(wEnd).toISOString(),
    });
    if (wEnd >= endMs) break;
    cursor += strideMs;
    index++;
  }
  return out;
}

export function sectionCountsOf(bundle: SignalBundle): Record<string, number> {
  return {
    journals: bundle.journals.length,
    notes: bundle.notes.length,
    todos: bundle.todos.length,
    habits: bundle.habits.length,
    habitProgress: bundle.habitProgress.length,
    chatSummaries: bundle.chatSummaries.length,
    temporalAnchors: bundle.temporalAnchors.length,
    profileOverrides: bundle.profileOverrides.length,
    ritualProgress: bundle.ritualProgress.length,
    photoNotes: bundle.photoNotes.length,
    calendarEvents: bundle.calendarSummary.total_events,
  };
}

export function worldBookToActiveWorlds(
  worldBook: HarnessWorldBookEntry[],
): ActiveWorldInput[] {
  return worldBook
    .filter((w) => w.phase === 'active')
    .map((w) => ({
      id: w.id,
      name: w.current_name,
      description: w.description,
      archetypes: w.archetypes,
      first_signal_at: w.first_signal_at,
      last_signal_at: w.last_signal_at,
    }));
}

export function chapterBookToActiveChapters(
  chapterBook: HarnessChapterBookEntry[],
): ActiveChapterInput[] {
  // An active chapter is any chapter that is not closed. "suggested", "upcoming",
  // and "active" are all in-scope for dedup. Closed chapters are inert and
  // don't need to be passed to the classifier.
  return chapterBook
    .filter((c) => c.closed_in_window === null)
    .map((c) => ({
      id: c.id,
      title: c.title,
      chapter_type: c.chapter_type,
      phase: c.phase,
      start_date: c.start_date,
      end_date: c.end_date,
      primary_world_name: c.primary_world_name,
      description: c.description,
      target_description: c.target_description,
    }));
}

function makeWorldId(
  name: string | null | undefined,
  windowIndex: number,
  worldBook: HarnessWorldBookEntry[],
): string {
  const safeName =
    typeof name === 'string' && name.trim().length > 0 ? name.trim() : 'unnamed';
  const slug = safeName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const base = `harness:${slug || 'unnamed'}`;
  if (!worldBook.find((w) => w.id === base)) return base;
  return `${base}-w${windowIndex}`;
}

function makeChapterId(
  title: string | null | undefined,
  windowIndex: number,
  chapterBook: HarnessChapterBookEntry[],
): string {
  const safeTitle =
    typeof title === 'string' && title.trim().length > 0 ? title.trim() : 'unnamed';
  const slug = safeTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const base = `harness:chapter:${slug || 'unnamed'}-w${windowIndex}`;
  // Chapters are always window-scoped so we never collide — but guard anyway.
  if (!chapterBook.find((c) => c.id === base)) return base;
  return `${base}-${chapterBook.length}`;
}

function makeLifeContextId(
  name: string | null | undefined,
  windowIndex: number,
  book: HarnessLifeContextBookEntry[],
): string {
  const safeName =
    typeof name === 'string' && name.trim().length > 0 ? name.trim() : 'unnamed';
  const slug = safeName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const base = `harness:context:${slug || 'unnamed'}`;
  if (!book.find((c) => c.id === base)) return base;
  return `${base}-w${windowIndex}`;
}

export function mergeRunIntoState(
  worldBook: HarnessWorldBookEntry[],
  chapterBook: HarnessChapterBookEntry[],
  lifeContextBook: HarnessLifeContextBookEntry[],
  events: HarnessEvent[],
  run: WindowRun,
): {
  worldBook: HarnessWorldBookEntry[];
  chapterBook: HarnessChapterBookEntry[];
  lifeContextBook: HarnessLifeContextBookEntry[];
  events: HarnessEvent[];
} {
  const nextWB: HarnessWorldBookEntry[] = worldBook.map((w) => ({
    ...w,
    renamed_history: [...w.renamed_history],
  }));
  const nextCB: HarnessChapterBookEntry[] = chapterBook.map((c) => ({
    ...c,
    updated_in_windows: [...c.updated_in_windows],
  }));
  const nextLCB: HarnessLifeContextBookEntry[] = lifeContextBook.map((c) => ({ ...c }));
  const nextEvents: HarnessEvent[] = [...events];
  const ctx = {
    window_index: run.window_index,
    window_start: run.window_start,
    window_end: run.window_end,
  };

  // Capture initially-dormant worlds before any mutations so the new-world
  // pre-check can reference them even after reactivation changes their phase.
  const initiallyDormant = new Map<
    string,
    { id: string; archetypes: typeof nextWB[0]['archetypes'] }
  >();
  for (const w of worldBook) {
    if (w.phase === 'dormant') {
      initiallyDormant.set(w.current_name.toLowerCase(), {
        id: w.id,
        archetypes: w.archetypes,
      });
    }
  }

  // 1. Evolution proposals (run first so archived worlds are up-to-date before
  //    reactivation and new-world checks run)
  for (const e of run.output.evolution_proposals) {
    if (e.event_type === 'split') {
      for (const pid of e.parent_world_ids) {
        const p = nextWB.find((w) => w.id === pid);
        if (p) p.phase = 'archived';
      }
      for (const child of e.proposed_children) {
        if (!child || typeof child.name !== 'string' || !child.name.trim()) continue;
        const childId = makeWorldId(child.name, run.window_index, nextWB);
        nextWB.push({
          id: childId,
          current_name: child.name,
          original_name: child.name,
          description: child.description,
          archetypes: child.archetypes,
          phase: 'active',
          emerged_in_window: run.window_index,
          first_signal_at: run.window_start,
          last_signal_at: run.window_end,
          renamed_history: [],
        });
      }
      nextEvents.push({
        ...ctx,
        event_type: 'evolution_split',
        world_name: e.parent_world_ids.join(','),
        world_id: e.parent_world_ids[0] ?? 'unknown',
        confidence: e.confidence,
        detail: {
          parent_world_ids: e.parent_world_ids,
          child_names: e.proposed_children.map((c) => c.name),
          reason: e.reason,
        },
      });
    } else if (e.event_type === 'emerge') {
      for (const child of e.proposed_children) {
        if (!child || typeof child.name !== 'string' || !child.name.trim()) continue;
        const childId = makeWorldId(child.name, run.window_index, nextWB);
        nextWB.push({
          id: childId,
          current_name: child.name,
          original_name: child.name,
          description: child.description,
          archetypes: child.archetypes,
          phase: 'active',
          emerged_in_window: run.window_index,
          first_signal_at: run.window_start,
          last_signal_at: run.window_end,
          renamed_history: [],
        });
      }
      const firstChild = e.proposed_children[0];
      nextEvents.push({
        ...ctx,
        event_type: 'evolution_emerge',
        world_name: firstChild?.name ?? 'unknown',
        world_id: firstChild
          ? makeWorldId(firstChild.name, run.window_index, nextWB)
          : 'unknown',
        confidence: e.confidence,
        detail: { parent_world_ids: e.parent_world_ids, reason: e.reason },
      });
    } else if (e.event_type === 'transform') {
      for (const pid of e.parent_world_ids) {
        const p = nextWB.find((w) => w.id === pid);
        if (!p) continue;
        const proposed = e.proposed_children[0];
        if (proposed?.name && proposed.name !== p.current_name) {
          p.renamed_history.push({
            window_index: run.window_index,
            from: p.current_name,
            to: proposed.name,
          });
          p.current_name = proposed.name;
        }
        if (proposed?.archetypes?.length) p.archetypes = proposed.archetypes;
        if (proposed?.description) p.description = proposed.description;
      }
      nextEvents.push({
        ...ctx,
        event_type: 'evolution_transform',
        world_name: e.proposed_children[0]?.name ?? 'unknown',
        world_id: e.parent_world_ids[0] ?? 'unknown',
        confidence: e.confidence,
        detail: {
          parent_world_ids: e.parent_world_ids,
          new_name: e.proposed_children[0]?.name,
          reason: e.reason,
        },
      });
    } else if (e.event_type === 'absorb') {
      for (const pid of e.parent_world_ids) {
        const p = nextWB.find((w) => w.id === pid);
        if (p) p.phase = 'archived';
      }
      nextEvents.push({
        ...ctx,
        event_type: 'evolution_absorb',
        world_name: e.proposed_children[0]?.name ?? 'archived',
        world_id: e.parent_world_ids[0] ?? 'unknown',
        confidence: e.confidence,
        detail: {
          parent_world_ids: e.parent_world_ids,
          absorber_name: e.proposed_children[0]?.name ?? null,
          reason: e.reason,
        },
      });
    }
  }

  // 2. Reactivation proposals — dormant → active
  for (const r of run.output.reactivation_proposals) {
    if (!r || typeof r.world_id !== 'string') continue;
    const entry = nextWB.find((w) => w.id === r.world_id);
    if (!entry) continue;
    entry.phase = 'active';
    entry.last_signal_at = run.window_end;
    nextEvents.push({
      ...ctx,
      event_type: 'world_reactivated',
      world_name: entry.current_name,
      world_id: entry.id,
      confidence: r.confidence,
      detail: {
        drops_last_4_weeks: r.drops_last_4_weeks,
        reason: r.reason,
      },
    });
  }

  // 3. New World candidates — with dormancy pre-check
  for (const c of run.output.new_world_candidates) {
    if (!c || typeof c.proposed_name !== 'string' || !c.proposed_name.trim()) continue;
    const lnName = c.proposed_name.toLowerCase();
    const dormantMatch = initiallyDormant.get(lnName);
    // Check for archetype overlap: any archetype with weight ≥ 0.3 in both.
    const isUnexpected =
      dormantMatch !== undefined &&
      dormantMatch.archetypes.some((a) =>
        a.weight >= 0.3 &&
        c.archetypes.some((ca) => ca.type === a.type && ca.weight >= 0.3),
      );
    const id = makeWorldId(c.proposed_name, run.window_index, nextWB);
    nextWB.push({
      id,
      current_name: c.proposed_name,
      original_name: c.proposed_name,
      description: c.description,
      archetypes: c.archetypes,
      phase: 'active',
      emerged_in_window: run.window_index,
      first_signal_at: c.first_signal_at,
      last_signal_at: c.last_signal_at,
      renamed_history: [],
    });
    nextEvents.push({
      ...ctx,
      event_type: 'emerged',
      world_name: c.proposed_name,
      world_id: id,
      confidence: c.confidence,
      detail: {
        drop_count: c.drop_count,
        distinct_day_count: c.distinct_day_count,
        ...(isUnexpected ? { unexpected_vs_dormant_world: dormantMatch!.id } : {}),
      },
    });
  }

  // 2. New Chapter candidates
  for (const c of run.output.new_chapter_candidates) {
    if (!c || typeof c.proposed_title !== 'string' || !c.proposed_title.trim()) continue;
    const id = makeChapterId(c.proposed_title, run.window_index, nextCB);
    nextCB.push({
      id,
      title: c.proposed_title,
      description: c.description,
      chapter_type: c.chapter_type,
      phase: 'suggested',
      start_date: c.start_date,
      end_date: c.end_date,
      primary_world_name: c.primary_world_name,
      related_world_names: c.related_world_names ?? [],
      target_description: c.target_description,
      proposed_in_window: run.window_index,
      updated_in_windows: [],
      closed_in_window: null,
      confidence: c.confidence,
    });
    nextEvents.push({
      ...ctx,
      event_type: 'chapter_proposed',
      world_name: c.primary_world_name ?? 'unknown',
      world_id: id,
      confidence: c.confidence,
      detail: {
        title: c.proposed_title,
        chapter_type: c.chapter_type,
        start_date: c.start_date,
        end_date: c.end_date,
      },
    });
  }

  // 3. Chapter updates (extend / close / modify existing chapter)
  for (const u of run.output.chapter_updates) {
    if (!u || typeof u.chapter_id !== 'string') continue;
    const ch = nextCB.find((c) => c.id === u.chapter_id);
    if (!ch) {
      // Update targeted a chapter we don't know about. Log an event but
      // don't crash — classifier may have hallucinated an id.
      nextEvents.push({
        ...ctx,
        event_type: 'chapter_updated',
        world_name: 'unknown',
        world_id: u.chapter_id,
        detail: { warning: 'unknown_chapter_id', reason: u.reason },
      });
      continue;
    }
    if (u.new_end_date) ch.end_date = u.new_end_date;
    if (u.new_description) ch.description = u.new_description;
    if (u.new_target_description) ch.target_description = u.new_target_description;
    ch.updated_in_windows.push(run.window_index);
    if (u.close_chapter) {
      ch.closed_in_window = run.window_index;
      ch.phase = 'closed';
      nextEvents.push({
        ...ctx,
        event_type: 'chapter_closed',
        world_name: ch.primary_world_name,
        world_id: ch.id,
        detail: { reason: u.reason, title: ch.title },
      });
    } else {
      nextEvents.push({
        ...ctx,
        event_type: 'chapter_updated',
        world_name: ch.primary_world_name,
        world_id: ch.id,
        detail: {
          title: ch.title,
          new_end_date: u.new_end_date,
          reason: u.reason,
        },
      });
    }
  }

  // 4. Life context candidates
  for (const lc of run.output.new_life_context_candidates) {
    if (!lc || typeof lc.proposed_name !== 'string' || !lc.proposed_name.trim()) continue;
    const id = makeLifeContextId(lc.proposed_name, run.window_index, nextLCB);
    nextLCB.push({
      id,
      name: lc.proposed_name,
      description: lc.description,
      kind: lc.kind,
      calendar_source: lc.calendar_source,
      start_date: lc.start_date,
      end_date: lc.end_date,
      proposed_in_window: run.window_index,
      confidence: lc.confidence,
    });
    nextEvents.push({
      ...ctx,
      event_type: 'life_context_proposed',
      world_name: lc.proposed_name,
      world_id: id,
      confidence: lc.confidence,
      detail: { kind: lc.kind, reason: lc.reason },
    });
  }

  // 5. Velocity updates
  for (const v of run.output.velocity_updates) {
    const entry = nextWB.find((w) => w.id === v.world_id);
    if (!entry) continue;
    entry.last_signal_at = run.window_end;
    nextEvents.push({
      ...ctx,
      event_type: 'velocity_update',
      world_name: entry.current_name,
      world_id: entry.id,
      detail: {
        signal_velocity: v.signal_velocity,
        signal_velocity_delta: v.signal_velocity_delta,
        drops_last_4_weeks: v.drops_last_4_weeks,
        drops_prior_4_weeks: v.drops_prior_4_weeks,
        rationale: v.rationale,
      },
    });
    if (v.recommend_dormant) {
      entry.phase = 'dormant';
      nextEvents.push({
        ...ctx,
        event_type: 'dormancy_recommended',
        world_name: entry.current_name,
        world_id: entry.id,
        detail: { rationale: v.rationale },
      });
    }
  }

  // 6. Evolution proposals (kept for ordering clarity — now also processed as
  //    section 1 above; this block is intentionally empty and will be removed
  //    in the next cleanup pass. For now, preserve the label so harness output
  //    readers recognize the numbering.)
  // (handled in section 1 above)

  // 7. Reclassification proposals — World that has shifted to obligation shape
  for (const r of run.output.reclassification_proposals) {
    if (!r || typeof r.world_id !== 'string') continue;
    if ((r.sustained_over_rebuilds ?? 0) < 2 || (r.confidence ?? 0) < 0.7) continue;
    const entry = nextWB.find((w) => w.id === r.world_id);
    if (!entry) continue;
    entry.phase = 'archived';
    const lcId = makeLifeContextId(r.target_name, run.window_index, nextLCB);
    nextLCB.push({
      id: lcId,
      name: r.target_name,
      description: r.reason,
      kind: r.target_kind as LifeContextKind,
      calendar_source: null,
      start_date: run.window_start,
      end_date: null,
      proposed_in_window: run.window_index,
      confidence: r.confidence,
    });
    nextEvents.push({
      ...ctx,
      event_type: 'world_reclassified',
      world_name: entry.current_name,
      world_id: entry.id,
      confidence: r.confidence,
      detail: {
        target_kind: r.target_kind,
        target_name: r.target_name,
        reason: r.reason,
        life_context_id: lcId,
      },
    });
  }

  return {
    worldBook: nextWB,
    chapterBook: nextCB,
    lifeContextBook: nextLCB,
    events: nextEvents,
  };
}

export function buildSummary(
  runs: WindowRun[],
  worldBook: HarnessWorldBookEntry[],
  chapterBook: HarnessChapterBookEntry[],
  lifeContextBook: HarnessLifeContextBookEntry[],
  events: HarnessEvent[],
): HarnessSummary {
  const totalIn = runs.reduce(
    (s, r) => s + (r.output.run_metadata.input_tokens ?? 0),
    0,
  );
  const totalOut = runs.reduce(
    (s, r) => s + (r.output.run_metadata.output_tokens ?? 0),
    0,
  );
  // Sonnet 4.6 approximate pricing: $3/M input, $15/M output
  const cost = (totalIn / 1_000_000) * 3 + (totalOut / 1_000_000) * 15;

  const stability: HarnessSummary['stability_by_name'] = {};
  for (const wb of worldBook) {
    let windowsPresent = 0;
    for (const run of runs) {
      const appeared =
        run.output.new_world_candidates.some(
          (c) => c.proposed_name === wb.current_name,
        ) ||
        run.output.velocity_updates.some((v) => v.world_id === wb.id) ||
        run.output.evolution_proposals.some(
          (ev) =>
            ev.parent_world_ids.includes(wb.id) ||
            ev.proposed_children.some((c) => c.name === wb.current_name),
        );
      if (appeared) windowsPresent++;
    }
    stability[wb.current_name] = {
      windows_present: windowsPresent,
      first_window: wb.emerged_in_window,
      name_changes: wb.renamed_history.length,
    };
  }

  const totalChaptersProposed = runs.reduce(
    (s, r) => s + r.output.new_chapter_candidates.length,
    0,
  );
  const totalChapterUpdates = runs.reduce(
    (s, r) => s + r.output.chapter_updates.length,
    0,
  );
  const totalChaptersClosed = events.filter(
    (e) => e.event_type === 'chapter_closed',
  ).length;
  const totalDistinctChapters = chapterBook.length;

  const totalReactivations = events.filter(
    (e) => e.event_type === 'world_reactivated',
  ).length;
  const unexpectedNewVsReactivate = events.filter(
    (e) =>
      e.event_type === 'emerged' &&
      (e.detail as Record<string, unknown> | undefined)?.unexpected_vs_dormant_world !== undefined,
  ).length;

  const totalReclassifications = events.filter(
    (e) => e.event_type === 'world_reclassified',
  ).length;

  return {
    total_worlds_emerged: worldBook.length,
    worlds_still_active: worldBook.filter((w) => w.phase === 'active').length,
    worlds_dormant: worldBook.filter((w) => w.phase === 'dormant').length,
    worlds_archived: worldBook.filter((w) => w.phase === 'archived').length,
    total_chapters_proposed: totalChaptersProposed,
    total_chapter_updates: totalChapterUpdates,
    total_chapters_closed: totalChaptersClosed,
    total_distinct_chapters: totalDistinctChapters,
    total_life_contexts_proposed: lifeContextBook.length,
    total_reactivations: totalReactivations,
    unexpected_new_vs_reactivate: unexpectedNewVsReactivate,
    total_reclassifications: totalReclassifications,
    total_evolution_proposals: runs.reduce(
      (s, r) => s + r.output.evolution_proposals.length,
      0,
    ),
    total_velocity_updates: runs.reduce(
      (s, r) => s + r.output.velocity_updates.length,
      0,
    ),
    total_dormancy_recommendations: events.filter(
      (e) => e.event_type === 'dormancy_recommended',
    ).length,
    stability_by_name: stability,
    total_input_tokens: totalIn,
    total_output_tokens: totalOut,
    estimated_cost_usd: Math.round(cost * 100) / 100,
  };
}

export function buildHarnessSummary(finalization: HarnessResult): {
  user_id: string;
  window_days: number;
  stride_days: number;
  total_windows: number;
  cost_usd: number;
  worlds: Array<{ id: string; name: string; phase: string; emerged_in_window: number }>;
  chapters: Array<{
    id: string;
    title: string;
    primary_world_name: string;
    phase: string;
    start_date: string | null;
    end_date: string | null;
    proposed_in_window: number;
    closed_in_window: number | null;
  }>;
  life_contexts: Array<{
    id: string;
    name: string;
    kind: string;
    proposed_in_window: number;
    end_date: string | null;
  }>;
  candidates_per_window: Array<{
    window_index: number;
    window_end: string;
    new_worlds: string[];
    new_chapters: Array<{
      title: string;
      primary_world: string;
      start: string | null;
      end: string | null;
    }>;
    new_life_contexts: Array<{ name: string; kind: string }>;
    chapter_updates: Array<{ chapter_id: string; close: boolean }>;
    reclassifications: Array<{ world_id: string; target_name: string; target_kind: string }>;
    velocity_deltas: Array<{
      world_id: string;
      velocity: number;
      delta: string;
      dormant: boolean;
    }>;
  }>;
  totals: {
    worlds_emerged: number;
    chapters_proposed: number;
    chapters_closed: number;
    chapter_updates: number;
    life_contexts_proposed: number;
    reclassifications: number;
    dormancy_recommendations: number;
  };
} {
  return {
    user_id: finalization.user_id,
    window_days: finalization.window_days,
    stride_days: finalization.stride_days,
    total_windows: finalization.total_windows,
    cost_usd: finalization.summary.estimated_cost_usd,

    worlds: finalization.world_book.map((w) => ({
      id: w.id,
      name: w.current_name,
      phase: w.phase,
      emerged_in_window: w.emerged_in_window,
    })),

    chapters: finalization.chapter_book.map((c) => ({
      id: c.id,
      title: c.title,
      primary_world_name: c.primary_world_name,
      phase: c.phase,
      start_date: c.start_date,
      end_date: c.end_date,
      proposed_in_window: c.proposed_in_window,
      closed_in_window: c.closed_in_window,
    })),

    life_contexts: finalization.life_context_book.map((l) => ({
      id: l.id,
      name: l.name,
      kind: l.kind,
      proposed_in_window: l.proposed_in_window,
      end_date: l.end_date,
    })),

    candidates_per_window: finalization.runs.map((r) => ({
      window_index: r.window_index,
      window_end: r.window_end,
      new_worlds: (r.output.new_world_candidates || []).map((c) => c.proposed_name),
      new_chapters: (r.output.new_chapter_candidates || []).map((c) => ({
        title: c.proposed_title,
        primary_world: c.primary_world_name,
        start: c.start_date,
        end: c.end_date,
      })),
      new_life_contexts: (r.output.new_life_context_candidates || []).map((c) => ({
        name: c.proposed_name,
        kind: c.kind,
      })),
      chapter_updates: (r.output.chapter_updates || []).map((u) => ({
        chapter_id: u.chapter_id,
        close: u.close_chapter,
      })),
      reclassifications: (r.output.reclassification_proposals || []).map((p) => ({
        world_id: p.world_id,
        target_name: p.target_name,
        target_kind: p.target_kind,
      })),
      velocity_deltas: (r.output.velocity_updates || []).map((v) => ({
        world_id: v.world_id,
        velocity: v.signal_velocity,
        delta: v.signal_velocity_delta,
        dormant: v.recommend_dormant,
      })),
    })),

    totals: {
      worlds_emerged: finalization.summary.total_worlds_emerged,
      chapters_proposed: finalization.summary.total_chapters_proposed,
      chapters_closed: finalization.summary.total_chapters_closed,
      chapter_updates: finalization.summary.total_chapter_updates,
      life_contexts_proposed: finalization.summary.total_life_contexts_proposed,
      reclassifications: finalization.summary.total_reclassifications,
      dormancy_recommendations: finalization.summary.total_dormancy_recommendations,
    },
  };
}

// Re-export so the Inngest wrapper can invoke inside its step.run callbacks
// without importing from signalCollector directly (keeps imports local).
export {
  collectSignalForBackfillClassifier,
  classifyWorldsWeekly,
};
