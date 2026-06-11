// ============================================================================
// run-corpus.mjs — Phase 2 corpus harness for the habit-read route
//
// Pulls real deck data for the corpus users from Supabase, assembles
// fact-sheet payloads per the habitRead.js contract (this assembly logic is
// the reference implementation for the Phase 3 client work), POSTs each
// payload to the deployed Cortex route, and writes:
//   - corpus-results.json   (raw payloads + responses, send this back)
//   - corpus-review.html    (human review sheet, open in a browser)
//
// Usage:
//   SUPABASE_URL=https://pvfnnpcfmgczlcglvlzl.supabase.co \
//   SUPABASE_SERVICE_KEY=eyJ... \
//   CORTEX_URL=https://<your-worker>/ \
//   CORTEX_TOKEN=<a valid session access token> \
//   node run-corpus.mjs
//
// Notes:
//   - CORTEX_TOKEN is any valid user session JWT (the route's auth gate
//     verifies the session; the handler itself is stateless).
//   - Read-only against Supabase. Nothing is written anywhere except the two
//     local output files.
// ============================================================================

import { writeFileSync } from 'node:fs';

// ── Corpus config ───────────────────────────────────────────────────────────
// Build corpus from live weekly-enabled users (expected: 11 shadow decks).
async function loadCorpusUsers() {
  const prefs = await sb('notification_preferences?weekly_enabled=eq.true&select=user_id,timezone');
  const seen = new Set();
  const rows = (prefs ?? []).filter((r) => {
    if (!r?.user_id || seen.has(r.user_id)) return false;
    seen.add(r.user_id);
    return true;
  });
  if (rows.length === 0) throw new Error('No weekly-enabled users found.');

  return rows.map((r, idx) => {
    const owner = r.user_id;
    const fallbackLabel = `User ${idx + 1}`;
    return {
      label: fallbackLabel,
      owner,
      tz: typeof r.timezone === 'string' && r.timezone.trim() ? r.timezone.trim() : 'UTC',
    };
  });
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const CORTEX_URL = process.env.CORTEX_URL;
const CORTEX_TOKEN = process.env.CORTEX_TOKEN;
const DAYPART_OVERRIDE =
  process.argv
    .find((arg) => arg.startsWith('--daypart='))
    ?.split('=')[1]
    ?.trim()
    .toLowerCase() ||
  process.env.HABIT_READ_DAYPART_OVERRIDE ||
  null;
const DAYPART =
  DAYPART_OVERRIDE && ['morning', 'afternoon', 'evening'].includes(DAYPART_OVERRIDE)
    ? DAYPART_OVERRIDE
    : null;
if (!SUPABASE_URL || !SERVICE_KEY || !CORTEX_URL || !CORTEX_TOKEN) {
  console.error('Missing env. Need SUPABASE_URL, SUPABASE_SERVICE_KEY, CORTEX_URL, CORTEX_TOKEN.');
  process.exit(1);
}

// ── Date helpers (pure YYYY-MM-DD, noon-anchored, matches DateService idiom) ─
function todayInTz(tz) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date()); // YYYY-MM-DD
}
function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function weekdayIdx(iso) {
  return new Date(`${iso}T12:00:00Z`).getUTCDay(); // 0=Sun
}
function isoWeekMonday(iso) {
  const day = weekdayIdx(iso);
  return addDays(iso, day === 0 ? -6 : 1 - day);
}
const WEEKDAY_FULL = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

