/**
 * Worlds & Chapters v2 — signal collector (Phase 1, step 2)
 *
 * Sole source of truth for what raw signal the Worlds classifier sees.
 * Exports two modes sharing a single typed SignalBundle discriminated
 * union so mode-conditional fields (DCO history, weekly summaries) are
 * a compile-time guarantee rather than a runtime discipline.
 *
 * Hard boundary: this file does not import from any Life Map pipeline
 * function (bootstrapLifeMap, rebuildLifeMap, runUnifiedAnalyst,
 * updateLifeMapAndFocus, generateHeadlineFromFocus, fetchFullHistoricalSnapshot).
 * Enforced by scripts/check-worlds-boundary.mjs.
 *
 * References:
 *   worlds_and_chapters_spec_v2-3.md §7
 *   audit_v2-1.md §5
 *   handover_v3_to_next_session.md §6 (non-negotiables) and §8 (task spec)
 */

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
}

// ─── Entry shapes ────────────────────────────────────────────────────────────

export interface JournalEntry {
  id: string;
  title: string | null;
  body: string | null;
  mood: string[] | null;
  tags: unknown;
  origin: string | null;
  created_at: string;
  target_date: string | null;
  date: string | null;
  is_goal: boolean | null;
  archived: boolean;
}

export interface NoteEntry {
  id: string;
  title: string | null;
  body: string | null;
  subtype: string | null; // catchall | idea | event | general
  mood: string[] | null;
  tags: unknown;
  origin: string | null;
  created_at: string;
  target_date: string | null;
  date: string | null;
  is_goal: boolean | null;
  archived: boolean;
}

export interface TodoEntry {
  id: string;
  title: string | null;
  name: string | null;
  body: string | null;
  notes: string | null;
  subtype: string | null;
  tags: unknown;
  // `status` is present for schema completeness but is unreliable in live data
  // (audit finding 3.7: 0 rows have status='completed' even when completed).
  // Use completed_at for completion.
  status: string | null;
  completed_at: string | null;
  archived: boolean;
  due_date: string | null;
  target_date: string | null;
  scheduled_date: string | null;
  created_at: string;
}

export interface HabitEntry {
  id: string;
  name: string | null;
  title: string | null;
  notes: string | null;
  why_string: string | null;
  tags: string[] | null;
  frequency: string | null;
  cadence: string | null;
  target_per_period: number | null;
  subtype: string | null;
  archived: boolean;
  commitment: string | null;
  created_at: string;
}

export interface HabitProgressEntry {
  habit_id: string;
  occurred_day: string;
  occurred_at: string | null;
}

export interface ChatSummaryEntry {
  id: string;
  title: string | null;
  auto_title: string | null;
  running_summary: string;
  context_json: unknown;
  created_at: string;
}

export interface TemporalAnchorEntry {
  id: string;
  title: string | null;
  description: string | null;
  category: string | null;
  date_text: string | null;
  resolved_date: string | null;
  date_confidence: string | null;
  date_range_start: string | null;
  date_range_end: string | null;
  status: string | null;
  created_at: string;
}

export interface ProfileOverrideEntry {
  action: string;
  fact_text: string;
  created_at: string;
}

export interface RitualProgressEntry {
  ritual_day: string;
  drops_count: number | null;
  sweeps_count: number | null;
  feeding_gauge_value: number | null;
  is_fed: boolean | null;
}

export interface PhotoNoteEntry {
  note_id: string;
  created_at: string;
  parent_note_body: string | null;
}

export interface DcoEntry {
  date: string;
  dco: unknown;
}

export interface WeeklySummaryEntry {
  week_start_date: string;
  week_end_date: string;
  content: unknown;
  stats_snapshot: unknown;
  key_themes: unknown;
}

// ─── SignalBundle (discriminated union) ──────────────────────────────────────

