// ============================================================================
// habitRead.js — Unified per-habit AI read for the weekly sweep (Phase 1)
//
// Replaces the per-habit floor-suggest fan-out with ONE batched call covering
// all eligible habits. Produces, per habit: a composed read_paragraph, an
// optional frequency_line, and an optional interactive disruption object.
//
// Anti-hallucination posture (per habit-read-implementation-plan.md):
//   - Input boundary: worker accepts only the typed fact-sheet payload below,
//     trims everything, drops ref-less signals.
//   - Output schema: ref echo-validation, window overlap, label-in-paragraph,
//     weekday allowlist, char caps, confidence gates. Drop-on-fail per habit;
//     publish-always overall.
//
// Provider: aiProvider tier 'sonnet' (claude-sonnet-4-6 primary, Gemini Flash
// fallback, circuit breaker). Mode 'background': no server-side abort timeout;
// large payloads can take 30-60s. Client abort fires after 90s.
//
// Wiring in cortex-index.js:
//   import { handleHabitRead } from './habitRead.js';
//   - add 'habit-read' to AUTH_REQUIRED_TYPES
//   - in the type router:  if (type === 'habit-read') {
//       return j(await handleHabitRead(body, env));
//     }
//
// Expected request body (client-assembled; see plan doc):
// {
//   type: 'habit-read',
//   todayISO: 'YYYY-MM-DD',
//   timezone: 'America/Los_Angeles',
//   planWindow: { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' },
//   factSheets: [{
//     habit_id, name, cadence: 'daily'|'weekly'|'monthly',
//     subtype: 'start_habit'|'break_habit', target_per_period,
//     week_hits, week_target, streak: { count, unit },
//     trend_weeks: [{ week_start, hits, target }],     // oldest first, <= 6
//     completion_days: ['YYYY-MM-DD', ...],            // last 56d
//     planned_dates: ['YYYY-MM-DD', ...],
//     best_day, best_day_all_time,                     // 'Fridays' | null
//     total_completions, tracking_since, floor_note,
//     freq_rec: { chips: [int], typical, current } | null,
//     adaptations: [{ mode: 'pause'|'floor', start, end }]
//   }],
//   events:     [{ ref, title, start, end, all_day }],   // synced calendar,
//                                                        // today-42d .. plan end
//   eventNotes: [{ ref, title, body, start, end }]       // user event notes,
//                                                        // same range (primary)
// }
//
// Response: { ok: true, reads: { [habit_id]: HabitRead }, meta: {...} }
// HabitRead: { read_paragraph, frequency_line, disruption, confidence }
// disruption: { ref, label, start, end, ideas: [string], offer_pause } | null
// ============================================================================

import { aiGenerate, getProviders } from './aiProvider.js';

// ── Caps (input boundary) ───────────────────────────────────────────────────
const MAX_HABITS = 12;
const MAX_EVENTS = 40;
const MAX_NOTES = 40;
const MAX_COMPLETION_DAYS = 80;
const MAX_TITLE = 120;
const MAX_NOTE_BODY = 280;

// ── Caps (output schema) ────────────────────────────────────────────────────
const MAX_PARAGRAPH = 280;
const MAX_FREQ_LINE = 90;
const MAX_LABEL = 40;
const MAX_IDEA = 90;
const MAX_IDEAS = 3;
const CONF_DISRUPTION = 0.55;
const CONF_PARAGRAPH = 0.35;

const WEEKDAY_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

// ─────────────────────────────────────────────────────────────────────────────
// System prompt. Semantic rules only, no examples (standing project rule).
// ─────────────────────────────────────────────────────────────────────────────