// ── Supabase REST ───────────────────────────────────────────────────────────
async function sb(pathAndQuery) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status} on ${pathAndQuery.split('?')[0]}`);
  return res.json();
}

// ── Fact-sheet assembly (reference implementation for Phase 3 client work) ──

function median(values) {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 !== 0 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

function buildChips(current, typical, cadence) {
  const maxVal = cadence === 'weekly' ? 7 : 8;
  const lo = Math.max(1, Math.min(current, typical));
  const hi = Math.min(maxVal, Math.max(current, typical));
  const out = new Set();
  for (let n = lo; n <= hi; n++) out.add(n);
  out.add(Math.max(1, Math.min(maxVal, current)));
  out.add(Math.max(1, Math.min(maxVal, typical)));
  return [...out].sort((a, b) => a - b);
}

/** Mirrors computeFrequencyRecommendation gates. */
function computeFreqRec(habit, daysForHabit, today) {
  const cadence = habit.cadence ?? 'daily';
  const current = habit.target_per_period ?? 1;
  if (cadence === 'daily') return null;
  const currentKey = cadence === 'weekly' ? isoWeekMonday(today) : today.slice(0, 7);
  const buckets = new Map();
  for (const day of daysForHabit) {
    const key = cadence === 'weekly' ? isoWeekMonday(day) : day.slice(0, 7);
    if (key === currentKey) continue;
    if (!buckets.has(key)) buckets.set(key, new Set());
    buckets.get(key).add(day);
  }
  const keys = [...buckets.keys()].sort().slice(-8);
  const withData = keys.filter((k) => (buckets.get(k)?.size ?? 0) >= 1).length;
  if (withData < 4) return null;
  const typical = median(keys.map((k) => buckets.get(k)?.size ?? 0));
  if (Math.abs(typical - current) < 1) return null;
  return { chips: buildChips(current, typical, cadence), typical, current };
}

/** Streak APPROXIMATION (real app uses streakUtils with adaptations; close
 *  enough for corpus review; flagged in the review sheet). */
function approxStreak(habit, daysForHabit, today) {
  const set = new Set(daysForHabit);
  if ((habit.cadence ?? 'daily') === 'daily') {
    let count = 0;
    let cursor = set.has(today) ? today : addDays(today, -1);
    while (set.has(cursor)) {
      count++;
      cursor = addDays(cursor, -1);
    }
    return { count, unit: 'day' };
  }
  const target = habit.target_per_period ?? 1;
  const byWeek = new Map();
  for (const day of daysForHabit) {
    const k = isoWeekMonday(day);
    byWeek.set(k, (byWeek.get(k) ?? 0) + 1);
  }
  let count = 0;
  let wk = addDays(isoWeekMonday(today), -7); // last completed week
  while ((byWeek.get(wk) ?? 0) >= target) {
    count++;
    wk = addDays(wk, -7);
  }
  return { count, unit: 'week' };
}

function buildFactSheet(habit, progressDays, adaptations, plans, today) {
  const daysForHabit = [...new Set(progressDays)].sort();
  const pauses = adaptations.filter((a) => a.mode === 'pause');
  const isPaused = (d) => pauses.some((a) => a.period_start <= d && a.period_end >= d);

  // Rolling 7-day window
  const window = Array.from({ length: 7 }, (_, i) => addDays(today, -(6 - i)));
  const completedSet = new Set(daysForHabit);
  const weekHits = window.filter((d) => completedSet.has(d) && !isPaused(d)).length;
  const activeDays = window.filter((d) => !isPaused(d)).length;
  const cadence = habit.cadence ?? 'daily';
  const target = habit.target_per_period ?? 1;
  const weekTarget = cadence === 'daily' ? activeDays : target;

  // Trend: last 6 COMPLETED ISO weeks (current in-progress week excluded; the
  // current week's only source of truth is week_hits/week_target).
  const currentMon = isoWeekMonday(today);
  const weekKeys = Array.from({ length: 6 }, (_, i) => addDays(currentMon, -(6 - i) * 7));
  const hitsMap = new Map();
  for (const d of daysForHabit) {
    const k = isoWeekMonday(d);
    if (!hitsMap.has(k)) hitsMap.set(k, new Set());
    hitsMap.get(k).add(d);
  }
  const barTarget = cadence === 'daily' ? 7 : target;
  // Payload trend carries ALL completed weeks from first activity onward.
  // The 3-week minimum is a UI display rule (computeTrend) and must never
  // gate the fact sheet; reusing it here starved eligibility for young
  // habits (corpus v3 Tina bug). Phase 3 client note: same rule applies.
  let firstIdx = weekKeys.findIndex((k) => (hitsMap.get(k)?.size ?? 0) > 0);
  const span = firstIdx === -1 ? [] : weekKeys.slice(firstIdx);
  const trendWeeks = span.map((k) => ({ week_start: k, hits: hitsMap.get(k)?.size ?? 0, target: barTarget }));

  // Best day, 56d and all-time
  const cutoff56 = addDays(today, -56);
  const tally56 = new Array(7).fill(0);
  const tallyAll = new Array(7).fill(0);
  for (const d of daysForHabit) {
    tallyAll[weekdayIdx(d)]++;
    if (d >= cutoff56) tally56[weekdayIdx(d)]++;
  }
  const bestOf = (tally) => {
    const ranked = tally.map((count, idx) => ({ idx, count })).sort((a, b) => b.count - a.count);
    const top = ranked[0] ?? { idx: -1, count: 0 };
    const second = ranked[1] ?? { idx: -1, count: 0 };
    if (top.idx < 0 || top.count < 3 || top.count <= second.count) return null;
    return WEEKDAY_FULL[top.idx] ?? null;
  };

  return {
    habit_id: habit.id,
    name: habit.name,
    cadence,
    subtype: habit.subtype === 'break_habit' ? 'break_habit' : 'start_habit',
    target_per_period: target,
    week_hits: weekHits,
    week_target: weekTarget,
    streak: approxStreak(habit, daysForHabit, today),
    trend_weeks: trendWeeks,
    completion_days: daysForHabit.filter((d) => d >= cutoff56).slice(-80),
    planned_dates: plans.map((p) => p.planned_date).filter((d) => d >= today),
    best_day: bestOf(tally56),
    best_day_all_time: bestOf(tallyAll),
    total_completions: daysForHabit.length,
    tracking_since: habit.start_date ?? (habit.created_at ? habit.created_at.slice(0, 10) : null),
    floor_note: habit.floor_note ?? null,
    freq_rec: computeFreqRec(habit, daysForHabit, today),
    adaptations: adaptations
      .filter((a) => a.period_end >= today)
      .map((a) => ({ mode: a.mode, start: a.period_start, end: a.period_end })),
  };
}

// ── Signal assembly ─────────────────────────────────────────────────────────

function pickEvents(rows, today, planEnd) {
  const mapped = rows.map((e) => ({
    ref: `cal:${e.id}`,
    title: (e.title ?? '').slice(0, 120),
    start: e.start_at.slice(0, 10),
    end: (e.end_at ?? e.start_at).slice(0, 10),
    all_day: e.is_all_day === true,
  }));
  if (mapped.length <= 40) return mapped;
  // Downselect: keep everything in the plan window, then past multi-day or
  // all-day events (travel-shaped), then past timed events newest first.
  const inWindow = mapped.filter((e) => e.end >= today && e.start <= planEnd);
  const past = mapped.filter((e) => e.end < today);
  const travelShaped = past.filter((e) => e.all_day || e.end > e.start);
  const rest = past
    .filter((e) => !e.all_day && e.end === e.start)
    .sort((a, b) => b.start.localeCompare(a.start));
  return [...inWindow, ...travelShaped, ...rest].slice(0, 40);
}

// ── Main ────────────────────────────────────────────────────────────────────

const corpusUsers = await loadCorpusUsers();
console.log(`Loaded ${corpusUsers.length} weekly-enabled users for corpus run.`);
if (DAYPART) {
  console.log(`Using daypart override: ${DAYPART}`);
}

const results = [];
for (const person of corpusUsers) {
  const today = todayInTz(person.tz);
  const lookback = addDays(today, -42);
  const planEnd = addDays(today, 6);
  const signalEnd = addDays(today, 13);
  const o = person.owner;

  const [habits, progress, adaptations, plans, notes, calRows] = await Promise.all([
    sb(`habits?owner_id=eq.${o}&archived=eq.false&select=id,name,cadence,target_per_period,subtype,floor_note,start_date,created_at`),
    sb(`habit_progress?owner_id=eq.${o}&select=habit_id,occurred_day&order=occurred_day.asc&limit=5000`),
    sb(`habit_adaptations?owner_id=eq.${o}&period_end=gte.${lookback}&select=habit_id,mode,period_start,period_end`),
    sb(`habit_plans?owner_id=eq.${o}&planned_date=gte.${today}&select=habit_id,planned_date`),
    sb(`notes?owner_id=eq.${o}&subtype=eq.event&archived=eq.false&select=id,title,body,target_date,end_date&target_date=gte.${lookback}&target_date=lte.${signalEnd}`),
    sb(`synced_calendar_events?owner_id=eq.${o}&archived=eq.false&start_at=gte.${lookback}&start_at=lte.${signalEnd}T23:59:59Z&select=id,title,start_at,end_at,is_all_day&order=start_at.asc`),
  ]);

  const progByHabit = new Map();
  for (const p of progress) {
    if (!progByHabit.has(p.habit_id)) progByHabit.set(p.habit_id, []);
    progByHabit.get(p.habit_id).push(p.occurred_day);
  }
  const adaptByHabit = new Map();
  for (const a of adaptations) {
    if (!adaptByHabit.has(a.habit_id)) adaptByHabit.set(a.habit_id, []);
    adaptByHabit.get(a.habit_id).push(a);
  }
  const plansByHabit = new Map();
  for (const p of plans) {
    if (!plansByHabit.has(p.habit_id)) plansByHabit.set(p.habit_id, []);
    plansByHabit.get(p.habit_id).push(p);
  }

  const factSheets = habits.map((h) =>
    buildFactSheet(
      h,
      progByHabit.get(h.id) ?? [],
      adaptByHabit.get(h.id) ?? [],
      plansByHabit.get(h.id) ?? [],
      today,
    ),
  );

  const eventNotes = notes.map((n) => ({
    ref: `note:${n.id}`,
    title: (n.title ?? '').slice(0, 120),
    body: n.body ? n.body.slice(0, 280) : null,
    start: n.target_date,
    end: n.end_date ?? n.target_date,
  }));
  const events = pickEvents(calRows, today, planEnd);

  const payload = {
    type: 'habit-read',
    todayISO: today,
    timezone: person.tz,
    ...(DAYPART ? { daypartOverride: DAYPART } : {}),
    planWindow: { start: today, end: planEnd },
    factSheets,
    events,
    eventNotes,
  };

  console.log(`[${person.label}] ${factSheets.length} habits, ${events.length} events, ${eventNotes.length} notes -> POST`);
  const t0 = Date.now();
  let response;
  try {
    const res = await fetch(CORTEX_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${CORTEX_TOKEN}` },
      body: JSON.stringify(payload),
    });
    response = { http: res.status, body: await res.json() };
  } catch (err) {
    response = { http: 0, body: { error: err.message } };
  }
  console.log(`[${person.label}] HTTP ${response.http}, ${Date.now() - t0}ms, reads: ${Object.keys(response.body?.reads ?? {}).length}, flags: ${response.body?.meta?.flags?.length ?? 0}`);
  results.push({ person: person.label, payload, response });
}