interface SignalBundleBase {
  userId: string;
  collectedAt: string;
  journals: JournalEntry[];
  notes: NoteEntry[];
  todos: TodoEntry[];
  habits: HabitEntry[];
  habitProgress: HabitProgressEntry[];
  chatSummaries: ChatSummaryEntry[];
  temporalAnchors: TemporalAnchorEntry[];
  profileOverrides: ProfileOverrideEntry[];
  ritualProgress: RitualProgressEntry[];
  photoNotes: PhotoNoteEntry[];
}

export interface LiveSignalBundle extends SignalBundleBase {
  mode: 'live';
  windowStart: null;
  windowEnd: null;
  dcoHistory: DcoEntry[];
  weeklySummaries: WeeklySummaryEntry[];
}

export interface BackfillSignalBundle extends SignalBundleBase {
  mode: 'backfill';
  windowStart: string;
  windowEnd: string;
}

export type SignalBundle = LiveSignalBundle | BackfillSignalBundle;

// ─── Supabase REST helper ────────────────────────────────────────────────────

async function supabaseGet<T>(env: Env, pathAndQuery: string): Promise<T[]> {
  const url = `${env.SUPABASE_URL}/rest/v1/${pathAndQuery}`;
  const res = await fetch(url, {
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`supabaseGet ${res.status} ${res.statusText} on ${pathAndQuery}\n${body}`);
  }
  return (await res.json()) as T[];
}

function windowClause(column: string, start: string | null, end: string | null): string {
  const parts: string[] = [];
  if (start) parts.push(`${column}=gte.${start}`);
  if (end) parts.push(`${column}=lte.${end}`);
  return parts.length ? '&' + parts.join('&') : '';
}

// ─── Per-section fetchers ────────────────────────────────────────────────────

const NOTE_COLUMNS =
  'id,title,body,subtype,mood,tags,origin,created_at,target_date,date,is_goal,archived';

async function fetchJournals(
  userId: string,
  env: Env,
  windowStart: string | null,
  windowEnd: string | null,
): Promise<JournalEntry[]> {
  const q =
    `notes?owner_id=eq.${userId}` +
    `&subtype=eq.journal` +
    `&select=${NOTE_COLUMNS}` +
    windowClause('created_at', windowStart, windowEnd) +
    `&order=created_at.asc&limit=2000`;
  return supabaseGet<JournalEntry>(env, q);
}

async function fetchNonJournalNotes(
  userId: string,
  env: Env,
  windowStart: string | null,
  windowEnd: string | null,
): Promise<NoteEntry[]> {
  // Non-journal user-authored notes. Subtypes: catchall | idea | event | general.
  //
  // Two exclusions that PostgREST can't express cleanly in one filter, applied
  // in-memory after fetch:
  //   1. origin='space_chat' rows — already represented via chatSummaries.
  //   2. subtype='event' AND external_source IS NOT NULL — synced calendar junk
  //      (4,081 rows for James per audit §2.6). This is the single most
  //      important filter in the entire collector per non-negotiable §6.
  //
  // `external_source` is pulled into the select to enable the in-memory filter,
  // then stripped before returning.
  const columns = NOTE_COLUMNS + ',external_source';
  const q =
    `notes?owner_id=eq.${userId}` +
    `&subtype=in.(catchall,idea,event,general)` +
    `&select=${columns}` +
    windowClause('created_at', windowStart, windowEnd) +
    `&order=created_at.asc&limit=2000`;
  type WithExt = NoteEntry & { external_source: unknown };
  const raw = await supabaseGet<WithExt>(env, q);
  return raw
    .filter((r) => r.origin !== 'space_chat')
    .filter((r) => !(r.subtype === 'event' && r.external_source != null))
    .map(({ external_source: _omit, ...rest }) => rest);
}

async function fetchTodos(
  userId: string,
  env: Env,
  windowStart: string | null,
  windowEnd: string | null,
): Promise<TodoEntry[]> {
  const columns =
    'id,title,name,body,notes,subtype,tags,status,completed_at,archived,' +
    'due_date,target_date,scheduled_date,created_at';
  const q =
    `todos?owner_id=eq.${userId}` +
    `&select=${columns}` +
    windowClause('created_at', windowStart, windowEnd) +
    `&order=created_at.asc&limit=2000`;
  return supabaseGet<TodoEntry>(env, q);
}

