// ============================================================================
// propose_changes: put changes on a card for the person to accept.
//
// The change model (workers/shared/changes): every change is checked here
// against the item as it is now, the same checks the app runs again before
// the card is drawn, and anything that fails is dropped with the reason, so
// the model can fix it or say so. Nothing is changed: the app applies a card
// only when the person taps. The rows that pass are what the reply may say
// Gremly is offering; the agent runner keeps them for the card.
// ============================================================================

import { OPS, TYPES as FIELD_TYPES, GROUPS } from '../../../shared/changes/fields.js';
import { checkCard } from '../../../shared/changes/check.js';
import { loadItem, worldsAndChapters, isId } from './items.js';
import { arr, bool, day, int, obj, str, strEnum, time } from './schema.js';
import { clock, dayWords, trim } from './words.js';

// the agent proposes item changes; today's plan has its own tools on the brief
const AGENT_OPS = Object.keys(OPS).filter((op) => op !== 'plan');

/** The field list in words, for the tool's description, from fields.js. */
export function fieldListWords() {
  return Object.entries(FIELD_TYPES)
    .map(([type, spec]) => {
      const fields = Object.entries(spec.fields)
        .map(([name, def]) => `${name}${def.group === 'asked' ? '*' : ''} (${def.about})`)
        .join(', ');
      return `${type}: ${fields}. Operations: ${spec.ops.join(', ')}.`;
    })
    .join('\n');
}

const DESCRIPTION = `Put changes to the person's items on a card for them to accept with a tap. Nothing changes until they do. Each call puts a new card in place of the last one, so include every change you want on it. Each change is checked against the item as it is now; the result says which changes are on the card and why any were dropped, so you can fix one and propose it again, or tell the person. Only say Gremly is offering a change that is on the card.
Rules:
- Name an item by the id find_items, get_item or get_day gave you; never guess an id.
- Put everything for one item in one change.
- Fields marked * are ${GROUPS.asked}.
- Days are YYYY-MM-DD and times HH:MM on a 24 hour clock, worked out from today's date.
- To empty a field, name it in clear. To add to an item's text rather than replace it, use text_add.
- A habit is archived only when the person asks to stop it; to leave it out for today, use skip_today.
- To turn an item into another kind, use convert with to, and fields for the new item.
Fields and operations by kind of item:
${fieldListWords()}`;

const LINKS = obj({
  add: arr(str('an id'), 'ids to add'),
  remove: arr(str('an id'), 'ids to take away'),
});
const WORDS = obj({
  add: arr(str('a word'), 'to add'),
  remove: arr(str('a word'), 'to take away'),
});

const FIELDS = obj({
  name: str('the new name or title'),
  text: str('new text that replaces what the item says'),
  text_add: str('text to add to what the item says'),
  day: day('the day'),
  time: time('the time'),
  deadline: day('when a todo is due'),
  length: int('how long, in whole minutes'),
  schedule: obj(
    {
      per: strEnum(['day', 'week', 'month'], 'the period'),
      times: int('how many times in each period'),
      days: arr(
        int('a day of the week, 0 Sunday to 6 Saturday'),
        'fixed days of the week, for a weekly habit',
      ),
    },
    ['per'],
    "a habit's schedule",
  ),
  start_day: day('the day a habit starts'),
  end_day: day('the day it ends'),
  end_time: time('the time an event ends'),
  reminder_day: day('the day Gremly reminds them about a note'),
  reminder: obj(
    {
      add: arr(
        obj(
          {
            time: time('when it goes off'),
            day: day('the day, for one that goes off once'),
            repeat: strEnum(
              ['once', 'daily', 'weekdays', 'weekends', 'weekly'],
              'how often; once when left out',
            ),
            days: arr(int('a day of the week, 0 Sunday to 6 Saturday'), 'for weekly'),
          },
          ['time'],
        ),
        'reminders to add',
      ),
      remove: arr(str('a reminder id from get_item'), 'reminders to take off'),
    },
    [],
    'reminders',
  ),
  list: obj(
    {
      add: arr(str('an item for the list'), 'items to add'),
      tick: arr(str('a list item id from get_item'), 'items to tick'),
      untick: arr(str('a list item id from get_item'), 'items to untick'),
      remove: arr(str('a list item id from get_item'), 'items to take off'),
    },
    [],
    "a note's list",
  ),
  part_of_day: strEnum(['morning', 'day', 'evening', 'any'], 'the part of the day'),
  worlds: LINKS,
  chapters: LINKS,
  tags: WORDS,
  pinned: bool('pinned to the top'),
  favourite: bool('a favourite'),
});

const CHANGE = obj(
  {
    op: strEnum(AGENT_OPS, 'what the change does'),
    type: strEnum(['todo', 'habit', 'note'], 'the kind of item'),
    id: str('the item id; left out for add'),
    to: strEnum(['todo', 'habit', 'note'], 'for convert, the kind it becomes'),
    days: arr(str('a day, YYYY-MM-DD'), 'for log and unlog'),
    fields: FIELDS,
    clear: arr(str('a field name'), 'fields to empty'),
  },
  ['op', 'type'],
);

