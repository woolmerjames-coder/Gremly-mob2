/**
 * The day's brief thread (Daily brief in Chat).
 *
 * One scope_chats row per person per ritual day, chat_type 'daily', created by
 * whichever comes first: the brief job or the person's first open
 * (ensure_daily_thread, supabase/migrations/20261001165814_daily_brief_thread.sql).
 */

import { supabase } from '../supabase/client';
import type { SpaceChat } from '../types';
import type { DailyThreadMeta } from '../brief/types';
import { nowTimestamp } from '../date/DateService';

export type DailyThread = SpaceChat & { metadata_json: DailyThreadMeta };

function asThread(row: unknown): DailyThread | null {
  const r = row as (SpaceChat & { metadata_json?: unknown }) | null;
  if (!r || !r.id) return null;
  const meta = (r.metadata_json ?? {}) as DailyThreadMeta;
  if (!meta.ritual_day) return null;
  return r as DailyThread;
}

/** Today's thread, created if this is the first ask of the day. */
export async function ensureDailyThread(ritualDay: string): Promise<DailyThread | null> {
  const { data, error } = await supabase.rpc('ensure_daily_thread', { p_day: ritualDay });
  if (error) throw new Error(`ensure_daily_thread failed: ${error.message}`);
  return asThread(data);
}

/** The thread for a ritual day, or null when none has been made. Never creates one. */
export async function getDailyThread(
  userId: string,
  ritualDay: string,
): Promise<DailyThread | null> {
  const { data, error } = await supabase
    .from('scope_chats')
    .select('*')
    .eq('user_id', userId)
    .eq('chat_type', 'daily')
    .eq('metadata_json->>ritual_day', ritualDay)
    .maybeSingle();
  if (error) throw new Error(`Failed to read the daily thread: ${error.message}`);
  return asThread(data);
}

/**
 * Merge fields into the thread's metadata (seen_at, answered_at,
 * plan_locked_at...). Fields already set are kept unless the patch names them.
 */
export async function patchDailyThreadMeta(
  threadId: string,
  patch: Partial<DailyThreadMeta>,
): Promise<DailyThread | null> {
  const { data: current, error: readError } = await supabase
    .from('scope_chats')
    .select('metadata_json')
    .eq('id', threadId)
    .maybeSingle();
  if (readError) throw new Error(`Failed to read the daily thread: ${readError.message}`);
  const merged = { ...((current?.metadata_json as DailyThreadMeta | null) ?? {}), ...patch };
  const { data, error } = await supabase
    .from('scope_chats')
    .update({ metadata_json: merged, updated_at: nowTimestamp() })
    .eq('id', threadId)
    .select('*')
    .maybeSingle();
  if (error) throw new Error(`Failed to update the daily thread: ${error.message}`);
  return asThread(data);
}

/** Recent daily threads for the history list, newest first. */
export async function listDailyThreads(userId: string, limit = 30): Promise<DailyThread[]> {
  const { data, error } = await supabase
    .from('scope_chats')
    .select('*')
    .eq('user_id', userId)
    .eq('chat_type', 'daily')
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to list daily threads: ${error.message}`);
  return (data ?? []).map(asThread).filter((t): t is DailyThread => t !== null);
}