async function fetchHabits(
  userId: string,
  env: Env,
  windowStart: string | null,
  windowEnd: string | null,
): Promise<HabitEntry[]> {
  const columns =
    'id,name,title,notes,why_string,tags,frequency,cadence,target_per_period,' +
    'subtype,archived,commitment,created_at';
  const q =
    `habits?owner_id=eq.${userId}` +
    `&select=${columns}` +
    windowClause('created_at', windowStart, windowEnd) +
    `&order=created_at.asc&limit=500`;
  return supabaseGet<HabitEntry>(env, q);
}

async function fetchHabitProgress(
  userId: string,
  env: Env,
  windowStart: string | null,
  windowEnd: string | null,
): Promise<HabitProgressEntry[]> {
  const q =
    `habit_progress?owner_id=eq.${userId}` +
    `&select=habit_id,occurred_day,occurred_at` +
    windowClause('occurred_day', windowStart, windowEnd) +
    `&order=occurred_day.asc&limit=5000`;
  return supabaseGet<HabitProgressEntry>(env, q);
}

async function fetchChatSummaries(
  userId: string,
  env: Env,
  windowStart: string | null,
  windowEnd: string | null,
): Promise<ChatSummaryEntry[]> {
  // space_chats uses user_id (see existing fetcher at index.js:4926).
  // Only rows with a non-null running_summary count as signal (spec §7).
  // No space_id is selected: the classifier never sees which space (if any)
  // a chat belonged to.
  const q =
    `space_chats?user_id=eq.${userId}` +
    `&running_summary=not.is.null` +
    `&select=id,title,auto_title,running_summary,context_json,created_at` +
    windowClause('updated_at', windowStart, windowEnd) +
    `&order=created_at.asc&limit=500`;
  return supabaseGet<ChatSummaryEntry>(env, q);
}

async function fetchTemporalAnchors(
  userId: string,
  env: Env,
  windowStart: string | null,
  windowEnd: string | null,
): Promise<TemporalAnchorEntry[]> {
  // user_temporal_anchors uses user_id (see existing usage at index.js:4947).
  const columns =
    'id,title,description,category,date_text,resolved_date,date_confidence,' +
    'date_range_start,date_range_end,status,created_at';
  const q =
    `user_temporal_anchors?user_id=eq.${userId}` +
    `&select=${columns}` +
    windowClause('created_at', windowStart, windowEnd) +
    `&order=created_at.asc&limit=500`;
  return supabaseGet<TemporalAnchorEntry>(env, q);
}

async function fetchProfileOverrides(
  userId: string,
  env: Env,
  windowStart: string | null,
  windowEnd: string | null,
): Promise<ProfileOverrideEntry[]> {
  // user_profile_overrides uses user_id (see existing fetcher at index.js:2525).
  const q =
    `user_profile_overrides?user_id=eq.${userId}` +
    `&select=action,fact_text,created_at` +
    windowClause('created_at', windowStart, windowEnd) +
    `&order=created_at.asc&limit=500`;
  return supabaseGet<ProfileOverrideEntry>(env, q);
}

async function fetchRitualProgress(
  userId: string,
  env: Env,
  windowStart: string | null,
  windowEnd: string | null,
): Promise<RitualProgressEntry[]> {
  const q =
    `daily_ritual_progress?owner_id=eq.${userId}` +
    `&select=ritual_day,drops_count,sweeps_count,feeding_gauge_value,is_fed` +
    windowClause('ritual_day', windowStart, windowEnd) +
    `&order=ritual_day.asc&limit=1000`;
  return supabaseGet<RitualProgressEntry>(env, q);
}

