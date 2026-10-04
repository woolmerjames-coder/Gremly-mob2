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
 * The thread's metadata is one JSON value, changed by reading it, merging and
 * writing it back. Several parts of the app do that (the brief's stamps, the
 * plan, the agent's tasks, the evening wrap up), so each change waits for the
 * one before it: two that overlapped would each write back what they read,
 * and the second would undo the first.
 */
const turns = new Map<string, Promise<unknown>>();
function inTurn<T>(threadId: string, work: () => Promise<T>): Promise<T> {
  const before = turns.get(threadId) ?? Promise.resolve();
  const mine = before.then(work, work);
  turns.set(
    threadId,
    mine.catch(() => undefined),
  );
  return mine;
}

/**
 * Merge fields into the thread's metadata (seen_at, answered_at,
 * plan_locked_at...). Fields already set are kept unless the patch names them.
 */
export function patchDailyThreadMeta(
  threadId: string,
  patch: Partial<DailyThreadMeta>,
): Promise<DailyThread | null> {
  return inTurn(threadId, () => patchNow(threadId, patch));
}

async function patchNow(
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

/**
 * Stamp one of the thread's moments (first seen, first reply, plan locked)
 * with the time now, unless it already has one. Returns the stamp kept, and
 * whether it was made by this call.
 */
export function markDailyThreadOnce(
  threadId: string,
  field: 'seen_at' | 'answered_at' | 'plan_locked_at',
): Promise<{ at: string; fresh: boolean } | null> {
  return inTurn(threadId, () => markOnceNow(threadId, field));
}

async function markOnceNow(
  threadId: string,
  field: 'seen_at' | 'answered_at' | 'plan_locked_at',
): Promise<{ at: string; fresh: boolean } | null> {
  const { data: current, error: readError } = await supabase
    .from('scope_chats')
    .select('metadata_json')
    .eq('id', threadId)
    .maybeSingle();
  if (readError) throw new Error(`Failed to read the daily thread: ${readError.message}`);
  const meta = (current?.metadata_json as DailyThreadMeta | null) ?? null;
  if (!meta) return null;
  const existing = meta[field];
  if (existing) return { at: existing, fresh: false };
  const at = nowTimestamp();
  const { error } = await supabase
    .from('scope_chats')
    .update({ metadata_json: { ...meta, [field]: at }, updated_at: at })
    .eq('id', threadId);
  if (error) throw new Error(`Failed to update the daily thread: ${error.message}`);
  return { at, fresh: true };
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
