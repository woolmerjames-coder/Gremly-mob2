// ============================================================================
// get_item: one of the person's items in full. Every field Gremly can change,
// with its value now (from the change model's field list), the ids of its list
// items and reminders so a change can name them, its Worlds and Chapters, and
// what else it holds as the item chat reads it (itemDetail.js).
// ============================================================================

import { TYPES as FIELD_TYPES } from '../../../shared/changes/fields.js';
import { beforeValue, scheduleLabel } from '../../../shared/changes/check.js';
import { itemDetailText, toDetail } from '../../itemDetail.js';
import { loadItem, worldsAndChapters } from './items.js';
import { obj, str, strEnum } from './schema.js';
import { clock, dayWords, trim } from './words.js';

const DESCRIPTION = `Read one of the person's items in full: every field Gremly can change with its value now, its text, its list items and reminders with their ids, the Worlds and Chapters it belongs to, a habit's recent check-ins, and changes made to it before. Use it before proposing a change that depends on what the item says or holds, and to answer questions about one item.`;

function scheduleWords(s) {
  if (!s) return '';
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  if (s.days?.length) return `on ${s.days.map((d) => DAYS[d]).join(', ')}`;
  return scheduleLabel(s);
}

function valueWords(def, value, ctx, names) {
  if (value == null || value === '' || (Array.isArray(value) && !value.length)) return 'none';
  switch (def.kind) {
    case 'text':
      return `“${trim(value, 300)}”`;
    case 'day':
      return dayWords(value, ctx.today);
    case 'time':
      return clock(value);
    case 'minutes':
      return `${value} min`;
    case 'flag':
      return value ? 'yes' : 'no';
    case 'schedule':
      return `${scheduleWords(value)}${value.label && value.label !== scheduleLabel(value) ? ` (its label says ${value.label})` : ''}`;
    case 'tags':
      return value.join(', ');
    case 'links':
      return value.map((id) => `${names.get(id) || 'unknown'} (id ${id})`).join(', ');
    case 'list':
      return value
        .map((i) => `${i.checked ? '[x]' : '[ ]'} ${trim(i.text, 80)} (id ${i.id})`)
        .join('; ');
    case 'reminder':
      return value
        .map((r) => {
          const when =
            r.kind === 'before'
              ? r.evening
                ? 'the evening before'
                : `${r.minutes} min before`
              : `${r.frequency || 'once'}${r.date ? ` on ${dayWords(r.date, ctx.today)}` : ''}${r.time ? ` at ${clock(r.time)}` : ''}`;
          return `${when} (id ${r.id})`;
        })
        .join('; ');
    default:
      return String(value);
  }
}

export const getItem = {
  name: 'get_item',
  description: DESCRIPTION,
  parameters: obj(
    {
      type: strEnum(['todo', 'habit', 'note'], 'the kind of item'),
      id: str('its id, from find_items or the day'),
    },
    ['type', 'id'],
  ),

  async run(ctx, input = {}) {
    const loaded = await loadItem(ctx, input.type, input.id);
    if (!loaded) return { found: false };
    const lw = await worldsAndChapters(ctx);
    const detail = toDetail(loaded.row, input.type, {
      loggedDays: loaded.item.logged_days || [],
      timezone: ctx.timezone,
    });
    return {
      found: true,
      type: input.type,
      item: loaded.item,
      names: [...lw.worlds, ...lw.chapters],
      detailText: itemDetailText(detail, ctx.today),
    };
  },

  render(res, ctx) {
    if (!res.found) return 'No item of theirs has that kind and id. Look it up with find_items.';
    const { type, item } = res;
    const names = new Map(res.names.map((n) => [n.id, n.name]));
    const state = item.archived
      ? 'archived'
      : item.completed_at
        ? `done${item.completed_at ? ` ${dayWords(String(item.completed_at).slice(0, 10), ctx.today)}` : ''}`
        : 'open';
    const lines = [
      `${type} | id ${item.id} | ${state}${item.external_source ? ' | from their calendar, so Gremly can read it but not change it' : ''}`,
      'Fields (name: value now; * only when they ask for that field themselves):',
    ];
    for (const [field, def] of Object.entries(FIELD_TYPES[type].fields)) {
      const value = beforeValue(type, item, field);
      lines.push(
        `- ${field}${def.group === 'asked' ? '*' : ''}: ${valueWords(def, value, ctx, names)}`,
      );
    }
    if (res.detailText) lines.push(res.detailText);
    return lines.join('\n');
  },
};
