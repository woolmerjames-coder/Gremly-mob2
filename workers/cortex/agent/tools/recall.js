// ============================================================================
// recall: search what Gremly remembers about the person's life, the same
// search the chat context uses for each message (public.recall_life): facts
// they have told Gremly, their story and the Chapters of their life. A fact
// comes with how Gremly knows it (workers/shared/factSource.js), so a person
// who asks where Gremly got something is told the truth.
// ============================================================================

import { int, obj, str } from './schema.js';
import { dayWords, trim } from './words.js';
import { sourceWords } from '../../../shared/factSource.js';

const PRIVATE_HINT =
  ' [private: use it only when it bears on what they are talking about, in their own words, and never open with it]';

// The description is as it was before a fact carried its source, on purpose:
// it is part of what the agent is sent on every turn, and one clause added to
// it took the card off a plain answer to Gremly's question 7 times in 40,
// against once in 40 as it was (the day replay, 7 October). What to do with a
// fact's source is said with the result instead, where it is read only when
// something was looked up.
const DESCRIPTION = `Search what Gremly remembers about the person's life: facts they have told it, their story, and the Chapters of their life. Use it when the conversation touches their past, the people in it, or plans and events that may be on record, and before saying Gremly doesn't know something about them. Words are matched by their stems, any of them; search again with other words when nothing fits. Each memory comes with its date and whether it still holds.${PRIVATE_HINT}`;

/** Said above what recall found: what a fact's source is for. */
const HOW_HINT =
  'On record (when they ask how Gremly knows something, a fact says it on its own line: tell them the day, where they said it and what they said. When no line says it, Gremly cannot tell where it came from and may have got it wrong, and it is never from anyone else):';

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
    const rows = await ctx.db.rpc('recall_life', {
      p_user: ctx.userId,
      p_query: query.slice(0, 300),
      p_limit: Number.isInteger(input.limit) ? Math.min(Math.max(input.limit, 1), 20) : 10,
    });
    return { memories: Array.isArray(rows) ? rows : [] };
  },

  render({ memories }, ctx) {
    if (!memories.length) return 'Nothing on record matched. Try other words.';
    const lines = memories
      .map((m) => {
        const parts = [
          m.source,
          m.about_date ? dayWords(m.about_date, ctx.today) : '',
          m.state || '',
          `${m.title && m.source !== 'fact' ? `${trim(m.title, 80)}: ` : ''}${trim(m.body, 280)}`,
        ].filter(Boolean);
        // a fact says how Gremly knows it; a story item or a Chapter is Gremly's own writing
        const how =
          m.source === 'fact'
            ? sourceWords(m, { today: ctx.today, timezone: ctx.timezone, quote: 240 })
            : '';
        if (how) parts.push(`how Gremly knows: ${how}`);
        return `- ${parts.join(' | ')}${m.private ? PRIVATE_HINT : ''}`;
      })
      .join('\n');
    return `${HOW_HINT}\n${lines}`;
  },
};
