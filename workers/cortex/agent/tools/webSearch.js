// ============================================================================
// web_search: the web, for current facts the person asks about that are not
// in their own records. The same Tavily search every chat surface's search
// follow-up uses (cortex/webSearch.js).
// ============================================================================

import { executeTavilySearch, formatSearchBrief } from '../../webSearch.js';
import { obj, str } from './schema.js';

export const WEB_SEARCH_DESCRIPTION = `Search the web for current facts about the world outside them that the person asks about or needs to know. Never for their own items, plans or day, which are in their records. Returns a short answer and sources; say which source a fact came from.`;

export const webSearch = {
  name: 'web_search',
  description: WEB_SEARCH_DESCRIPTION,
  parameters: obj({ query: str('what to search for, as a search engine query') }, ['query']),

  async run(ctx, input = {}) {
    const query = String(input.query || '')
      .trim()
      .slice(0, 300);
    if (!query) return { result: null };
    if (!ctx.env.TAVILY_API_KEY) throw new Error('web search is not set up');
    return { result: await executeTavilySearch(query, ctx.env.TAVILY_API_KEY, { maxResults: 5 }) };
  },

  render({ result }) {
    if (!result) return 'The search returned nothing.';
    return formatSearchBrief(result);
  },
};
