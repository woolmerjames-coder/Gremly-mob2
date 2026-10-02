/**
 * The day record: one picture of the day for everything that talks about it.
 *
 * Built from the DCO's day frame (travel and set times from memory and the
 * calendar), set times added in today's thread (thread meta fixed_blocks),
 * today's meetings and the date anchors. The brief, the morning notification
 * and the planner read it here; the app builds the same record from the same
 * inputs (lib/brief/dayRecord.ts), so the chip, the plan's end and the flags
 * agree everywhere. Keep the two in step.
 *
 * - travel: what today's travel is called and when they set off
 * - blocks: set times the day is planned around (busy, like meetings)
 * - planEnd: nothing is planned after setting off (10pm otherwise)
 * - duringTravel: meetings that fall after they set off, to point out
 * - chip: the day card's flag. Travel today first, then a date that falls
 *   today or a trip under way, then the nearest date ahead.
 */

import { daysBetween, weekdayName } from '../context/db';

export const DEFAULT_PLAN_END = 22 * 60;
/** A set time with no end is busy for this long */
export const BLOCK_MINUTES = 30;

const isMin = (n) => Number.isFinite(n) && n >= 0 && n < 24 * 60;

/** Set times from the frame and from the thread, minus any the thread took away. */
export function blocksOf(frame, threadMeta) {
  const removed = new Set(Array.isArray(threadMeta?.fixed_removed) ? threadMeta.fixed_removed : []);
  const fromFrame = (Array.isArray(frame?.blocks) ? frame.blocks : []).map((b) => ({
    ...b,
    source: 'memory',
  }));
  const fromThread = (Array.isArray(threadMeta?.fixed_blocks) ? threadMeta.fixed_blocks : []).map(
    (b) => ({ ...b, source: 'chat' }),
  );
  const out = [];
  for (const b of [...fromThread, ...fromFrame]) {
    if (!b || !b.id || removed.has(b.id) || !isMin(b.start) || !b.title) continue;
    // a block said in the thread replaces one from memory at the same time
    if (out.some((x) => x.id === b.id || (x.start === b.start && x.travel === !!b.travel)))
      continue;
    out.push({
      id: b.id,
      title: String(b.title),
      start: b.start,
      end: isMin(b.end) && b.end > b.start ? b.end : null,
      travel: b.travel === true,
      source: b.source,
    });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** "Flying to San Diego today", "Anniversary in 5 days"; null when there is nothing to show. */
export function chipFor({ today, travel, away, anchors }) {
  if (travel?.label) return { text: `${travel.label} today`, kind: 'travel' };
  const list = (Array.isArray(anchors) ? anchors : []).filter(
    (a) => a && typeof a.date === 'string' && a.short_label && String(a.short_label).trim(),
  );
  const todays = list
    .filter((a) => a.date === today)
    .sort((x, y) => (x.short_label < y.short_label ? -1 : 1));
  if (todays.length) return { text: `${todays[0].short_label.trim()} today`, kind: 'date' };
  if (away?.label) {
    const until =
      away.through && away.through > today
        ? ` until ${weekdayName(away.through)}`
        : away.through === today
          ? ', last day'
          : '';
    return { text: `${away.label}${until}`, kind: 'away' };
  }
  const underWay = list.find((a) => a.date < today && a.date_end && a.date_end >= today);
  if (underWay) {
    const until =
      underWay.date_end === today ? ', last day' : ` until ${weekdayName(underWay.date_end)}`;
    return { text: `${underWay.short_label.trim()}${until}`, kind: 'away' };
  }
  const ahead = list.filter((a) => a.date > today).sort((x, y) => (x.date < y.date ? -1 : 1))[0];
  if (!ahead) return null;
  const days = daysBetween(today, ahead.date);
  return {
    text: `${ahead.short_label.trim()} ${days === 1 ? 'tomorrow' : `in ${days} days`}`,
    kind: 'date',
  };
}

/**
 * @param {object} p
 * @param {string} p.today
 * @param {object|null} p.frame the DCO's day_frame
 * @param {object|null} p.threadMeta today's thread metadata (fixed_blocks, fixed_removed)
 * @param {{id:string,title:string,start:number,end:number}[]} p.meetings
 * @param {object[]} p.anchors the DCO's named_anchors
 */
export function buildDayRecord({ today, frame, threadMeta = null, meetings = [], anchors = [] }) {
  const usable = frame && frame.date === today ? frame : null;
  const blocks = blocksOf(usable, threadMeta);
  const travelIds = new Set(usable?.travel_calendar_ids || []);
  const t = usable?.travel || null;
  const travelBlocks = blocks.filter((b) => b.travel);
  // a set-off time said in the thread wins over memory, then the frame's own,
  // then the first travel block or travel entry on the calendar
  const setsOff =
    travelBlocks.find((b) => b.source === 'chat')?.start ??
    (isMin(t?.departs) ? t.departs : null) ??
    travelBlocks[0]?.start ??
    meetings.filter((m) => travelIds.has(m.id)).sort((a, b) => a.start - b.start)[0]?.start ??
    null;
  const travelling =
    !!t?.label || travelBlocks.length > 0 || meetings.some((m) => travelIds.has(m.id));
  const travel = travelling ? { label: t?.label || null, departs: setsOff } : null;
  const planEnd = travelling && isMin(setsOff) ? setsOff : DEFAULT_PLAN_END;
  const duringTravel =
    planEnd < DEFAULT_PLAN_END
      ? meetings.filter((m) => m.start >= planEnd && !travelIds.has(m.id))
      : [];
  const away = !travel && usable?.away?.label ? usable.away : null;
  return {
    date: today,
    travel,
    away: away ? { label: away.label, through: away.through || null } : null,
    blocks,
    busy: [
      ...meetings.map((m) => ({ start: m.start, end: m.end })),
      ...blocks.map((b) => ({ start: b.start, end: b.end ?? b.start + BLOCK_MINUTES })),
    ].sort((a, b) => a.start - b.start),
    planEnd,
    duringTravel: duringTravel.map((m) => ({ id: m.id, title: m.title, start: m.start })),
    chip: chipFor({ today, travel, away, anchors }),
  };
}