const HABIT_READ_SYSTEM = `You are Gremly, a calm companion who reads a person's habit data and writes one short read per habit for their weekly review. You receive fact sheets for several habits plus two sources of signal about their days: event-notes the user captured themselves, and synced calendar entries. Each event and note carries a ref id.

Time vocabulary, follow it exactly. week_hits and week_target describe the current week, a rolling seven day window ending today, and they are the only source of truth about the current week. trend_weeks lists prior completed weeks only and says nothing about the current week. Never describe the current week using trend_weeks. Never declare the current week failed, finished, or a streak broken while it is still in progress; a week below target with days remaining is simply open.

Break habits, subtype break_habit, are habits the user is quitting or avoiding. For these, every completion is a day the user stayed CLEAR of the thing: week_hits is clear days this week, total_completions is total clear days, streaks are clear streaks. Read these as wins and never, under any circumstances, describe completions as doing the unwanted thing.

For every habit, compose read_paragraph: a single flowing paragraph, never a list of stitched observations. Lead with one true judgment about what the data means, not a recital of it; use numbers only where they serve that judgment. Warm plain voice, second person, present tense, and vary how paragraphs open across habits. Keep it clearly under 280 characters, shorter when a disruption is present so the setup lands before the options. Never shame the user, never stack multiple negative observations in one paragraph, never speculate about the user's motives, priorities, or reasons beyond what an overlapping event plainly shows, never moralize, at most one exclamation mark, and never use em or en dashes anywhere in any field. Speak in the user's plain language, never in system terms: say paused or doing a lighter version, never words like adaptation, fact sheet, or trend. Do not restate the habit's full title inside the paragraph; the card already shows it.

Ground every claim in the fact sheet. Numbers and streaks must match the data exactly. Name a weekday only when the fact sheet's completion days, planned dates, the habit's own name, or the disruption window contain it, and the only weekday you may call the user's best or strongest is the one given as best_day or best_day_all_time; when those two differ, prefer best_day, the recent one, and make clear it is recent. You may connect a below-target completed week to an event or note whose dates overlap that week, and only then; when the overlap is not plain, say nothing about causes. Stating a pattern the data shows is your job; inventing a reason for it is forbidden.

Disruption judgment. Treat the user's own event-notes as the primary, most trustworthy signal. A calendar is secondary and noisy: routine meetings and the ordinary working week are never events worth mentioning, however dense, and for the routine calendar silence is the correct answer. When a note and a calendar entry plainly concern the same plan, treat them as one situation and prefer the note's framing and dates. A disruption is a real event that changes where, how, or whether this habit can happen during its dates. Weigh what the habit physically requires against what the event's setting and dates allow, habit by habit: the same trip can disrupt one habit, reshape another, and leave a third untouched. When the user has planned dates for this habit that fall inside the event, that collision alone deserves a disruption. Return a disruption when the event displaces the habit or changes its setting enough that a chosen smaller or adapted version would genuinely help; ideas may adapt the habit to the event's setting as the user described it, including pointing the user toward finding what they need there, but never invent specific named places, venues, or routes. When the event overlaps the week but this habit can work around it, do not return a disruption; instead let the paragraph name the event and say plainly how the week works around it, including which days remain open when that helps. Stay silent about an event only for habits it does not touch. Never invent events, trips, dates, or locations.

When an adaptation in the fact sheet already covers a stretch you would otherwise flag, do not return a disruption for it; the user has already decided. Let the paragraph briefly acknowledge the existing pause or floor, naming the event or note whose dates match it when one exists, and how the week works around it.

When you return a disruption: ref must be the id of the event or note it came from, label is a short name for it taken from that source, start and end are its dates, and the read_paragraph must mention the label verbatim and end by setting up the choice the options present. Provide two or three ideas, each a single short clause of roughly six to ten words, the smallest version of the habit that still genuinely counts during the disruption, specific to this habit and this situation. If the habit has a saved floor note you may build on it. Set offer_pause true when stepping away entirely is a reasonable choice for this habit and stretch. For break habits, ideas must be protective tactics that help the user stay clear, never smaller doses, and offer_pause is always false.

frequency_line: write it only when the fact sheet includes freq_rec, and it must be one plain sentence about the relationship between the typical number and the current target given there. Never propose a number that is not in the provided chips, and never restate this relationship inside read_paragraph when frequency_line exists. When freq_rec is absent, frequency_line is null; the paragraph may still note momentum but must not suggest changing the target.

Return ONLY JSON, an object keyed by habit_id, each value:
{
  "read_paragraph": string | null,
  "frequency_line": string | null,
  "disruption": { "ref": string, "label": string, "start": "YYYY-MM-DD", "end": "YYYY-MM-DD", "ideas": [string], "offer_pause": boolean } | null,
  "confidence": number
}`;