async function fetchPhotoNotes(
  userId: string,
  env: Env,
  windowStart: string | null,
  windowEnd: string | null,
): Promise<PhotoNoteEntry[]> {
  // log_photos has its own owner_id, so ownership filtering happens on the
  // row directly (no need for embedded-resource filter). The parent note's
  // body is the text signal per spec decision 6; image URL is discarded.
  const q =
    `log_photos?owner_id=eq.${userId}` +
    `&select=note_id,created_at,note:notes!inner(body)` +
    windowClause('created_at', windowStart, windowEnd) +
    `&order=created_at.asc&limit=500`;
  type RawPhoto = {
    note_id: string;
    created_at: string;
    note: { body: string | null } | null;
  };
  const raw = await supabaseGet<RawPhoto>(env, q);
  return raw.map((r) => ({
    note_id: r.note_id,
    created_at: r.created_at,
    parent_note_body: r.note?.body ?? null,
  }));
}

// ─── Live-only fetchers (backfill excludes these per spec decisions 7 and 8) ─

async function fetchDcoHistory(userId: string, env: Env): Promise<DcoEntry[]> {
  const q =
    `user_daily_state?user_id=eq.${userId}` + `&select=date,dco` + `&order=date.desc&limit=30`;
  return supabaseGet<DcoEntry>(env, q);
}

async function fetchWeeklySummaries(userId: string, env: Env): Promise<WeeklySummaryEntry[]> {
  const q =
    `weekly_summaries?user_id=eq.${userId}` +
    `&select=week_start_date,week_end_date,content,stats_snapshot,key_themes` +
    `&order=week_start_date.asc&limit=52`;
  return supabaseGet<WeeklySummaryEntry>(env, q);
}

// ─── Shared orchestration ────────────────────────────────────────────────────

type SharedSections = Omit<SignalBundleBase, 'userId' | 'collectedAt'>;

async function fetchSharedSignalSections(
  userId: string,
  env: Env,
  windowStart: string | null,
  windowEnd: string | null,
): Promise<SharedSections> {
  const [
    journals,
    notes,
    todos,
    habits,
    habitProgress,
    chatSummaries,
    temporalAnchors,
    profileOverrides,
    ritualProgress,
    photoNotes,
  ] = await Promise.all([
    fetchJournals(userId, env, windowStart, windowEnd),
    fetchNonJournalNotes(userId, env, windowStart, windowEnd),
    fetchTodos(userId, env, windowStart, windowEnd),
    fetchHabits(userId, env, windowStart, windowEnd),
    fetchHabitProgress(userId, env, windowStart, windowEnd),
    fetchChatSummaries(userId, env, windowStart, windowEnd),
    fetchTemporalAnchors(userId, env, windowStart, windowEnd),
    fetchProfileOverrides(userId, env, windowStart, windowEnd),
    fetchRitualProgress(userId, env, windowStart, windowEnd),
    fetchPhotoNotes(userId, env, windowStart, windowEnd),
  ]);
  return {
    journals,
    notes,
    todos,
    habits,
    habitProgress,
    chatSummaries,
    temporalAnchors,
    profileOverrides,
    ritualProgress,
    photoNotes,
  };
}

// ─── Public exports ──────────────────────────────────────────────────────────

export async function collectSignalForLiveClassifier(
  userId: string,
  env: Env,
): Promise<LiveSignalBundle> {
  const collectedAt = new Date().toISOString();
  const [sections, dcoHistory, weeklySummaries] = await Promise.all([
    fetchSharedSignalSections(userId, env, null, null),
    fetchDcoHistory(userId, env),
    fetchWeeklySummaries(userId, env),
  ]);
  return {
    mode: 'live',
    userId,
    collectedAt,
    windowStart: null,
    windowEnd: null,
    ...sections,
    dcoHistory,
    weeklySummaries,
  };
}

export async function collectSignalForBackfillClassifier(
  userId: string,
  env: Env,
  windowStart: string,
  windowEnd: string,
): Promise<BackfillSignalBundle> {
  const collectedAt = new Date().toISOString();
  const sections = await fetchSharedSignalSections(userId, env, windowStart, windowEnd);
  return {
    mode: 'backfill',
    userId,
    collectedAt,
    windowStart,
    windowEnd,
    ...sections,
  };
}
