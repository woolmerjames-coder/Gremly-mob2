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
// Provider: aiProvider tier 'mini' (gpt-4.1-mini primary, Gemini Flash
// fallback, circuit breaker). Mode 'realtime'.
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
const MAX_EVENTS = 80;
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

For every habit, compose read_paragraph: a single flowing paragraph, never a list of stitched observations. Open with the most meaningful true thing in that habit's recent data, in a warm plain voice, second person, present tense. The paragraph must read as one thought. Keep it under 280 characters. Never shame the user, never moralize, never use exclamation marks more than once, and never use em or en dashes anywhere in any field.

Ground every claim in the fact sheet. Numbers, counts, and streaks must match the data exactly. Name a weekday only when the fact sheet's completion days, planned dates, or the disruption window actually contain that weekday. You may connect a below-target week to an event or note whose dates overlap that week, and only then; when the overlap is not plain, say nothing about causes. Stating a pattern the data shows is your job; inventing a reason for it is forbidden.

Disruption judgment. Treat the user's own event-notes as the primary, most trustworthy signal. A calendar is secondary and noisy: routine meetings and the ordinary working week are never disruptions, however dense. When a note and a calendar entry plainly concern the same plan, treat them as one situation and prefer the note's framing and dates. A real disruption genuinely displaces the user's normal routine on days they would do this habit: being away from home, or an unusual commitment that crowds the habit out. Weigh what the habit physically requires against what the stretch will allow. Silence is the correct answer most weeks; return disruption null unless the conflict is clear and specific. Never invent events, trips, dates, or locations.

When you return a disruption: ref must be the id of the event or note it came from, label is a short name for it taken from that source, start and end are its dates, and the read_paragraph must mention the label verbatim and end by setting up the choice the options present. Provide two or three ideas, each a single short clause of roughly six to ten words, the smallest version of the habit that still genuinely counts during the disruption, specific to this habit and this situation. If the habit has a saved floor note you may build on it. Set offer_pause true when stepping away entirely is a reasonable choice for this habit and stretch.

Break habits, subtype break_habit, are habits the user is quitting or avoiding. For these, a disruption is a stretch of elevated temptation or risk. Ideas must be protective tactics that help the user stay clear, never smaller doses of the thing. offer_pause is always false for break habits.

frequency_line: write it only when the fact sheet includes freq_rec, and it must be one plain sentence about the relationship between the typical number and the current target given there. Never propose a number that is not in the provided chips. When freq_rec is absent, frequency_line is null; the paragraph may still note momentum but must not suggest changing the target.

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

function sanitizeSignals(events, eventNotes) {
  const cleanEvents = (Array.isArray(events) ? events : [])
    .filter((e) => e && e.ref && e.title && isIsoDay(String(e.start).slice(0, 10)))
    .slice(0, MAX_EVENTS)
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

/**
 * Weekdays the paragraph is allowed to name for this habit.
 * Deliberately excludes today's weekday: a paragraph about today says
 * "today"; allowing today's weekday name would let one in seven fabricated
 * weekday patterns through by coincidence.
 */
function allowedWeekdays(sheet, disruption, todayISO) {
  const allowed = new Set();
  for (const day of sheet.completion_days) allowed.add(weekdayOfIso(day));
  for (const day of sheet.planned_dates) allowed.add(weekdayOfIso(day));
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
function validateOne(parsed, sheet, refSet, planWindow, todayISO, flags) {
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
    const ideas = (Array.isArray(d.ideas) ? d.ideas : [])
      .map((s) => (typeof s === 'string' ? stripDashes(softCap(s, MAX_IDEA)) : ''))
      .filter((s) => s.length > 0)
      .slice(0, MAX_IDEAS);
    if (okRef && okDates && okOverlap && okConf && label && ideas.length > 0) {
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
  let paragraph =
    typeof parsed.read_paragraph === 'string'
      ? stripDashes(softCap(parsed.read_paragraph, MAX_PARAGRAPH))
      : null;
  if (paragraph) {
    if (confidence < CONF_PARAGRAPH) {
      flags.push({ habit_id: sheet.habit_id, drop: 'paragraph', reason: 'confidence' });
      paragraph = null;
    } else if (disruption && !paragraph.toLowerCase().includes(disruption.label.toLowerCase())) {
      // Paragraph and interactive layer must never drift apart.
      flags.push({ habit_id: sheet.habit_id, drop: 'both', reason: 'label_not_in_paragraph' });
      disruption = null;
      paragraph = null;
    } else if (!paragraphWeekdaysOk(paragraph, allowedWeekdays(sheet, disruption, todayISO))) {
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

export async function handleHabitRead(body, env) {
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
    const sheets = (Array.isArray(body.factSheets) ? body.factSheets : [])
      .map(sanitizeFactSheet)
      .filter(Boolean)
      // Eligibility: a habit without a rhythm cannot be read or disrupted (spec 3C).
      .filter((s) => s.trend_weeks.length >= 3 || s.completion_days.length >= 6)
      .slice(0, MAX_HABITS);
    if (sheets.length === 0) return { ...EMPTY, source: 'no_eligible_habits' };

    const { cleanEvents, cleanNotes } = sanitizeSignals(body.events, body.eventNotes);
    const refSet = new Set([...cleanEvents.map((e) => e.ref), ...cleanNotes.map((n) => n.ref)]);

    const userPayload = JSON.stringify({
      todayISO,
      timezone: trimStr(body.timezone, 64) || 'UTC',
      planWindow,
      factSheets: sheets,
      eventNotes: cleanNotes, // primary signal first
      events: cleanEvents,
    });

    const providers = getProviders('mini', env);
    const callCfg = {
      temperature: 0.4,
      maxOutputTokens: Math.min(2400, 240 + sheets.length * 220),
      responseFormat: 'json',
    };

    const result = await aiGenerate({
      endpoint: 'habit-read',
      mode: 'realtime',
      env,
      systemPrompt: HABIT_READ_SYSTEM,
      messages: [{ role: 'user', content: userPayload }],
      primary: { ...providers.primary, ...callCfg },
      fallback: { ...providers.fallback, ...callCfg },
      validate: (content) => {
        try {
          const o = JSON.parse(content);
          return { valid: o && typeof o === 'object' && !Array.isArray(o) };
        } catch {
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
      console.warn('[HabitRead] parse failed');
      return { ...EMPTY, source: 'parse_fallback' };
    }

    // Per-habit validation: drop-on-fail per habit, publish the rest.
    const reads = {};
    const flags = [];
    for (const sheet of sheets) {
      const clean = validateOne(parsed[sheet.habit_id], sheet, refSet, planWindow, todayISO, flags);
      if (clean) reads[sheet.habit_id] = clean;
    }

    console.log('[HabitRead]', {
      habits_in: sheets.length,
      reads_out: Object.keys(reads).length,
      disruptions: Object.values(reads).filter((r) => r.disruption).length,
      flags: flags.length,
      provider: result.provider,
      model: result.model,
      was_fallback: result.wasFallback === true,
      latency_ms: Date.now() - t0,
    });

    return { ok: true, reads, meta: { flags, model: result.model, latency_ms: Date.now() - t0 } };
  } catch (err) {
    console.error('[HabitRead] handler error:', err.message);
    return { ...EMPTY, source: 'handler_error' };
  }
}
