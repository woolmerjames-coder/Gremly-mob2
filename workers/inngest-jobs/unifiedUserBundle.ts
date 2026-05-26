/**
 * unifiedUserBundle.ts — Neutral shared input layer for the Gremly intelligence pipeline.
 *
 * Supersedes the two duplicate fetchers:
 *   - fetchUserSnapshot   (Inngest worker index.js ~4843) — Life Map / summary-analyst input
 *   - signalCollector.ts  (collectSignalFor{Live,Backfill}Classifier) — Worlds input
 *
 * This module is INPUT ONLY. It contains no AI-authored conclusion, performs no
 * structural authoring, and imports NO Life Map function (bootstrapLifeMap,
 * rebuildLifeMap, runUnifiedAnalyst, updateLifeMapAndFocus, generateHeadlineFromFocus,
 * fetchFullHistoricalSnapshot) and NO classifier module. It is a *new shared module on
 * neither side of the Worlds boundary*; the boundary script must be updated to allowlist
 * it (separate change). Sharing inputs is allowed; sharing structural authority is not.
 *
 * SCOPE OF THIS FILE (Task 1, prompt 1): the raw-signal + reference-state layer and the
 * bundle's type spine — provably the UNION of both old fetchers. The `computed` metrics
 * (todoStats / habitHealth / dropVelocity / moodSignal / spaceActivity) and the calendar
 * projections are intentionally STUBBED below; they are the next prompt (port the
 * snapshotCompute* helpers from the worker). Consumer wiring, the boundary-script edit,
 * and old-fetcher deletion are later steps, gated on the field-by-field equivalence diff.
 *
 * Style mirrors signalCollector.ts exactly (self-contained Env + supabaseGet, per-section
 * fetchers, Promise.all orchestration) so it drops into workers/inngest-jobs/ cleanly.
 */

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
}

// ─── Window descriptor ───────────────────────────────────────────────────────
// Generalizes signalCollector's live|backfill discriminant. `all` = bootstrap +
// Worlds-live (full history). `trailing` = weekly steady-state / daily DCO.
// `range` = explicit backfill window.

export type BundleWindow =
  | { mode: 'trailing'; windowDays: number; asOf?: string } // asOf defaults to today (UTC)
  | { mode: 'range'; windowStart: string; windowEnd: string }
  | { mode: 'all' };

interface ResolvedWindow {
  windowStart: string | null; // null = unbounded (all history)
  windowEnd: string | null;
  forwardWindow: string | null; // asOf + 14d, for the forward calendar look; null in `all`
  asOf: string; // YYYY-MM-DD anchor
}

function formatDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function resolveWindow(window: BundleWindow): ResolvedWindow {
  if (window.mode === 'all') {
    return {
      windowStart: null,
      windowEnd: null,
      forwardWindow: null,
      asOf: formatDateOnly(new Date()),
    };
  }
  if (window.mode === 'range') {
    const fw = new Date(window.windowEnd + 'T00:00:00Z');
    fw.setUTCDate(fw.getUTCDate() + 14);
    return {
      windowStart: window.windowStart,
      windowEnd: window.windowEnd,
      forwardWindow: formatDateOnly(fw),
      asOf: window.windowEnd,
    };
  }
  // trailing
  const asOf = window.asOf ?? formatDateOnly(new Date());
  const anchor = new Date(asOf + 'T00:00:00Z');
  const start = new Date(anchor);
  start.setUTCDate(start.getUTCDate() - window.windowDays);
  const fw = new Date(anchor);
  fw.setUTCDate(fw.getUTCDate() + 14);
  return {
    windowStart: formatDateOnly(start),
    windowEnd: asOf,
    forwardWindow: formatDateOnly(fw),
    asOf,
  };
}

// ─── Supabase REST helper (verbatim from signalCollector) ─────────────────────

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

