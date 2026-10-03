// ============================================================================
// items.js: one of the person's items read from the database in the shape the
// change model checks against (workers/shared/changes/check.js): the store's
// field names, with its Worlds, Chapters and, for a habit, the days it is
// logged on. Shared by get_item and propose_changes.
// ============================================================================

import { addDays } from './words.js';

const SELECT = {
  todo: {
    table: 'todos',
    select:
      'id,name,title,body,notes,due_day,due_time,target_date,time_estimate_minutes,reminders_json,time_window,tags,is_pinned,completed_at,archived,list_items,subtype,commitment,commitment_note,sweep_reschedule_count,created_at,views,chat_summary,space_id',
  },
  habit: {
    table: 'habits',
    select:
      'id,name,title,frequency,cadence,target_per_period,days_active,frequency_json,notes,start_date,end_date,time_estimate_minutes,reminders_json,time_window,tags,is_pinned,archived,subtype,replacement_text,floor_note,commitment_note,created_at,last_completed_at,views,chat_summary,space_id',
  },
  note: {
    table: 'notes',
    select:
      'id,title,body,subtype,target_date,event_time,end_date,end_time,reminder_date,list_items,reminders_json,tags,is_pinned,is_favorite,archived,external_source,mood,location,created_at,views,chat_summary,space_id',
  },
};

// how far back a habit's check-ins are read, for the checks on log and unlog
const LOG_DAYS = 60;

export const ITEM_TYPES = Object.keys(SELECT);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isId = (v) => typeof v === 'string' && UUID.test(v);

/**
 * The item as the change model reads it, or null when it is not one of the
 * person's items. Includes the raw row for words (row).
 */
export async function loadItem(ctx, type, id) {
  const t = SELECT[type];
  if (!t || !isId(id)) return null;
  const d = ctx.db;
  const [rows, worlds, chapters, logs] = await Promise.all([
    d.select(`${t.table}?id=eq.${id}&owner_id=eq.${ctx.userId}&select=${t.select}&limit=1`),
    d
      .select(`drop_world_links?drop_id=eq.${id}&owner_id=eq.${ctx.userId}&select=world_id`)
      .catch(() => []),
    d
      .select(`drop_chapter_links?drop_id=eq.${id}&owner_id=eq.${ctx.userId}&select=chapter_id`)
      .catch(() => []),
    type === 'habit'
      ? d
          .select(
            `habit_progress?owner_id=eq.${ctx.userId}&habit_id=eq.${id}&occurred_day=gte.${addDays(ctx.today, -LOG_DAYS)}&select=occurred_day&order=occurred_day.desc&limit=200`,
          )
          .catch(() => [])
      : Promise.resolve(null),
  ]);
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return null;
  const { reminders_json, frequency_json, ...rest } = row;
  const item = {
    ...rest,
    reminders: Array.isArray(reminders_json) ? reminders_json : [],
    frequency_value: frequency_json ?? null,
    world_ids: (worlds || []).map((w) => w.world_id),
    chapter_ids: (chapters || []).map((c) => c.chapter_id),
  };
  if (logs) item.logged_days = [...new Set(logs.map((l) => String(l.occurred_day).slice(0, 10)))];
  return { item, row };
}

/** The person's Worlds and open Chapters, read once per turn. */
export async function worldsAndChapters(ctx) {
  ctx.cache = ctx.cache || new Map();
  if (ctx.cache.has('worlds')) return ctx.cache.get('worlds');
  const d = ctx.db;
  const [worlds, chapters] = await Promise.all([
    d
      .select(`worlds?owner_id=eq.${ctx.userId}&select=id,name,display_name&limit=100`)
      .catch(() => []),
    d.select(`chapters?owner_id=eq.${ctx.userId}&select=id,title&limit=200`).catch(() => []),
  ]);
  const out = {
    worlds: (worlds || []).map((w) => ({ id: w.id, name: w.display_name || w.name || 'a World' })),
    chapters: (chapters || []).map((c) => ({ id: c.id, name: c.title || 'a Chapter' })),
  };
  ctx.cache.set('worlds', out);
  return out;
}