// ─────────────────────────────────────────────────────────────────────────────
// Input boundary
// ─────────────────────────────────────────────────────────────────────────────

function trimStr(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function isIsoDay(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/** Word-boundary trim, mirrors floor-suggest backstop. */
function softCap(s, max) {
  const t = s.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return sp > 0 ? cut.slice(0, sp) : cut;
}

function sanitizeFactSheet(raw) {
  if (!raw || typeof raw !== 'object' || !raw.habit_id || !raw.name) return null;
  const trendWeeks = Array.isArray(raw.trend_weeks)
    ? raw.trend_weeks
        .filter((w) => w && isIsoDay(w.week_start))
        .slice(-6)
        .map((w) => ({
          week_start: w.week_start,
          hits: Number(w.hits) || 0,
          target: Math.max(1, Number(w.target) || 1),
        }))
    : [];
  const freqRec =
    raw.freq_rec && Array.isArray(raw.freq_rec.chips) && raw.freq_rec.chips.length > 0
      ? {
          chips: raw.freq_rec.chips.map((n) => Number(n)).filter(Number.isFinite),
          typical: Number(raw.freq_rec.typical) || 0,
          current: Number(raw.freq_rec.current) || 0,
        }
      : null;
  return {
    habit_id: String(raw.habit_id),
    name: trimStr(raw.name, MAX_TITLE),
    cadence: ['daily', 'weekly', 'monthly'].includes(raw.cadence) ? raw.cadence : 'daily',
    subtype: raw.subtype === 'break_habit' ? 'break_habit' : 'start_habit',
    target_per_period: Math.max(1, Number(raw.target_per_period) || 1),
    week_hits: Number(raw.week_hits) || 0,
    week_target: Math.max(1, Number(raw.week_target) || 1),
    streak: {
      count: Number(raw.streak?.count) || 0,
      unit: raw.streak?.unit === 'week' ? 'week' : 'day',
    },
    trend_weeks: trendWeeks,
    completion_days: (Array.isArray(raw.completion_days) ? raw.completion_days : [])
      .filter(isIsoDay)
      .slice(-MAX_COMPLETION_DAYS),
    planned_dates: (Array.isArray(raw.planned_dates) ? raw.planned_dates : []).filter(isIsoDay),
    best_day: typeof raw.best_day === 'string' ? trimStr(raw.best_day, 12) : null,
    best_day_all_time:
      typeof raw.best_day_all_time === 'string' ? trimStr(raw.best_day_all_time, 12) : null,
    total_completions: Number(raw.total_completions) || 0,
    tracking_since: isIsoDay(raw.tracking_since) ? raw.tracking_since : null,
    floor_note: raw.floor_note ? trimStr(raw.floor_note, 200) : null,
    freq_rec: freqRec,
    adaptations: (Array.isArray(raw.adaptations) ? raw.adaptations : [])
      .filter(
        (a) =>
          a && (a.mode === 'pause' || a.mode === 'floor') && isIsoDay(a.start) && isIsoDay(a.end),
      )
      .map((a) => ({ mode: a.mode, start: a.start, end: a.end })),
  };
}

/**
 * Priority downselect when the event list exceeds MAX_EVENTS. Classes map to
 * what events are FOR: (1) plan-window events are never cut (disruption
 * detection input), (2) past all-day or multi-day events (the travel-shaped
 * signal retro correlation needs), (3) past single-block timed events, newest
 * first (the ordinary-working-week class the prompt fences as noise anyway).
 * Enforced here so the boundary never depends on client-side ordering.
 */
function downselectEvents(events, planWindow) {
  if (events.length <= MAX_EVENTS) return { kept: events, cut: 0 };
  const inWindow = events.filter((e) => e.end >= planWindow.start && e.start <= planWindow.end);
  const past = events.filter((e) => e.end < planWindow.start);
  const travelShaped = past.filter((e) => e.all_day || e.end > e.start);
  const timed = past
    .filter((e) => !e.all_day && e.end === e.start)
    .sort((a, b) => b.start.localeCompare(a.start));
  const seen = new Set();
  const kept = [];
  for (const e of [...inWindow, ...travelShaped, ...timed]) {
    if (seen.has(e.ref) || kept.length >= MAX_EVENTS) continue;
    seen.add(e.ref);
    kept.push(e);
  }
  return { kept, cut: events.length - kept.length };
}

function sanitizeSignals(events, eventNotes) {
  const cleanEvents = (Array.isArray(events) ? events : [])
    .filter((e) => e && e.ref && e.title && isIsoDay(String(e.start).slice(0, 10)))
    .slice(0, 300)
    .map((e) => ({
      ref: String(e.ref).slice(0, 80),
      title: trimStr(e.title, MAX_TITLE),
      start: String(e.start).slice(0, 10),
      end: isIsoDay(String(e.end).slice(0, 10))
        ? String(e.end).slice(0, 10)
        : String(e.start).slice(0, 10),
      all_day: e.all_day === true,
    }));
  const cleanNotes = (Array.isArray(eventNotes) ? eventNotes : [])
    .filter((n) => n && n.ref && n.title && isIsoDay(String(n.start).slice(0, 10)))
    .slice(0, MAX_NOTES)
    .map((n) => ({
      ref: String(n.ref).slice(0, 80),
      title: trimStr(n.title, MAX_TITLE),
      body: n.body ? trimStr(n.body, MAX_NOTE_BODY) : null,
      start: String(n.start).slice(0, 10),
      end: isIsoDay(String(n.end).slice(0, 10))
        ? String(n.end).slice(0, 10)
        : String(n.start).slice(0, 10),
    }));
  return { cleanEvents, cleanNotes };
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation helpers
// ─────────────────────────────────────────────────────────────────────────────

function weekdayOfIso(iso) {
  // Noon-anchor to dodge timezone edge cases, same trick as DateService.
  const d = new Date(`${iso}T12:00:00Z`);
  return d.getUTCDay();
}

function addDaysIso(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Weekdays covered by a date window (capped at one full week). */
function weekdaysOfWindow(start, end) {
  const out = [];
  let cur = start;
  for (let i = 0; i < 7 && cur <= end; i++) {
    out.push(weekdayOfIso(cur));
    cur = addDaysIso(cur, 1);
  }
  return out;
}

/** Monday of the ISO week containing iso. */
function isoMondayOf(iso) {
  const day = weekdayOfIso(iso);
  return addDaysIso(iso, day === 0 ? -6 : 1 - day);
}

/**
 * Sentence-boundary cap for the read paragraph. Returns the paragraph trimmed
 * at the last full sentence inside the cap, or null when no clean sentence
 * fits (publishing a mid-sentence fragment is worse than publishing nothing).
 */
function sentenceCap(s, max) {
  const t = s.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastEnd = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('!'), cut.lastIndexOf('?'));
  return lastEnd >= 80 ? cut.slice(0, lastEnd + 1) : null;
}

/**
 * Weekdays the paragraph is allowed to name for this habit.
 * Includes today's weekday (a note covering today licenses it) and every
 * weekday covered by the user's event-notes window.
 */
function allowedWeekdays(sheet, disruption, todayISO, noteWeekdays) {
  const allowed = new Set();
  for (const day of sheet.completion_days) allowed.add(weekdayOfIso(day));
  for (const day of sheet.planned_dates) allowed.add(weekdayOfIso(day));
  // A habit whose own name states a weekday licenses that weekday
  // ("Call Mum Weekly on Saturdays" may say Saturdays).
  const nameLower = sheet.name.toLowerCase();
  for (let i = 0; i < 7; i++) {
    if (nameLower.includes(WEEKDAY_NAMES[i])) allowed.add(i);
  }
  if (sheet.best_day_all_time) {
    const i = WEEKDAY_NAMES.indexOf(sheet.best_day_all_time.toLowerCase().replace(/s$/, ''));
    if (i >= 0) allowed.add(i);
  }
  if (disruption) {
    let cur = disruption.start;
    let guard = 0;
    while (cur <= disruption.end && guard < 32) {
      allowed.add(weekdayOfIso(cur));
      const d = new Date(`${cur}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 1);
      cur = d.toISOString().slice(0, 10);
      guard++;
    }
  }
  for (const d of noteWeekdays) allowed.add(d);
  allowed.add(weekdayOfIso(todayISO));
  return allowed;
}

function paragraphWeekdaysOk(paragraph, allowed) {
  const lower = paragraph.toLowerCase();
  for (let i = 0; i < 7; i++) {
    if (lower.includes(WEEKDAY_NAMES[i]) && !allowed.has(i)) return false;
  }
  return true;
}

function stripDashes(s) {
  // Standing rule: no em or en dashes in authored text. Replace with comma.
  return s.replace(/\s*[\u2013\u2014]\s*/g, ', ');
}

/**
 * Validate and clean one habit's read. Returns a clean HabitRead or null.
 * flags collects drop reasons for observability (review_flags pattern).
 */
function validateOne(parsed, sheet, refSet, planWindow, todayISO, noteWeekdays, flags) {
  if (!parsed || typeof parsed !== 'object') return null;

  const confidence =
    typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0;

  // ── Disruption ──
  let disruption = null;
  const d = parsed.disruption;
  if (d && typeof d === 'object') {
    const ref = typeof d.ref === 'string' ? d.ref : '';
    const label = stripDashes(trimStr(d.label, MAX_LABEL));
    const okRef = refSet.has(ref);
    const okDates = isIsoDay(d.start) && isIsoDay(d.end) && d.start <= d.end;
    const okOverlap = okDates && d.start <= planWindow.end && d.end >= planWindow.start;
    const okConf = confidence >= CONF_DISRUPTION;
    // A disruption fully covered by an existing adaptation is already decided;
    // the paragraph may acknowledge it but no options are offered (spec 2D).
    const alreadyAdapted =
      okDates && sheet.adaptations.some((a) => a.start <= d.start && a.end >= d.end);
    const ideas = (Array.isArray(d.ideas) ? d.ideas : [])
      .map((s) => (typeof s === 'string' ? stripDashes(softCap(s, MAX_IDEA)) : ''))
      .filter((s) => s.length > 0)
      .slice(0, MAX_IDEAS);
    if (alreadyAdapted) {
      flags.push({ habit_id: sheet.habit_id, drop: 'disruption', reason: 'already_adapted' });
    } else if (okRef && okDates && okOverlap && okConf && label && ideas.length > 0) {
      disruption = {
        ref,
        label,
        start: d.start,
        end: d.end,
        ideas,
        offer_pause: sheet.subtype === 'break_habit' ? false : d.offer_pause === true,
      };
    } else {
      flags.push({
        habit_id: sheet.habit_id,
        drop: 'disruption',
        reason: !okRef ? 'ref' : !okOverlap ? 'window' : !okConf ? 'confidence' : 'shape',
      });
    }
  }

  // ── Paragraph ──
  let paragraph = null;
  if (typeof parsed.read_paragraph === 'string') {
    const capped = sentenceCap(stripDashes(parsed.read_paragraph), MAX_PARAGRAPH);
    if (capped === null) {
      flags.push({ habit_id: sheet.habit_id, drop: 'paragraph', reason: 'overlength' });
    } else {
      paragraph = capped;
    }
  }
  if (paragraph) {
    if (confidence < CONF_PARAGRAPH) {
      flags.push({ habit_id: sheet.habit_id, drop: 'paragraph', reason: 'confidence' });
      paragraph = null;
    } else if (disruption && !paragraph.toLowerCase().includes(disruption.label.toLowerCase())) {
      // Paragraph and interactive layer must never drift apart.
      flags.push({ habit_id: sheet.habit_id, drop: 'both', reason: 'label_not_in_paragraph' });
      disruption = null;
      paragraph = null;
    } else if (
      !paragraphWeekdaysOk(paragraph, allowedWeekdays(sheet, disruption, todayISO, noteWeekdays))
    ) {
      flags.push({ habit_id: sheet.habit_id, drop: 'paragraph', reason: 'weekday' });
      // A disruption without its paragraph cannot render; drop both.
      paragraph = null;
      disruption = null;
    }
  } else if (disruption) {
    // Disruption requires a paragraph that sets it up.
    flags.push({ habit_id: sheet.habit_id, drop: 'disruption', reason: 'no_paragraph' });
    disruption = null;
  }

  // ── Frequency line ──
  let frequencyLine =
    typeof parsed.frequency_line === 'string'
      ? stripDashes(softCap(parsed.frequency_line, MAX_FREQ_LINE))
      : null;
  if (frequencyLine && !sheet.freq_rec) {
    flags.push({ habit_id: sheet.habit_id, drop: 'frequency_line', reason: 'gate' });
    frequencyLine = null;
  }

  if (!paragraph && !frequencyLine && !disruption) return null;
  return {
    read_paragraph: paragraph,
    frequency_line: frequencyLine,
    disruption,
    confidence,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function handleHabitRead(body, env, ownerId, ctx) {
  const EMPTY = { ok: true, reads: {} };
  const t0 = Date.now();
  try {
    const todayISO = isIsoDay(body.todayISO) ? body.todayISO : '';
    const planWindow =
      body.planWindow && isIsoDay(body.planWindow.start) && isIsoDay(body.planWindow.end)
        ? { start: body.planWindow.start, end: body.planWindow.end }
        : null;
    if (!todayISO || !planWindow) return { ...EMPTY, source: 'bad_input' };

    // Input boundary
    const curMon = isoMondayOf(todayISO);
    const sheets = (Array.isArray(body.factSheets) ? body.factSheets : [])
      .map(sanitizeFactSheet)
      .filter(Boolean)
      // trend_weeks must contain COMPLETED weeks only; the current week's sole
      // source of truth is week_hits/week_target. Strip the in-progress ISO
      // week even if a client sends it (input-boundary fix for the rolling vs
      // ISO week conflation found in corpus run 1).
      .map((s) => ({ ...s, trend_weeks: s.trend_weeks.filter((w) => w.week_start !== curMon) }))
      // Eligibility v3: enough recent rhythm (2+ completed weeks with data AND
      // 4+ completions in the 56d window) OR a long history (20+ lifetime),
      // so dormant long-running habits stay readable while one-completion
      // habits stay silent (spec 3C).
      .filter((s) => {
        const weeksWithData = s.trend_weeks.filter((w) => w.hits > 0).length;
        return (weeksWithData >= 2 && s.completion_days.length >= 4) || s.total_completions >= 20;
      })
      .slice(0, MAX_HABITS);
    if (sheets.length === 0) return { ...EMPTY, source: 'no_eligible_habits' };

    const { cleanEvents: allEvents, cleanNotes } = sanitizeSignals(body.events, body.eventNotes);
    const { kept: cleanEvents, cut: eventsCut } = downselectEvents(allEvents, planWindow);
    const refSet = new Set([...cleanEvents.map((e) => e.ref), ...cleanNotes.map((n) => n.ref)]);
    const noteWeekdays = new Set();
    for (const n of cleanNotes) {
      for (const d of weekdaysOfWindow(n.start, n.end)) noteWeekdays.add(d);
    }

    const userPayload =
      JSON.stringify({
        todayISO,
        timezone: trimStr(body.timezone, 64) || 'UTC',
        planWindow,
        factSheets: sheets,
        eventNotes: cleanNotes, // primary signal first
        events: cleanEvents,
      }) +
      // Append a hard enforcement note so the model does not generate preamble
      // reasoning text before the JSON. This saves thousands of tokens.
      '\n\nIMPORTANT: Your response MUST begin with { and end with }. No preamble, no explanation, no markdown. Pure JSON only.';

    const providers = getProviders('sonnet', env);
    const callCfg = {
      temperature: 0.4,
      // 600 tokens per habit + 400 base; capped at 8000 to prevent truncation.
      // Sonnet generates verbose JSON for disruption objects; 3500 was still
      // hitting max_tokens on 8-habit decks with multiple disruptions.
      maxOutputTokens: Math.min(8000, 400 + sheets.length * 600),
      responseFormat: 'json',
    };

    const result = await aiGenerate({
      endpoint: 'habit-read',
      mode: 'background',
      env,
      systemPrompt: HABIT_READ_SYSTEM,
      messages: [{ role: 'user', content: userPayload }],
      primary: { ...providers.primary, ...callCfg },
      fallback: { ...providers.fallback, ...callCfg },
      validate: (content) => {
        try {
          const o = JSON.parse(content);
          const valid = o && typeof o === 'object' && !Array.isArray(o);
          if (!valid) console.warn('[HabitRead] validate: parsed ok but not object', typeof o);
          return { valid };
        } catch (e) {
          console.warn('[HabitRead] validate: parse failed', {
            error: e.message,
            preview: content?.slice(0, 150),
            tail: content?.slice(-80),
            len: content?.length,
          });
          return { valid: false };
        }
      },
    });

    if (!result.ok) {
      console.warn('[HabitRead] generate failed', { error: result.error });
      return { ...EMPTY, source: 'api_error' };
    }

    let parsed;
    try {
      parsed = JSON.parse(result.content);
    } catch {
      console.warn('[HabitRead] parse failed', {
        content_preview: result.content?.slice(0, 200),
        content_tail: result.content?.slice(-100),
        content_len: result.content?.length,
        stop_reason: result.stop_reason,
      });
      return { ...EMPTY, source: 'parse_fallback' };
    }

    // Per-habit validation: drop-on-fail per habit, publish the rest.
    const reads = {};
    const flags = [];
    for (const sheet of sheets) {
      const clean = validateOne(
        parsed[sheet.habit_id],
        sheet,
        refSet,
        planWindow,
        todayISO,
        noteWeekdays,
        flags,
      );
      if (clean) reads[sheet.habit_id] = clean;
    }

    // ── Cache write (worker-side, fire-and-forget) ──────────────────────────
    // Persists results so a client abort never wastes the paid run.
    // owner_id is taken from the verified JWT (sub claim), never from the body.
    if (ownerId && env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
      const weekStart =
        typeof body.weekStart === 'string' && isIsoDay(body.weekStart) ? body.weekStart : null;
      const inputHashes =
        body.inputHashes && typeof body.inputHashes === 'object' && !Array.isArray(body.inputHashes)
          ? body.inputHashes
          : {};
      const upsertRows = sheets
        .map((sheet) => {
          const inputHash =
            typeof inputHashes[sheet.habit_id] === 'string' ? inputHashes[sheet.habit_id] : null;
          if (!weekStart || !inputHash) {
            console.warn('[HabitRead] skipping cache write — missing weekStart or inputHash', {
              habit_id: sheet.habit_id,
            });
            return null;
          }
          return {
            habit_id: sheet.habit_id,
            owner_id: ownerId,
            week_start: weekStart,
            input_hash: inputHash,
            payload: reads[sheet.habit_id] ?? { empty: true },
            model: result.model ?? null,
            dismissed: false,
            updated_at: new Date().toISOString(),
          };
        })
        .filter(Boolean);
      if (upsertRows.length > 0) {
        const upsertPromise = fetch(
          `${env.SUPABASE_URL}/rest/v1/habit_reads?on_conflict=habit_id,week_start`,
          {
            method: 'POST',
            headers: {
              apikey: env.SUPABASE_SERVICE_KEY,
              Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
              'Content-Type': 'application/json',
              Prefer: 'resolution=merge-duplicates',
            },
            body: JSON.stringify(upsertRows),
          },
        )
          .then(async (res) => {
            if (!res.ok) {
              const text = await res.text().catch(() => '');
              console.warn('[HabitRead] cache write failed:', res.status, text.slice(0, 200));
            }
          })
          .catch((err) => {
            console.warn('[HabitRead] cache write error:', err.message);
          });
        // Register with ctx.waitUntil so Cloudflare keeps the Worker alive until
        // the write completes. If ctx is not available (e.g. corpus harness), await
        // directly so the write still happens before returning.
        if (ctx?.waitUntil) {
          ctx.waitUntil(upsertPromise);
        } else {
          await upsertPromise;
        }
      }
    } else if (ownerId) {
      console.warn('[HabitRead] skipping cache write — missing SUPABASE env vars');
    }

    console.log('[HabitRead]', {
      habits_in: sheets.length,
      reads_out: Object.keys(reads).length,
      disruptions: Object.values(reads).filter((r) => r.disruption).length,
      flags: flags.length,
      events_cut: eventsCut,
      provider: result.provider,
      model: result.model,
      was_fallback: result.wasFallback === true,
      latency_ms: Date.now() - t0,
    });

    return {
      ok: true,
      reads,
      meta: { flags, events_cut: eventsCut, model: result.model, latency_ms: Date.now() - t0 },
    };
  } catch (err) {
    console.error('[HabitRead] handler error:', err.message);
    return { ...EMPTY, source: 'handler_error' };
  }
}