async function supabasePost<T>(env: Env, rpc: string, body: unknown): Promise<T[]> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${rpc}`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return [];
  return (await res.json().catch(() => [])) as T[];
}

function windowClause(column: string, start: string | null, end: string | null): string {
  const parts: string[] = [];
  if (start) parts.push(`${column}=gte.${start}`);
  if (end) parts.push(`${column}=lte.${end}`);
  return parts.length ? '&' + parts.join('&') : '';
}

// ─── Entry shapes ─────────────────────────────────────────────────────────────
// Ported from signalCollector, with columns UNIONED where fetchUserSnapshot needs more.
// Unions are flagged inline so the equivalence audit can see exactly what changed.

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
  space_id: string | null; // UNION (+ from fetchUserSnapshot)
}

export interface NoteEntry {
  id: string;
  title: string | null;
  body: string | null;
  subtype: string | null;
  mood: string[] | null;
  tags: unknown;
  origin: string | null;
  created_at: string;
  target_date: string | null;
  date: string | null;
  is_goal: boolean | null;
  archived: boolean;
  space_id: string | null; // UNION (+ from fetchUserSnapshot)
}

export interface TodoEntry {
  id: string;
  title: string | null;
  name: string | null;
  body: string | null;
  notes: string | null;
  subtype: string | null;
  tags: unknown;
  status: string | null; // unreliable in live data; use completed_at
  completed_at: string | null;
  archived: boolean;
  due_date: string | null; // signalCollector
  due_day: string | null; // UNION (+ fetchUserSnapshot) — two due-date columns; reconcile downstream
  target_date: string | null;
  scheduled_date: string | null;
  space_id: string | null; // UNION (+ fetchUserSnapshot)
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
  space_id: string | null; // UNION (+ fetchUserSnapshot)
  created_at: string;
}

export interface HabitProgressEntry {
  habit_id: string;
  occurred_day: string;
  occurred_at: string | null;
}

export interface ChatSummaryEntry {
  id: string;
  space_id: string | null; // UNION (+ fetchUserSnapshot)
  title: string | null;
  auto_title: string | null;
  running_summary: string;
  context_json: unknown; // carries keyTopics[] per column comment — the chat theme signal
  updated_at: string | null; // UNION (+ fetchUserSnapshot)
  created_at: string;
}

export interface EntityChatSummaryEntry {
  // shape returned by RPC get_recent_entity_chat_summaries (passthrough)
  [k: string]: unknown;
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

export interface CalendarSummary {
  total_events: number;
  span_days: number;
  meetings_per_week: number;
  top_titles: Array<{ title: string; count: number }>;
  by_source: Array<{ source: string; count: number }>;
}

// fetchUserSnapshot-only sections ──────────────────────────────────────────────

export interface CalendarEventRaw {
  id: string;
  title: string | null;
  target_date: string | null;
  end_date: string | null;
  event_time: string | null;
  location: string | null;
  is_all_day: boolean | null;
  space_id: string | null;
  external_source: unknown; // present => synced; barred from narrative per DCO §8
}

export interface SpaceEntry {
  id: string;
  name: string | null;
}

export interface MilestoneEntry {
  id: string;
  title: string | null;
  name: string | null;
  date: string | null;
  space_id: string | null;
  completed: boolean | null;
  completed_at: string | null;
}

// Reference state ───────────────────────────────────────────────────────────

export interface LifeMapRef {
  life_map: unknown;
  version: number | null;
  rebuilt_at: string | null;
  updated_at: string | null;
}

export interface DcoEntry {
  date: string;
  dco: unknown;
}

export interface WeeklySummaryEntry {
  week_start_date: string;
  week_end_date: string | null;
  content: unknown;
  stats_snapshot: unknown;
  key_themes: unknown;
}

export interface UserProfileRef {
  profile_text: string | null;
  signals: unknown;
}

// ─── The bundle ───────────────────────────────────────────────────────────────

export interface UnifiedUserBundle {
  userId: string;
  collectedAt: string;
  window: BundleWindow;

  raw: {
    journals: JournalEntry[];
    notes: NoteEntry[]; // non-journal, non-event, non-space_chat
    todos: TodoEntry[];
    habits: HabitEntry[];
    habitProgress: HabitProgressEntry[];
    chatSummaries: ChatSummaryEntry[];
    entityChatSummaries: EntityChatSummaryEntry[];
    temporalAnchors: TemporalAnchorEntry[];
    profileOverrides: ProfileOverrideEntry[];
    ritualProgress: RitualProgressEntry[];
    photoNotes: PhotoNoteEntry[];
    calendarEventsRaw: CalendarEventRaw[]; // Life-Map / DCO side reads these
    calendarSummary: CalendarSummary; // Worlds reads the digest (§6)
    spaces: SpaceEntry[];
    milestones: MilestoneEntry[];
  };

  referenceState: {
    currentLifeMap: LifeMapRef | null;
    dcoHistory: DcoEntry[]; // up to 30; analyst slices most-recent-1, Worlds takes the set
    weeklySummaries: WeeklySummaryEntry[]; // up to 52; analyst slices 4, Worlds takes the set
    userProfile: UserProfileRef | null;
  };

  computed: {
    todoStats: { overdue: number; active: number; completedRecently: number };
    habitHealth: Array<{
      id: string;
      name: string | null;
      frequency: string | null;
      space_id: string | null;
      completions: number;
      expected: number;
      score_pct: number;
    }>;
    dropVelocity: {
      velocity: 'increasing' | 'decreasing' | 'steady';
      dropsLast3: number;
      dropsPrev3: number;
    };
    moodSignal: {
      topMoods: Array<{ mood: string; count: number; pct: number }>;
      allTags: Record<string, number>;
      totalTags: number;
      journalCount: number;
    };
    spaceActivity: Record<
      string,
      { name: string; recentDrops: number; recentTodos: number; totalRecent: number }
    >;
    spaceMap: Record<string, string>;
  };

  calendar: {
    todaysEvents: Array<{
      title: string | null;
      time: string | null;
      location: string | null;
      is_all_day: boolean | null;
      space: string | null;
      space_id: string | null;
      is_synced: boolean;
    }>;
    upcomingEvents: Array<{
      title: string | null;
      date: string | null;
      space: string | null;
      space_id: string | null;
      is_synced: boolean;
    }>;
    spaceKeyDates: Array<{
      date: string | null;
      title: string | null;
      space: string | null;
      space_id: string | null;
    }>;
  };
}

// ─── Per-section fetchers ─────────────────────────────────────────────────────

const NOTE_COLUMNS =
  'id,title,body,subtype,mood,tags,origin,created_at,target_date,date,is_goal,archived,space_id';

async function fetchJournals(
  userId: string,
  env: Env,
  ws: string | null,
  we: string | null,
): Promise<JournalEntry[]> {
  const q =
    `notes?owner_id=eq.${userId}&subtype=eq.journal&select=${NOTE_COLUMNS}` +
    windowClause('created_at', ws, we) +
    `&order=created_at.asc&limit=2000`;
  return supabaseGet<JournalEntry>(env, q);
}

async function fetchNonJournalNotes(
  userId: string,
  env: Env,
  ws: string | null,
  we: string | null,
): Promise<NoteEntry[]> {
  // Ported from signalCollector: the two in-memory exclusions are the single most
  // important filter in the collector — drop origin='space_chat' (already in
  // chatSummaries) and synced calendar junk (subtype='event' AND external_source).
  const columns = NOTE_COLUMNS + ',external_source';
  const q =
    `notes?owner_id=eq.${userId}&subtype=in.(catchall,idea,event,general)&select=${columns}` +
    windowClause('created_at', ws, we) +
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
  ws: string | null,
  we: string | null,
): Promise<TodoEntry[]> {
  const columns =
    'id,title,name,body,notes,subtype,tags,status,completed_at,archived,' +
    'due_date,due_day,target_date,scheduled_date,space_id,created_at'; // +due_day,+space_id (union)
  const q =
    `todos?owner_id=eq.${userId}&select=${columns}` +
    windowClause('created_at', ws, we) +
    `&order=created_at.asc&limit=2000`;
  return supabaseGet<TodoEntry>(env, q);
}

async function fetchHabits(
  userId: string,
  env: Env,
  ws: string | null,
  we: string | null,
): Promise<HabitEntry[]> {
  const columns =
    'id,name,title,notes,why_string,tags,frequency,cadence,target_per_period,' +
    'subtype,archived,commitment,space_id,created_at'; // +space_id (union)
  const q =
    `habits?owner_id=eq.${userId}&select=${columns}` +
    windowClause('created_at', ws, we) +
    `&order=created_at.asc&limit=500`;
  return supabaseGet<HabitEntry>(env, q);
}

async function fetchHabitProgress(
  userId: string,
  env: Env,
  ws: string | null,
  we: string | null,
): Promise<HabitProgressEntry[]> {
  const q =
    `habit_progress?owner_id=eq.${userId}&select=habit_id,occurred_day,occurred_at` +
    windowClause('occurred_day', ws, we) +
    `&order=occurred_day.asc&limit=5000`;
  return supabaseGet<HabitProgressEntry>(env, q);
}

async function fetchChatSummaries(
  userId: string,
  env: Env,
  ws: string | null,
  we: string | null,
): Promise<ChatSummaryEntry[]> {
  // space_chats uses user_id. +space_id,+updated_at,+archived_at filter (union w/ fetchUserSnapshot).
  const columns = 'id,space_id,title,auto_title,running_summary,context_json,updated_at,created_at';
  const q =
    `space_chats?user_id=eq.${userId}&archived_at=is.null&running_summary=not.is.null&select=${columns}` +
    windowClause('updated_at', ws, we) +
    `&order=created_at.asc&limit=500`;
  return supabaseGet<ChatSummaryEntry>(env, q);
}

async function fetchEntityChatSummaries(
  userId: string,
  env: Env,
  ws: string | null,
): Promise<EntityChatSummaryEntry[]> {
  // fetchUserSnapshot query 12 — RPC. p_since unbounded in `all` mode.
  return supabasePost<EntityChatSummaryEntry>(env, 'get_recent_entity_chat_summaries', {
    p_user_id: userId,
    p_since: ws ?? '1970-01-01',
  });
}

async function fetchTemporalAnchors(userId: string, env: Env): Promise<TemporalAnchorEntry[]> {
  // Superset of both: signalCollector windowed by created_at (all statuses);
  // fetchUserSnapshot took status=active regardless of date. Anchors are low-volume,
  // so fetch ALL (no window/status filter) and let consumers slice. Reconcile at gate.
  const columns =
    'id,title,description,category,date_text,resolved_date,date_confidence,' +
    'date_range_start,date_range_end,status,created_at';
  const q =
    `user_temporal_anchors?user_id=eq.${userId}&select=${columns}` +
    `&order=created_at.asc&limit=500`;
  return supabaseGet<TemporalAnchorEntry>(env, q);
}

async function fetchProfileOverrides(
  userId: string,
  env: Env,
  ws: string | null,
  we: string | null,
): Promise<ProfileOverrideEntry[]> {
  const q =
    `user_profile_overrides?user_id=eq.${userId}&select=action,fact_text,created_at` +
    windowClause('created_at', ws, we) +
    `&order=created_at.asc&limit=500`;
  return supabaseGet<ProfileOverrideEntry>(env, q);
}

async function fetchRitualProgress(
  userId: string,
  env: Env,
  ws: string | null,
  we: string | null,
): Promise<RitualProgressEntry[]> {
  const q =
    `daily_ritual_progress?owner_id=eq.${userId}` +
    `&select=ritual_day,drops_count,sweeps_count,feeding_gauge_value,is_fed` +
    windowClause('ritual_day', ws, we) +
    `&order=ritual_day.asc&limit=1000`;
  return supabaseGet<RitualProgressEntry>(env, q);
}

async function fetchPhotoNotes(
  userId: string,
  env: Env,
  ws: string | null,
  we: string | null,
): Promise<PhotoNoteEntry[]> {
  const q =
    `log_photos?owner_id=eq.${userId}&select=note_id,created_at,note:notes!inner(body)` +
    windowClause('created_at', ws, we) +
    `&order=created_at.asc&limit=500`;
  type RawPhoto = { note_id: string; created_at: string; note: { body: string | null } | null };
  const raw = await supabaseGet<RawPhoto>(env, q);
  return raw.map((r) => ({
    note_id: r.note_id,
    created_at: r.created_at,
    parent_note_body: r.note?.body ?? null,
  }));
}

async function fetchSpaces(userId: string, env: Env): Promise<SpaceEntry[]> {
  return supabaseGet<SpaceEntry>(
    env,
    `spaces?owner_id=eq.${userId}&archived_at=is.null&select=id,name&limit=50`,
  );
}

async function fetchMilestones(userId: string, env: Env): Promise<MilestoneEntry[]> {
  return supabaseGet<MilestoneEntry>(
    env,
    `space_milestones?owner_id=eq.${userId}&is_active=eq.true&select=id,title,name,date,space_id,completed,completed_at&order=date.asc&limit=100`,
  );
}

async function fetchCalendarEventsRaw(
  userId: string,
  env: Env,
  rw: ResolvedWindow,
): Promise<CalendarEventRaw[]> {
  // fetchUserSnapshot query 2: window + 14d forward look + still-active multi-day events.
  // In `all` mode there is no window, so fetch every (non-archived) event.
  const columns =
    'id,title,target_date,end_date,event_time,location,is_all_day,space_id,external_source';
  const base = `notes?owner_id=eq.${userId}&subtype=eq.event&archived=eq.false&select=${columns}`;
  if (rw.windowStart && rw.forwardWindow) {
    const orClause =
      `&or=(and(target_date.gte.${rw.windowStart},target_date.lte.${rw.forwardWindow}),` +
      `and(target_date.lt.${rw.windowStart},end_date.gte.${rw.windowStart}))`;
    return supabaseGet<CalendarEventRaw>(
      env,
      base + orClause + `&order=target_date.asc&limit=1000`,
    );
  }
  return supabaseGet<CalendarEventRaw>(env, base + `&order=target_date.asc&limit=2000`);
}

async function fetchCalendarSummary(
  userId: string,
  env: Env,
  ws: string | null,
  we: string | null,
): Promise<CalendarSummary> {
  // Compact digest of synced events (subtype='event' AND external_source IS NOT NULL).
  // Ported from signalCollector; raw synced rows never enter `notes`.
  const q =
    `notes?owner_id=eq.${userId}&subtype=eq.event&external_source=not.is.null` +
    `&select=title,external_source,target_date,created_at` +
    windowClause('created_at', ws, we) +
    `&order=created_at.asc&limit=10000`;
  type RawEvent = {
    title: string | null;
    external_source: { provider?: string | null } | null;
    target_date: string | null;
    created_at: string;
  };
  const raw = await supabaseGet<RawEvent>(env, q);
  const total = raw.length;
  if (total === 0)
    return { total_events: 0, span_days: 0, meetings_per_week: 0, top_titles: [], by_source: [] };

  let spanDays: number;
  if (ws && we) {
    spanDays = Math.max(
      1,
      Math.round((new Date(we).getTime() - new Date(ws).getTime()) / 86400000),
    );
  } else {
    const dates = raw.map((r) => r.target_date ?? r.created_at).sort();
    spanDays = Math.max(
      1,
      Math.round(
        (new Date(dates[dates.length - 1]).getTime() - new Date(dates[0]).getTime()) / 86400000,
      ),
    );
  }

  const titleCounts = new Map<string, { count: number; sample: string }>();
  for (const e of raw) {
    const t = (e.title ?? '').trim();
    if (!t) continue;
    const norm = t.toLowerCase().replace(/\s+/g, ' ');
    const ex = titleCounts.get(norm);
    if (ex) ex.count++;
    else titleCounts.set(norm, { count: 1, sample: t });
  }
  const top_titles = Array.from(titleCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 15)
    .map(({ sample, count }) => ({ title: sample, count }));

  const sourceCounts = new Map<string, number>();
  for (const e of raw) {
    const provider =
      e.external_source && typeof e.external_source === 'object'
        ? ((e.external_source as { provider?: string | null }).provider ?? '').toString().trim()
        : '';
    const src = provider || 'unknown';
    sourceCounts.set(src, (sourceCounts.get(src) ?? 0) + 1);
  }
  const by_source = Array.from(sourceCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([source, count]) => ({ source, count }));

  return {
    total_events: total,
    span_days: spanDays,
    meetings_per_week: Math.round((total / spanDays) * 7 * 10) / 10,
    top_titles,
    by_source,
  };
}

// Reference-state fetchers (fetched in every mode) ─────────────────────────────

async function fetchLifeMap(userId: string, env: Env): Promise<LifeMapRef | null> {
  const rows = await supabaseGet<LifeMapRef>(
    env,
    `user_life_map?user_id=eq.${userId}&select=life_map,version,rebuilt_at,updated_at`,
  );
  return rows[0] ?? null;
}

async function fetchDcoHistory(userId: string, env: Env): Promise<DcoEntry[]> {
  return supabaseGet<DcoEntry>(
    env,
    `user_daily_state?user_id=eq.${userId}&select=date,dco&order=date.desc&limit=30`,
  );
}

async function fetchWeeklySummaries(userId: string, env: Env): Promise<WeeklySummaryEntry[]> {
  return supabaseGet<WeeklySummaryEntry>(
    env,
    `weekly_summaries?user_id=eq.${userId}&select=week_start_date,week_end_date,content,stats_snapshot,key_themes&order=week_start_date.desc&limit=52`,
  );
}

async function fetchUserProfile(userId: string, env: Env): Promise<UserProfileRef | null> {
  const rows = await supabaseGet<UserProfileRef>(
    env,
    `user_profiles?user_id=eq.${userId}&select=profile_text,signals`,
  );
  return rows[0] ?? null;
}

// ─── Snapshot compute helpers (ported verbatim from inngest-index.js) ──────────

function getExpectedCompletionsForDays(frequency: string | null, days: number): number {
  switch (frequency) {
    case 'daily':
      return days;
    case 'weekly':
      return Math.ceil(days / 7);
    case '2x/week':
      return Math.ceil((days / 7) * 2);
    case '3x/week':
      return Math.ceil((days / 7) * 3);
    case '4x/week':
      return Math.ceil((days / 7) * 4);
    case '5x/week':
      return Math.ceil((days / 7) * 5);
    case '6x/week':
      return Math.ceil((days / 7) * 6);
    case '5x/month':
      return Math.ceil((days / 30) * 5);
    case 'monthly':
      return days >= 30 ? 1 : 0;
    default:
      return days;
  }
}

function snapshotDeduplicateEvents(events: CalendarEventRaw[]): CalendarEventRaw[] {
  const seenExternalIds = new Map<string, CalendarEventRaw>();
  const seenKeyDates = new Set<string>();
  const deduped: CalendarEventRaw[] = [];

  for (const evt of events) {
    // Skip cancelled
    if (
      evt.title &&
      (evt.title.toLowerCase().startsWith('canceled:') ||
        evt.title.toLowerCase().startsWith('cancelled:'))
    )
      continue;

    const ext = evt.external_source as { externalId?: string } | null | undefined;
    if (ext && ext.externalId) {
      const extId = ext.externalId;
      if (!seenExternalIds.has(extId)) {
        seenExternalIds.set(extId, evt);
        deduped.push(evt);
      }
    } else {
      const key = `${(evt.title || '').trim().toLowerCase()}|${evt.target_date}|${evt.space_id || ''}`;
      if (!seenKeyDates.has(key)) {
        seenKeyDates.add(key);
        deduped.push(evt);
      }
    }
  }

  return deduped;
}

function snapshotComputeTodoStats(
  todos: TodoEntry[],
  targetDate: string,
): { overdue: number; active: number; completedRecently: number } {
  const overdue = todos.filter(
    (t) => t.target_date && t.target_date < targetDate && t.status !== 'completed' && !t.archived,
  ).length;
  const active = todos.filter((t) => t.status === 'active' && !t.archived).length;
  const completedRecently = todos.filter((t) => t.completed_at).length;
  return { overdue, active, completedRecently };
}

function snapshotComputeHabitHealth(
  habits: HabitEntry[],
  habitProgress: HabitProgressEntry[],
  windowDays: number,
): Array<{
  id: string;
  name: string | null;
  frequency: string | null;
  space_id: string | null;
  completions: number;
  expected: number;
  score_pct: number;
}> {
  const completionMap: Record<string, number> = {};
  for (const hp of habitProgress) {
    completionMap[hp.habit_id] = (completionMap[hp.habit_id] || 0) + 1;
  }
  return habits.map((h) => {
    const done = completionMap[h.id] || 0;
    const expected = getExpectedCompletionsForDays(h.frequency, windowDays);
    const score = expected > 0 ? Math.round((done / expected) * 100) : 0;
    return {
      id: h.id,
      name: h.name,
      frequency: h.frequency,
      space_id: h.space_id || null,
      completions: done,
      expected,
      score_pct: score,
    };
  });
}

function snapshotComputeDropVelocity(
  drops: Array<{ created_at: string }>,
  targetDate: string,
): { velocity: 'increasing' | 'decreasing' | 'steady'; dropsLast3: number; dropsPrev3: number } {
  const target = new Date(targetDate + 'T00:00:00Z');

  const threeBefore = new Date(target);
  threeBefore.setUTCDate(threeBefore.getUTCDate() - 3);
  const threeBeforeStr = formatDateOnly(threeBefore);

  const sixBefore = new Date(target);
  sixBefore.setUTCDate(sixBefore.getUTCDate() - 6);
  const sixBeforeStr = formatDateOnly(sixBefore);

  const dropsLast3 = drops.filter((n) => {
    const d = n.created_at ? n.created_at.split('T')[0] : null;
    return d && d >= threeBeforeStr && d <= targetDate;
  }).length;

  const dropsPrev3 = drops.filter((n) => {
    const d = n.created_at ? n.created_at.split('T')[0] : null;
    return d && d >= sixBeforeStr && d < threeBeforeStr;
  }).length;

  let velocity: 'increasing' | 'decreasing' | 'steady' = 'steady';
  if (dropsLast3 > dropsPrev3 * 1.5) velocity = 'increasing';
  else if (dropsLast3 < dropsPrev3 * 0.5) velocity = 'decreasing';

  return { velocity, dropsLast3, dropsPrev3 };
}

function snapshotComputeMoodSignal(journals: JournalEntry[]): {
  topMoods: Array<{ mood: string; count: number; pct: number }>;
  allTags: Record<string, number>;
  totalTags: number;
  journalCount: number;
} {
  const moodCounts: Record<string, number> = {};
  let totalMoodTags = 0;

  for (const j of journals) {
    if (j.mood && Array.isArray(j.mood)) {
      for (const m of j.mood) {
        moodCounts[m] = (moodCounts[m] || 0) + 1;
        totalMoodTags++;
      }
    }
  }

  const topMoods =
    totalMoodTags > 0
      ? Object.entries(moodCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([mood, count]) => ({ mood, count, pct: Math.round((count / totalMoodTags) * 100) }))
      : [];

  return {
    topMoods,
    allTags: moodCounts,
    totalTags: totalMoodTags,
    journalCount: journals.length,
  };
}

function snapshotComputeSpaceActivity(
  drops: Array<{ space_id?: string | null }>,
  todos: Array<{ space_id?: string | null; archived: boolean }>,
  spaceMap: Record<string, string>,
): Record<string, { name: string; recentDrops: number; recentTodos: number; totalRecent: number }> {
  const activity: Record<
    string,
    { name: string; recentDrops: number; recentTodos: number; totalRecent: number }
  > = {};

  for (const spaceId of Object.keys(spaceMap)) {
    const dropCount = drops.filter((n) => n.space_id === spaceId).length;
    const todoCount = todos.filter((t) => t.space_id === spaceId && !t.archived).length;
    activity[spaceId] = {
      name: spaceMap[spaceId],
      recentDrops: dropCount,
      recentTodos: todoCount,
      totalRecent: dropCount + todoCount,
    };
  }

  return activity;
}

/** Derive windowDays + targetDate from the BundleWindow (mirrors fetchUserSnapshot's date math). */
function deriveWindowParams(
  window: BundleWindow,
  rw: ResolvedWindow,
  journals: JournalEntry[],
  notes: NoteEntry[],
  todos: TodoEntry[],
): { windowDays: number; targetDate: string } {
  if (window.mode === 'trailing') {
    return { windowDays: window.windowDays, targetDate: rw.asOf };
  }
  if (window.mode === 'range') {
    const days = Math.max(
      1,
      Math.round(
        (new Date(window.windowEnd).getTime() - new Date(window.windowStart).getTime()) / 86400000,
      ),
    );
    return { windowDays: days, targetDate: window.windowEnd };
  }
  // all — compute span from actual data
  const allDates: string[] = [
    ...journals.map((j) => j.created_at.slice(0, 10)),
    ...notes.map((n) => n.created_at.slice(0, 10)),
    ...todos.map((t) => t.created_at.slice(0, 10)),
  ].filter(Boolean);
  if (allDates.length < 2) return { windowDays: 30, targetDate: rw.asOf };
  const sorted = [...allDates].sort();
  const days = Math.max(
    1,
    Math.round(
      (new Date(sorted[sorted.length - 1]).getTime() - new Date(sorted[0]).getTime()) / 86400000,
    ),
  );
  return { windowDays: days, targetDate: rw.asOf };
}

// ─── Entrypoint ───────────────────────────────────────────────────────────────

export async function buildUnifiedUserBundle(
  userId: string,
  env: Env,
  window: BundleWindow,
): Promise<UnifiedUserBundle> {
  const rw = resolveWindow(window);
  const { windowStart: ws, windowEnd: we } = rw;
  const collectedAt = new Date().toISOString();

  const [
    journals,
    notes,
    todos,
    habits,
    habitProgress,
    chatSummaries,
    entityChatSummaries,
    temporalAnchors,
    profileOverrides,
    ritualProgress,
    photoNotes,
    calendarEventsRaw,
    calendarSummary,
    spaces,
    milestones,
    currentLifeMap,
    dcoHistory,
    weeklySummaries,
    userProfile,
  ] = await Promise.all([
    fetchJournals(userId, env, ws, we),
    fetchNonJournalNotes(userId, env, ws, we),
    fetchTodos(userId, env, ws, we),
    fetchHabits(userId, env, ws, we),
    fetchHabitProgress(userId, env, ws, we),
    fetchChatSummaries(userId, env, ws, we),
    fetchEntityChatSummaries(userId, env, ws),
    fetchTemporalAnchors(userId, env),
    fetchProfileOverrides(userId, env, ws, we),
    fetchRitualProgress(userId, env, ws, we),
    fetchPhotoNotes(userId, env, ws, we),
    fetchCalendarEventsRaw(userId, env, rw),
    fetchCalendarSummary(userId, env, ws, we),
    fetchSpaces(userId, env),
    fetchMilestones(userId, env),
    fetchLifeMap(userId, env),
    fetchDcoHistory(userId, env),
    fetchWeeklySummaries(userId, env),
    fetchUserProfile(userId, env),
  ]);

  // --- Derive windowDays / targetDate (mirrors fetchUserSnapshot date math) ---
  const { windowDays, targetDate } = deriveWindowParams(window, rw, journals, notes, todos);

  // --- Build space lookup ---
  const spaceMap: Record<string, string> = {};
  for (const s of spaces) {
    if (s.id && s.name) spaceMap[s.id] = s.name;
  }

  // drops = non-archived journals + non-archived notes
  // Legacy fetchUserSnapshot queried notes with archived=eq.false at DB level; replicate
  // that filter here so dropVelocity and spaceActivity receive an equivalent input.
  const drops = [...journals, ...notes].filter((n) => !n.archived);

  // --- Computed metrics ---
  const calendarEvents = snapshotDeduplicateEvents(calendarEventsRaw);
  const todoStats = snapshotComputeTodoStats(todos, targetDate);
  // Legacy queried habits with archived=eq.false; replicate at call site (raw keeps full set).
  const habitHealth = snapshotComputeHabitHealth(
    habits.filter((h) => !h.archived),
    habitProgress,
    windowDays,
  );
  const dropVelocity = snapshotComputeDropVelocity(drops, targetDate);
  // Legacy derived journals from archived=eq.false drops; replicate at call site.
  const moodSignal = snapshotComputeMoodSignal(journals.filter((j) => !j.archived));
  const spaceActivity = snapshotComputeSpaceActivity(drops, todos, spaceMap);

  // --- Calendar projections ---
  function eventActiveOnDate(evt: CalendarEventRaw, date: string): boolean {
    const start = evt.target_date ?? '';
    const end = evt.end_date ?? start;
    return start <= date && end >= date;
  }

  const todaysEvents = calendarEvents
    .filter((e) => eventActiveOnDate(e, targetDate))
    .map((e) => ({
      title: e.title,
      time: e.event_time ?? null,
      location: e.location ?? null,
      is_all_day: e.is_all_day ?? null,
      space: spaceMap[e.space_id ?? ''] ?? null,
      space_id: e.space_id ?? null,
      is_synced: e.external_source != null,
    }));

  const target = new Date(targetDate + 'T00:00:00Z');
  const sevenAfter = new Date(target);
  sevenAfter.setUTCDate(sevenAfter.getUTCDate() + 7);
  const sevenAfterStr = formatDateOnly(sevenAfter);

  const upcomingEvents = calendarEvents
    .filter((e) => {
      const start = e.target_date ?? '';
      const end = e.end_date ?? start;
      return (
        (start > targetDate && start <= sevenAfterStr) ||
        (start <= targetDate && end > targetDate && end <= sevenAfterStr)
      );
    })
    .slice(0, 15)
    .map((e) => ({
      title: e.title,
      date: e.target_date ?? null,
      space: spaceMap[e.space_id ?? ''] ?? null,
      space_id: e.space_id ?? null,
      is_synced: e.external_source != null,
    }));

  const fiveBeforeStr = formatDateOnly(new Date(target.getTime() - 5 * 86400000));
  const fiveAfterStr = formatDateOnly(new Date(target.getTime() + 5 * 86400000));

  const spaceKeyDates = calendarEvents
    .filter((e) => {
      if (e.external_source != null || !e.space_id) return false;
      const end = e.end_date ?? e.target_date ?? '';
      return (e.target_date ?? '') <= fiveAfterStr && end >= fiveBeforeStr;
    })
    .map((e) => ({
      date: e.target_date ?? null,
      title: e.title,
      space: spaceMap[e.space_id ?? ''] ?? null,
      space_id: e.space_id ?? null,
    }));

  return {
    userId,
    collectedAt,
    window,
    raw: {
      journals,
      notes,
      todos,
      habits,
      habitProgress,
      chatSummaries,
      entityChatSummaries,
      temporalAnchors,
      profileOverrides,
      ritualProgress,
      photoNotes,
      calendarEventsRaw,
      calendarSummary,
      spaces,
      milestones,
    },
    referenceState: { currentLifeMap, dcoHistory, weeklySummaries, userProfile },
    computed: { todoStats, habitHealth, dropVelocity, moodSignal, spaceActivity, spaceMap },
    calendar: { todaysEvents, upcomingEvents, spaceKeyDates },
  };
}
