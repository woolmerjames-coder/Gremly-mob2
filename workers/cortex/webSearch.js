// ============================================================================
// webSearch.js: a web search through Tavily, and its results put into words
// for a model. Used by every chat surface's search follow-up and by the
// agent's web_search tool (agent/tools).
// ============================================================================

/**
 * Execute a web search using Tavily API
 *
 * @param {string} query - The search query
 * @param {string} apiKey - Tavily API key
 * @param {Object} options - Search options
 * @param {number} options.maxResults - Maximum results to return (default: 5)
 * @param {string} options.searchDepth - 'basic' or 'advanced' (default: 'basic')
 * @returns {Promise<Object|null>} Formatted search results or null on error
 */
export async function executeTavilySearch(query, apiKey, options = {}) {
  const maxResults = options.maxResults ?? 3;
  const searchDepth = options.searchDepth ?? 'basic';
  const includeImages = options.includeImages ?? false;

  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        query: query,
        search_depth: searchDepth,
        max_results: maxResults,
        include_answer: true,
        include_raw_content: false,
        include_images: includeImages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error('[Tavily] Search failed:', {
        status: response.status,
        error: errorText,
      });
      return null;
    }

    const data = await response.json();

    // Format results
    const results = (data.results || []).map((result, index) => ({
      index: index + 1,
      title: result.title || '',
      url: result.url || '',
      snippet: (result.content || '').substring(0, 1000),
    }));

    // Get images if available (Tavily returns these separately)
    const images = includeImages && data.images ? data.images.slice(0, 3) : [];

    console.log('[Tavily] Search result:', {
      query,
      includeImages,
      resultsCount: results.length,
      imagesReturned: data.images?.length || 0,
      rawImages: data.images,
    });

    return {
      query: query,
      answer: data.answer || null,
      results: results,
      images: images,
    };
  } catch (error) {
    console.error('[Tavily] Search error:', error);
    return null;
  }
}

/**
 * Format Tavily search results into a readable brief for the LLM.
 * Instead of raw JSON, gives the model a structured brief that's
 * easy to cite from — the approach used by Perplexity/ChatGPT Browse.
 */
export function formatSearchBrief(tavilyResult) {
  if (!tavilyResult || !tavilyResult.results) return JSON.stringify(tavilyResult);

  let brief = '';

  // Lead with the synthesized answer if available
  if (tavilyResult.answer) {
    brief += `SYNTHESIZED ANSWER: ${tavilyResult.answer}\n\n`;
  }

  brief += 'SOURCES:\n\n';

  for (const result of tavilyResult.results) {
    // Extract domain name for easy citation
    let domain = '';
    try {
      domain = new URL(result.url).hostname.replace('www.', '');
    } catch {
      domain = result.url;
    }

    brief += `[${result.title}] (${domain})\n`;
    brief += `${result.snippet}\n\n`;
  }

  brief +=
    'INSTRUCTIONS: Use the specific findings, statistics, and expert names from these sources in your response. Cite each source by its name. Do not give generic advice — only share what these sources specifically say.';

  return brief;
}
