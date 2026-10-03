// ============================================================================
// get_day: one day of the person's life as Gremly knows it. The calendar (read
// as the brief reads it, workers/shared/calendar.js), the todos planned for
// it, the habits that fall on it and where each stands, and for today the
// travel and set times from the day record the brief and the planner use
// (inngest-jobs/brief/dayRecord.js). Counting and matching days is done here,
// so the model never adds up times or counts check-ins itself.
// ============================================================================

import { calendarSelects, meetingsFrom } from '../../../shared/calendar.js';
import { scheduleOf, scheduleLabel } from '../../../shared/changes/check.js';
import { buildDayRecord } from '../../../inngest-jobs/brief/dayRecord.js';
import { day, obj } from './schema.js';
import { clock, dayWords, mondayOf, trim, weekdayOf } from './words.js';

const DESCRIPTION = `Read one day of the person's life: timed calendar entries and all day ones, the todos planned for it with their ids, the habits that fall on it and where each stands, and for today also the todos past their day and the travel and set times Gremly knows about. Use it for questions about a day, before suggesting how to fit something in, and before proposing changes to a day. Today when no date is given.`;

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Whether a habit falls on a day, and where it stands. Pure, for tests. */
export function habitOnDay(h, date, logged) {
  if (h.start_date && String(h.start_date).slice(0, 10) > date) return null;
  if (h.end_date && String(h.end_date).slice(0, 10) < date) return null;
  const s = scheduleOf(h);
  const doneThatDay = logged.includes(date);
  if (s.days?.length) {
    if (!s.days.includes(weekdayOf(date))) return null;
    return { schedule: `on ${s.days.map((d) => DOW[d]).join(', ')}`, done: doneThatDay };
  }
  if (s.per === 'day') {
    const count = logged.filter((d) => d === date).length;
    return {
      schedule: scheduleLabel(s),
      done: s.times > 1 ? count >= s.times : doneThatDay,
    };
  }
  const start = s.per === 'week' ? mondayOf(date) : `${date.slice(0, 8)}01`;
  const sofar = logged.filter((d) => d >= start && d <= date).length;
  return {
    schedule: scheduleLabel(s),
    done: doneThatDay,
    progress: `${sofar} of ${s.times} this ${s.per}`,
    met: sofar >= s.times,
  };
}

