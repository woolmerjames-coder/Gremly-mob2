/**
 * Shared helpers used by worldsBootstrap.ts and worldsWriterTest.ts.
 */

import { createClient } from '@supabase/supabase-js';
import type { ActiveWorldInput, ActiveChapterInput, ActiveLifeContextInput } from './worldsClassifier';

export interface ActiveStateEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
}

/**
 * Loads active worlds and active chapters for an owner from Supabase and
 * shapes them into the classifier's ActiveWorldInput / ActiveChapterInput
 * types.
 *
 * Active worlds:   phase in ('candidate', 'active', 'evolving')
 * Active chapters: phase in ('suggested', 'upcoming', 'active')
 */
export async function loadActiveState(
  ownerId: string,
  env: ActiveStateEnv,
): Promise<{ activeWorlds: ActiveWorldInput[]; activeChapters: ActiveChapterInput[]; activeLifeContexts: ActiveLifeContextInput[] }> {
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const { data: worlds, error: wErr } = await db
    .from('worlds')
    .select('id, name, description, archetypes, first_signal_at, last_signal_at')
    .eq('owner_id', ownerId)
    .in('phase', ['candidate', 'active', 'evolving']);
  if (wErr) throw wErr;

  const { data: chapters, error: cErr } = await db
    .from('chapters')
    .select(
      'id, title, chapter_type, phase, start_date, end_date, primary_world_id, description, target_description',
    )
    .eq('owner_id', ownerId)
    .in('phase', ['suggested', 'upcoming', 'active', 'closed']);
  if (cErr) throw cErr;

  const { data: lcs, error: lcErr } = await db
    .from('life_contexts')
    .select('id, name, kind, description, start_date, end_date, active')
    .eq('owner_id', ownerId)
    .eq('active', true);
  if (lcErr) throw lcErr;

  const worldNameById = new Map(
    (worlds ?? []).map((w: any) => [w.id as string, w.name as string]),
  );

  return {
    activeWorlds: (worlds ?? []).map((w: any) => ({
      id: w.id as string,
      name: w.name as string,
      description: w.description as string,
      archetypes: w.archetypes,
      first_signal_at: w.first_signal_at as string,
      last_signal_at: w.last_signal_at as string,
    })),
    activeChapters: (chapters ?? []).map((c: any) => ({
      id: c.id as string,
      title: c.title as string,
      chapter_type: c.chapter_type,
      phase: c.phase,
      start_date: c.start_date as string | null,
      end_date: c.end_date as string | null,
      primary_world_name: worldNameById.get(c.primary_world_id as string) ?? '',
      description: c.description as string,
      target_description: c.target_description as string | null,
    })),
    activeLifeContexts: (lcs ?? []).map((lc: any) => ({
      id: lc.id as string,
      name: lc.name as string,
      kind: lc.kind,
      description: lc.description as string | null,
      start_date: lc.start_date as string | null,
      end_date: lc.end_date as string | null,
      active: lc.active as boolean,
    })),
  };
}
