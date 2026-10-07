// ============================================================================
// recall: search what Gremly remembers about the person's life, the same
// search the chat context uses for each message (public.recall_life_now): facts
// they have told Gremly, their story and the Chapters of their life.
// ============================================================================

import { int, obj, str } from './schema.js';
import { dayWords, trim } from './words.js';
import { stateWords } from '../../../shared/factTiming.js';

const PRIVATE_HINT =
  ' [private: use it only when it bears on what they are talking about, in their own words, and never open with it]';

const DESCRIPTION = `Search what Gremly remembers about the person's life: facts they have told it, their story, and the Chapters of their life. Use it when the conversation touches their past, the people in it, or plans and events that may be on record, and before saying Gremly doesn't know something about them. Words are matched by their stems, any of them; search again with other words when nothing fits. Each memory comes with its date and whether it still holds.${PRIVATE_HINT}`;

export const recall = {
  name: 'recall',
  description: DESCRIPTION,
  parameters: obj(
    {
      query: str('words to look for in what Gremly remembers'),
      limit: int('how many at most, up to 20; 10 when left out'),
    },
    ['query'],
  ),

  async run(ctx, input = {}) {
    const query = String(input.query || '').trim();
    if (query.length < 2) return { memories: [] };
    const rows = await ctx.db.rpc('recall_life_now', {
      p_user: ctx.userId,
      p_query: query.slice(0, 300),
      p_limit: Number.isInteger(input.limit) ? Math.min(Math.max(input.limit, 1), 20) : 10,
    });
    return { memories: Array.isArray(rows) ? rows : [] };
  },

  render({ memories }, ctx) {
    if (!memories.length) return 'Nothing on record matched. Try other words.';
    return memories
      .map((m) => {
        const parts = [
          m.source,
          m.about_date ? dayWords(m.about_date, ctx.today) : '',
          // a plan whose date has passed says so: never handed on as still ahead
          m.source === 'fact' ? stateWords(m, ctx.today) : m.state || '',
          `${m.title && m.source !== 'fact' ? `${trim(m.title, 80)}: ` : ''}${trim(m.body, 280)}`,
        ].filter(Boolean);
        return `- ${parts.join(' | ')}${m.private ? PRIVATE_HINT : ''}`;
      })
      .join('\n');
  },
};