const HINTS = {
  no_item: 'no item of theirs has that kind and id; look it up with find_items',
  archived: 'it is archived; restore it first if they want it back',
  not_archived: 'it is not archived',
  calendar_item: 'it comes from their calendar, which Gremly can read but not change',
  no_change: 'it already is that way',
  conflict:
    'another change on this card is already about that item; put everything for one item in one change',
  add_needs_name: 'a new item needs a name',
  op_not_for_type: 'that operation does not apply to that kind of item',
  future_day: 'a habit cannot be logged for a day still to come',
  bad_days: 'days must be YYYY-MM-DD',
  bad_convert: 'convert needs to, another kind of item',
  no_fields: 'nothing to change was given',
  unknown_op: 'that operation is not one Gremly has',
  unknown_type: 'that kind of item is not one Gremly has',
};

function hint(reason) {
  if (HINTS[reason]) return HINTS[reason];
  const [code, field] = String(reason).split(':');
  switch (code) {
    case 'unknown_field':
      return `${field} is not a field of that kind of item`;
    case 'bad_value':
      return `the value for ${field} is not valid: days are YYYY-MM-DD, times HH:MM on a 24 hour clock, lengths whole minutes`;
    case 'cannot_clear':
      return `${field} cannot be emptied`;
    case 'cannot_add':
      return `${field} cannot be added to`;
    case 'not_an_event':
      return `${field} belongs to events; give the note its day in the same change`;
    case 'unknown_link':
      return `one of the ${field} ids is not one of theirs`;
    case 'unknown_list_item':
      return 'one of the list item ids is not on that list; read it with get_item';
    case 'unknown_reminder':
      return 'one of the reminder ids is not on that item; read it with get_item';
    default:
      return reason;
  }
}

/** The tool's change, in the change model's own shape. */
export function toModelChange(c, i) {
  const out = { cid: `c${i + 1}`, op: c?.op, type: c?.type };
  if (c?.id) out.id = c.id;
  if (c?.to) out.to = c.to;
  if (Array.isArray(c?.days)) out.days = c.days;
  const given = c?.fields && typeof c.fields === 'object' ? { ...c.fields } : {};
  const fields = {};
  for (const [k, v] of Object.entries(given)) {
    if (v === undefined || v === null) continue;
    if (k === 'text_add') fields.text = { add: v };
    else fields[k] = v;
  }
  for (const k of Array.isArray(c?.clear) ? c.clear : []) {
    if (typeof k === 'string') fields[k === 'text_add' ? 'text' : k] = null;
  }
  if (['add', 'change', 'convert'].includes(c?.op)) out.fields = fields;
  return out;
}

function fieldWords(field, value, ctx, names) {
  if (value === null) return `${field} cleared`;
  if (field === 'text' && typeof value === 'object') return `adds “${trim(value.add, 80)}”`;
  if (field === 'text') return `text “${trim(value, 80)}”`;
  if (['day', 'deadline', 'start_day', 'end_day', 'reminder_day'].includes(field)) {
    return `${field} ${dayWords(value, ctx.today)}`;
  }
  if (field === 'time' || field === 'end_time') return `${field} ${clock(value)}`;
  if (field === 'worlds' || field === 'chapters') {
    const n = (ids) => ids.map((id) => names.get(id) || id).join(', ');
    return [
      value.add.length ? `into ${n(value.add)}` : '',
      value.remove.length ? `out of ${n(value.remove)}` : '',
    ]
      .filter(Boolean)
      .join(', ');
  }
  return `${field} ${JSON.stringify(value)}`;
}

export const proposeChanges = {
  name: 'propose_changes',
  description: DESCRIPTION,
  parameters: obj({ changes: arr(CHANGE, 'the changes, one per item') }, ['changes']),

  async run(ctx, input = {}) {
    const raws = (Array.isArray(input.changes) ? input.changes : [])
      .slice(0, 20)
      .map(toModelChange);
    const lw = await worldsAndChapters(ctx);
    // each item named once, read fresh
    const wanted = new Map();
    for (const r of raws) {
      if (r.id && isId(r.id) && FIELD_TYPES[r.type])
        wanted.set(`${r.type}:${r.id}`, [r.type, r.id]);
    }
    const loaded = new Map(
      await Promise.all(
        [...wanted.entries()].map(async ([key, [type, id]]) => [
          key,
          (await loadItem(ctx, type, id))?.item ?? null,
        ]),
      ),
    );
    const { changes, dropped } = checkCard(raws, (raw) => ({
      today: ctx.today,
      item: raw.id ? (loaded.get(`${raw.type}:${raw.id}`) ?? null) : null,
      worlds: lw.worlds.map((w) => w.id),
      chapters: lw.chapters.map((c) => c.id),
    }));
    return { changes, dropped, names: [...lw.worlds, ...lw.chapters] };
  },

  render({ changes, dropped, names }, ctx) {
    const byId = new Map(names.map((n) => [n.id, n.name]));
    const lines = [];
    if (changes.length) {
      lines.push('On the card, for the person to accept or not:');
      for (const c of changes) {
        const what = [
          c.op === 'convert' ? `into a ${c.to}` : '',
          ...Object.entries(c.fields || {}).map(([f, v]) => fieldWords(f, v, ctx, byId)),
          c.days ? `days ${c.days.map((d) => dayWords(d, ctx.today)).join(', ')}` : '',
        ].filter(Boolean);
        lines.push(
          `- ${c.cid} ${c.op} ${c.type} “${trim(c.title, 60)}”${what.length ? `: ${what.join('; ')}` : ''}`,
        );
      }
    } else {
      lines.push('Nothing made it onto the card.');
    }
    if (dropped.length) {
      lines.push('Dropped:');
      for (const d of dropped) lines.push(`- ${d.cid}: ${hint(d.reason)}`);
    }
    return lines.join('\n');
  },
};
