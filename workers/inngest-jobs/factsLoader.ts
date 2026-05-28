/**
 * factsLoader (v0.7) — pre-computes everything the writer might otherwise infer.
 *
 * Beyond the v0.6 facts loader, this version adds:
 *
 *   - week.date_lookup: { '2026-05-20': 'Wednesday', ... } covering every date that appears
 *     anywhere in inputs (brief, observations, journal quotes, week range, mood arc).
 *   - day_of_week field on mood_arc cells, day_by_day rows, and journal_quotes.
 *   - entities block: user identity from user_profiles.identity, plus other people in the
 *     user's life with their relationship when known. Eliminates the "user named James,
 *     son named James" ambiguity by data rather than by prompt example.
 *   - durations block: explicit derived durations the writer would otherwise reach for
 *     (days_since_onboarding, consecutive_zero_fed_weeks, days_since_last_fed).
 *
 * Journal quote shape is also extended: each quote carries an id ('q_<date>_<index>') so
 * moment cards can cite it via SourceRef { type: 'journal_quote', id: ... }.
 *
 * Fed days continue to come from daily_ritual_progress.is_fed (not the broken
 * cortex_preferences.fed_days_count column).
 */

import type {
  HardFacts,
  MoodArcCell,
  DayActivity,
  WorldChip,
  JournalQuote,
  EvidenceFacts,
  EntitiesBlock,
  Valence,
} from './summaryTypes';
import { moodArrayValence } from './moodValence';

type FetchRows = (path: string) => Promise<unknown[]>;
type RunRpc = (fn: string, params: Record<string, unknown>) => Promise<unknown>;

export interface FactsLoaderInput {
  userId: string;
  canonicalWeekStart: string;
  canonicalWeekEnd: string;
  runRpc: RunRpc;
  fetchRows: FetchRows;
}

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

function weekdayOf(iso: string): string {
  // iso is 'yyyy-mm-dd'; treat as UTC noon to avoid TZ drift
  const d = new Date(iso + 'T12:00:00Z');
  return WEEKDAY_NAMES[d.getUTCDay()];
}