writeFileSync('corpus-results.json', JSON.stringify(results, null, 2));

// ── Review sheet ────────────────────────────────────────────────────────────
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Habit Read Corpus Review</title>
<style>body{font-family:Georgia,serif;background:#F9F6F1;color:#222;max-width:860px;margin:0 auto;padding:40px 24px;}
h1{color:#1E3D2B;}h2{color:#2E5540;margin-top:44px;border-bottom:2px solid rgba(46,85,64,0.2);padding-bottom:6px;}
.habit{background:#fff;border-radius:14px;padding:18px 20px;margin-top:18px;box-shadow:0 1px 3px rgba(0,0,0,0.06);}
.hname{font-weight:700;font-size:17px;color:#1E3D2B;}
.facts{font-family:-apple-system,sans-serif;font-size:12px;color:rgba(34,34,34,0.6);margin-top:6px;line-height:1.6;}
.para{margin-top:12px;background:rgba(156,166,224,0.14);border-radius:10px;padding:12px 14px;font-size:15px;line-height:1.55;}
.freq{margin-top:8px;font-family:-apple-system,sans-serif;font-size:13px;color:#26442F;}
.disr{margin-top:8px;font-family:-apple-system,sans-serif;font-size:13px;background:rgba(224,196,122,0.18);border-radius:10px;padding:10px 12px;}
.none{margin-top:12px;font-family:-apple-system,sans-serif;font-size:13px;color:rgba(34,34,34,0.45);font-style:italic;}
.flag{color:#A0522D;font-family:-apple-system,sans-serif;font-size:12px;margin-top:8px;}
.meta{font-family:-apple-system,sans-serif;font-size:12px;color:rgba(34,34,34,0.5);margin-top:10px;}
.check{font-family:-apple-system,sans-serif;font-size:12.5px;background:#fff;border-radius:10px;padding:12px 16px;margin-top:14px;line-height:1.7;}
</style></head><body><h1>Habit Read Corpus Review</h1>
<div class="check"><b>Read every paragraph against:</b> 1. Fact fusion (details from two events merged). 2. Date promotion (approximate dates stated as exact). 3. Subject swap (another habit's or person's data). 4. Number accuracy vs the facts line. 5. Weekday claims vs the facts line. 6. Tone: warm, plain, shame-free, no dashes. Streaks below are approximations.</div>`;

for (const r of results) {
  html += `<h2>${esc(r.person)}</h2>`;
  const reads = r.response.body?.reads ?? {};
  const flags = r.response.body?.meta?.flags ?? [];
  if (r.response.http !== 200) html += `<p class="flag">HTTP ${r.response.http}: ${esc(JSON.stringify(r.response.body))}</p>`;
  for (const fs of r.payload.factSheets) {
    const read = reads[fs.habit_id];
    const habitFlags = flags.filter((f) => f.habit_id === fs.habit_id);
    html += `<div class="habit"><div class="hname">${esc(fs.name)}</div>
<div class="facts">${esc(fs.cadence)} · target ${fs.target_per_period} · this wk ${fs.week_hits}/${fs.week_target} · streak ~${fs.streak.count} ${esc(fs.streak.unit)} · trend [${fs.trend_weeks.map((w) => `${w.hits}/${w.target}`).join(' ')}] · best56 ${esc(fs.best_day ?? 'n/a')} / all ${esc(fs.best_day_all_time ?? 'n/a')} · total ${fs.total_completions} · since ${esc(fs.tracking_since ?? 'n/a')} · planned [${fs.planned_dates.join(', ')}] · freq_rec ${fs.freq_rec ? `typical ${fs.freq_rec.typical} vs ${fs.freq_rec.current}` : 'none'} · adapt [${fs.adaptations.map((a) => `${a.mode} ${a.start}..${a.end}`).join('; ')}]</div>`;
    if (read?.read_paragraph) html += `<div class="para">${esc(read.read_paragraph)}</div>`;
    if (read?.frequency_line) html += `<div class="freq">freq: ${esc(read.frequency_line)}</div>`;
    if (read?.disruption) {
      const d = read.disruption;
      html += `<div class="disr"><b>${esc(d.label)}</b> ${esc(d.start)} to ${esc(d.end)} (ref ${esc(d.ref)})<br>ideas: ${d.ideas.map(esc).join(' · ')}<br>offer_pause: ${d.offer_pause}</div>`;
    }
    if (!read) html += `<div class="none">no read returned (eligibility or validation)</div>`;
    for (const f of habitFlags) html += `<div class="flag">dropped ${esc(f.drop)}: ${esc(f.reason)}</div>`;
    html += `</div>`;
  }
  html += `<p class="meta">model: ${esc(r.response.body?.meta?.model ?? 'n/a')} · latency: ${r.response.body?.meta?.latency_ms ?? '?'}ms · source: ${esc(r.response.body?.source ?? 'ok')}</p>`;
}
html += `</body></html>`;
writeFileSync('corpus-review.html', html);
console.log('\nWrote corpus-results.json and corpus-review.html');
