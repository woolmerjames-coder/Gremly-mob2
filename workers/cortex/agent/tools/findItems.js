// ============================================================================
// find_items: search the person's own todos, habits and notes.
//
// The search is the database's (public.find_items): the item's own words by
// their stems, any of them, the name counting most, plus filters. It only
// finds candidates. Which item the person means is the model's judgement over
// what comes back, as it is with the whole-list matcher this replaces in the
// agent lane (entityMatch.js stays for the quick lane until replay shows the
// two find the same items).
// ============================================================================

import { arr, day, int, obj, str, strEnum } from './schema.js';
import { clock, dayWords, trim } from './words.js';

const STATES = ['open', 'done', 'archived', 'any'];
const TYPES = ['todo', 'habit', 'note'];
const LIMIT = 12;

const DESCRIPTION = `Search the person's own todos, habits and notes. Use it whenever the conversation is about something they may already have: before proposing a change to it, before adding something that may already exist, and before saying they have nothing about it. Words are matched against each item's name and text by their stems, any of them, the name counting most; search with the words the item itself is likely to use, and search again with other words, or with filters alone, when nothing fits. Filters narrow by kind of item, by the day it is for, and by whether it is open, done or archived. It returns candidates with their ids, best first; which one the person means is your judgement, and when two fit equally well, ask them.`;

export const findItems = {
  name: 'find_items',
  description: DESCRIPTION,
  parameters: obj({
    query: str('words to look for in the items; leave out to list by filters alone'),
    types: arr(strEnum(TYPES), 'kinds of item to include; all kinds when left out'),
    from: day('only items for this day or later'),
    to: day('only items for this day or earlier'),
    state: strEnum(STATES, 'open (the default), done, archived, or any'),
    limit: int('how many at most, up to 30; 12 when left out'),
  }),

  async run(ctx, input = {}) {
    const types = (Array.isArray(input.types) ? input.types : []).filter((t) => TYPES.includes(t));
    const dayOrNull = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
    const rows = await ctx.db.rpc('find_items', {
      p_user: ctx.userId,
      p_query: typeof input.query === 'string' ? input.query.slice(0, 200) : null,
      p_types: types.length ? types : null,
      p_from: dayOrNull(input.from),
      p_to: dayOrNull(input.to),
      p_state: STATES.includes(input.state) ? input.state : 'open',
      p_limit: Number.isInteger(input.limit) ? Math.min(Math.max(input.limit, 1), 30) : LIMIT,
    });
    return { items: Array.isArray(rows) ? rows : [] };
  },

  render({ items }, ctx) {
    if (!items.length) return 'Nothing matched. Try other words, or filters alone.';
    const lines = items.map((i) => {
      const when = [i.day ? dayWords(i.day, ctx.today) : '', i.time ? clock(i.time) : '']
        .filter(Boolean)
        .join(' at ');
      const parts = [
        i.type,
        `id ${i.id}`,
        trim(i.title, 90) || '(untitled)',
        when,
        i.type === 'habit' && i.detail ? i.detail : '',
        i.type === 'note' && i.detail ? i.detail : '',
        i.state,
        i.snippet && trim(i.snippet, 120) !== trim(i.title, 120) ? `“${trim(i.snippet, 120)}”` : '',
      ].filter(Boolean);
      return `- ${parts.join(' | ')}`;
    });
    return `${items.length} found, best first:\n${lines.join('\n')}`;
  },
};