export async function loadFacts(input: FactsLoaderInput): Promise<HardFacts> {
  const { userId, canonicalWeekStart, canonicalWeekEnd, runRpc, fetchRows } = input;

  // ── Cortex preferences (tenure, level, tier) ──────────────────────────────
  const cpRows = (await fetchRows(
    `cortex_preferences?owner_id=eq.${userId}` +
      `&select=current_tier,gremly_age,trial_started_at,onboarding_completed_at`,
  )) as Array<{
    current_tier: string | null;
    gremly_age: number | null;
    trial_started_at: string | null;
    onboarding_completed_at: string | null;
  }>;
  const cp = cpRows[0] ?? {};
  const onboarding = cp.trial_started_at ?? cp.onboarding_completed_at ?? null;
  const trialStartedDate = onboarding ? new Date(onboarding) : null;
  const tenureDays = trialStartedDate
    ? Math.max(0, Math.floor((Date.now() - +trialStartedDate) / 86400000))
    : 999;
  const isFirstWeekly = tenureDays < 14;

  // ── User profile (name, pronouns, partner, relationships) ─────────────────
  const upRows = (await fetchRows(
    `user_profiles?user_id=eq.${userId}&select=identity,profile_text,timezone`,
  ).catch(() => [])) as Array<{
    identity: Record<string, unknown> | null;
    profile_text: string | null;
    timezone: string | null;
  }>;
  const up = upRows[0] ?? { identity: null, profile_text: null, timezone: null };
  const identity = (up.identity ?? {}) as Record<string, unknown>;
  const userName = ((identity['name'] as string) || null) as string | null;
  const userPronouns = ((identity['pronouns'] as string) || null) as string | null;
  const partnerRaw = identity['partner'];
  const partnerName =
    typeof partnerRaw === 'string'
      ? partnerRaw
      : partnerRaw && typeof partnerRaw === 'object' && 'name' in partnerRaw
        ? String((partnerRaw as { name: unknown }).name)
        : null;

  // ── Effective display range ───────────────────────────────────────────────
  const weekStartDate = new Date(canonicalWeekStart + 'T00:00:00Z');
  const weekEndDate = new Date(canonicalWeekEnd + 'T00:00:00Z');
  const displayStartDate =
    trialStartedDate && trialStartedDate > weekStartDate ? trialStartedDate : weekStartDate;
  const display_start = displayStartDate.toISOString().slice(0, 10);
  const display_end = canonicalWeekEnd;
  const days_in_display = Math.max(
    1,
    Math.min(7, Math.round((+weekEndDate - +displayStartDate) / 86400000) + 1),
  );

  // ── Fed days from daily_ritual_progress (source of truth) ─────────────────
  const fedRows = (await fetchRows(
    `daily_ritual_progress?owner_id=eq.${userId}` +
      `&ritual_day=gte.${display_start}&ritual_day=lte.${display_end}` +
      `&select=ritual_day,is_fed,feeding_gauge_value,drops_count,sweeps_count`,
  )) as Array<{
    ritual_day: string;
    is_fed: boolean;
    feeding_gauge_value: string | number;
    drops_count: number;
    sweeps_count: number;
  }>;
  const fedByDay = new Map<string, boolean>();
  const activityByDay = new Map<string, { drops: number; sweeps: number; is_fed: boolean }>();
  for (const r of fedRows) {
    fedByDay.set(r.ritual_day, !!r.is_fed);
    activityByDay.set(r.ritual_day, {
      drops: r.drops_count ?? 0,
      sweeps: r.sweeps_count ?? 0,
      is_fed: !!r.is_fed,
    });
  }
  const fed_days_in_window = [...fedByDay.values()].filter(Boolean).length;
  const graduated_this_window = fed_days_in_window >= 7;

  // ── Hero spine SQL ────────────────────────────────────────────────────────
  let h: {
    drops: number;
    done: number;
    habits_active: number;
    per_day_moods: { day: string; moods: string[] }[];
    worlds: { name: string; delta: string }[];
  };
  try {
    h = (await runRpc('summary_hero_spine', {
      p_owner: userId,
      p_week_start: canonicalWeekStart,
      p_week_end: canonicalWeekEnd,
    })) as typeof h;
  } catch {
    h = { drops: 0, done: 0, habits_active: 0, per_day_moods: [], worlds: [] };
  }

  // ── Mood arc + day-by-day with day_of_week pre-computed ───────────────────
  const moodsByDay = new Map<string, string[]>();
  for (const d of h.per_day_moods ?? []) moodsByDay.set(d.day, d.moods);
  const mood_arc: MoodArcCell[] = [];
  const day_by_day: DayActivity[] = [];
  const dayInitials = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  for (let i = 0; i < days_in_display; i++) {
    const d = new Date(+displayStartDate + i * 86400000);
    const iso = d.toISOString().slice(0, 10);
    const initial = dayInitials[d.getUTCDay()];
    const moods = moodsByDay.get(iso) ?? [];
    const dayName = WEEKDAY_NAMES[d.getUTCDay()];
    mood_arc.push({
      day_label: `${initial} ${d.getUTCDate()}`,
      date: iso,
      day_of_week: dayName,
      valence: moodArrayValence(moods),
      moods,
    });
    const act = activityByDay.get(iso) ?? { drops: 0, sweeps: 0, is_fed: false };
    day_by_day.push({
      date: iso,
      day_of_week: dayName,
      drops: act.drops,
      journals: 0,
      sweeps: act.sweeps,
      todos_created: 0,
      todos_completed: 0,
      is_fed: act.is_fed,
    });
  }

  // ── Worlds ────────────────────────────────────────────────────────────────
  const worlds: WorldChip[] = (h.worlds ?? []).map((w) => ({
    name: w.name,
    direction:
      w.delta === 'growing'
        ? 'up'
        : w.delta === 'declining' || w.delta === 'dormant'
          ? 'down'
          : 'flat',
    delta_text: w.delta || 'holding steady',
  }));

  // ── Journal quotes from analyst observations + notes, each with day_of_week + id ─
  const journal_quotes: JournalQuote[] = [];
  const seenTexts = new Set<string>();
  let quoteCounter = 0;
  const nextQuoteId = (date: string): string => `q_${date}_${++quoteCounter}`;

  const analystRows = (await fetchRows(
    `observations?user_id=eq.${userId}&stage=eq.analyst&observed_for_week=eq.${canonicalWeekStart}` +
      `&select=kind,evidence_snapshot`,
  )) as Array<{ kind: string; evidence_snapshot: Record<string, unknown> | null }>;
  for (const r of analystRows) {
    const ev = r.evidence_snapshot ?? {};
    const rawQ = ev['journal_quote'];
    const rawDate = (ev['date'] as string) || canonicalWeekStart;
    if (typeof rawQ === 'string' && rawQ.length > 8) {
      let text = rawQ.trim();
      const dateMatch = text.match(/\s*\((20\d{2}-\d{2}-\d{2})\)\s*$/);
      const extractedDate = dateMatch?.[1] ?? rawDate;
      if (dateMatch) text = text.slice(0, dateMatch.index).trim();
      text = text
        .replace(/^['"\u2018\u2019\u201c\u201d]+/, '')
        .replace(/['"\u2018\u2019\u201c\u201d]+$/, '')
        .trim();
      if (text && !seenTexts.has(text)) {
        seenTexts.add(text);
        journal_quotes.push({
          id: nextQuoteId(extractedDate),
          date: extractedDate,
          day_of_week: weekdayOf(extractedDate),
          text,
          source: 'journal',
        });
      }
    }
    const connected = ev['connected_items'];
    if (Array.isArray(connected)) {
      for (const item of connected) {
        if (typeof item !== 'string') continue;
        const m = item.match(
          /^(20\d{2}-\d{2}-\d{2})[^'"]*['"\u2018\u2019\u201c\u201d]([^'"\u2018\u2019\u201c\u201d]+)['"\u2018\u2019\u201c\u201d]/,
        );
        if (m) {
          const text = m[2].trim();
          if (text.length > 8 && !seenTexts.has(text)) {
            seenTexts.add(text);
            journal_quotes.push({
              id: nextQuoteId(m[1]),
              date: m[1],
              day_of_week: weekdayOf(m[1]),
              text,
              source: 'journal',
            });
          }
        }
      }
    }
  }

  const notesRows = (await fetchRows(
    `notes?owner_id=eq.${userId}` +
      `&or=(date.gte.${display_start},captured_at.gte.${display_start}T00:00:00Z)` +
      `&or=(date.lte.${display_end},captured_at.lte.${display_end}T23:59:59Z)` +
      `&archived=is.false` +
      `&select=body,date,captured_at,canonical_type,subtype,journal_subtype`,
  ).catch(() => [])) as Array<{
    body: string | null;
    date: string | null;
    captured_at: string | null;
    canonical_type: string | null;
    subtype: string | null;
    journal_subtype: string | null;
  }>;
  for (const n of notesRows) {
    const text = (n.body ?? '').trim();
    if (text.length < 20) continue;
    if (seenTexts.has(text)) continue;
    const date = n.date ?? (n.captured_at ? n.captured_at.slice(0, 10) : canonicalWeekStart);
    const isJournal =
      n.canonical_type === 'log' || n.journal_subtype !== null || n.subtype === 'journal';
    seenTexts.add(text);
    journal_quotes.push({
      id: nextQuoteId(date),
      date,
      day_of_week: weekdayOf(date),
      text,
      source: isJournal ? 'journal' : 'drop_note',
    });
  }

  // ── Entities block (user identity + other named people) ──────────────────
  const entities = buildEntitiesBlock(userName, partnerName, analystRows, up.profile_text ?? null);

  // ── Deterministic detector outputs as evidence-facts ──────────────────────
  const evidence = await loadEvidenceFacts(userId, canonicalWeekStart, canonicalWeekEnd, runRpc);

  // ── Durations (pre-computed so writer never has to derive them) ───────────
  const today = new Date();
  const daysSinceOnboarding = trialStartedDate
    ? Math.max(0, Math.floor((+today - +trialStartedDate) / 86400000))
    : 0;
  let daysSinceLastFed: number | null = null;
  const lastFedRows = (await fetchRows(
    `daily_ritual_progress?owner_id=eq.${userId}&is_fed=eq.true` +
      `&order=ritual_day.desc&limit=1&select=ritual_day`,
  ).catch(() => [])) as Array<{ ritual_day: string }>;
  if (lastFedRows.length > 0) {
    const lastFed = new Date(lastFedRows[0].ritual_day + 'T12:00:00Z');
    daysSinceLastFed = Math.floor((+today - +lastFed) / 86400000);
  }

  // ── Date lookup: every date in any input mapped to its weekday name ───────
  const date_lookup = buildDateLookup({
    canonicalWeekStart,
    canonicalWeekEnd,
    displayStart: display_start,
    displayEnd: display_end,
    mood_arc,
    day_by_day,
    journal_quotes,
    analystObservations: analystRows,
    onboarding,
  });

  return {
    user: {
      user_id: userId,
      tenure_days: tenureDays,
      is_first_weekly: isFirstWeekly,
      onboarding_at: onboarding,
      current_tier: cp.current_tier ?? 'Hatchling',
      gremly_level: cp.gremly_age ?? 1,
      name: userName,
      pronouns: userPronouns,
    },
    week: {
      canonical_start: canonicalWeekStart,
      canonical_end: canonicalWeekEnd,
      display_start,
      display_end,
      days_in_display,
      date_lookup,
    },
    fed: {
      days_in_window: fed_days_in_window,
      target: 7,
      graduated_this_window,
    },
    totals: {
      drops: h.drops ?? 0,
      journals: journal_quotes.length,
      todos_created: 0,
      todos_completed: h.done ?? 0,
    },
    durations: {
      days_since_onboarding: daysSinceOnboarding,
      consecutive_zero_fed_weeks: null,
      days_since_last_fed: daysSinceLastFed,
    },
    entities,
    mood_arc,
    day_by_day,
    worlds,
    journal_quotes,
    evidence,
  };
}

function buildEntitiesBlock(
  userName: string | null,
  partnerName: string | null,
  analystRows: Array<{ kind: string; evidence_snapshot: Record<string, unknown> | null }>,
  profileText: string | null,
): EntitiesBlock {
  const user_address_rule = userName
    ? `Address the user in second person only. The user's first name is ${userName}; never write that name as a way to address the user. If that name appears in observations or journal quotes referring to someone else, that is a different person and is named in the deck as that other person.`
    : `Address the user in second person only. Never use their name to address them.`;

  // Other people from observations: scan evidence_snapshot strings for proper-noun mentions
  // plus pull explicit name fields. Then attempt to attach a relationship hint from the
  // profile_text when a name appears near a relationship word (mother, son, partner, etc).
  const peopleSet = new Map<
    string,
    { name: string; relationship?: string; source: 'user_profile' | 'observations' }
  >();
  if (partnerName) {
    peopleSet.set(partnerName, {
      name: partnerName,
      relationship: 'partner',
      source: 'user_profile',
    });
  }

  const relWords = [
    'mum',
    'mom',
    'mother',
    'dad',
    'father',
    'partner',
    'husband',
    'wife',
    'son',
    'daughter',
    'brother',
    'sister',
    'parent',
    'parents',
    'colleague',
    'friend',
    'manager',
    'boss',
    'therapist',
    'doctor',
    'coach',
  ];
  const STOP = new Set([
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
    'Gremly',
    'Mum',
    'Mom',
    'Dad',
    'The',
    'A',
    'An',
    'I',
    'You',
    'Your',
    'We',
  ]);

  const captureNamesFromText = (text: string): void => {
    const matches = text.matchAll(/\b([A-Z][a-zA-Z]+)\b/g);
    for (const m of matches) {
      const name = m[1];
      if (STOP.has(name)) continue;
      if (name === userName) continue; // do not list the user as "other people"
      if (!peopleSet.has(name)) {
        peopleSet.set(name, { name, source: 'observations' });
      }
    }
  };

  for (const r of analystRows) {
    const ev = r.evidence_snapshot ?? {};
    const flatString = JSON.stringify(ev);
    captureNamesFromText(flatString);
  }

  // Try to attach relationships from profile_text by proximity. profile_text typically has
  // sentences like "Mum is supportive" or "James's son ..." We do a simple proximity scan.
  if (profileText) {
    for (const [name, entry] of peopleSet) {
      if (entry.relationship) continue;
      const re = new RegExp(`\\b${name}\\b`, 'g');
      for (const m of profileText.matchAll(re)) {
        const ctxStart = Math.max(0, (m.index ?? 0) - 60);
        const ctxEnd = Math.min(profileText.length, (m.index ?? 0) + name.length + 60);
        const ctx = profileText.slice(ctxStart, ctxEnd).toLowerCase();
        for (const w of relWords) {
          if (ctx.includes(w)) {
            entry.relationship = w;
            break;
          }
        }
        if (entry.relationship) break;
      }
    }
  }

  const other_people = [...peopleSet.values()].slice(0, 30);
  return {
    user_name: userName,
    user_address_rule,
    other_people,
  };
}

interface BuildLookupInput {
  canonicalWeekStart: string;
  canonicalWeekEnd: string;
  displayStart: string;
  displayEnd: string;
  mood_arc: MoodArcCell[];
  day_by_day: DayActivity[];
  journal_quotes: JournalQuote[];
  analystObservations: Array<{ evidence_snapshot: Record<string, unknown> | null }>;
  onboarding: string | null;
}

function buildDateLookup(input: BuildLookupInput): Record<string, string> {
  const lookup: Record<string, string> = {};
  const add = (iso: string): void => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
    if (lookup[iso]) return;
    lookup[iso] = weekdayOf(iso);
  };

  add(input.canonicalWeekStart);
  add(input.canonicalWeekEnd);
  add(input.displayStart);
  add(input.displayEnd);
  if (input.onboarding) add(input.onboarding.slice(0, 10));
  for (const c of input.mood_arc) add(c.date);
  for (const d of input.day_by_day) add(d.date);
  for (const q of input.journal_quotes) add(q.date);
  for (const o of input.analystObservations) {
    const flat = JSON.stringify(o.evidence_snapshot ?? {});
    for (const m of flat.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)) add(m[1]);
  }
  return lookup;
}

async function loadEvidenceFacts(
  userId: string,
  weekStart: string,
  weekEnd: string,
  runRpc: RunRpc,
): Promise<EvidenceFacts> {
  const safeCall = async <T>(fn: string, fallback: T): Promise<T> => {
    try {
      return (await runRpc(fn, {
        p_owner: userId,
        p_week_start: weekStart,
        p_week_end: weekEnd,
      })) as T;
    } catch {
      return fallback;
    }
  };

  const reschedule = await safeCall<{
    fill_input?: { items?: Array<{ title: string; count: number; age_days: number }> };
  }>('summary_detect_reschedule_as_soft_no', {});
  const cadence = await safeCall<{
    fill_input?: {
      items?: Array<{
        title: string;
        target_per_week: number;
        avg_per_week: number;
        weeks_observed: number;
        hit_rate_pct: number;
      }>;
    };
  }>('summary_detect_cadence_calibration_mismatch', {});
  const closures = await safeCall<{
    fill_input?: { chapter_title?: string; days_since_close?: number; reopens?: number };
  }>('summary_detect_decisive_closure', {});
  const alignment = await safeCall<{ fill_input?: { count?: number; worlds?: unknown[] } }>(
    'summary_detect_cross_domain_alignment',
    {},
  );

  const rescheduled_todos = (reschedule.fill_input?.items ?? []).slice(0, 8).map((i) => ({
    title: i.title,
    count: i.count,
    age_days: i.age_days,
  }));

  const habit_cadence_mismatches = (cadence.fill_input?.items ?? []).slice(0, 5).map((i) => ({
    title: i.title,
    target_per_week: i.target_per_week,
    actual_per_week: i.avg_per_week,
    weeks_observed: i.weeks_observed,
    hit_rate_pct: i.hit_rate_pct,
  }));

  const chapter_closures: EvidenceFacts['chapter_closures'] = [];
  if (closures.fill_input?.chapter_title) {
    chapter_closures.push({
      title: closures.fill_input.chapter_title,
      days_since_close: closures.fill_input.days_since_close ?? 0,
      reopens: closures.fill_input.reopens ?? 0,
    });
  }

  return {
    rescheduled_todos,
    habit_cadence_mismatches,
    chapter_closures,
    aligned_worlds_count: alignment.fill_input?.count ?? 0,
  };
}