export const getDay = {
  name: 'get_day',
  description: DESCRIPTION,
  parameters: obj({ date: day('the day to read; today when left out') }),

  async run(ctx, input = {}) {
    const date =
      typeof input.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.date)
        ? input.date
        : ctx.today;
    const isToday = date === ctx.today;
    const d = ctx.db;
    const u = ctx.userId;
    const monthStart = `${date.slice(0, 8)}01`;
    const since = mondayOf(date) < monthStart ? mondayOf(date) : monthStart;
    const [synced, noteEvents, quickEvents, todos, overdue, habits, progress, dcoRows, threads] =
      await Promise.all([
        ...calendarSelects(d, u, ctx.timezone, date),
        d.select(
          `todos?owner_id=eq.${u}&completed_at=is.null&archived=eq.false&due_day=eq.${date}&select=id,name,title,due_time,time_estimate_minutes&order=due_time.asc.nullslast&limit=50`,
        ),
        isToday
          ? d.select(
              `todos?owner_id=eq.${u}&completed_at=is.null&archived=eq.false&due_day=lt.${date}&select=id,name,title,due_day&order=due_day.desc&limit=15`,
            )
          : Promise.resolve([]),
        d.select(
          `habits?owner_id=eq.${u}&archived=eq.false&select=id,name,title,frequency,cadence,target_per_period,days_active,start_date,end_date&limit=200`,
        ),
        d.select(
          `habit_progress?owner_id=eq.${u}&occurred_day=gte.${since}&occurred_day=lte.${date}&select=habit_id,occurred_day&limit=3000`,
        ),
        isToday
          ? d
              .select(`user_daily_state?user_id=eq.${u}&date=eq.${date}&select=dco&limit=1`)
              .catch(() => [])
          : Promise.resolve([]),
        isToday
          ? d
              .select(
                `scope_chats?user_id=eq.${u}&chat_type=eq.daily&metadata_json->>ritual_day=eq.${date}&select=metadata_json&limit=1`,
              )
              .catch(() => [])
          : Promise.resolve([]),
      ]);
    const dco = dcoRows?.[0]?.dco || null;
    const { meetings, allDay } = meetingsFrom({
      synced,
      noteEvents,
      quickEvents,
      tz: ctx.timezone,
      cancelledIds: new Set(dco?.cancelled_calendar_ids || []),
    });
    const logsBy = new Map();
    for (const p of progress || []) {
      const logged = String(p.occurred_day).slice(0, 10);
      logsBy.set(p.habit_id, [...(logsBy.get(p.habit_id) || []), logged]);
    }
    const habitRows = [];
    for (const h of habits || []) {
      const on = habitOnDay(h, date, logsBy.get(h.id) || []);
      if (on) habitRows.push({ id: h.id, title: h.name || h.title || 'Untitled', ...on });
    }
    const record = isToday
      ? buildDayRecord({
          today: date,
          frame: dco?.day_frame || null,
          threadMeta: threads?.[0]?.metadata_json || null,
          meetings,
          anchors: Array.isArray(dco?.named_anchors) ? dco.named_anchors : [],
        })
      : null;
    return {
      date,
      isToday,
      meetings,
      allDay,
      todos: (todos || []).map((t) => ({ ...t, title: t.name || t.title || 'Untitled' })),
      overdue: (overdue || []).map((t) => ({ ...t, title: t.name || t.title || 'Untitled' })),
      habits: habitRows,
      record,
    };
  },

  render(r, ctx) {
    const lines = [dayWords(r.date, ctx.today)];
    lines.push(
      r.meetings.length
        ? `Calendar: ${r.meetings.map((m) => `${clock(m.start)} to ${clock(m.end)} ${trim(m.title, 60)}`).join('; ')}`
        : 'Calendar: nothing timed',
    );
    if (r.allDay.length)
      lines.push(`All day: ${r.allDay.map((a) => trim(a.title, 60)).join('; ')}`);
    if (r.record?.travel) {
      lines.push(
        `Travel: ${r.record.travel.label || 'travelling'}${r.record.travel.departs != null ? `, setting off at ${clock(r.record.travel.departs)}` : ''}`,
      );
    } else if (r.record?.away) {
      lines.push(
        `Away: ${r.record.away.label}${r.record.away.through ? ` until ${dayWords(r.record.away.through, ctx.today)}` : ''}`,
      );
    }
    if (r.record?.blocks?.length) {
      lines.push(
        `Set times: ${r.record.blocks.map((b) => `${clock(b.start)} ${trim(b.title, 50)}`).join('; ')}`,
      );
    }
    lines.push(
      r.todos.length
        ? `Todos for the day: ${r.todos
            .map(
              (t) =>
                `${trim(t.title, 60)} (id ${t.id})${t.due_time ? ` at ${clock(t.due_time)}` : ''}${t.time_estimate_minutes ? `, ${t.time_estimate_minutes} min` : ''}`,
            )
            .join('; ')}`
        : 'Todos for the day: none',
    );
    if (r.overdue.length) {
      lines.push(
        `Past their day: ${r.overdue.map((t) => `${trim(t.title, 60)} (id ${t.id}, was ${dayWords(t.due_day, ctx.today)})`).join('; ')}`,
      );
    }
    if (r.habits.length) {
      lines.push(
        `Habits: ${r.habits
          .map(
            (h) =>
              `${trim(h.title, 50)} (id ${h.id}) ${h.schedule}, ${h.done ? 'done that day' : 'not done that day'}${h.progress ? `, ${h.progress}${h.met ? ', already met' : ''}` : ''}`,
          )
          .join('; ')}`,
      );
    }
    return lines.join('\n');
  },
};
