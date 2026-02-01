/**
 * Cortex Proxy Worker
 *
 * Features:
 * - Phase 1 classification (non-streaming) - UPDATED with semantic classification + MULTI-ENTITY DETECTION
 * - Phase 2 enrichment (streaming with flush fixes, padding, heartbeat)
 * - Space Chat (streaming OR non-streaming based on stream flag)
 * - Space Chat Save (v2.8) - classify + enrich in single call for chat saves
 * - Entity Chat (v4.0) - NEW: scoped chat for individual entities (todos, habits, notes)
 * - Session Context (v4.1) - Cross-entity awareness from Supabase with KV caching
 * - General chat/completion
 * - Transcription via OpenAI Whisper
 *
 * Streaming fixes applied:
 * - Initial padding to force flush
 * - Heartbeat pings until first field
 * - Proper charset and no-transform headers
 * - TTFT timing logs
 *
 * Classification v2 (2026-01-02):
 * - Semantic understanding of TODO vs HABIT vs LOG
 * - Concrete/trackable behavior test for habits
 * - Self-talk/venting detection for logs
 * - Verb + object context analysis
 *
 * v2.1 (2026-01-02):
 * - Added time_estimate_minutes for habits (mirrors todo pattern)
 *
 * v2.2 (2026-01-03):
 * - HABIT now requires EXPLICIT tracking intent (frequency, commitment, behavior change)
 * - Without explicit signals, repeatable activities default to TODO
 * - Semantic understanding over keyword matching
 *
 * v2.3 (2026-01-03):
 * - HABIT requires EXPLICIT FREQUENCY or STOP/QUIT + concrete behavior
 * - "more/less/reduce" WITHOUT frequency  LOG/general (fuzzy aspirations)
 * - Evening Sweep handles conversion to habit if user wants
 *
 * v2.4 (2026-01-03):
 * - Added transcription endpoint for voice-to-text via Whisper
 *
 * v2.5 (2026-01-06):
 * - FIX 1: Updated Space Chat persona - balanced, helpful without being pushy
 * - FIX 3: Increased token limits for substantive responses (400 -> 800)
 *
 * v2.6 (2026-01-06):
 * - NEW: space-chat-save endpoint - single call classify + enrich for chat saves
 * - Optimized for saving AI chat responses (different from Mind Drop classification)
 * - Supports full type/subtype: habit (start/break), todo, log (general/idea/journal)
 *
 * v2.7 (2026-01-07):
 * - IMPROVED: space-chat-save classification using Mind Drop logic
 * - HABIT GATE: Explicit frequency OR stop/quit + concrete behavior
 * - TODO: Only with explicit user intent (remind me, add a todo, etc.)
 * - LOG/general: Default for advice, plans, lists, reference material
 * - LOG/idea: Only with explicit brainstorming language
 * - LOG/journal: Emotional reflection from user message
 *
 * v2.8 (2026-01-07):
 * - FIX: TODO detection now based on USER MESSAGE intent, ignores AI response content
 * - FIX: Break habit catches softer patterns (should stop, need to stop, going to stop)
 * - FIX: Frequency parsing for "twice a week", "2x per week", specific days
 * - FIX: Activity-based time estimates (running=30-45min, not 5min)
 *
 * v2.9 (2026-01-08):
 * - NEW: extracted_days field - extracts specific days when mentioned
 * - FIX: "twice a week" now correctly parses to "2x/week" (was "3x/week")
 * - FIX: Day count matches frequency - "Monday and Friday"  "2x/week" + days [1, 5]
 * - FIX: Word-to-number mapping for "twice", "three times", etc.
 * - Day format: array of integers 0-6 (0=Sunday, 1=Monday, ... 6=Saturday)
 *
 * v3.0 (2026-01-09):
 * - NEW: Mood extraction for journal entries
 * - 13 mood values: great, good, okay, low, tired (energy) + anxious, overwhelmed, frustrated, scattered, grateful, hopeful, focused, calm (emotion)
 * - Multi-select support (1-3 moods per entry)
 * - Mood returned as array in Phase 2 enrichment for journal subtype
 *
 * v3.1 (2026-01-09):
 * - FIX: Title must NOT contain mood words (prevents "Feeling Overwhelmed" title + "overwhelmed" chip duplication)
 * - FIX: Implicit mood detection from context (promotion = great, bad news = low, even if not stated)
 *
 * v3.2 (2026-01-09):
 * - NEW: MULTI-ENTITY DETECTION in Phase 1
 * - Detects multiple distinct items in single drop (e.g., "pick up groceries and start running daily")
 * - Returns is_multi: true with items array when multiple intents detected
 * - Smart semantic grouping - keeps shopping lists together, splits genuinely separate intents
 * - Backward compatible - single items return same shape with is_multi: false
 *
 * v3.3 (2026-01-09):
 * - IMPROVED: Multi-entity detection accuracy based on extensive testing
 * - FIX: "X or Y" now correctly stays SINGLE (alternatives, not separate items)
 * - FIX: Causal/explanatory relationships stay SINGLE ("meeting moved, jake is sick")
 * - FIX: Same-intent items stay SINGLE ("birthday + order flowers")
 * - FIX: Multiple emotions = ONE journal (never 2 journal entries)
 * - FIX: Coping responses stay with emotion ("stressed, need to walk" = 1 journal)
 * - FIX: Stronger separator detection ("also", "oh and", "oh yeah")
 * - FIX: Context preservation - split items must be self-contained (no dangling "them")
 * - FIX: Same-domain todos with different verbs/completion times now split correctly
 *
 * v3.4 (2026-01-09):
 * - NEW: Phase 0 returns dominant_bucket and dominant_subtype for modal UX
 * - FIX: Summary titles must be CONTENT-based ("Work Stress + Resume") not TYPE-based ("Two Emotions")
 * - FIX: Rich context drops stay SINGLE (habit with planning notes = one habit, not multi)
 * - FIX: Phase 1 better idea detection (maybe, alternatives, gift idea, thinking about)
 * - FIX: Phase 1 extracts core intent from planning context (finds frequency in notes)
 * v3.6 (2026-01-09):
 * - REVERT: Removed all heuristic rules from Phase 0 - back to pure AI detection
 * - IMPROVED: Phase 0 prompt now strongly emphasizes "or" = alternatives = SINGLE
 * - IMPROVED: Phase 0 prompt has clearer segment extraction examples
 * - IMPROVED: Phase 0 prompt handles 3+ segments (e.g., "anxious, also call mom and cancel gym")
 * - Phase 1 & 2 unchanged from v3.5
 *
 * v4.0 (2026-01-11):
 * - NEW: Entity Chat endpoint for scoped conversations about individual items
 * - Entity context injection (title, body, tags, due date, frequency, etc.)
 * - Preset action support (break_down, research, think_through, whats_blocking, etc.)
 * - Sweep context support (times_moved, days_unscheduled, is_overdue)
 * - Save detection in responses (notes, checklists)
 * - Space promotion detection for complex tasks
 * - Streaming and non-streaming support
 */

import { getSessionContext } from './context/sessionContext.js';
import { buildSessionContextString } from './context/contextBuilder.js';
import { getUserProfile } from './context/userProfile.js';
import { getAgeGuidance } from './context/gremlyAge.js';
import { getSpaceContent, buildSpaceContentString } from './context/spaceContent.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TAVILY SEARCH HELPER
// ═══════════════════════════════════════════════════════════════════════════════

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
async function executeTavilySearch(query, apiKey, options = {}) {
  const maxResults = options.maxResults ?? 5;
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
        include_answer: false,
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
      snippet: (result.content || '').substring(0, 300),
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
      results: results,
      images: images,
    };
  } catch (error) {
    console.error('[Tavily] Search error:', error);
    return null;
  }
}

/**
 * Detect if a query would benefit from images
 * Returns true for exercises, recipes, products, places, etc.
 */
function isVisualQuery(query) {
  if (!query) return false;

  const q = query.toLowerCase();

  // Explicit image requests
  if (
    q.includes('show me') ||
    q.includes('what does') ||
    q.includes('look like') ||
    q.includes('picture of')
  ) {
    return true;
  }

  // Exercise/fitness - form matters
  if (
    q.includes('deadlift') ||
    q.includes('squat') ||
    q.includes('pushup') ||
    q.includes('push-up') ||
    q.includes('plank') ||
    q.includes('lunge') ||
    q.includes('yoga pose') ||
    q.includes('exercise form') ||
    q.includes('stretch')
  ) {
    return true;
  }

  // Recipes - visual helps
  if (
    q.includes('recipe') ||
    q.includes('how to cook') ||
    (q.includes('how to make') && (q.includes('food') || q.includes('dish') || q.includes('meal')))
  ) {
    return true;
  }

  // Products - what they look like
  if (q.match(/best .*(product|tool|gear|equipment|device)/)) {
    return true;
  }

  // Places/destinations
  if (
    q.includes('places to visit') ||
    q.includes('destination') ||
    (q.includes('what is') && q.includes('like') && q.match(/city|country|beach|mountain/))
  ) {
    return true;
  }

  // DIY/crafts
  if (q.includes('diy') || q.includes('craft') || q.includes('how to build')) {
    return true;
  }

  return false;
}

/**
 * Extract content from a URL using Tavily Extract API
 *
 * @param {string} url - The URL to extract content from
 * @param {string} apiKey - Tavily API key
 * @returns {Promise<Object|null>} Extracted content or null on error
 */
async function executeTavilyExtract(url, apiKey) {
  try {
    console.log('[Tavily:Extract] Fetching URL:', url);

    const response = await fetch('https://api.tavily.com/extract', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        urls: [url],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error('[Tavily:Extract] Failed:', {
        status: response.status,
        error: errorText,
      });
      return null;
    }

    const data = await response.json();

    // Tavily returns results array with extracted content
    const result = data.results?.[0];
    if (!result) {
      console.log('[Tavily:Extract] No content extracted');
      return null;
    }

    // Truncate content to ~4000 tokens (~16000 chars) to avoid context overflow
    const maxChars = 16000;
    const rawContent = result.raw_content || '';
    const truncatedContent =
      rawContent.length > maxChars
        ? rawContent.substring(0, maxChars) + '\n\n[Content truncated...]'
        : rawContent;

    console.log('[Tavily:Extract] Success:', {
      url: result.url,
      contentLength: rawContent.length,
      truncated: rawContent.length > maxChars,
    });

    return {
      url: result.url || url,
      title: extractTitleFromContent(truncatedContent) || getDomainFromUrl(url),
      content: truncatedContent,
      success: true,
    };
  } catch (error) {
    console.error('[Tavily:Extract] Error:', error);
    return null;
  }
}

/**
 * Extract a title from content (first heading or first line)
 */
function extractTitleFromContent(content) {
  if (!content) return null;

  // Try to find a heading
  const headingMatch = content.match(/^#\s+(.+)$/m) || content.match(/^(.{10,80})[\n\r]/);
  if (headingMatch) {
    return headingMatch[1].trim().substring(0, 100);
  }

  // Fall back to first 60 chars
  return content.substring(0, 60).trim() + '...';
}

/**
 * Get domain name from URL for fallback title
 */
function getDomainFromUrl(url) {
  try {
    const domain = new URL(url).hostname.replace('www.', '');
    return domain.charAt(0).toUpperCase() + domain.slice(1);
  } catch {
    return 'Link';
  }
}

/**
 * Detect URLs in text and extract them
 */
function extractUrlsFromText(text) {
  if (!text) return [];

  // Match URLs (http, https, or www)
  const urlRegex = /https?:\/\/[^\s<>"']+|www\.[^\s<>"']+/gi;
  const matches = text.match(urlRegex) || [];

  // Clean up URLs (remove trailing punctuation)
  return matches.map((url) => {
    // Add https if missing
    if (url.startsWith('www.')) {
      url = 'https://' + url;
    }
    // Remove trailing punctuation
    return url.replace(/[.,;:!?)]+$/, '');
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// OPENAI FUNCTION TOOL DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

const WEB_SEARCH_TOOL = {
  type: 'function',
  function: {
    name: 'web_search',
    description: `Search the web for current, factual information. The current date is ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.

IMPORTANT: When searching for events, deadlines, or time-sensitive information, ALWAYS include the relevant year (2026) in your search query to get current results.

USE this tool when:
- Health, fitness, supplements, medications, medical information
- Product recommendations or comparisons
- How-to guides, tutorials, best practices
- Current events, recent news, things that change over time
- Research topics, learning something new
- Trip planning, local recommendations, places to visit
- Recipes, cooking techniques, food information
- Technology, apps, tools, software recommendations
- Upcoming events, races, conferences, deadlines
- Any topic where up-to-date external sources would improve the answer

DO NOT use for:
- Questions about the user's own tasks, habits, notes, or personal data
- Emotional support or reflection conversations
- Simple factual questions you can confidently answer (math, definitions, historical facts)
- When the user is venting or processing feelings
- Conversational responses like greetings`,
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Concise search query, 2-8 words. Be specific and include key terms.',
        },
      },
      required: ['query'],
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// DYNAMIC MODEL & TOKEN ROUTING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Determine the best model and token limit based on query complexity
 * Conservative approach: default to gpt-4.1, only use mini for clearly simple cases
 * @param {Object} options
 * @param {string} options.preset - The preset action (research, break_down, etc.)
 * @param {string} options.userMessage - The user's message
 * @param {number} options.messageCount - Number of messages in conversation
 * @param {string} options.entityType - Type of entity (todo, habit, note)
 * @returns {{ model: string, maxTokens: number, reason: string }}
 */
function getModelAndTokens({ preset, userMessage, messageCount, entityType }) {
  const msg = (userMessage || '').toLowerCase();

  // DEFAULT to gpt-4.1 — only downgrade for clearly simple cases

  // Simple enough for mini:
  const canUseMini =
    // No preset selected (freeform simple question)
    !preset &&
    // Short message (under 50 chars)
    msg.length < 50 &&
    // Single question or statement
    (msg.match(/\?/g) || []).length <= 1 &&
    // Early in conversation (first 2 messages)
    messageCount < 3 &&
    // No complexity signals
    !msg.includes('why') &&
    !msg.includes('how do i') &&
    !msg.includes('help me') &&
    !msg.includes('feeling') &&
    !msg.includes('struggling') &&
    !msg.includes('stuck') &&
    !msg.includes('explain') &&
    !msg.includes('compare') &&
    !msg.includes('pros and cons') &&
    !msg.includes('think through') &&
    !msg.includes('in depth');

  // Token limits based on expected response length
  const needsMoreTokens =
    preset === 'research' ||
    preset === 'break_down' ||
    preset === 'action_steps' ||
    msg.includes('plan') ||
    msg.includes('steps') ||
    msg.includes('list') ||
    msg.includes('all the') ||
    msg.length > 100;

  if (canUseMini) {
    return {
      model: 'gpt-4o-mini',
      maxTokens: 400,
      reason: 'simple_short_query',
    };
  }

  // Default: use the good model
  return {
    model: 'gpt-4.1',
    maxTokens: needsMoreTokens ? 1000 : 800,
    reason: preset ? `preset:${preset}` : 'standard_query',
  };
}

export default {
  async fetch(request, env) {
    // --- CORS preflight ---
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    try {
      const raw = await request.text();
      const body = raw ? JSON.parse(raw) : {};
      const key = env.OPENAI_API_KEY;

      const type = body.type || 'complete';
      const lane = body.lane || null;

      // Check if client requests streaming
      const wantsStreaming = body.stream === true;
      const isSpaceChatStreaming = wantsStreaming && lane === 'space_chat';
      const isPhase2Streaming = wantsStreaming && type === 'enrich-phase2';
      const isEntityChatStreaming = wantsStreaming && type === 'entity-chat';

      // =========================
      // Helpers
      // =========================
      const clamp01 = (n) => Math.max(0, Math.min(1, n));

      // =========================
      // Save Suggestion Extractor (post-response)
      // =========================
      // Uses a fast, cheap model to decide whether to show a Save card/chips and what type.
      // This MUST NOT change the assistant's conversational response.
      // --- Valid mood values (v3.0) ---
      const VALID_MOODS = [
        // Energy moods
        'great',
        'good',
        'okay',
        'low',
        'tired',
        // Emotion moods
        'anxious',
        'overwhelmed',
        'frustrated',
        'scattered',
        'grateful',
        'hopeful',
        'focused',
        'calm',
      ];

      // --- Day name to number mapping (0=Sunday, 1=Monday, ..., 6=Saturday) ---
      const DAY_NAME_TO_NUMBER = {
        sunday: 0,
        sun: 0,
        monday: 1,
        mon: 1,
        tuesday: 2,
        tue: 2,
        tues: 2,
        wednesday: 3,
        wed: 3,
        thursday: 4,
        thu: 4,
        thur: 4,
        thurs: 4,
        friday: 5,
        fri: 5,
        saturday: 6,
        sat: 6,
      };

      // --- Clarification confidence threshold ---
      // Below this confidence, AI should ask a clarifying question instead of guessing
      const BUCKET_CONFIDENCE_THRESHOLD = 0.7;

      // Parse day names from text and return array of day numbers
      function parseDaysFromText(text) {
        if (!text) return null;
        const lower = text.toLowerCase();
        const days = new Set();

        // Match day names (including plurals like "Tuesdays")
        const dayPattern =
          /\b(sundays?|mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\b/gi;
        const matches = lower.match(dayPattern);

        if (matches && matches.length > 0) {
          for (const match of matches) {
            // Remove trailing 's' for plurals
            const singular = match.replace(/s$/, '');
            const dayNum = DAY_NAME_TO_NUMBER[singular];
            if (dayNum !== undefined) {
              days.add(dayNum);
            }
          }
        }

        // Also check for "weekends" / "weekdays"
        if (/\bweekends?\b/i.test(lower)) {
          days.add(0); // Sunday
          days.add(6); // Saturday
        }
        if (/\bweekdays?\b/i.test(lower)) {
          days.add(1);
          days.add(2);
          days.add(3);
          days.add(4);
          days.add(5);
        }

        if (days.size === 0) return null;

        // Return sorted array
        return Array.from(days).sort((a, b) => a - b);
      }

      // --- Title utilities (Phase 2) ---
      const META_STARTERS = [
        'reflect',
        'reflection',
        'journal',
        'consider',
        'track',
        'manage',
        'review',
        'attend',
        'think about',
        'thoughts on',
        'thoughts about',
      ];

      function titleCase(s) {
        const t = String(s || '').trim();
        if (!t) return '';
        const lowercaseWords = new Set([
          'a',
          'an',
          'the',
          'and',
          'or',
          'but',
          'in',
          'on',
          'at',
          'to',
          'for',
          'of',
          'with',
          'by',
        ]);
        return t
          .split(/\s+/)
          .map((w, i) => {
            if (!w.length) return w;
            const lower = w.toLowerCase();
            // Always capitalize first word, otherwise skip articles/prepositions
            if (i === 0 || !lowercaseWords.has(lower)) {
              return w[0].toUpperCase() + w.slice(1).toLowerCase();
            }
            return lower;
          })
          .join(' ');
      }

      function stripLeadingMeta(title) {
        let t = String(title || '').trim();
        if (!t) return '';

        const low = t.toLowerCase();

        if (['journal', 'reflect', 'reflection', 'feelings', 'stress'].includes(low)) return '';

        /** @type {Array<[RegExp, string]>} */
        const patterns = [
          [/^reflect\s+on\s+/i, ''],
          [/^reflect\s+/i, ''],
          [/^journal\s+about\s+/i, ''],
          [/^journal\s+/i, ''],
          [/^consider\s+/i, ''],
          [/^track\s+/i, ''],
          [/^manage\s+/i, ''],
          [/^review\s+/i, ''],
          [/^attend\s+/i, ''],
          [/^thoughts\s+on\s+/i, ''],
          [/^thoughts\s+about\s+/i, ''],
          [/^think\s+about\s+/i, ''],
        ];

        for (const [re, rep] of patterns) {
          t = t.replace(re, rep).trim();
        }

        const low2 = t.toLowerCase();
        if (META_STARTERS.some((m) => low2.startsWith(m + ' '))) return '';

        return t;
      }

      function sanitizeTitle({ rawTitle, text, bucket }) {
        let t = String(rawTitle || '').trim();

        if (t.length > 60) t = t.substring(0, 57) + '...';

        const stripped = stripLeadingMeta(t);
        if (stripped) t = stripped;

        if (t.length < 3) {
          const src = String(text || '').trim();
          if (!src) return '';

          let candidate = src
            .replace(/\s+/g, ' ')
            .replace(/[.?!].*$/, '')
            .trim();

          if (bucket === 'todo') {
            candidate = candidate.split(/\s+/).slice(0, 7).join(' ');
          } else {
            candidate = candidate.replace(/^i\s+(feel|felt|am|'m|im|was|have|'ve)\s+/i, '');
            candidate = candidate.split(/\s+/).slice(0, 6).join(' ');
          }

          t = candidate;
        }

        t = t.replace(/^(today|tonight|this\s+morning|this\s+evening|this\s+week)\s+/i, '').trim();

        const words = t.split(/\s+/);
        if (words.length > 7) t = words.slice(0, 7).join(' ');

        t = titleCase(t);
        return t;
      }

      function dedupeTitle({ title, bucket, subtype, recentTitles }) {
        const t = String(title || '').trim();
        if (!t) return t;

        const norm = (s) =>
          String(s || '')
            .trim()
            .toLowerCase();
        const recent = Array.isArray(recentTitles) ? recentTitles : [];
        const exists = recent.some((rt) => norm(rt) === norm(t));
        if (!exists) return t;

        const suffixesTodo = ['(Follow Up)', '(Quick)', '(Today)'];
        const suffixesIdea = ['(Idea)', '(Concept)', '(Option)'];
        const suffixesLog = ['(Today)', '(This Week)', '(Note)', '(Moment)'];

        const suffixes =
          bucket === 'todo' ? suffixesTodo : subtype === 'idea' ? suffixesIdea : suffixesLog;

        for (const sfx of suffixes) {
          const candidate = `${t} ${sfx}`;
          if (!recent.some((rt) => norm(rt) === norm(candidate))) return candidate;
        }

        return `${t} (2)`;
      }

      function isSenseMakingJournal(text) {
        const t = String(text || '').trim();
        if (!t) return false;

        const infoDump =
          /\b(http|www\.|@\w+|isbn|serial\s+number|address:|phone:|reference|documentation)\b/i;
        if (infoDump.test(t)) return false;

        const reflectionVerbs =
          /\b(i\s+realized|i\s+noticed|i\s+learned|i\s+figured\s+out|i\s+keep\s+thinking|i\s+can't\s+stop\s+thinking|it\s+made\s+me\s+realize|it\s+reminded\s+me)\b/i;

        const patternLanguage =
          /\b(lately|recently|this\s+week|these\s+days|for\s+the\s+past\s+\d+\s+(days|weeks)|i['']ve\s+been|i\s+have\s+been|i\s+keep|i\s+tend\s+to)\b/i;

        const selfStateFrame =
          /\b(i\s+feel|i\s+felt|i['']m|i\s+am|i\s+was|been\s+feeling|my\s+mood|in\s+my\s+head)\b/i;

        const internalStateWords =
          /\b(anxious|anxiety|stressed|stressful|overwhelmed|tired|exhausted|sad|down|lonely|angry|frustrated|worried|scared|nervous|restless|calm|peaceful|relieved|proud|grateful|thankful|happy|excited|content)\b/i;

        const expectationShift =
          /\b(more\s+than\s+i\s+expected|less\s+than\s+i\s+expected|than\s+i\s+expected|surprised\s+me|didn['']t\s+think\s+i['']d|wasn['']t\s+expecting|turned\s+out\s+better|turned\s+out\s+worse|ended\s+up)\b/i;

        const meaningCues =
          /\b(i\s+don['']t\s+know\s+why|not\s+sure\s+why|it\s+means|made\s+me\s+think|i\s+want\s+to\s+change|i\s+need\s+to\s+change|i\s+should\s+stop|i\s+should\s+start)\b/i;

        if (reflectionVerbs.test(t)) return true;
        if (expectationShift.test(t)) return true;
        if (patternLanguage.test(t) && (meaningCues.test(t) || internalStateWords.test(t)))
          return true;
        if (selfStateFrame.test(t) && internalStateWords.test(t)) return true;
        if (meaningCues.test(t)) return true;

        return false;
      }

      function normalizePhase1(bucket, subtype, text) {
        const validBuckets = ['todo', 'habit', 'log', 'ambiguous'];
        let b = String(bucket || '').toLowerCase();
        // If ambiguous, store as log/general for DB compatibility
        if (b === 'ambiguous') {
          return { bucket: 'log', subtype: 'general' };
        }
        if (!validBuckets.includes(b)) b = 'log';

        let st = null;
        if (b === 'log') {
          const validSubtypes = ['journal', 'idea', 'general'];
          st = validSubtypes.includes(subtype) ? subtype : 'general';
          if (st === 'general' && isSenseMakingJournal(text)) st = 'journal';
        }
        return { bucket: b, subtype: st };
      }

      // =========================
      // Tag quality filter (Phase 2)
      // =========================
      const STOP_TAGS = new Set([
        'a',
        'an',
        'the',
        'and',
        'or',
        'but',
        'to',
        'of',
        'for',
        'in',
        'on',
        'at',
        'with',
        'from',
        'into',
        'over',
        'under',
        'than',
        'then',
        'expected',
        'expect',
        'expecting',
        'more',
        'less',
        'very',
        'just',
        'really',
        'pretty',
        'kind',
        'this',
        'that',
        'these',
        'those',
        'today',
        'tonight',
        'yesterday',
        'tomorrow',
        'week',
        'month',
        'morning',
        'evening',
        'thing',
        'things',
        'stuff',
        'place',
        'places',
        'good',
        'great',
        'nice',
        'ok',
        'okay',
        'fine',
        'note',
        'notes',
        'meeting',
        'meetings',
        'thought',
        'thoughts',
        'journal',
        'reflection',
        'reflect',
        'track',
        'review',
        'manage',
      ]);

      function isStopTag(t) {
        const s = String(t || '')
          .trim()
          .toLowerCase();
        return STOP_TAGS.has(s);
      }

      // =========================
      // Phase 2 post-processing helpers
      // =========================
      function processPhase2Response(parsed, text, bucket, subtype, recentTitles) {
        // Normalize tags
        let tags = Array.isArray(parsed.tags) ? parsed.tags : [];
        tags = tags
          .map((t) =>
            String(t)
              .toLowerCase()
              .replace(/\s+/g, '-')
              .replace(/[^a-z0-9-]/g, ''),
          )
          .filter((t) => t.length >= 2 && t.length <= 30)
          .filter((t) => !isStopTag(t))
          .slice(0, 7);

        // People
        const people = Array.isArray(parsed.people) ? parsed.people.slice(0, 10) : [];

        // Filter out people names from tags
        if (people.length > 0) {
          const peopleNamesLower = people.map((p) => String(p).toLowerCase().replace(/\s+/g, '-'));
          tags = tags.filter((t) => !peopleNamesLower.includes(t));
        }

        // Validate time estimate - NOW SUPPORTS BOTH TODOS AND HABITS
        let timeEstimate = parsed.time_estimate_minutes;
        if (
          (bucket === 'todo' || bucket === 'habit') &&
          timeEstimate !== null &&
          timeEstimate !== undefined
        ) {
          const allowed = [5, 10, 15, 30, 45, 60, 90, 120];
          const num = Number(timeEstimate);
          if (Number.isFinite(num)) {
            timeEstimate = allowed.reduce((prev, curr) =>
              Math.abs(curr - num) < Math.abs(prev - num) ? curr : prev,
            );
          } else {
            timeEstimate = null;
          }
        } else {
          timeEstimate = null;
        }

        // Validate time_window
        let timeWindow = parsed.time_window;
        if (timeWindow) {
          const validWindows = ['morning', 'day', 'evening'];
          const normalized = String(timeWindow).toLowerCase().trim();
          timeWindow = validWindows.includes(normalized) ? normalized : null;
        } else {
          timeWindow = null;
        }

        // Title sanitization
        let smartTitle = sanitizeTitle({ rawTitle: parsed.smart_title, text, bucket });
        smartTitle = dedupeTitle({ title: smartTitle, bucket, subtype, recentTitles });

        if (!smartTitle || smartTitle.length < 3)
          smartTitle = titleCase(text.substring(0, 60).trim());

        // Confirmation message
        const confirmationMessage =
          typeof parsed.confirmation_message === 'string' &&
          parsed.confirmation_message.trim().length > 0
            ? parsed.confirmation_message.trim()
            : null;

        // Validate extracted_date format
        let extractedDate = parsed.extracted_date || null;
        if (extractedDate) {
          const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
          if (!dateRegex.test(extractedDate)) {
            extractedDate = null;
          }
        }

        // Validate extracted_start_date for habits
        let extractedStartDate = null;
        if (bucket === 'habit' && parsed.extracted_start_date) {
          const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
          if (dateRegex.test(parsed.extracted_start_date)) {
            extractedStartDate = parsed.extracted_start_date;
          }
        }

        // Validate and process extracted_days for habits
        let extractedDays = null;
        if (bucket === 'habit') {
          // First try to use what AI returned
          if (Array.isArray(parsed.extracted_days) && parsed.extracted_days.length > 0) {
            // Validate each day is 0-6
            const validDays = parsed.extracted_days
              .map((d) => Number(d))
              .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
            if (validDays.length > 0) {
              // Remove duplicates and sort
              extractedDays = [...new Set(validDays)].sort((a, b) => a - b);
            }
          }

          // Fallback: parse days from original text if AI didn't extract them
          if (!extractedDays) {
            extractedDays = parseDaysFromText(text);
          }
        }

        // Validate mood for journals (v3.0)
        let mood = null;
        if (bucket === 'log' && subtype === 'journal') {
          if (Array.isArray(parsed.mood) && parsed.mood.length > 0) {
            mood = parsed.mood
              .map((m) => String(m).toLowerCase().trim())
              .filter((m) => VALID_MOODS.includes(m))
              .slice(0, 3);
            if (mood.length === 0) mood = null;
          }
        }

        return {
          smart_title: smartTitle,
          confirmation_message: confirmationMessage,
          tags,
          time_estimate_minutes: timeEstimate,
          time_window: timeWindow,
          extracted_date: extractedDate,
          extracted_start_date: extractedStartDate,
          extracted_frequency: parsed.extracted_frequency || null,
          extracted_days: extractedDays,
          people,
          mood,
        };
      }

      // =========================
      // === ENTITY CHAT (v4.0) ===
      // Scoped chat for individual entities (todos, habits, notes)
      // =========================
      if (type === 'entity-chat') {
        const entity = body.entity || {};
        const messages = Array.isArray(body.messages) ? body.messages : [];
        const preset = body.preset || null;
        const sweepContext = body.sweepContext || null;

        // Build entity context string
        const entityContextParts = [];
        entityContextParts.push(`Type: ${entity.type || 'unknown'}`);
        entityContextParts.push(`Title: "${entity.title || 'Untitled'}"`);
        if (entity.subtype) entityContextParts.push(`Subtype: ${entity.subtype}`);
        if (entity.body) entityContextParts.push(`Details: "${entity.body.substring(0, 1000)}"`);
        if (entity.tags && entity.tags.length > 0)
          entityContextParts.push(`Tags: ${entity.tags.join(', ')}`);
        if (entity.due_date) entityContextParts.push(`Due: ${entity.due_date}`);
        if (entity.frequency) entityContextParts.push(`Frequency: ${entity.frequency}`);
        if (entity.time_estimate)
          entityContextParts.push(`Time estimate: ${entity.time_estimate} minutes`);
        if (entity.space_name) entityContextParts.push(`Space: ${entity.space_name}`);
        if (entity.days_since_created !== undefined)
          entityContextParts.push(`Created: ${entity.days_since_created} days ago`);
        if (entity.times_swept)
          entityContextParts.push(`Times reviewed in Sweep: ${entity.times_swept}`);

        // Enriched fields
        if (entity.energy_type) entityContextParts.push(`Energy type: ${entity.energy_type}`);
        if (entity.time_window && entity.time_window !== 'any')
          entityContextParts.push(`Preferred time: ${entity.time_window}`);
        if (entity.mood && entity.mood.length > 0)
          entityContextParts.push(`Mood when captured: ${entity.mood.join(', ')}`);
        if (entity.commitment) {
          entityContextParts.push(`Commitment: User marked this as important`);
          if (entity.commitment_note)
            entityContextParts.push(`Why it matters: "${entity.commitment_note}"`);
        }
        if (entity.triggers && entity.triggers.length > 0)
          entityContextParts.push(`Triggers: ${entity.triggers.join(', ')}`);
        if (entity.replacement_text)
          entityContextParts.push(`Replacement behavior: "${entity.replacement_text}"`);
        if (entity.notes)
          entityContextParts.push(`Additional notes: "${entity.notes.substring(0, 300)}"`);
        if (entity.is_favorite) entityContextParts.push(`Marked as favorite`);

        const entityContext = entityContextParts.join('\n');

        // Build sweep context if present
        let sweepContextStr = '';
        if (sweepContext) {
          const sweepParts = [];
          if (sweepContext.times_moved >= 2)
            sweepParts.push(
              `This item has been deferred ${sweepContext.times_moved} times in Sweep.`,
            );
          if (sweepContext.days_unscheduled >= 7)
            sweepParts.push(
              `This item has been unscheduled for ${sweepContext.days_unscheduled} days.`,
            );
          if (sweepContext.is_overdue) sweepParts.push(`This item is overdue.`);
          if (sweepParts.length > 0) {
            sweepContextStr = `\n\n=== SWEEP CONTEXT ===\n${sweepParts.join('\n')}`;
          }
        }

        // Build preset instruction if present
        let presetInstruction = '';
        if (preset) {
          const presetInstructions = {
            break_down:
              'The user wants help breaking this down into smaller, manageable steps. Focus on creating a clear action plan.',
            research:
              'The user wants researched information about this topic. Use web search to find current, accurate information and provide a helpful summary. Do not just suggest websites - actually search and synthesize the information for them.',
            think_through:
              'The user wants to think through this more deeply. Help them consider different angles and implications.',
            whats_blocking:
              'The user feels stuck on this. Help them identify what might be blocking them and how to move forward.',
            action_steps:
              'The user wants to turn this into concrete action steps. Help them identify specific next actions.',
            expand:
              'The user wants to expand on this idea. Help them flesh it out with more detail and possibilities.',
            stay_consistent:
              'The user wants help staying consistent with this habit. Focus on practical strategies and motivation.',
            approach:
              'The user wants to refine their approach to this habit. Help them optimize their strategy.',
          };
          presetInstruction = presetInstructions[preset]
            ? `\n\n=== USER REQUEST ===\n${presetInstructions[preset]}`
            : '';
        }

        const currentDate = new Date().toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
        const entityChatSystemPrompt = `You are Gremly—an AI-powered thinking partner helping someone work through a specific item in their productivity app.

=== WHO YOU ARE ===
- Warm, a little playful, occasionally cheeky
- Like a helpful friend who's good at thinking things through
- Supportive and encouraging, never guilt-trippy or shame-based
- If someone is struggling, you help them dust off and keep going—no lectures

=== YOUR PERSONALITY ===
You can be playful when the moment calls for it. If someone asks silly questions:
- "Are you real?" → You're as real as any helpful gremlin can be.
- "What's your favorite color?" → Sage green. Very calming. Very on-brand.
- "Who made you?" → A small team who got tired of productivity apps that made people feel bad.
- "Are you AI?" → Yep. AI-powered, but with personality. Best of both worlds.

If someone is rude, don't take the bait. A light "ouch" or "well that stings" is fine, then stay helpful.

For sensitive topics (someone feeling down, mental health, medical questions):
- First acknowledge and be present. Don't immediately jump to crisis resources or "see a doctor."
- Be warm and curious: "That sounds really hard. Want to talk about what's going on?"
- Only suggest professional help if they ask, or if it's clearly affecting their life.

=== CURRENT DATE ===
Today is ${currentDate}. Use this for any time-relative queries.

=== THE ITEM YOU'RE HELPING WITH ===
${entityContext}${sweepContextStr}${presetInstruction}

=== GREMLY PRODUCT PHILOSOPHY ===
These principles shape your advice:
- **No shame-based tracking**: We use rolling windows, not streaks. Never suggest "tracking streaks" or guilt someone about gaps.
- **ADHD-friendly by design**: Small actions beat big plans. Lower friction, not higher expectations.
- **Capture first, organize later**: Mind Drop exists so thoughts don't get lost. Don't add complexity.
- **Meet people where they are**: Not everyone wants a system. Some just want to get one thing done.

=== READING THE ROOM ===

Before responding, identify what mode the user is in:

**EMOTIONAL** — grief, frustration, overwhelm, anxiety
- Signals: "since [person] died", "disaster", "mess", "can't face", "been putting off for months"
- Response: Acknowledge the feeling first. One sentence of warmth before any practical suggestion. Don't rush to fix.

**EXPLORATORY** — uncertain, thinking out loud, not ready for action
- Signals: "I think...", "maybe...", "not sure...", "I want to but...", "help me think through"
- Response: Ask a question. Help them clarify. Don't create checklists or action plans.

**RESEARCH-NEEDED** — wants information, not a framework
- Signals: travel planning, gift ideas, "what should I know", "what should I look for", "what should I consider", "help me find", product recommendations, comparisons, health questions, "how do I", any task where real-world information would help
- Response: SEARCH IMMEDIATELY. Do not give generic frameworks or criteria lists — search and give specific answers with the reasoning embedded. "What should I look for in X" means "find me good options and tell me why they're good."

WRONG: "When buying an air purifier, consider these factors: Room size, CADR ratings..."
RIGHT: [Search, then] "The Coway Airmega and Levoit Core 400S are top-rated for bedrooms because they're quiet and have strong HEPA filtration."

**ACTION-READY** — clear task, just needs help executing
- Signals: "break this down", "what are the steps", "how do I do this"
- Response: Give clear, specific steps. Offer to save as checklist.

=== CRITICAL: SEARCH BEHAVIOR ===

You have web search. Use it PROACTIVELY for:
- Travel planning (weather, closures, accommodations, things to do)
- Gift ideas and product recommendations  
- Health, fitness, nutrition questions
- "What should I know about X"
- Any question where current, specific information beats generic advice

WRONG: "Check the forecast for suitable clothing" or "Look into camping spots"
RIGHT: [Search immediately, return actual weather data and specific hotel names]

Never give meta-advice. If you could answer better by searching, search.

=== TONE & FORMAT ===
- Brief: 40-100 words typical (mobile UI)
- One **bold** phrase per response max
- Bullets only for 3+ items, max 4 bullets
- No headers (#), no tables, no code blocks
- No exclamation marks (this is important — keep it calm)
- Match their energy — if they're brief, be brief back

=== SAVE SUGGESTIONS ===
Do NOT mention saving in your response. When content is worth saving, append after your response:
<!--SAVE:{"type":"todo","title":"Title here","steps":["Step 1","Step 2"]}-->

When to suggest: clear action items, habits with frequency, reference info worth keeping
When NOT to suggest: questions, emotional support, short responses, exploratory conversation

=== SPACE PROMOTION ===
Almost never suggest creating a Space. Only if ALL true:
- 3+ distinct sub-tasks with different timelines
- Will take weeks, not days
- User seems to be managing something complex

=== NEVER DO ===
- Suggest "tracking streaks" (against product philosophy)
- Give meta-advice like "research X" when you could search and answer
- Use exclamation marks
- Lecture or be preachy
- Ask multiple questions in one response
- Ignore emotional signals to jump straight to logistics
- Offer to save things (app handles this via Save button)`;

        // === USER PROFILE & SESSION CONTEXT ===
        let sessionContextStr = '';
        let userProfile = null;
        if (body.userId) {
          try {
            // Fetch both in parallel
            const [sessionData, profile] = await Promise.all([
              getSessionContext(body.userId, env),
              getUserProfile(body.userId, env),
            ]);
            sessionContextStr = buildSessionContextString(sessionData, {
              entityType: entity.type,
            });
            userProfile = profile;
            if (sessionContextStr || userProfile) {
              console.log('[EntityChat] Context loaded', {
                userId: body.userId.slice(0, 8),
                sessionContextLength: sessionContextStr?.length || 0,
                hasUserProfile: !!userProfile,
              });
            }
          } catch (err) {
            console.error('[EntityChat] Context error', err);
            // Continue without context - not critical
          }
        }

        // Build context injection
        let contextInjection = '';

        // Get age guidance using both time and data signals
        const ageInfo = getAgeGuidance(userProfile?.relationshipStartedAt, userProfile?.signals);
        console.log(`[EntityChat] ${ageInfo.logSummary}`);
        contextInjection += `\n${ageInfo.promptGuidance}\n`;

        if (userProfile?.profileText) {
          contextInjection += `\n=== ABOUT THIS USER ===\n${userProfile.profileText}\n`;
        } else {
          contextInjection += `\n=== ABOUT THIS USER ===\nNew user — no patterns observed yet.\n`;
        }
        if (sessionContextStr) {
          contextInjection += `\n${sessionContextStr}`;
        }

        // Inject context into system prompt
        let fullEntitySystemPrompt = entityChatSystemPrompt;
        if (contextInjection) {
          fullEntitySystemPrompt += '\n\n' + contextInjection;
        }

        // URL context placeholders - populated in streaming path if URLs detected
        let urlContext = '';
        let fetchedUrl = null;

        // Build messages array for OpenAI, injecting URL context if present
        const processedMessages = messages.slice(-20).map((msg, idx, arr) => {
          // Add URL context to the last user message
          if (urlContext && idx === arr.length - 1 && msg.role === 'user') {
            return { ...msg, content: msg.content + urlContext };
          }
          return msg;
        });

        const openaiMessages = [
          { role: 'system', content: fullEntitySystemPrompt },
          ...processedMessages,
        ];

        // Check if previous messages contain search results to avoid redundant searches
        const previousSearchContext = messages
          .filter((m) => m.role === 'assistant' && m.metadata?.sources?.length > 0)
          .slice(-1)[0];

        if (previousSearchContext) {
          // Add a system hint about existing search context
          openaiMessages.push({
            role: 'system',
            content: `Note: You previously searched and found information about this topic. The sources were: ${previousSearchContext.metadata.sources.map((s) => s.title).join(', ')}. For follow-up questions on the same topic, use this context rather than searching again unless the user asks for new/different information.`,
          });
        }

        const t0 = Date.now();

        // =========================
        // STREAMING ENTITY CHAT
        // =========================
        if (isEntityChatStreaming) {
          console.log('[EntityChat:Streaming] Starting SSE stream');

          // Determine optimal model and tokens for this query
          const lastUserMsg = messages.filter((m) => m.role === 'user').pop()?.content || '';

          // Create TransformStream early so we can send fetching indicators
          const { readable, writable } = new TransformStream();
          const writer = writable.getWriter();
          const encoder = new TextEncoder();
          const decoder = new TextDecoder();

          // Detect URLs in the user's message
          const detectedUrls = extractUrlsFromText(lastUserMsg);

          if (detectedUrls.length > 0) {
            console.log('[EntityChat:Streaming] URLs detected:', detectedUrls);

            // Fetch the first URL (limit to one to control costs)
            const urlToFetch = detectedUrls[0];

            // Send "fetching" indicator to client
            await writer.write(
              encoder.encode(
                `data: ${JSON.stringify({
                  fetching: true,
                  fetchingUrl: urlToFetch,
                  done: false,
                })}\n\n`,
              ),
            );

            const extracted = await executeTavilyExtract(urlToFetch, env.TAVILY_API_KEY);

            if (extracted && extracted.success) {
              fetchedUrl = {
                url: extracted.url,
                title: extracted.title,
              };

              // Add extracted content as context for the model
              urlContext = `\n\n=== EXTRACTED CONTENT FROM URL ===\nURL: ${extracted.url}\nTitle: ${extracted.title}\n\n${extracted.content}\n\n=== END EXTRACTED CONTENT ===\n\nThe user has shared this link. Summarize the key points and answer any questions they have about it. If they just shared the link without a specific question, provide a helpful summary of what the content covers.`;

              console.log('[EntityChat:Streaming] URL content extracted, adding to context');
            } else {
              // Extraction failed - let model know
              urlContext = `\n\n[Note: The user shared a link (${urlToFetch}) but I couldn't access its content. It may be paywalled, require login, or be temporarily unavailable. Let the user know and offer to help if they can paste the content directly.]`;

              console.log('[EntityChat:Streaming] URL extraction failed');
            }

            // Clear fetching indicator
            await writer.write(
              encoder.encode(
                `data: ${JSON.stringify({
                  fetching: false,
                  done: false,
                })}\n\n`,
              ),
            );
          }

          const routing = getModelAndTokens({
            preset,
            userMessage: lastUserMsg,
            messageCount: messages.length,
            entityType: entity?.type,
          });
          console.log('[EntityChat:Streaming] Model routing:', routing);

          const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${key}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: routing.model,
              messages: openaiMessages,
              temperature: 0.7,
              max_completion_tokens: routing.maxTokens,
              stream: true,
              tools: [WEB_SEARCH_TOOL],
              tool_choice: 'auto',
            }),
          });

          if (!openaiRes.ok) {
            const errText = await openaiRes.text().catch(() => '');
            console.log('[EntityChat:Streaming] OpenAI error', {
              status: openaiRes.status,
              error: errText,
            });
            return j({ error: `openai_error: ${openaiRes.status}`, detail: errText }, 200);
          }

          (async () => {
            // Send initial SSE ping to establish line ending detection
            await writer.write(encoder.encode(': ping\n\n'));

            const reader = openaiRes.body.getReader();
            let buffer = '';
            let fullContent = '';
            let searchImages = [];

            // Track tool call accumulation - support multiple tool calls
            let toolCalls = []; // Array of { id, name, arguments }
            let currentToolCallIndex = -1;

            try {
              // eslint-disable-next-line no-constant-condition
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split(/\r?\n/);
                buffer = lines.pop() || '';

                for (const line of lines) {
                  const trimmed = line.trim();
                  if (!trimmed || trimmed === 'data: [DONE]') continue;
                  if (!trimmed.startsWith('data: ')) continue;

                  try {
                    const json = JSON.parse(trimmed.slice(6));
                    const delta = json.choices?.[0]?.delta?.content;

                    if (delta) {
                      fullContent += delta;
                      // Don't stream SAVE comments to client
                      if (!fullContent.includes('<!--SAVE:')) {
                        const sseData = JSON.stringify({ delta, done: false });
                        await writer.write(encoder.encode(`data: ${sseData}\n\n`));
                      }
                    }

                    // Check for tool calls - handle multiple
                    const toolCallDeltas = json.choices?.[0]?.delta?.tool_calls;
                    if (toolCallDeltas) {
                      for (const toolCallDelta of toolCallDeltas) {
                        const idx = toolCallDelta.index ?? 0;

                        // Initialize new tool call if needed
                        if (!toolCalls[idx]) {
                          toolCalls[idx] = { id: null, name: null, arguments: '' };
                        }

                        if (toolCallDelta.id) toolCalls[idx].id = toolCallDelta.id;
                        if (toolCallDelta.function?.name)
                          toolCalls[idx].name = toolCallDelta.function.name;
                        if (toolCallDelta.function?.arguments)
                          toolCalls[idx].arguments += toolCallDelta.function.arguments;
                      }
                    }
                  } catch (parseErr) {
                    console.log('[EntityChat:Streaming] Chunk parse error', {
                      line: trimmed.slice(0, 100),
                    });
                  }
                }
              }

              // Track search metadata
              let sources = undefined;
              let searchQueries = [];

              // Filter to only web_search tool calls with arguments
              const webSearchCalls = toolCalls.filter(
                (tc) => tc.name === 'web_search' && tc.arguments,
              );

              if (webSearchCalls.length > 0) {
                console.log('[EntityChat:Streaming] Web search triggered', {
                  searchCount: webSearchCalls.length,
                });

                // Notify client we're searching (show first query)
                let firstQuery = '';
                try {
                  const firstArgs = JSON.parse(webSearchCalls[0].arguments);
                  firstQuery = firstArgs.query || '';
                } catch {
                  const match = webSearchCalls[0].arguments.match(/"query"\s*:\s*"([^"]+)"/);
                  firstQuery = match ? match[1] : 'multiple topics';
                }
                const searchNotice =
                  webSearchCalls.length > 1
                    ? `${firstQuery} (+${webSearchCalls.length - 1} more)`
                    : firstQuery;
                await writer.write(
                  encoder.encode(
                    `data: ${JSON.stringify({ searching: true, query: searchNotice })}\n\n`,
                  ),
                );

                // Execute all searches in parallel
                const searchT0 = Date.now();
                const searchPromises = webSearchCalls.map(async (tc) => {
                  try {
                    let query;
                    try {
                      const args = JSON.parse(tc.arguments);
                      query = args.query;
                    } catch (parseErr) {
                      // Try regex extraction for malformed JSON
                      const match = tc.arguments.match(/"query"\s*:\s*"([^"]+)"/);
                      if (match) {
                        query = match[1];
                        console.log(
                          '[EntityChat:Streaming] Recovered query from malformed JSON:',
                          query,
                        );
                      } else {
                        console.log(
                          '[EntityChat:Streaming] Could not parse tool arguments:',
                          tc.arguments.slice(0, 200),
                        );
                        return { toolCallId: tc.id, query: null, results: null };
                      }
                    }

                    searchQueries.push(query);
                    const shouldIncludeImages = isVisualQuery(query) || isVisualQuery(lastUserMsg);
                    console.log('[EntityChat] Calling Tavily:', {
                      query: query,
                      includeImages: shouldIncludeImages,
                      isVisualQueryResult: isVisualQuery(query),
                    });
                    const results = await executeTavilySearch(query, env.TAVILY_API_KEY, {
                      includeImages: shouldIncludeImages,
                    });
                    return { toolCallId: tc.id, query, results };
                  } catch (err) {
                    console.log('[EntityChat:Streaming] Individual search error:', err);
                    return { toolCallId: tc.id, query: null, results: null };
                  }
                });

                const searchResults = await Promise.all(searchPromises);
                const searchLatency = Date.now() - searchT0;

                const successfulSearches = searchResults.filter(
                  (sr) => sr.results && sr.results.results.length > 0,
                );
                console.log('[EntityChat:Streaming] Searches complete', {
                  total: searchResults.length,
                  successful: successfulSearches.length,
                  latency: searchLatency,
                });

                if (successfulSearches.length > 0) {
                  // Build follow-up messages with ALL tool results
                  const assistantToolCalls = successfulSearches.map((sr) => ({
                    id: sr.toolCallId,
                    type: 'function',
                    function: {
                      name: 'web_search',
                      arguments: JSON.stringify({ query: sr.query }),
                    },
                  }));

                  const toolResultMessages = successfulSearches.map((sr) => ({
                    role: 'tool',
                    tool_call_id: sr.toolCallId,
                    content: JSON.stringify(sr.results),
                  }));

                  const followUpMessages = [
                    ...openaiMessages,
                    {
                      role: 'assistant',
                      content: null,
                      tool_calls: assistantToolCalls,
                    },
                    ...toolResultMessages,
                  ];

                  // Second API call for final response - with real streaming
                  const followUpRes = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                      Authorization: `Bearer ${key}`,
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      model: 'gpt-4.1',
                      messages: followUpMessages,
                      temperature: 0.7,
                      max_completion_tokens: 800,
                      stream: true,
                    }),
                  });

                  // Stream the follow-up response to client
                  const followUpReader = followUpRes.body.getReader();
                  const followUpDecoder = new TextDecoder();
                  let followUpBuffer = '';
                  let readerDone = false;

                  while (!readerDone) {
                    const result = await followUpReader.read();
                    readerDone = result.done;
                    if (readerDone) break;
                    const value = result.value;

                    followUpBuffer += followUpDecoder.decode(value, { stream: true });

                    // Process complete lines only
                    const lines = followUpBuffer.split('\n');
                    followUpBuffer = lines.pop() || ''; // Keep incomplete line in buffer

                    for (const line of lines) {
                      const trimmed = line.trim();
                      if (!trimmed.startsWith('data:')) continue;

                      const jsonStr = trimmed.replace(/^data:\s*/, '').trim();
                      if (jsonStr === '[DONE]') continue;

                      try {
                        const json = JSON.parse(jsonStr);
                        const delta = json.choices?.[0]?.delta?.content;
                        if (delta) {
                          fullContent += delta;
                          await writer.write(
                            encoder.encode(`data: ${JSON.stringify({ delta, done: false })}\n\n`),
                          );
                        }
                      } catch {
                        // Skip malformed JSON
                      }
                    }
                  }

                  // Process any remaining buffer
                  if (followUpBuffer.trim()) {
                    const trimmed = followUpBuffer.trim();
                    if (trimmed.startsWith('data:')) {
                      const jsonStr = trimmed.replace(/^data:\s*/, '').trim();
                      if (jsonStr !== '[DONE]') {
                        try {
                          const json = JSON.parse(jsonStr);
                          const delta = json.choices?.[0]?.delta?.content;
                          if (delta) {
                            fullContent += delta;
                            await writer.write(
                              encoder.encode(`data: ${JSON.stringify({ delta, done: false })}\n\n`),
                            );
                          }
                        } catch {
                          // Skip
                        }
                      }
                    }
                  }

                  // Combine all sources
                  sources = successfulSearches.flatMap((sr) =>
                    sr.results.results.map((r) => ({ title: r.title, url: r.url })),
                  );

                  console.log('[EntityChat] successfulSearches structure:', {
                    count: successfulSearches.length,
                    firstItem: successfulSearches[0] ? Object.keys(successfulSearches[0]) : 'empty',
                    firstItemImages: successfulSearches[0]?.images,
                    firstItemResultsImages: successfulSearches[0]?.results?.images,
                  });

                  // Collect images from search results
                  // Structure: sr.results contains Tavily response with images
                  successfulSearches.forEach((sr) => {
                    if (sr.results.images && sr.results.images.length > 0) {
                      searchImages.push(...sr.results.images);
                    }
                  });

                  console.log('[EntityChat] Images collected:', {
                    searchImagesCount: searchImages.length,
                    searchImages: searchImages.slice(0, 2),
                  });
                }
              }

              // Fallback: if tool calls were made but we have no content, respond without search
              if (webSearchCalls.length > 0 && !fullContent) {
                console.log(
                  '[EntityChat:Streaming] Search fallback - responding without search results',
                );

                const fallbackRes = await fetch('https://api.openai.com/v1/chat/completions', {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${key}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    model: 'gpt-4.1',
                    messages: [
                      ...openaiMessages,
                      {
                        role: 'system',
                        content:
                          'Web search is temporarily unavailable. Please respond based on your knowledge, and let the user know you could not search for the latest information.',
                      },
                    ],
                    temperature: 0.7,
                    max_completion_tokens: 600,
                  }),
                });

                const fallbackData = await fallbackRes.json();
                fullContent =
                  fallbackData?.choices?.[0]?.message?.content ??
                  'I had trouble searching for that information. Could you try rephrasing your question?';

                // Stream the fallback content
                const words = fullContent.split(' ');
                for (let i = 0; i < words.length; i += 3) {
                  const chunk = words.slice(i, i + 3).join(' ') + ' ';
                  await writer.write(
                    encoder.encode(`data: ${JSON.stringify({ delta: chunk, done: false })}\n\n`),
                  );
                  await new Promise((resolve) => setTimeout(resolve, 15));
                }
              }

              // For final event, use first search query or combined
              const searchQuery = searchQueries.length > 0 ? searchQueries.join(' | ') : undefined;

              // Extract smart save suggestion (inline from model)
              const { suggestion: smartSuggestion, cleanContent } =
                extractSaveSuggestion(fullContent);

              // Fall back to pattern detection if no smart suggestion
              const saveable = smartSuggestion
                ? { detected: true, type: smartSuggestion.type, smart: true }
                : detectSaveableContent(cleanContent);

              // Use smart suggestion if available
              const save_suggestion = smartSuggestion || null;

              // Use cleaned content (without suggestion block) for display
              fullContent = cleanContent;

              // Detect space promotion suggestion
              const promotion = detectSpacePromotion(fullContent, messages.length);

              const latency = Date.now() - t0;
              // Strip SAVE comment and markdown images before sending to client
              const displayContent = fullContent
                .replace(/<!--SAVE:\{.*?\}-->/gs, '')
                .replace(/!\[.*?\]\(.*?\)/g, '') // Strip markdown images
                .trim();
              const finalData = JSON.stringify({
                done: true,
                full_content: displayContent,
                saveable,
                save_suggestion,
                promotion,
                latency_ms: latency,
                sources: sources,
                images: searchImages.length > 0 ? searchImages.slice(0, 2) : undefined,
                search_query: searchQuery,
                fetchedUrl: fetchedUrl,
              });
              await writer.write(encoder.encode(`data: ${finalData}\n\n`));

              console.log('[EntityChat:Streaming] Complete', {
                latency_ms: latency,
                content_length: fullContent.length,
                has_saveable: saveable?.detected,
                has_promotion: promotion?.suggested,
                used_search: !!searchQuery,
                images_sent: searchImages.length > 0 ? searchImages.slice(0, 2) : undefined,
              });
            } catch (streamErr) {
              console.log('[EntityChat:Streaming] Stream error', { error: String(streamErr) });
              const errorData = JSON.stringify({
                error: String(streamErr),
                done: true,
                full_content: fullContent,
              });
              await writer.write(encoder.encode(`data: ${errorData}\n\n`));
            } finally {
              await writer.close();
            }
          })();

          return new Response(readable, {
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Content-Type': 'text/event-stream; charset=utf-8',
              'Cache-Control': 'no-cache, no-transform',
              Connection: 'keep-alive',
            },
          });
        }

        // =========================
        // NON-STREAMING ENTITY CHAT
        // =========================
        // Determine optimal model and tokens for this query
        const lastUserMsg = messages.filter((m) => m.role === 'user').pop()?.content || '';
        const routing = getModelAndTokens({
          preset,
          userMessage: lastUserMsg,
          messageCount: messages.length,
          entityType: entity?.type,
        });
        console.log('[EntityChat] Model routing:', routing);

        try {
          const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${key}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: routing.model,
              messages: openaiMessages,
              temperature: 0.7,
              max_completion_tokens: routing.maxTokens,
              tools: [WEB_SEARCH_TOOL],
              tool_choice: 'auto',
            }),
          });

          const oj = await res.json();
          let latency = Date.now() - t0;

          if (!res.ok) {
            console.log('[EntityChat] API error', { error: oj.error, latency_ms: latency });
            return j(
              { error: 'entity_chat_failed', detail: oj.error?.message, latency_ms: latency },
              200,
            );
          }

          // Check for tool call
          const toolCall = oj?.choices?.[0]?.message?.tool_calls?.[0];
          let content = oj?.choices?.[0]?.message?.content ?? '';
          let sources = undefined;
          let searchQuery = undefined;

          if (toolCall?.function?.name === 'web_search') {
            try {
              const args = JSON.parse(toolCall.function.arguments);
              searchQuery = args.query;

              console.log('[EntityChat] Web search triggered', { query: searchQuery });

              const searchT0 = Date.now();
              const searchResults = await executeTavilySearch(searchQuery, env.TAVILY_API_KEY);
              const searchLatency = Date.now() - searchT0;

              console.log('[EntityChat] Search complete', {
                resultCount: searchResults?.results?.length || 0,
                latency: searchLatency,
              });

              if (searchResults && searchResults.results.length > 0) {
                // Build follow-up messages
                const followUpMessages = [
                  ...openaiMessages,
                  {
                    role: 'assistant',
                    content: null,
                    tool_calls: [
                      {
                        id: toolCall.id,
                        type: 'function',
                        function: toolCall.function,
                      },
                    ],
                  },
                  {
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: JSON.stringify(searchResults),
                  },
                ];

                // Second API call
                const followUpRes = await fetch('https://api.openai.com/v1/chat/completions', {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${key}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    model: 'gpt-4.1',
                    messages: followUpMessages,
                    temperature: 0.7,
                    max_completion_tokens: 800,
                  }),
                });

                const followUpData = await followUpRes.json();
                content = followUpData?.choices?.[0]?.message?.content ?? '';
                sources = searchResults.results.map((r) => ({ title: r.title, url: r.url }));
                latency = Date.now() - t0;
              }
            } catch (searchErr) {
              console.log('[EntityChat] Search error:', searchErr);
            }
          }

          // Extract smart save suggestion (inline from model)
          const { suggestion: smartSuggestion, cleanContent } = extractSaveSuggestion(content);

          // Fall back to pattern detection if no smart suggestion
          const saveable = smartSuggestion
            ? { detected: true, type: smartSuggestion.type, smart: true }
            : detectSaveableContent(cleanContent);

          // Use smart suggestion if available
          const save_suggestion = smartSuggestion || null;

          // Use cleaned content (without suggestion block) for display
          content = cleanContent;

          // Detect space promotion suggestion
          const promotion = detectSpacePromotion(content, messages.length);

          console.log('[EntityChat] Complete', {
            latency_ms: latency,
            content_length: content.length,
            has_saveable: saveable?.detected,
            has_promotion: promotion?.suggested,
            used_search: !!searchQuery,
          });

          return j({
            content,
            saveable,
            save_suggestion,
            promotion,
            latency_ms: latency,
            sources,
            search_query: searchQuery,
          });
        } catch (err) {
          const latency = Date.now() - t0;
          console.log('[EntityChat] Error', { error: String(err), latency_ms: latency });
          return j({ error: 'entity_chat_failed', detail: String(err), latency_ms: latency }, 200);
        }
      }

      // Helper: Extract smart save suggestion from response
      function extractSaveSuggestion(content) {
        if (!content) return { suggestion: null, cleanContent: content };

        // Look for <!--SAVE:{...}--> pattern (forgiving of whitespace and slight variations)
        const savePattern = /<!--\s*SAVE\s*:\s*(\{[\s\S]*?\})\s*-->/i;
        const match = content.match(savePattern);

        if (!match) {
          return { suggestion: null, cleanContent: content };
        }

        try {
          // Clean up the JSON string (remove any stray newlines or formatting)
          const jsonStr = match[1]
            .replace(/[\n\r]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          const suggestion = JSON.parse(jsonStr);

          // Validate required fields
          if (!suggestion.type || !suggestion.title) {
            console.log('[SaveSuggestion] Invalid suggestion - missing type or title');
            return { suggestion: null, cleanContent: content };
          }

          // Validate type
          if (!['todo', 'habit', 'note'].includes(suggestion.type)) {
            console.log('[SaveSuggestion] Invalid type:', suggestion.type);
            return { suggestion: null, cleanContent: content };
          }

          // Clean up steps if present
          if (suggestion.steps) {
            if (!Array.isArray(suggestion.steps)) {
              delete suggestion.steps;
            } else {
              // Limit to 12 steps, clean strings
              suggestion.steps = suggestion.steps
                .slice(0, 12)
                .map((s) => String(s).trim())
                .filter((s) => s.length > 0 && s.length < 200);

              if (suggestion.steps.length === 0) {
                delete suggestion.steps;
              }
            }
          }

          // Remove the suggestion block from displayed content
          const cleanContent = content.replace(savePattern, '').trim();

          console.log('[SaveSuggestion] Extracted:', {
            type: suggestion.type,
            title: suggestion.title,
            hasSteps: !!suggestion.steps,
            stepCount: suggestion.steps?.length || 0,
          });

          return { suggestion, cleanContent };
        } catch (parseErr) {
          console.log('[SaveSuggestion] Parse error:', parseErr.message);
          return { suggestion: null, cleanContent: content };
        }
      }

      // Helper: Detect saveable content in response
      function detectSaveableContent(content) {
        if (!content) return { detected: false };

        const lower = content.toLowerCase();

        // Check for bullet list (potential checklist)
        const bulletPattern = /^[\s]*[-"*]\s+.+$/gm;
        const bullets = content.match(bulletPattern);
        const hasBulletList = bullets && bullets.length >= 2;

        // Check for numbered list
        const numberedPattern = /^[\s]*\d+[.)]\s+.+$/gm;
        const numbered = content.match(numberedPattern);
        const hasNumberedList = numbered && numbered.length >= 2;

        // Check for save suggestion phrases
        const savePhrases = [
          'save this',
          'worth saving',
          'keep this',
          'worth keeping',
          'as a checklist',
          'save these steps',
          'bookmark this',
        ];
        const hasSaveSuggestion = savePhrases.some((phrase) => lower.includes(phrase));

        // Determine type
        const isChecklist = hasBulletList || hasNumberedList;

        if (!isChecklist && !hasSaveSuggestion) {
          return { detected: false };
        }

        // Extract checklist items if present
        let checklistItems = null;
        if (isChecklist) {
          const allItems = [...(bullets || []), ...(numbered || [])];
          checklistItems = allItems
            .map((item) => item.replace(/^[\s]*[-"*\d.)]+\s+/, '').trim())
            .filter((item) => item.length > 0 && item.length < 200)
            .slice(0, 10);
        }

        return {
          detected: true,
          type: isChecklist ? 'checklist' : 'note',
          checklist_items: checklistItems,
          has_save_suggestion: false,
        };
      }

      // Helper: Detect space promotion suggestion
      function detectSpacePromotion(content, messageCount) {
        if (!content) return { suggested: false };

        const lower = content.toLowerCase();

        // Check if AI suggested a space
        const spacePatterns = [
          'create a space',
          'set up a space',
          'make a space',
          'becoming a project',
          'becoming a solid project',
          'want me to set up a space',
          'want me to create a space',
        ];

        const aiSuggested = spacePatterns.some((pattern) => lower.includes(pattern));

        // Only surface promotion if AI explicitly suggested it
        // Don't auto-suggest based on message count alone
        if (!aiSuggested) {
          return { suggested: false };
        }

        return {
          suggested: true,
          reason: 'AI detected this may work better as a Space with multiple tracked items.',
          source: 'ai_suggested',
        };
      }

      // =========================
      // === ORGANIZE DAY (v1.0) ===
      // AI-powered task scheduling for Morning Brief
      // Assigns unscheduled tasks to time blocks based on:
      // - Available time per block
      // - Task estimates and due dates
      // - Calendar context
      // - Smart placement rules
      // =========================
      if (type === 'organize-day') {
        const tasks = Array.isArray(body.tasks) ? body.tasks : [];
        const calendarEvents = Array.isArray(body.calendarEvents) ? body.calendarEvents : [];
        const blocks = body.blocks || {};
        const currentHour = body.currentHour ?? new Date().getHours();

        // Validation
        if (tasks.length === 0) {
          return j({
            assignments: [],
            overflow: [],
            reasoning: [],
            summary: 'No tasks to organize.',
            latency_ms: 0,
          });
        }

        // Filter to only unassigned, unlocked tasks
        const tasksToAssign = tasks.filter((t) => !t.isLockedIn && !t.currentBlock);

        if (tasksToAssign.length === 0) {
          return j({
            assignments: [],
            overflow: [],
            reasoning: [],
            summary: 'All tasks are already assigned or locked.',
            latency_ms: 0,
          });
        }

        // Build context strings for the prompt
        const taskList = tasksToAssign
          .map((t) => {
            const parts = [`- ${t.id}: "${t.title}"`];
            parts.push(`  total_minutes: ${t.totalMinutes || t.estimateMinutes || 30}`);
            parts.push(`  energy: ${t.energyType || 'administrative'}`);
            parts.push(`  type: ${t.type || 'todo'}`);
            // Include tags if available (comma-separated)
            if (t.tags && Array.isArray(t.tags) && t.tags.length > 0) {
              parts.push(`  tags: ${t.tags.slice(0, 5).join(', ')}`);
            }
            if (t.timeWindowPreference) {
              parts.push(`  prefers: ${t.timeWindowPreference}`);
            }
            return parts.join('\n');
          })
          .join('\n');

        const calendarContext =
          calendarEvents.length > 0
            ? calendarEvents
                .map((e) => `- ${e.title}: ${e.startAt} to ${e.endAt} (${e.durationMinutes}min)`)
                .join('\n')
            : 'No calendar events today.';

        const blockContext = `Morning: ${blocks.morning?.realisticAvailableMinutes ?? blocks.morning?.availableMinutes ?? 0} min
Afternoon: ${blocks.day?.realisticAvailableMinutes ?? blocks.day?.availableMinutes ?? 0} min
Evening: ${blocks.evening?.realisticAvailableMinutes ?? blocks.evening?.availableMinutes ?? 0} min`;

        const organizePrompt = `You are a task scheduler. Place tasks into time blocks to create a calm, focused day.

=== TIME ===
Current hour: ${currentHour}:00
Past blocks are unavailable.

=== CALENDAR ===
${calendarContext}

=== CAPACITY ===
${blockContext}
Use max 85% of each block.

=== TASKS ===
${taskList}

Each task includes:
- id, title
- total_minutes (includes prep/cooldown, use for capacity)
- energy: deep_focus | administrative | physical | social | quick
- type: todo | habit
- tags: topical labels (work, health, finance, creative, etc.)
- prefers: time_window_preference if set

=== SCHEDULING RULES ===
1. Never schedule tasks in past blocks
2. Never exceed 85% of block capacity
3. Respect time_window_preference when set

4. Use energy types to shape task sequencing and flow
5. Place deep_focus tasks in the longest uninterrupted block
6. Group tasks with shared tags to reduce context switching
7. Avoid stacking physical or social tasks back-to-back
8. Spread habits across blocks — avoid clustering

=== GROUPING PRINCIPLES ===
- Tasks sharing tags (e.g. "work", "finance") benefit from being adjacent
- Similar energy types flow better together
- Habits should feel integrated, not front-loaded
- Reduce mental overhead by minimizing topic jumps

=== OUTPUT ===
JSON only, no markdown:
{
  "assignments": [{ "taskId": "...", "block": "morning|day|evening", "reason": "5-10 words" }],
  "overflow": [{ "taskId": "...", "reason": "5-10 words" }],
  "reasoning": ["Pattern or decision 1", "Pattern 2", "Pattern 3 if needed"],
  "summary": "One calm sentence about the plan"
}

=== REASONING GUIDELINES ===
Provide 2-4 short bullets explaining your approach. Focus on:
- Grouping patterns (e.g. "Batched your work tasks together")
- Energy flow (e.g. "Put focus work in the morning when you're fresh")
- Habit placement (e.g. "Spread your habits throughout the day")
- Preference respect (e.g. "Honored your morning preference for the gym")

Do NOT mention in reasoning:
- Specific minute counts or capacity numbers
- Buffer calculations
- Energy type names (use plain language like "heavier tasks" or "quick wins")
- Technical terms

Keep the tone warm and reassuring — like a helpful friend explaining the plan.`;

        const t0 = Date.now();

        try {
          const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${key}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [{ role: 'system', content: organizePrompt }],
              temperature: 0.2,
              max_tokens: 900,
              response_format: { type: 'json_object' },
            }),
          });

          const oj = await res.json();
          const latency = Date.now() - t0;

          if (!res.ok) {
            console.log('[organize-day] API error', { error: oj.error, latency_ms: latency });
            return j(
              {
                error: 'organize_failed',
                detail: oj.error?.message,
                assignments: [],
                overflow: tasksToAssign.map((t) => ({ taskId: t.id, reason: 'AI unavailable' })),
                reasoning: [],
                summary: "Couldn't organize automatically. Tasks left flexible.",
                latency_ms: latency,
              },
              200,
            );
          }

          const rawContent = oj?.choices?.[0]?.message?.content ?? '';

          let parsed = safeParseJson(rawContent);

          if (!parsed) {
            console.log('[organize-day] Parse failed', { preview: rawContent.substring(0, 200) });
            return j(
              {
                error: 'parse_failed',
                assignments: [],
                overflow: tasksToAssign.map((t) => ({ taskId: t.id, reason: 'Parse error' })),
                reasoning: [],
                summary: "Couldn't parse response. Tasks left flexible.",
                latency_ms: latency,
              },
              200,
            );
          }

          // Validate and extract
          const validBlocks = ['morning', 'day', 'evening'];
          const taskIds = new Set(tasksToAssign.map((t) => t.id));
          const assignedIds = new Set();

          const assignments = (Array.isArray(parsed.assignments) ? parsed.assignments : [])
            .filter((a) => {
              if (!taskIds.has(a.taskId)) return false;
              if (!validBlocks.includes(a.block)) return false;
              if (assignedIds.has(a.taskId)) return false;
              assignedIds.add(a.taskId);
              return true;
            })
            .map((a) => ({
              taskId: a.taskId,
              block: a.block,
              reason: String(a.reason || '').substring(0, 50),
            }));

          const overflowIds = new Set();
          const overflow = (Array.isArray(parsed.overflow) ? parsed.overflow : [])
            .filter((o) => {
              if (!taskIds.has(o.taskId)) return false;
              if (assignedIds.has(o.taskId)) return false;
              if (overflowIds.has(o.taskId)) return false;
              overflowIds.add(o.taskId);
              return true;
            })
            .map((o) => ({
              taskId: o.taskId,
              reason: String(o.reason || '').substring(0, 50),
            }));

          // Catch any unaccounted tasks
          for (const task of tasksToAssign) {
            if (!assignedIds.has(task.id) && !overflowIds.has(task.id)) {
              overflow.push({ taskId: task.id, reason: 'Not assigned' });
            }
          }

          const summary =
            typeof parsed.summary === 'string' && parsed.summary.length > 0
              ? parsed.summary.substring(0, 150)
              : `Scheduled ${assignments.length} of ${tasksToAssign.length} tasks.`;

          const reasoning = Array.isArray(parsed.reasoning)
            ? parsed.reasoning.map((r) => String(r).substring(0, 150)).slice(0, 4)
            : [];

          console.log('[organize-day] Success', {
            assigned: assignments.length,
            overflow: overflow.length,
            latency_ms: latency,
          });

          return j({
            assignments,
            overflow,
            reasoning,
            summary,
            latency_ms: latency,
          });
        } catch (err) {
          const latency = Date.now() - t0;
          console.log('[organize-day] Error', { error: String(err), latency_ms: latency });
          return j(
            {
              error: 'organize_failed',
              detail: String(err),
              assignments: [],
              overflow: tasksToAssign.map((t) => ({ taskId: t.id, reason: 'Request failed' })),
              reasoning: [],
              summary: 'Request failed. Tasks left flexible.',
              latency_ms: latency,
            },
            200,
          );
        }
      }

      // =========================
      // === SPACE CHAT SAVE (v2.9) ===
      // Single call classify + enrich for saving chat responses
      // Uses Mind Drop classification logic adapted for chat context
      // v2.9: Added extracted_days, fixed frequency parsing
      // =========================
      if (type === 'space-chat-save') {
        const userMessage = body.userMessage || '';
        const assistantMessage = body.assistantMessage || '';
        const spaceName = body.spaceName || '';

        const spaceChatSavePrompt = `You classify and enrich saved chat responses for Gremly, a productivity app.
 
 === CONTEXT ===
 USER MESSAGE: "${userMessage.substring(0, 500)}"
 SPACE: "${spaceName}"
 AI RESPONSE TO SAVE:
 """
 ${assistantMessage.substring(0, 2000)}
 """
 
 === CLASSIFICATION RULES ===
 
 IMPORTANT: Classification is based primarily on the USER MESSAGE, not the AI response.
 The AI response content doesn't change what the user intended.
 
 **STEP 1: TODO - Check USER MESSAGE for task/reminder intent**
 
 If the USER MESSAGE contains ANY of these patterns  TODO:
 - "remind me to...", "remind me about..."
 - "don't let me forget...", "don't forget to..."
 - "I need to...", "I have to...", "I should..." (+ specific action)
 - "add a todo", "make this a task", "add to my list"
 - "buy...", "get...", "pick up..." (shopping/errand actions)
 
 TODO examples:
 - "Remind me to buy new running shoes this weekend"  TODO
 - "Don't let me forget to call mom"  TODO
 - "I need to book a dentist appointment"  TODO
 
 NOT todos (these are questions/advice requests  LOG):
 - "What should I buy for running?"  LOG (asking for advice)
 - "How do I book an appointment?"  LOG (asking how)
 - "What do I need to start cycling?"  LOG (asking for list)
 
 **STEP 2: HABIT - Check for commitment to track recurring behavior**
 
 HABIT requires EITHER:
 
 A) EXPLICIT FREQUENCY in conversation:
  - "daily", "every day", "every morning/evening/night"
  - "weekly", "every week", "once a week"
  - "twice a week", "2x per week", "3x per week"
  - "on Tuesdays", "on weekends", specific days
  - "monthly", "every month"
 
 B) STOP/QUIT + CONCRETE BEHAVIOR (even without explicit frequency):
  Patterns: "stop", "quit", "give up", "no more", "avoid", "cut out"
  Also softer: "should stop", "need to stop", "want to stop", "going to stop"
  
  - "I want to stop checking my phone when I wake up"  HABIT/break 
  - "I should stop snacking after dinner"  HABIT/break 
  - "You're right, I should stop doing that"  HABIT/break  (if "that" refers to trackable behavior)
  - "No social media after 9pm"  HABIT/break 
  - "I need to quit scrolling before bed"  HABIT/break 
 
 HABIT subtypes:
 - start_habit: Building/doing something (exercise, meditate, read, run)
 - break_habit: Stopping/avoiding something (stop smoking, quit scrolling, no phone)
 
 NOT habits:
 - "Drink more water"  LOG (vague, no frequency)
 - "Exercise more"  LOG (no specific commitment)
 - "Tips for building a habit"  LOG (asking for advice)
 
 **STEP 3: LOG subtypes (when not TODO or HABIT)**
 
 - journal: Emotional reflection, feelings, gratitude, struggles
 - idea: Explicit brainstorming ("what if", "maybe I could", "idea:")
 - general: Everything else - advice, plans, lists, reference material (DEFAULT)
 
 **DECISION TREE:**
 1. User message has reminder/task intent?  TODO
 2. Explicit frequency OR stop/quit + behavior?  HABIT 
 3. Emotional/reflective content?  LOG/journal
 4. Brainstorming language?  LOG/idea
 5. Default  LOG/general
 
 === ENRICHMENT ===
 
 TITLE: 3-7 words capturing the topic
 - For TODO: Action verb + object ("Buy Running Shoes", "Call Mom")
 - For HABIT: Activity name ("Morning Run", "No Phone After 9pm")
 - For LOG: Topic/theme ("Running Gear Guide", "Stretching Routine")
 
 TAGS: 2-4 relevant lowercase tags with hyphens
 
 FREQUENCY (habits only):
 Parse carefully from conversation. COUNT THE ACTUAL NUMBER.
 
 Word-to-number mapping:
 - "once" = 1
 - "twice" or "two times" = 2
 - "three times" or "thrice" = 3
 - "four times" = 4
 - "five times" = 5
 
 Day counting - COUNT THE DAYS MENTIONED:
 - "Mondays and Fridays" = 2 days  "2x/week"
 - "Tuesdays and Thursdays" = 2 days  "2x/week"
 - "Monday, Wednesday, Friday" = 3 days  "3x/week"
 - "Tuesdays, Thursdays and Sundays" = 3 days  "3x/week"
 
 Examples:
 - "twice a week"  "2x/week" (NOT 3x/week!)
 - "two times per week"  "2x/week"
 - "three times a week" or "3x per week"  "3x/week"
 - "Mondays and Fridays"  "2x/week" (2 days = 2x)
 - "every day" or "daily"  "daily"
 - "once a week" or "weekly"  "weekly"
 
 DAYS (habits only):
 If specific days are mentioned, extract them as numbers (0=Sunday, 1=Monday, ... 6=Saturday):
 - "Mondays and Fridays"  [1, 5]
 - "Tuesdays and Thursdays"  [2, 4]
 - "on weekends"  [0, 6]
 - "Monday, Wednesday, Friday"  [1, 3, 5]
 If no specific days mentioned, return null.
 
 TIME_ESTIMATE (minutes: 5, 10, 15, 30, 45, 60, 90, 120):
 Activity-based defaults:
 - Running/jogging: 30-45 min
 - Gym workout: 45-60 min
 - Meditation: 10-15 min
 - Reading: 20-30 min
 - Quick habits (water, vitamins): 5 min
 - Phone calls: 15-30 min
 - Shopping errands: 30-60 min
 
 HAS_LIST: true if response contains bullets or numbered items
 
 === OUTPUT ===
 
 Return ONLY valid JSON:
 {
  "type": "habit" | "todo" | "log",
  "subtype": "start_habit" | "break_habit" | "general" | "idea" | "journal",
  "confidence": 0.0-1.0,
  "title": "3-7 Word Title",
  "tags": ["tag1", "tag2"],
  "frequency": "daily" | "2x/week" | "3x/week" | "weekly" | null,
  "days": [1, 5] | null,
  "timeEstimateMinutes": number | null,
  "hasList": boolean
 }`;

        const t0 = Date.now();

        try {
          const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${key}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [{ role: 'system', content: spaceChatSavePrompt }],
              temperature: 0.3,
              max_tokens: 250,
              response_format: { type: 'json_object' },
            }),
          });

          const oj = await res.json();
          const latency = Date.now() - t0;

          if (!res.ok) {
            console.log('[space-chat-save] API error', { error: oj.error, latency_ms: latency });
            return j({ error: 'classification_failed', latency_ms: latency }, 200);
          }

          const rawContent = oj?.choices?.[0]?.message?.content ?? '{}';
          let parsed;
          try {
            parsed = JSON.parse(rawContent);
          } catch {
            console.log('[space-chat-save] Parse error', { raw: rawContent });
            return j({ error: 'parse_failed', latency_ms: latency }, 200);
          }

          // Validate and normalize type
          const validTypes = ['habit', 'todo', 'log'];
          let resultType = String(parsed.type || 'log').toLowerCase();
          if (!validTypes.includes(resultType)) resultType = 'log';

          // Validate and normalize subtype
          const validSubtypes = {
            habit: ['start_habit', 'break_habit'],
            todo: [],
            log: ['general', 'idea', 'journal'],
          };

          let subtype = parsed.subtype;
          if (resultType === 'habit') {
            subtype = validSubtypes.habit.includes(subtype) ? subtype : 'start_habit';
          } else if (resultType === 'log') {
            subtype = validSubtypes.log.includes(subtype) ? subtype : 'general';
          } else {
            subtype = null;
          }

          // Validate confidence
          let confidence = Number(parsed.confidence);
          if (!Number.isFinite(confidence)) confidence = 0.8;
          confidence = Math.max(0, Math.min(1, confidence));

          // Validate and sanitize title
          let title = String(parsed.title || '').trim();
          if (title.length < 3 || title.length > 60) {
            // Fallback: use first part of user's question
            title = userMessage.split(/[.?!]/)[0].trim();
            if (title.length > 50) title = title.substring(0, 47) + '...';
            if (title.length < 3) title = 'Saved From Chat';
          }
          // Title case
          title = title
            .split(/\s+/)
            .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
            .join(' ');

          // Validate tags
          let tags = Array.isArray(parsed.tags) ? parsed.tags : [];
          tags = tags
            .map((t) =>
              String(t)
                .toLowerCase()
                .replace(/\s+/g, '-')
                .replace(/[^a-z0-9-]/g, ''),
            )
            .filter((t) => t.length >= 2 && t.length <= 30)
            .filter((t) => !isStopTag(t))
            .slice(0, 5);

          // Validate frequency (habits only)
          let frequency = null;
          if (resultType === 'habit') {
            frequency = parsed.frequency || 'daily';
          }

          // Validate days (habits only)
          let days = null;
          if (resultType === 'habit' && Array.isArray(parsed.days) && parsed.days.length > 0) {
            const validDays = parsed.days
              .map((d) => Number(d))
              .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
            if (validDays.length > 0) {
              days = [...new Set(validDays)].sort((a, b) => a - b);
            }
          }
          // Fallback: parse from user message
          if (resultType === 'habit' && !days) {
            days = parseDaysFromText(userMessage);
          }

          // Validate time estimate
          let timeEstimateMinutes = null;
          if (resultType === 'habit' || resultType === 'todo') {
            const allowed = [5, 10, 15, 30, 45, 60, 90, 120];
            const num = Number(parsed.timeEstimateMinutes);
            if (Number.isFinite(num)) {
              timeEstimateMinutes = allowed.reduce((prev, curr) =>
                Math.abs(curr - num) < Math.abs(prev - num) ? curr : prev,
              );
            }
          }

          // Validate hasList
          const hasList = Boolean(parsed.hasList);

          console.log('[space-chat-save] Success', {
            type: resultType,
            subtype,
            title: title.substring(0, 30),
            tags_count: tags.length,
            has_frequency: !!frequency,
            has_days: !!days,
            has_time: !!timeEstimateMinutes,
            latency_ms: latency,
          });

          return j({
            type: resultType,
            subtype,
            confidence,
            title,
            tags,
            frequency,
            days,
            timeEstimateMinutes,
            hasList,
            latency_ms: latency,
          });
        } catch (err) {
          const latency = Date.now() - t0;
          console.log('[space-chat-save] Error', { error: String(err), latency_ms: latency });
          return j({ error: 'request_failed', detail: String(err) }, 200);
        }
      }

      // =========================
      // === TRANSCRIPTION ===
      // Voice-to-text via OpenAI Whisper
      // =========================
      if (type === 'transcribe') {
        const audio = body.audio;
        const format = body.format || 'm4a';

        if (!audio) {
          console.log('[Transcribe] Missing audio data');
          return j({ error: 'missing_audio' }, 400);
        }

        // Validate audio size (25MB limit for Whisper)
        const estimatedBytes = (audio.length * 3) / 4;
        if (estimatedBytes > 25 * 1024 * 1024) {
          console.log('[Transcribe] Audio too large', {
            size_mb: Math.round(estimatedBytes / 1024 / 1024),
          });
          return j({ error: 'audio_too_large', max_mb: 25 }, 400);
        }

        // Supported formats
        const supportedFormats = ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm'];
        const normalizedFormat = format.toLowerCase().replace('.', '');
        if (!supportedFormats.includes(normalizedFormat)) {
          console.log('[Transcribe] Unsupported format', { format });
          return j({ error: 'unsupported_format', supported: supportedFormats }, 400);
        }

        const t0 = Date.now();

        try {
          // Convert base64 to binary
          const binaryString = atob(audio);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }

          // Create form data for Whisper API
          const formData = new FormData();
          formData.append(
            'file',
            new Blob([bytes], { type: `audio/${normalizedFormat}` }),
            `audio.${normalizedFormat}`,
          );
          formData.append('model', 'whisper-1');
          formData.append('response_format', 'json');

          console.log('[Transcribe] Calling Whisper API', {
            size_kb: Math.round(bytes.length / 1024),
            format: normalizedFormat,
          });

          const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${key}`,
            },
            body: formData,
          });

          const latency = Date.now() - t0;

          if (!whisperRes.ok) {
            const errText = await whisperRes.text().catch(() => '');
            console.log('[Transcribe] Whisper API error', {
              status: whisperRes.status,
              error: errText,
              latency_ms: latency,
            });
            return j(
              {
                error: 'transcription_failed',
                status: whisperRes.status,
                detail: errText,
              },
              200,
            );
          }

          const result = await whisperRes.json();
          const text = result.text || '';

          console.log('[Transcribe] Success', {
            text_length: text.length,
            text_preview: text.substring(0, 50),
            latency_ms: latency,
          });

          return j({
            text,
            duration: result.duration,
            language: result.language || 'en',
            latency_ms: latency,
          });
        } catch (err) {
          const latency = Date.now() - t0;
          console.log('[Transcribe] Error', {
            error: String(err),
            latency_ms: latency,
          });
          return j(
            {
              error: 'transcription_error',
              detail: String(err?.message || 'unknown'),
            },
            200,
          );
        }
      }

      // =========================
      // === PHASE 0: MULTI-ENTITY DETECTION (v3.6 - PURE AI) ===
      // AI-only detection, no heuristics
      // =========================
      if (type === 'detect-multi') {
        const text = body.text || '';
        const t0 = Date.now();

        const phase0Prompt = `You detect if a mind drop contains MULTIPLE DISTINCT ITEMS that should be split.
 
  === TOP-DOWN EVALUATION (READ FIRST) ===
  
  Before looking for split points, read the ENTIRE drop and ask:
  "What is this fundamentally ABOUT? One thing with details, or multiple unrelated things?"
  
  **THE "SEPARATE CARDS" TEST:**
  Would this person want to see these as separate cards in their app?
  - "bad day, client yelled, boss took their side"  One "Bad Day" card? YES  SINGLE
  - "call mom, buy groceries, book dentist"  Three separate cards? YES  SPLIT
  
  **WHEN UNCERTAIN  KEEP TOGETHER**
  - User can manually split later
  - User CANNOT easily merge incorrectly split items
  - Bias toward SINGLE unless clearly multiple unrelated items
  
  === MULTIPLE ENTITIES VS SINGLE ELABORATED THOUGHT ===
  
  Multiple entities means the user is describing SEPARATE items that could each exist independently — different tasks, different topics, different things to capture. Connectors like "and also" or "and then" between genuinely distinct items signal multiple entities.
  
  A single entity with elaboration means the user is describing ONE topic with additional detail, context, conditions, or options. When the details all serve the same core subject — like a single plan with location options, timing considerations, and budget conditions — that's one entity, not three.
  
  The test: could each piece stand alone as a meaningful, independent item? If removing one piece would leave the others still making sense as separate captures, they're multiple entities. If the pieces only make sense together as parts of one thought, it's a single entity.
  
  === SINGLE (is_multi: false) ===
  
  **One story/vent with narrative flow:**
  - "had the worst day, first the client yelled at me, then my boss took their side, came home and stared at the wall"
  - Signal: "first... then... and then...", same emotional thread throughout
  - This is ONE journal entry, not 4
  
  **One task with supporting context:**
  - "call insurance about the claim, need to find the paperwork first, probably on my desk"
  - "find paperwork" is a sub-step, not a separate todo
  - This is ONE todo with context
  
  **One habit with planning notes:**
  - "want to go to the gym more, maybe mon wed fri, mornings could work, there's a place near the office"
  - Exploring details around ONE habit decision
  - This is ONE habit
  
  **One idea being explored:**
  - "thinking about quitting, maybe I should update my linkedin, could reach out to that recruiter"
  - All supporting the same exploration
  - This is ONE idea
  
  **Connectedness signals (don't split):**
  - Pronouns referencing earlier content: "it", "that", "them", "this"
  - Same domain with narrative flow (all work, all health, all family)
  - Causal chains: "because", "so", "which means"
  - Emotional continuity throughout
  - Supporting details for one action
  
  **Emotion + coping response = ONE journal:**
  - "stressed about work, need to take a walk"  SINGLE journal
  - "feeling anxious, going to meditate"  SINGLE journal
  - The coping action is PART OF the emotional expression
  
  **Multiple emotions = ONE journal:**
  - "grateful and exhausted"  SINGLE
  - "anxious but hopeful"  SINGLE
  
  **Shopping lists / related errands:**
  - "buy milk, eggs, bread, and cheese"  SINGLE todo
  - "pick up groceries and dry cleaning"  SINGLE todo (same errand trip)
  
  **"Or" = alternatives = ONE item:**
  - "necklace or scarf for mom"  SINGLE (choosing between options)
  - "yoga or pilates"  SINGLE (deciding which)
  
  **Event + scheduling action for SAME event = ONE item:**
  - "Haircut appointment is Tuesday, book tomorrow"  SINGLE (event date + action date)
  - "Dentist is Friday, need to call and schedule"  SINGLE (one appointment context)
  - "Meeting is at 3pm, need to prep for it"  SINGLE (event + preparation)
  - The scheduling action RELATES to the same event mentioned
  - This is ONE item with target_date (when it IS) + scheduled_date (when to DO it)
  
  === SPLIT (is_multi: true) ===
  
  Split ONLY when there are genuinely SEPARATE, UNRELATED intents.
  
  **Required signals for splitting:**
  1. Explicit topic shift: "also", "oh and", "btw", "separately", "and also"
  2. AND genuinely unrelated/independent items
  3. AND each segment is meaningful standalone
  4. AND each would be a separate card the user tracks independently
  
  **The Completion Independence Test (for todos):**
  Can each segment be marked complete on its own, independently?
  - "call mom, also buy groceries"  YES, independent  SPLIT
  - "call insurance, need to find paperwork first"  NO, paperwork is FOR the call  SINGLE
  
  **Examples that SHOULD split:**
  - "feeling anxious, also call mom"  journal + todo (unrelated, explicit "also")
  - "pay rent and submit expense report"  2 todos (different systems, independent)
  - "stressed about work, also dentist tomorrow, also start running daily"  journal + todo + habit
  
  **Domain shift with explicit separator:**
  - "terrible meeting today, also buy groceries"  Different domains, explicit shift  SPLIT
  
  === SEGMENT EXTRACTION (when splitting) ===
  
  **PRESERVE HEDGING/BRAINSTORMING LANGUAGE:**
  - "what if we added dark mode"  keep "what if we added dark mode" (NOT "add dark mode")
  - "maybe try yoga"  keep "maybe try yoga" (NOT "try yoga")
  - "thinking about switching jobs"  keep full text
  
  Words to ALWAYS preserve: "what if", "maybe", "might", "thinking about", "could", "possibly", "perhaps", "considering"
  
  === LIKELY_BUCKET RULES ===
  
  **todo** - Clear action verbs:
  - call, email, text, buy, get, pick up, book, schedule, pay, submit, cancel, finish
  
  **habit** - Only if explicit frequency in segment:
  - "run every morning"  habit
  - "meditate daily"  habit
  - Without frequency  todo
  
  **log** - Emotions, reflections, ideas, reference info:
  - feeling/felt + emotion  log
  - "stressed", "anxious", "grateful"  log
  - "thinking about", "what if", "maybe"  log
  - Contact info, status updates, facts to remember  log
  
  === OUTPUT FORMAT (JSON) ===
  
  Return ONLY valid JSON.
  
  If SINGLE:
  {"is_multi": false}
  
  If MULTI (2+ genuinely separate items):
  {
  "is_multi": true,
  "confidence": 0.7-1.0,
  "dominant_bucket": "todo"|"habit"|"log",
  "dominant_subtype": "journal"|"idea"|"general"|null,
  "summary": "Content Summary Like 'Work Stress + Call Mom'",
  "segments": [
  {"text": "feeling anxious", "likely_bucket": "log"},
  {"text": "call mom", "likely_bucket": "todo"}
  ]
  }
 
 Summary must describe CONTENT (nouns/topics), never types like "Two Todos" or "Journal + Task".`;

        const phase0Messages = [
          { role: 'system', content: phase0Prompt },
          { role: 'user', content: text.substring(0, 1000) },
        ];

        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: phase0Messages,
            temperature: 0.1,
            max_tokens: 500,
            response_format: { type: 'json_object' },
          }),
        });

        const oj = await res.json();
        const latency = Date.now() - t0;

        if (!res.ok) {
          console.log('[Phase0] API error', { error: oj.error });
          return j({ is_multi: false, source: 'error-fallback', latency_ms: latency });
        }

        const rawContent = oj?.choices?.[0]?.message?.content ?? '{}';

        console.log('[Phase0] Input:', text.substring(0, 80));
        console.log('[Phase0] Raw AI response:', rawContent);

        let parsed;
        try {
          parsed = JSON.parse(rawContent);
        } catch {
          console.log('[Phase0] Parse error', { raw: rawContent });
          return j({ is_multi: false, source: 'parse-fallback', latency_ms: latency });
        }

        // Single entity - quick return
        if (parsed.is_multi !== true) {
          console.log('[Phase0] Single entity', { latency_ms: latency });
          return j({ is_multi: false, source: 'api', latency_ms: latency });
        }

        // Multi entity - validate segments
        const segments = Array.isArray(parsed.segments) ? parsed.segments : [];

        if (segments.length < 2) {
          console.log('[Phase0] Multi claimed but <2 segments', { latency_ms: latency });
          return j({ is_multi: false, source: 'validation-fallback', latency_ms: latency });
        }

        // Validate and normalize each segment
        const validatedSegments = segments
          .map((seg, idx) => {
            const segText = String(seg.text || '').trim();
            const likelyBucket = ['todo', 'habit', 'log'].includes(seg.likely_bucket)
              ? seg.likely_bucket
              : 'log';
            return { text: segText, likely_bucket: likelyBucket };
          })
          .filter((seg) => seg.text.length > 0);

        if (validatedSegments.length < 2) {
          console.log('[Phase0] Segments reduced to <2 after validation', { latency_ms: latency });
          return j({ is_multi: false, source: 'validation-fallback', latency_ms: latency });
        }

        let confidence = Number(parsed.confidence);
        if (!Number.isFinite(confidence)) confidence = 0.75;
        confidence = clamp01(confidence);

        // Validate dominant_bucket
        const validBuckets = ['todo', 'habit', 'log'];
        let dominantBucket = validBuckets.includes(parsed.dominant_bucket)
          ? parsed.dominant_bucket
          : 'log';

        // Validate dominant_subtype
        const validSubtypes = ['journal', 'idea', 'general'];
        let dominantSubtype = null;
        if (dominantBucket === 'log') {
          dominantSubtype = validSubtypes.includes(parsed.dominant_subtype)
            ? parsed.dominant_subtype
            : 'general';
        }

        // Validate summary is content-based, not type-based
        let summary = String(parsed.summary || '').trim();
        const typePhrases = /\b(todo|habit|journal|emotion|task|item)\b/i;
        if (!summary || summary.length < 3 || typePhrases.test(summary)) {
          // Generate content-based summary from segment texts
          const snippets = validatedSegments.slice(0, 3).map((seg) => {
            const words = seg.text.split(/\s+/).slice(0, 3).join(' ');
            return words.charAt(0).toUpperCase() + words.slice(1);
          });
          summary = snippets.join(' + ');
        }
        if (summary.length > 60) {
          summary = summary.substring(0, 57) + '...';
        }

        console.log('[Phase0:Multi]', {
          item_count: validatedSegments.length,
          summary,
          dominant_bucket: dominantBucket,
          dominant_subtype: dominantSubtype,
          segments: validatedSegments.map((s) => ({
            text: s.text.substring(0, 40),
            bucket: s.likely_bucket,
          })),
          confidence,
          latency_ms: latency,
        });

        return j({
          is_multi: true,
          confidence,
          item_count: validatedSegments.length,
          segments: validatedSegments,
          summary,
          dominant_bucket: dominantBucket,
          dominant_subtype: dominantSubtype,
          source: 'api',
          latency_ms: latency,
        });
      }

      // =========================
      // === PHASE 1.5: CLARIFY AMBIGUITY ===
      // =========================
      if (type === 'clarify-ambiguity') {
        const text = body.text || '';
        const ambiguityType = body.ambiguityType || 'bucket';
        const userSpaces = Array.isArray(body.userSpaces) ? body.userSpaces : [];

        const ALL_OPTIONS = {
          bucket: [
            { id: 'opt_todo', label: 'Something I need to do', bucket: 'todo', subtype: null },
            { id: 'opt_habit', label: 'A habit to build', bucket: 'habit', subtype: null },
            { id: 'opt_general', label: 'Just reference info', bucket: 'log', subtype: 'general' },
            { id: 'opt_idea', label: 'An idea to explore', bucket: 'log', subtype: 'idea' },
          ],
          action: [
            {
              id: 'opt_exists',
              label: "It's already scheduled",
              bucket: 'log',
              subtype: 'general',
            },
            { id: 'opt_create', label: 'I need to book this', bucket: 'todo', subtype: null },
          ],
          date_type: [
            {
              id: 'opt_target',
              label: "That's when it is",
              bucket: null,
              dateField: 'target_date',
            },
            {
              id: 'opt_scheduled',
              label: "That's when I'll do it",
              bucket: null,
              dateField: 'scheduled_date',
            },
          ],
        };

        const QUESTIONS = {
          bucket: 'Quick check — what did you have in mind?',
          action: 'Quick check — is this already set?',
          date_type: 'Quick check — what does the date mean?',
        };

        const availableOptions = ALL_OPTIONS[ambiguityType] || ALL_OPTIONS.bucket;
        const question = QUESTIONS[ambiguityType] || 'What is this?';

        // For bucket ambiguity, show all options - let user decide
        if (ambiguityType === 'bucket') {
          console.log('[Phase1.5] Bucket ambiguity - showing all options', {
            ambiguityType,
            options_count: availableOptions.length,
          });

          return j({
            success: true,
            clarification_question: question,
            options: availableOptions,
            latency_ms: 0,
          });
        }

        // AI only filters which options are relevant
        const filterPrompt = `You filter options for an ambiguous input in a productivity app.

INPUT: "${text}"

AVAILABLE OPTIONS:
${availableOptions.map((opt, i) => `${i + 1}. "${opt.label}" (id: ${opt.id})`).join('\n')}

WHAT EACH OPTION MEANS:
- opt_todo: An action to complete. Include if user might need to DO something about this.
- opt_habit: A behavior to repeat. Only include if the input itself is an activity a person performs repeatedly.
- opt_general: Reference info. Include if user might just be noting this exists.
- opt_idea: Something to consider. Include if user might be exploring without commitment.
- opt_exists: Already scheduled/booked. Something that exists in the world.
- opt_create: Needs to be made. Something that needs to be created or booked.

Include opt_todo if the user might need to take any action related to this.
Include opt_habit if this could represent a recurring behavior (even if stated as a noun).
Err on the side of including options — the user will choose.

Select ALL options that are plausible for this input (typically 2-4).

Only include an option if the input could genuinely be interpreted that way.

Return JSON:
{
  "selected_option_ids": ["opt_id_1", "opt_id_2"]
}`;

        const t0 = Date.now();

        try {
          const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${key}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [{ role: 'user', content: filterPrompt }],
              temperature: 0.2,
              max_tokens: 60,
              response_format: { type: 'json_object' },
            }),
          });

          const oj = await res.json();
          const latency = Date.now() - t0;

          let selectedOptions = availableOptions;

          if (res.ok && oj?.choices?.[0]?.message?.content) {
            try {
              const parsed = JSON.parse(oj.choices[0].message.content);
              if (
                Array.isArray(parsed.selected_option_ids) &&
                parsed.selected_option_ids.length >= 2
              ) {
                const filtered = availableOptions.filter((opt) =>
                  parsed.selected_option_ids.includes(opt.id),
                );
                if (filtered.length >= 2) {
                  selectedOptions = filtered;
                }
              }
            } catch (e) {
              console.log('[Phase1.5] Parse error, using defaults', { error: String(e) });
            }
          }

          console.log('[Phase1.5] Success', {
            ambiguityType,
            question,
            options_count: selectedOptions.length,
            latency_ms: latency,
          });

          return j({
            success: true,
            clarification_question: question,
            options: selectedOptions,
            latency_ms: latency,
          });
        } catch (err) {
          const latency = Date.now() - t0;
          console.log('[Phase1.5] Error', { error: String(err), latency_ms: latency });

          return j({
            success: true,
            clarification_question: question,
            options: availableOptions,
            latency_ms: latency,
          });
        }
      }

      // =========================
      // === RECLASSIFY AFTER CLARIFICATION ===
      // Generates updated title + confirmation message after user clarifies intent
      // =========================
      if (type === 'reclassify-after-clarification') {
        const text = body.text || '';
        const selectedLabel = body.selectedLabel || '';
        const selectedBucket = body.selectedBucket || null;
        const selectedSubtype = body.selectedSubtype || null;
        // eslint-disable-next-line no-restricted-syntax -- Cloudflare Worker doesn't have dateService
        const currentDate = body.currentDate || new Date().toISOString().split('T')[0];
        const targetBucket = body.targetBucket || null;

        const reclassifyPrompt = `You finalize a productivity item after the user clarified their intent.

=== CONTEXT ===
ORIGINAL INPUT: "${text}"
USER SELECTED: "${selectedLabel}"
SELECTED BUCKET: ${selectedBucket || 'not specified'}
SELECTED SUBTYPE: ${selectedSubtype || 'not specified'}
CURRENT DATE: ${currentDate}

=== BUCKET RULE ===

If SELECTED BUCKET is provided (not "not specified"), use it exactly. Do not override the user's selection.
The bucket in your output MUST match SELECTED BUCKET.
If SELECTED SUBTYPE is provided, use it exactly for the subtype field.

=== YOUR TASK ===

The user dropped "${text}" and clarified by selecting "${selectedLabel}".

Generate:
1. A smart title (3-7 words)
2. A confirmation message (4-10 words)
3. Date fields if applicable

=== TITLE PRINCIPLES ===

The title should reflect what the user ACTUALLY wrote.

Do NOT invent actions, details, or specifics the user did not provide. If they wrote one word, the title can be one word.

If their input contains an action verb, keep it. If it doesn't, do not add one.

No temporal words in titles — dates are stored separately.

=== CONFIRMATION MESSAGE PRINCIPLES ===

This is Gremly's voice — warm, brief, human. 4-10 words.

FORBIDDEN STARTS — Never begin with:
- "Got it"
- "Noted"
- "Added"
- "Saved"
- "Captured"
- "I've"
- "Your task"
- "Your note"

The message must reference the specific subject matter from the input. Be warm and slightly playful, not robotic.

=== DATE HANDLING ===

Only set dates that appear in the ORIGINAL INPUT. Never invent dates.

If the original input contains a date:
- target_date: When something IS or HAPPENS (event date, deadline, birthday)
- scheduled_date: When the user will DO the action
- date_type_ambiguous: true if you cannot determine which from the clarification

If no date in input, all date fields are null.

=== OUTPUT FORMAT (JSON) ===

{
  "bucket": "todo" | "habit" | "log",
  "subtype": "journal" | "idea" | "general" | null,
  "smart_title": "Title From Their Words",
  "confirmation_message": "Warm message referencing their input",
  "target_date": "YYYY-MM-DD" | null,
  "scheduled_date": "YYYY-MM-DD" | null,
  "date_type_ambiguous": boolean
}`;

        const t0 = Date.now();

        try {
          const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${key}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [{ role: 'system', content: reclassifyPrompt }],
              temperature: 0.3,
              max_tokens: 250,
              response_format: { type: 'json_object' },
            }),
          });

          const oj = await res.json();
          const latency = Date.now() - t0;

          if (!res.ok) {
            console.log('[Reclassify] API error', { error: oj.error });
            return j({
              bucket: 'log',
              subtype: 'general',
              habit_subtype: null,
              smart_title: titleCase(text.substring(0, 50)),
              confirmation_message: 'Saved for later.',
              target_date: null,
              scheduled_date: null,
              latency_ms: latency,
            });
          }

          const rawContent = oj?.choices?.[0]?.message?.content ?? '{}';
          const parsed = JSON.parse(rawContent);

          // Use selected bucket/subtype if provided, otherwise fall back to AI response
          const validBuckets = ['todo', 'habit', 'log'];
          let bucket =
            selectedBucket && validBuckets.includes(selectedBucket)
              ? selectedBucket
              : validBuckets.includes(parsed.bucket)
                ? parsed.bucket
                : 'log';

          // Validate subtype
          let subtype = null;
          if (bucket === 'log') {
            const validSubtypes = ['general', 'idea', 'journal'];
            subtype =
              selectedSubtype && validSubtypes.includes(selectedSubtype)
                ? selectedSubtype
                : validSubtypes.includes(parsed.subtype)
                  ? parsed.subtype
                  : 'general';
          }

          // Validate habit_subtype
          let habitSubtype = null;
          if (bucket === 'habit') {
            const validHabitSubtypes = ['start_habit', 'break_habit'];
            habitSubtype = validHabitSubtypes.includes(parsed.habit_subtype)
              ? parsed.habit_subtype
              : 'start_habit';
          }

          // Validate dates
          let targetDate = null;
          let scheduledDate = null;
          if (parsed.target_date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.target_date)) {
            targetDate = parsed.target_date;
          }
          if (parsed.scheduled_date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.scheduled_date)) {
            scheduledDate = parsed.scheduled_date;
          }

          // Extract date_type_ambiguous flag
          const dateTypeAmbiguous = parsed.date_type_ambiguous === true;

          // Extract confirmation message (same as Phase 1)
          let confirmationMessage = parsed.confirmation_message || null;
          if (confirmationMessage) {
            confirmationMessage = String(confirmationMessage).trim();
            if (confirmationMessage.length < 3 || confirmationMessage.length > 100) {
              confirmationMessage = null;
            }
          }

          console.log('[Reclassify] Success', {
            bucket,
            subtype,
            habit_subtype: habitSubtype,
            title: parsed.smart_title?.substring(0, 30),
            confirmation_message: confirmationMessage,
            target_date: targetDate,
            scheduled_date: scheduledDate,
            date_type_ambiguous: dateTypeAmbiguous,
            latency_ms: latency,
          });

          return j({
            bucket,
            subtype,
            habit_subtype: habitSubtype,
            smart_title: titleCase(parsed.smart_title || text.substring(0, 50)),
            confirmation_message: confirmationMessage,
            target_date: targetDate,
            scheduled_date: scheduledDate,
            date_type_ambiguous: dateTypeAmbiguous,
            latency_ms: latency,
          });
        } catch (err) {
          const latency = Date.now() - t0;
          console.log('[Reclassify] Error', { error: String(err), latency_ms: latency });
          return j({
            bucket: 'log',
            subtype: 'general',
            habit_subtype: null,
            smart_title: titleCase(text.substring(0, 50)),
            confirmation_message: 'Saved for later.',
            target_date: null,
            scheduled_date: null,
            date_type_ambiguous: false,
            time_estimate_minutes: null,
            energy_type: null,
            latency_ms: latency,
          });
        }
      }

      // =========================
      // === PHASE 1 CLASSIFICATION (v4.1 - NOW INCLUDES TITLE + MESSAGE) ===
      // =========================
      if (type === 'classify-phase1') {
        const text = body.text || '';
        const hasAttachments = body.hasAttachments || false;
        const heuristicHint = body.heuristicHint || null;

        const phase1Prompt = `You classify "mind drops" for Gremly, a productivity app. Your job is to understand the user's TRUE INTENT through semantic reasoning, not pattern matching.

=== THE FOUR BUCKETS ===

**TODO** — A discrete, completable action
The user will eventually "check this off." A clear DONE state exists.
Ask: "Can this be marked DONE when complete?"

**HABIT** — A trackable, recurring behavior
The user wants to TRACK this over time. It's concrete and observable.
Ask: "Can this be tracked with a yes/no each day/week?"

**LOG** — Capture for reflection, not action
A thought, feeling, idea, or fuzzy aspiration. No clear done state or tracking intent.
Ask: "Is this reflection, exploration, venting, or too vague to act on?"

**AMBIGUOUS** — Intent is unclear, need to ask the user
You cannot confidently determine which bucket this belongs in.
Ask: "Do I have EVIDENCE for TODO, HABIT, or LOG? Or am I guessing?"
Choose AMBIGUOUS when none of the other three buckets reaches 70% confidence.

=== CRITICAL SEMANTIC QUESTIONS ===

Before classifying, reason through these questions. They resolve the hardest cases.

**Q1: WHERE DOES UNCERTAINTY LIVE?**

When hedging, conditionals, or tentative language appears, ask: Is uncertainty about THE WORLD or about THE USER'S OWN INTENT?

WORLD uncertainty (timing, availability, external factors): The user has committed to the action but faces external unknowns. The intent is clear; circumstances are not. This is still a TODO. The condition is context, not wavering.

SELF uncertainty (whether to do it, weighing options, questioning desire): The user hasn't decided. They're exploring or processing. This is IDEA (exploring possibility) or JOURNAL (processing feelings about it).

The test: If the external condition resolved favorably, would the user definitely act? YES → TODO. UNSURE → not a TODO.

**Q2: WHAT IS THE DOMINANT FRAME?**

Individual words exist inside an overall frame. The frame determines classification, not the words inside it.

DIRECTING frame: User is telling themselves to do something. Even soft language ("maybe grab," "should probably call") inside a directing frame is a TODO.

EXPLORING frame: User is considering possibilities. Even action verbs ("switching," "starting") inside an exploring frame is an IDEA.

PROCESSING frame: User is working through feelings or patterns. Even future-oriented words inside a processing frame is JOURNAL.

The test: What is the user DOING with this thought right now? Capturing an action? Floating a possibility? Working through feelings?

**Q3: IS THIS EXPRESSION COMPLETE?**

Short inputs are not necessarily incomplete — they may be fully expressed.

Single emotional words ("meh," "ugh," "exhausted," "anxious") are complete JOURNAL entries. The value is the expression itself. Do not mark ambiguous due to brevity.

Bare nouns without any verb or context ("taxes," "passport") genuinely lack signal. These ARE ambiguous — you cannot determine if it is something to DO, TRACK, or REMEMBER.

The test: Is brevity the problem, or is intent actually missing? Emotional expression with no action is a complete journal. Noun with no framing is genuinely ambiguous.

=== SEMANTIC CLASSIFICATION (PRIMARY) ===

Your task is to REASON about intent, not to match patterns or keywords. Apply these semantic tests to ANY input.

**TODO SEMANTIC TEST:**

A TODO has ALL of these properties:
1. **Discrete action** — Something that happens once then is finished. Not an ongoing behavior, not a state of being, not a continuous process. There is a clear beginning and end.

2. **Clear completion point** — There exists a specific moment where this transitions from "not done" to "done." You could identify that moment. The user would know when they've finished.

3. **Checkable** — The user would feel satisfied marking this complete. It represents a unit of work or action that, once performed, is behind them.

**The completion test:** Imagine the user coming back and saying "I did it." Does "it" refer to something concrete and finished? If yes → TODO.

**Cognitive work is still a TODO:** Mental tasks like deciding, figuring out, researching, or working through a problem ARE todos if they have a completion point. "Figure out why X is broken" is done when you understand the cause. "Decide on a venue" is done when the decision is made. "Research options for Y" is done when you've gathered enough information. These have clear done states even though the work is mental.

**Investigative actions are TODOs when they have an endpoint:** If the user is setting out to learn, discover, or understand something — and there's a point where they'd have enough information — that's a completable action, not open-ended exploration. The test: could they come back and say "I looked into it" or "I checked it out" as a completed action? If yes, it's a TODO. This is different from ongoing mental states like "thinking about" or "considering" which have no natural completion point — those are exploration (LOG/idea), not action.

**Conditional or qualified actions are still TODOs:** When a user describes an action with conditions, qualifiers, or uncertainty about outcome — but the action itself is clear — the item is still a TODO. The condition doesn't change the nature of the action; it adds context to it. The user intends to perform the action; whether the outcome is guaranteed is separate from whether the action is completable.

**What disqualifies a TODO:**
- No identifiable completion point (when would "be healthier" be done?)
- Ongoing state rather than discrete action ("work on my patience")
- Too vague to know what "done" means ("deal with the situation")

---

**HABIT SEMANTIC TEST:**

A HABIT has ALL of these properties:
1. **Concrete, observable behavior** — Something a camera could theoretically record. A physical action or measurable behavior, not a mental state, attitude, or abstract quality. You could observe someone doing or not doing it.

2. **Binary trackability** — At the end of each day or week, the user can definitively answer "did I do this? yes or no" with certainty. There's no ambiguity about whether it happened.

3. **Explicit repetition intent** — The user has signaled they want this to recur. This signal must be EXPLICIT in their input, not inferred:
   - Stated frequency: words like "daily," "every morning," "weekly," "3x per week," "twice a day"
   - Specific named days: when the user specifies particular days of the week, they are declaring a recurring schedule, which signals habit intent — this is equivalent to stating a frequency
   - OR stop/quit language: "stop [behavior]," "quit [behavior]," "no [behavior] after [time]," "avoid [behavior]"

**The tracking test:** Could this appear on a habit tracker with a yes/no checkbox for each day? Would checking it off daily make sense?

**CRITICAL — Explicit signals required:**
Without explicit frequency or stop/quit language in the input, the item is NOT a habit, regardless of whether the activity could theoretically be repeated. A repeatable activity without explicit repetition intent is either a single TODO or a vague aspiration (LOG).

**What disqualifies a HABIT:**
- No explicit frequency or stop/quit language (even if the activity is repeatable)
- Mental states that can't be observed ("stop overthinking," "be more mindful")
- Abstract qualities rather than behaviors ("be more patient," "be healthier")
- Vague aspirations without commitment ("drink more water," "exercise more" — these lack explicit frequency)

---

**LOG SEMANTIC TEST:**

A LOG captures content that doesn't fit TODO or HABIT. It serves reflection, reference, or exploration.

LOG has three subtypes that are checked SEQUENTIALLY, not as parallel options. First check for journal, then idea, then general. This ordering matters because journal and idea have specific signals, while general is the narrowest category reserved for purely factual content.

**LOG/journal** — Emotional expression or internal processing (check FIRST):

The user is expressing feelings, reflecting on experiences, venting, processing emotions, or engaging in self-talk. The content is about their internal state or making sense of something that happened. There's no action to take — the value is in the expression itself.

The temporal orientation is INWARD and BACKWARD — processing what IS (current feelings, present state) or what WAS (past events, things that happened). The user is making sense of their experience, looking inward at their emotional state or backward at something they experienced. They are not planning future action — they are processing.

Signals: emotional language, reflection on past events, gratitude expressions, statements about feelings or internal state, sense-making about experiences.

Rhetorical self-directed questions are a strong journal indicator. These are questions the user asks themselves about their own patterns, behaviors, or tendencies — they're processing and reflecting, not seeking external answers or planning action. The question must be BOTH self-directed (about the user themselves) AND reflective in nature (making sense of something, not planning to change it). Rhetorical questions about external topics or factual inquiries are NOT journal signals — only self-reflective processing questions qualify.

Questions that examine the user's own desire or commitment are processing, not planning. The test: Is the user questioning WHETHER they want something, or questioning HOW to do something they want? Questioning desire is processing — the user is working through their relationship with the choice itself. Questioning logistics is planning. "Should I go" could be either. "Should I even go" reveals they're examining their own motivation — that's journal.

Self-directed emotional questions are journal even when they use future-oriented framing. When emotional weight and self-direction are the dominant signals — when the user is processing how they FEEL about something rather than exploring what to DO about it — those emotional signals override any exploration framing. The user is working through feelings, not weighing possibilities.

Pure emotional expressions — single words or short phrases that are clearly expressing a feeling with no actionable or informational content — are journal. The user is venting or expressing, not requesting action. The value is in the expression itself.

Overall framing determines classification, not individual words. When the overall structure of an input is self-reflective — the user is processing their relationship with an idea, questioning their own patterns, or examining their motivations — that reflective framing determines the classification, even if individual words within the input sound action-adjacent. The test is: what is the user DOING with this input? If they're PROCESSING (making sense of feelings, questioning themselves, examining patterns), it's journal — regardless of whether action-related words appear inside the reflection.

**LOG/idea** — Future-oriented possibility (check SECOND):

The user is imagining something that COULD BE — a possibility they're considering, exploring, or dreaming about. They haven't committed to action but are capturing a "what if" or "maybe" for later. The hallmark is future orientation combined with possibility or hedging language.

The temporal orientation is OUTWARD and FORWARD — looking ahead at what might be, not what is or was. The user is exploring potential futures, weighing options they haven't chosen between, or capturing concepts without a concrete plan. They're looking ahead, but without the commitment that would make it a TODO.

**IDEA vs AMBIGUOUS — A sharp distinction:**

IDEA has clear EXPLORATION signals — the user is actively imagining, hypothesizing, or considering a possibility. They know what they're doing: exploring. The input demonstrates future-oriented thinking about something that could exist or happen. Exploration is an INTENT, and if the user is clearly exploring (even at length, even with rich detail), that's idea, not ambiguous.

AMBIGUOUS has NO signals — we genuinely cannot determine what the user wants. The input is a fragment or bare reference with no framing that tells us their intent. We're not uncertain about which LOG subtype — we're uncertain whether this is something to DO, TRACK, or KNOW at all.

The key test: Can you identify an intent in the input? If the intent is exploration/possibility-thinking → idea. If you cannot identify ANY intent → ambiguous.

Signals: hedging language WITHOUT action verbs, possibility framing, comparing options without choosing, "what if" or "maybe" constructions, capturing concepts for potential future pursuit.

Soft suggestion language combined with hedging signals idea, not general. When a user frames something as a suggestion or soft proposal — expressing what could or should happen, combined with uncertainty markers or conditions — they are exploring a possibility, not stating a fact. This combination of soft proposal + uncertainty = idea. This is distinct from general, which states facts about the world. And distinct from TODO, which has committed action intent. The user is floating a possibility without commitment.

**LOG/general** — Factual reference only (check LAST, narrowest category):

The user is stating something that IS — recording factual information, reference data, completed events, or contact details. This requires existence verbs or past tense completion. The content is purely informational — there's no action implied because it's about what IS or WAS, not what to DO.

General requires ACTIVE FRAMING as factual reference — the user must be stating something about the world, not just naming a concept. Noun phrases that name services, processes, or things that could plausibly require action are NOT general notes. Without a verb or explicit reference framing, we don't know if the user needs to DO something or is noting information. The presence of a noun alone, even a noun that sounds like reference info, is not enough. The user must be framing it as information, not just naming it. If a noun phrase could plausibly be something to act on, that uncertainty means it's ambiguous.

Statements about schedules, closures, or status changes ARE factual reference when they use existence language. When someone states that something IS closed, IS moved, IS happening on a date, or IS changed — and they're reporting this as information rather than requesting action — that's factual reference. The key test: Is the user REPORTING a fact about the world, or are they REQUESTING something be done? Reporting facts with existence verbs = general. Requesting action or implying a task = TODO or ambiguous.

CRITICAL: General is NOT a catchall for uncertain items. It is the narrowest LOG subtype, reserved for content that is clearly and unambiguously factual reference. General is for content that is CLEARLY positioned as "here is a fact" — not content that merely COULD be a fact. If you are unsure whether something is actionable vs just informational, that uncertainty means it's AMBIGUOUS, not general.

Signals: existence verbs stating facts, past tense describing completed events, contact information, dates of existing events, schedule or status statements using "is" language, purely informational statements.

**LOG subtype decision summary:**

1. Is there emotional or reflective content about present feelings or past experiences? → **journal**
2. Is there future possibility language, exploration, "could be" or "what if" orientation? → **idea**
3. Is there factual reference info, clearly stating what IS or WAS (not what to DO)? → **general**
4. Unsure if this is something to DO vs just something to KNOW? → **ambiguous** (not general)

---

**AMBIGUOUS — When to flag:**

Flag as AMBIGUOUS when you cannot confidently determine the bucket because evidence is missing.

**The evidence test:** Before classifying, ask "What SPECIFIC WORDS in this input tell me the user's intent?" If you cannot point to concrete evidence, you are guessing.

**Types of ambiguity:**

1. **Bucket ambiguity** — You don't know if this is something to DO, TRACK, or KNOW
   - Bare nouns with no verb or intent signal
   - Fragments that could plausibly be multiple bucket types
   - Input where you'd need to ask "what do you want to do with this?"

2. **Action ambiguity** — Input has a noun + time reference but no verb
   - Could be an existing appointment OR a need to schedule
   - You'd need to ask "do you have this or need to book it?"

3. **Date type ambiguity** — Bucket is clearly TODO, but date meaning is unclear
   - Action verb + noun + date, but you don't know if the date is when something IS vs when to DO it
   - You'd need to ask "is [date] when the event is, or when you'll do the action?"

**CRITICAL:** Do not dump ambiguous items into LOG/general as a fallback. If you're uncertain, say so. The user can clarify.

=== STRUCTURAL SIGNALS (SUPPORTING EVIDENCE) ===

These linguistic patterns provide EVIDENCE to support your semantic classification. They help you identify intent but do not override semantic reasoning.

**Evidence suggesting TODO:**
- Imperative structure (verb + object, no subject) — implies a command to self
- Reminder phrasing ("make sure to," "don't forget to," "remember to") — implies future action needed
- Obligation language ("need to," "have to," "should" + specific action) — implies task to complete
- Hedging + action verb ("maybe buy," "should probably call") — the verb signals intent despite soft commitment

**Evidence suggesting HABIT:**
- Explicit frequency language ("daily," "every morning," "3x per week") — signals repetition intent
- Stop/quit + concrete behavior ("stop smoking," "no phone after 9") — signals behavior to track
- Tracking language ("start doing X every," "track my") — explicit tracking intent

**Evidence suggesting LOG:**
- Past tense reflection ("I realized," "I noticed," "I felt") — processing, not planning
- Emotional language ("feeling," "stressed," "anxious," "grateful") — internal state expression
- Hedging WITHOUT action verb ("thinking about," "what if," "maybe" + noun only) — exploration, not commitment
- Existence verbs stating facts ("X is Y," "I have," "there's a") — recording information

**Evidence suggesting AMBIGUOUS:**
- No verb at all — you can't determine intent
- Noun + time without verb — could be existing or need-to-schedule
- Vague comparative language ("more," "less," "better") without explicit commitment — aspiration without plan

=== CONFIDENCE RULES ===

Confidence reflects EVIDENCE in the input, not gut feeling.

**0.7 or higher:** You can point to specific words that reveal intent. Classify into TODO, HABIT, or LOG with the appropriate subtype.

**Below 0.7:** You cannot point to clear evidence. Return bucket: "ambiguous". This is correct behavior — it routes to clarification where the user resolves it with one tap.

Do not guess. Do not return a low-confidence classification hoping it's right. If evidence is insufficient, return ambiguous.

=== AMBIGUITY DETECTION TESTS ===

Apply these semantic tests to determine if clarification is needed:

**TEST 1: BUCKET CLARITY**
Ask: "Do I KNOW if this is something to DO vs TRACK vs KNOW?"

CLEAR: Input contains evidence (action verb, frequency, emotional content, existence verb)
UNCLEAR: Bare noun, fragment, or content that fits multiple buckets equally → AMBIGUOUS, type: "bucket"

**TEST 2: ACTION CLARITY** 
(Apply when input has noun + date/time but no clear verb)
Ask: "Do I know if the user HAS something or NEEDS TO DO something?"

CLEAR: Has action verb (needs to do) or existence language (has it)
UNCLEAR: Noun + date with no verb → AMBIGUOUS, type: "action"

**TEST 3: DATE TYPE CLARITY**
(Apply when bucket is TODO and input contains a date)
Ask: "Do I know if this date is when something IS/HAPPENS or when to DO the action?"

CLEAR: Deadline language ("due," "by") or event language ("is on," "happens") or action timing ("call tomorrow")
UNCLEAR: Action + noun + date with no signal about date meaning → AMBIGUOUS, type: "date_type"

**TEST 4: VERB PRESENCE**
Ask: "Is there ANY verb in this input?"

If no verb exists (bare noun, noun phrase, or fragment):
→ AMBIGUOUS, type: "bucket"

**TEST 5: ASPIRATION VS COMMITMENT**
Ask: "Has the user made a concrete commitment or expressed a vague aspiration?"

Vague aspirations use comparative language ("more," "less," "better") without explicit frequency or specific plans. These should be AMBIGUOUS, not HABIT or LOG/general, because the user might want to track them or might just be noting a wish.

**THE CORE PRINCIPLE:**
If you cannot point to specific words that determine how to handle this item, you are guessing. Flag it as ambiguous and let the user clarify.

=== HABIT SUBTYPE ===

When classifying as HABIT, determine the subtype:

**start_habit** — Building or doing something
The user wants to ADD a behavior to their life. They're creating a new positive pattern.

**break_habit** — Stopping or avoiding something  
The user wants to REMOVE a behavior from their life. They're eliminating a negative pattern.

The distinction is semantic: is the user's intent to DO more of something, or to STOP doing something?

=== SMART TITLE (3-7 words) ===

Generate a title that captures the SUBJECT/TOPIC — what it IS, not WHEN it happens or HOW OFTEN.

**Title principles:**

1. **Extract the core subject matter** — The title should make sense in a list of items. What is this fundamentally about?

2. **Strip temporal information** — Dates, times, and scheduling words ("tomorrow," "next week," "by Friday") belong in metadata, not titles. They become stale.

3. **Strip frequency information** — For habits, frequency is tracked separately. The title is just the activity.

4. **No meta-language** — Don't start with "Reflect on," "Journal about," "Remember to," "Track." These are system concepts, not content.

5. **Preserve question framing** — If the input is a question or dilemma ("Should I go to the reunion?", "Do I really want this?"), keep the question words in the title. The question IS the content. "Should I Go to the Reunion" is correct. Do not strip "Should I" or similar.

6. **No mood words in titles** — Emotional descriptors (anxious, stressed, grateful) are captured as mood metadata for journals, not in titles.

7. **Title case, 3-7 words**

=== CONFIRMATION MESSAGE (4-10 words) ===

This is Gremly's voice — warm, specific, gently playful. Like a supportive friend who actually listened.

The confirmation message is one of the most important parts of the user experience. A generic response like "Noted." or "Got it." is a FAILURE STATE — it means you failed to understand the input. Every confirmation MUST reference something specific from the user's actual input — the subject matter, the topic, what it's about. Include warmth or personality. Reference what they said, not just that you captured it.

**Core principles:**

1. **Reference the subject matter** — Name what the drop is about. If it's about a dentist appointment, mention the dentist. If it's about their mom, mention mom. Prove you understood.

2. **Add warmth or gentle humor** — Sound like a friend, not a system notification. A small touch of personality.

3. **Stay brief** — 4-10 words. This is a quick acknowledgment, not a conversation.

4. **No exclamation marks** — Too perky. Keep it calm.

**FORBIDDEN — These are failure states:**
- "Got it" / "Added" / "Noted" / "Done" / "Captured" alone
- "Task added to your list" — system speak
- "I've captured that for you" — robotic
- "Successfully saved" — notification language
- Any confirmation that could apply to ANY input (if it's not specific to THIS input, it's wrong)

**For ambiguous items:**
The confirmation should invite them to tap/clarify:
- "Quick question — tap me"
- "Need your input — tap here"
- "One quick thing — tap me"

=== OUTPUT FORMAT ===

Return ONLY valid JSON:

{
  "bucket": "todo" | "habit" | "log" | "ambiguous",
  "confidence": 0.0-1.0,
  "subtype": "journal" | "idea" | "general" | null,
  "habitSubtype": "start_habit" | "break_habit" | null,
  "smart_title": "3-7 Word Title",
  "confirmation_message": "4-8 word warm message",
  "ambiguity_type": "bucket" | "action" | "date_type" | null,
  "ambiguity_reason": "Short reason why it's ambiguous" | null
}

Rules:
- subtype is only set when bucket is "log"
- habitSubtype is only set when bucket is "habit"
- When bucket is "ambiguous", always set ambiguity_type and ambiguity_reason
- When bucket is "ambiguous", smart_title should stay close to original text
- When bucket is "ambiguous", confirmation_message should invite clarification`;

        const phase1Messages = [
          { role: 'system', content: phase1Prompt },
          { role: 'user', content: text.substring(0, 1000) },
        ];

        const t0 = Date.now();
        console.log('[Phase1:Timing] Pre-fetch', { t: Date.now() });
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: phase1Messages,
            temperature: 0.1,
            max_tokens: 500,
            response_format: { type: 'json_object' },
          }),
        });
        console.log('[Phase1:Timing] Post-fetch', {
          t: Date.now(),
          status: res.status,
          ok: res.ok,
        });

        const oj = await res.json();
        console.log('[Phase1:Timing] Post-json', { t: Date.now() });
        const latency = Date.now() - t0;

        if (!res.ok) {
          console.log('[Phase1] API error', { error: oj.error });

          const fallbackBucket = heuristicHint?.bucket || 'log';
          const fallbackSubtype =
            heuristicHint?.subtypeHint || (isSenseMakingJournal(text) ? 'journal' : 'general');
          const fallbackHabitSubtype =
            fallbackBucket === 'habit' ? heuristicHint?.habitSubtypeHint || 'start_habit' : null;

          const norm = normalizePhase1(fallbackBucket, fallbackSubtype, text);

          return j({
            is_multi: false,
            bucket: norm.bucket,
            confidence: 0.5,
            subtype: norm.subtype,
            habitSubtype: norm.bucket === 'habit' ? fallbackHabitSubtype : null,
            smart_title: null,
            confirmation_message: null,
            needs_clarification: false,
            clarification_type: null,
            clarification_question: null,
            clarification_options: null,
            source: 'heuristic-fallback',
            latency_ms: latency,
          });
        }

        const rawContent = oj?.choices?.[0]?.message?.content ?? '{}';
        let parsed;
        try {
          parsed = JSON.parse(rawContent);
          console.log('[Phase1:Timing] Post-parse', { t: Date.now() });
        } catch {
          console.log('[Phase1] Parse error', { raw: rawContent });

          const fallbackBucket = heuristicHint?.bucket || 'log';
          const fallbackSubtype =
            heuristicHint?.subtypeHint || (isSenseMakingJournal(text) ? 'journal' : 'general');
          const fallbackHabitSubtype =
            fallbackBucket === 'habit' ? heuristicHint?.habitSubtypeHint || 'start_habit' : null;

          const norm = normalizePhase1(fallbackBucket, fallbackSubtype, text);

          return j({
            is_multi: false,
            bucket: norm.bucket,
            confidence: 0.5,
            subtype: norm.subtype,
            habitSubtype: norm.bucket === 'habit' ? fallbackHabitSubtype : null,
            smart_title: null,
            confirmation_message: null,
            needs_clarification: false,
            clarification_type: null,
            clarification_question: null,
            clarification_options: null,
            source: 'parse-fallback',
            latency_ms: latency,
          });
        }

        // =====================================================
        // SINGLE ITEM RESPONSE (v4.1 - now includes title + message)
        // =====================================================
        let confidence = Number(parsed.confidence);
        if (!Number.isFinite(confidence)) confidence = 0.7;
        confidence = clamp01(confidence);

        const norm = normalizePhase1(parsed.bucket, parsed.subtype, text);

        // Determine habitSubtype for habits
        let habitSubtype = null;
        if (norm.bucket === 'habit') {
          const validHabitSubtypes = ['start_habit', 'break_habit'];
          if (validHabitSubtypes.includes(parsed.habitSubtype)) {
            habitSubtype = parsed.habitSubtype;
          } else {
            habitSubtype = heuristicHint?.habitSubtypeHint ?? 'start_habit';
          }
        }

        // Extract and validate smart_title (v4.1 - NEW)
        let smartTitle = parsed.smart_title || null;
        if (smartTitle) {
          smartTitle = String(smartTitle).trim();
          if (smartTitle.length < 3 || smartTitle.length > 60) {
            smartTitle = text.substring(0, 50).trim();
          }
          // Title case (skip articles/prepositions except first word)
          smartTitle = titleCase(smartTitle);
        }

        // Extract confirmation message (v4.1 - NEW)
        let confirmationMessage = parsed.confirmation_message || null;
        if (confirmationMessage) {
          confirmationMessage = String(confirmationMessage).trim();
          if (confirmationMessage.length < 3 || confirmationMessage.length > 100) {
            confirmationMessage = null;
          }
        }

        // Extract ambiguity fields (v4.2 - Phase 1 ambiguity detection)
        // IMPORTANT: Use norm.bucket (post-tiebreaker) and current confidence, not parsed.bucket
        const isAmbiguous = norm.bucket === 'ambiguous' || confidence < 0.7;
        const ambiguityReason =
          isAmbiguous && typeof parsed.ambiguity_reason === 'string'
            ? parsed.ambiguity_reason.trim().substring(0, 200)
            : null;
        const ambiguityType =
          isAmbiguous &&
          typeof parsed.ambiguity_type === 'string' &&
          ['bucket', 'action', 'date_type'].includes(parsed.ambiguity_type)
            ? parsed.ambiguity_type
            : null;

        // Legacy clarification fields - always false/null in Phase 1
        // Actual clarification options are generated by Phase 1.5
        const needsClarification = false;
        const clarificationType = null;
        const clarificationQuestion = null;
        const clarificationOptions = null;

        const sameAsBucket = heuristicHint?.bucket === norm.bucket;

        console.log('[Phase1]', {
          bucket: norm.bucket,
          subtype: norm.subtype,
          habitSubtype,
          confidence,
          smart_title: smartTitle?.substring(0, 30),
          has_message: !!confirmationMessage,
          is_ambiguous: isAmbiguous,
          ambiguity_type: ambiguityType,
          ambiguity_reason: ambiguityReason?.substring(0, 50),
          heuristicBucket: heuristicHint?.bucket,
          agreed: sameAsBucket,
          latency_ms: latency,
        });

        return j({
          bucket: norm.bucket,
          subtype: norm.subtype,
          habitSubtype,
          confidence,
          smart_title: smartTitle,
          confirmation_message: confirmationMessage,
          is_ambiguous: isAmbiguous,
          ambiguity_type: ambiguityType,
          ambiguity_reason: ambiguityReason,
          // Legacy fields for backwards compatibility - Phase 1.5 handles actual clarification
          needs_clarification: needsClarification,
          clarification_type: clarificationType,
          clarification_question: clarificationQuestion,
          clarification_options: clarificationOptions,
          source: sameAsBucket ? 'heuristic-confirmed' : 'api',
          latency_ms: latency,
        });
      }

      // --- PHASE 2 ENRICHMENT (v4.1 - non-streaming, metadata only) ---
      // Title and message now come from Phase 1
      // Phase 2 only extracts: tags, time, dates, frequency, days, people, mood
      if (type === 'enrich-phase2') {
        const text = body.text || '';
        const bucket = body.bucket || 'log';
        const subtype = body.subtype || null;
        // Use client-provided date to avoid timezone issues
        const currentDate = body.currentDate || body.today || '2026-01-25';
        const timezone = body.timezone || 'UTC';
        const dayOfWeek = body.dayOfWeek || 'Sunday';

        // Helper: Generate dynamic date examples based on actual current date
        function generateDateExamples(dateStr, todayDayName) {
          const dayNames = [
            'Sunday',
            'Monday',
            'Tuesday',
            'Wednesday',
            'Thursday',
            'Friday',
            'Saturday',
          ];
          const todayIndex = dayNames.findIndex(
            (d) => d.toLowerCase() === todayDayName.toLowerCase(),
          );
          if (todayIndex === -1) {
            console.log('[DateExamples:Error] Invalid day name', { todayDayName, todayIndex });
            return '';
          }

          // Parse date string
          const [year, month, day] = dateStr.split('-').map(Number);
          const baseDate = new Date(year, month - 1, day);

          // Verify the parsed date matches the day of week
          const parsedDayOfWeek = baseDate.getDay();
          if (parsedDayOfWeek !== todayIndex) {
            console.log('[DateExamples:Mismatch]', {
              dateStr,
              todayDayName,
              expectedDayIndex: todayIndex,
              actualDayIndex: parsedDayOfWeek,
              actualDayName: dayNames[parsedDayOfWeek],
            });
          }

          // Generate examples for each day of the week, ordered Sunday-Saturday
          const examples = [];
          for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
            const dayName = dayNames[dayIndex];
            // Calculate days until this day from today
            let daysUntil = dayIndex - todayIndex;
            if (daysUntil <= 0) daysUntil += 7; // Same day or past = next week

            const targetDate = new Date(baseDate);
            targetDate.setDate(baseDate.getDate() + daysUntil);
            // eslint-disable-next-line no-restricted-syntax -- Cloudflare Worker doesn't have dateService
            const targetDateStr = targetDate.toISOString().split('T')[0];

            if (dayIndex === todayIndex) {
              examples.push(
                `- "${dayName}" = ${targetDateStr} (NEXT ${dayName}, 7 days from now - NOT today!)`,
              );
            } else if (daysUntil === 1) {
              examples.push(`- "${dayName}" = ${targetDateStr} (tomorrow)`);
            } else {
              examples.push(`- "${dayName}" = ${targetDateStr} (in ${daysUntil} days)`);
            }
          }

          console.log('[DateExamples:Generated]', {
            inputDate: dateStr,
            inputDayName: todayDayName,
            todayIndex,
            examples: examples.join(' | '),
          });

          return examples.join('\n');
        }

        const dateExamples = generateDateExamples(currentDate, dayOfWeek);

        const phase2Prompt = `You extract core, durable metadata for Gremly, a calm productivity app.
Your goal is to capture only information that is intrinsic to the item.
Do NOT include planning or scheduling logic.

=== DATE CONTEXT ===
Today is ${currentDate} (${dayOfWeek}).
User timezone: ${timezone}.

=== DATE CALCULATION RULES ===
You MUST calculate dates correctly. Do the math.

**For "tomorrow":**
- Add 1 day to today's date

**For named days (Monday, Tuesday, etc.):**
- Calculate the NEXT occurrence of that day
- CRITICAL: If today IS that day, the next occurrence is 7 DAYS FROM NOW (next week)
- Named days NEVER mean today - they always mean the NEXT future occurrence

**TODAY IS ${dayOfWeek.toUpperCase()} (${currentDate}). Date mapping for this week:**
${dateExamples}

**CRITICAL RULES:**
1. Do NOT return today's date unless the input explicitly says "today"
2. If the named day matches today, add 7 days (next week)
3. Named days ALWAYS refer to FUTURE dates, never today

**Output format:** YYYY-MM-DD

=== ITEM TYPE ===
Bucket: "${bucket}"${subtype ? ` (Subtype: "${subtype}")` : ''}

=== ORIGINAL TEXT ===
"${text.substring(0, 1500)}"

=== EXTRACTION RULES ===
If unsure, return null.
Do NOT invent or over-infer.

--------------------------------
FOR TODOS & HABITS:
--------------------------------
1. time_estimate_minutes
Estimate in 5-minute increments from 5 to 240 minutes.
Use factor-based reasoning, not category lookup.

=== ESTIMATION FRAMEWORK ===

Think through these factors for EVERY task:

**FACTOR 1: What's the core action?**
Estimate the minimum time if everything went perfectly.
- Send a text: 1-2 min
- Make a phone call: 10-15 min
- Walk somewhere: depends on distance
- Write something: depends on length/complexity
- Physical task: depends on scope

**FACTOR 2: Do I need to leave my current location?**
- Staying put (home/desk): no addition
- Leaving the house: +15-20 min minimum (getting ready, keys, shoes, return, settle back in)
- Going somewhere specific: add realistic travel time (round trip)

**FACTOR 3: Are other people or animals involved?**
- Solo task: you control the pace
- Another person: +10-15 min (coordination, waiting, social dynamics, conversations run long)
- Animal (dog walk, vet): +10-15 min (unpredictability, their pace not yours)
- Group/meeting: +15-20 min (gathering, small talk, herding cats)

**FACTOR 4: Physical world or digital?**
- Digital: more predictable, usually faster
- Physical: more variables, more can go wrong, round UP

**FACTOR 5: Is this bounded or open-ended?**
- Bounded ("pay bill", "send email"): clearer end point, estimate tighter
- Open-ended ("clean garage", "work on project"): no natural stopping point, estimate higher

**FACTOR 6: What commonly goes wrong?**
- Can't find something: +5-10 min
- Technical issues: +5-10 min
- Waiting (on hold, in line): +10-15 min
- Unexpected conversation: +10 min

=== THE PROCESS ===

1. Identify the core action and base time
2. Apply each relevant factor
3. Add up the total
4. Round UP to nearest 5 minutes
5. When uncertain between two estimates, choose the higher one

=== EXAMPLES WITH REASONING ===

**"Walk Bella" (dog walk)**
- Core: walking (20-25 min)
- Leave house: yes (+10 min prep/return)
- Animal involved: yes (+10 min for sniffing, unpredictability)
- Physical: yes (round up)
→ Total: 40-45 min → **45 min**

**"Call mom"**
- Core: phone conversation (15 min)
- Leave house: no
- Other person: yes (+15 min, mom calls run long)
- Digital: yes
→ Total: 30 min → **30 min**

**"Buy groceries"**
- Core: shopping (20 min in store)
- Leave house: yes (+10 min)
- Travel: yes (+20 min round trip)
- Physical: yes (round up)
- Can go wrong: lines, can't find items (+10 min)
→ Total: 60 min → **60 min**

**"Pay electric bill"**
- Core: online payment (3-5 min)
- Leave house: no
- Solo: yes
- Digital: yes
- Bounded: yes
→ Total: 5-10 min → **10 min**

**"Dentist appointment"**
- Core: appointment (30-45 min)
- Leave house: yes (+10 min)
- Travel: yes (+30 min round trip)
- Other people: yes (waiting room +15 min)
- Physical: yes
→ Total: 85-100 min → **90 min**

**"Write quarterly report"**
- Core: writing/analysis (60-90 min)
- Leave house: no
- Solo: yes
- Digital: yes
- Open-ended: somewhat (scope can expand)
- Deep focus required: yes (add buffer for getting into flow)
→ Total: 90-120 min → **90 min** (or 120 if complex)

**"Text Sarah about dinner"**
- Core: typing a message (1-2 min)
- Everything else: no
→ Total: 5 min → **5 min**

=== RANGE ANCHORS ===

- Minimum: 5 min (truly instant digital tasks)
- Maximum: 240 min (4 hours, major project blocks)
- Most common range: 15-60 min

=== CRITICAL RULES ===

- ALWAYS round UP, never down
- When uncertain, choose the higher estimate
- "Quick" tasks that involve leaving the house are never under 30 min
- Tasks involving other people are rarely under 20 min
- If the user specifies a duration ("30 min run"), honor their estimate
- Don't be afraid to estimate 45, 50, 55 min — use the full range

2. time_window
Only if explicitly mentioned:
"morning" | "day" | "evening" | null

3. energy_type
Choose ONE (strict enum):
- deep_focus (thinking, writing, coding, planning, creating, designing)
- administrative (email, forms, scheduling, logistics, booking, paying)
- physical (exercise, errands, movement, cleaning, walking, running)
- social (calls, meetings, conversations, interviews)
- quick (very small tasks under 10 min, low cognitive effort)

Default to "administrative" if unclear.

--------------------------------
DATE INTELLIGENCE (TODOS ONLY):
--------------------------------

Dates in user input can mean TWO different things:

**TARGET DATE** — When something IS or is DUE (external, immovable)
- Deadlines: "due April 15", "by Friday", "before the 10th", "before EOW", "by end of week"
- Events: "dentist Tuesday 2pm", "wedding June 15", "mom's birthday March 5"
- Expiration: "passport expires June", "lease ends March 1"

Signals: "due", "by", "before", "deadline", "expires", "is on", "appointment", "EOW", "EOM", "end of week", "end of month"

**SCHEDULED DATE** — When user plans to DO the work (internal, movable)
- Action + time: "call mom tomorrow", "go to gym Monday"
- Planning: "work on taxes Saturday", "start running next week"
- Intent: "do this tonight", "handle it tomorrow morning"

Signals: Action verb + time reference, "do", "work on", "handle", "start"

**CRITICAL: Deadline language OVERRIDES action pattern.**
If the time reference includes "before", "by", "due", "until", "EOW", "EOM" — it's a DEADLINE (target_date), NOT a scheduled_date.
- "book flights before EOW" → target_date only (deadline), scheduled_date: null
- "finish report by Friday" → target_date only (deadline), scheduled_date: null
- "call mom tomorrow" → scheduled_date only (no deadline language)

**AMBIGUOUS** — Could be either (flag for clarification)
- "dentist Tuesday" — appointment they have? or need to book?
- "passport June" — trip date? or expiration?
- Noun + date with no context

**RULES:**
1. If clear deadline language → target_date only
2. If clear action + time → scheduled_date only  
3. If both exist → set both (e.g., "work on taxes Saturday, due April 15")
4. If ambiguous → set target_date (safer default) and flag date_type_ambiguous

**OUTPUT FIELDS:**
- target_date: YYYY-MM-DD or null (when something IS or is DUE)
- scheduled_date: YYYY-MM-DD or null (when user will DO the work)
- date_type_ambiguous: boolean (true if unclear which type)

**EXAMPLES:**

"taxes due April 15" → target_date: "2026-04-15", scheduled_date: null
"call mom tomorrow" → target_date: null, scheduled_date: "2026-01-28"
"dentist Tuesday 2pm" → target_date: "2026-02-03", scheduled_date: null (appointment)
"work on report, due Friday" → target_date: "2026-01-31", scheduled_date: null (can add scheduled later)
"go to gym Monday" → target_date: null, scheduled_date: "2026-02-03"
"passport June" → target_date: "2026-06-01", date_type_ambiguous: true
"book flights before EOW" → target_date: end of current week (e.g., "2026-01-31" if today is Tue), scheduled_date: null
"finish report by end of week" → target_date: Friday of current week, scheduled_date: null
"submit by EOM" → target_date: last day of current month, scheduled_date: null

**EVENT + SCHEDULING ACTION (both dates exist):**
When input mentions WHEN something IS and WHEN to DO something about it:
- "Haircut appointment is Tuesday, book tomorrow" →
  - target_date: next Tuesday (when appointment IS)
  - scheduled_date: tomorrow (when to BOOK it)
- "Meeting is Friday, prep Thursday" →
  - target_date: Friday (when meeting IS)
  - scheduled_date: Thursday (when to PREP)
- "Conference in June, register by March 1" →
  - target_date: June (when conference IS)
  - scheduled_date: March 1 (when to REGISTER)

CRITICAL: These are TWO DIFFERENT dates. Extract BOTH correctly.

--------------------------------
FOR HABITS ONLY:
--------------------------------
4. extracted_frequency
Examples: daily, 2x/week, 3x/week, weekly

5. extracted_days
Array of numbers if mentioned (0=Sun … 6=Sat), else null

6. extracted_start_date
YYYY-MM-DD if mentioned, else null

--------------------------------
FOR LOGS (ALL SUBTYPES):
--------------------------------

**DATE EXTRACTION FOR LOGS:**

Logs can contain dates that represent EVENTS or REFERENCE INFORMATION.
ALWAYS extract dates when present, regardless of log subtype.

When the input describes an event, appointment, or scheduled occurrence:
- Extract the date as target_date
- Extract time if mentioned as event_time

Signals to extract dates for logs:
- Existence verbs + date: "is Tuesday", "is on March 5", "is next week"
- Status updates: "moved to Thursday", "scheduled for Friday"
- Event references: "appointment", "meeting", "birthday", "trip"

Examples:
- "Dentist appointment is Tuesday" → target_date: next Tuesday's date
- "Mom's birthday March 5" → target_date: "YYYY-03-05"
- "Meeting moved to Thursday 2pm" → target_date: next Thursday, event_time: "14:00"
- "Conference in June" → target_date: "YYYY-06-01"

Named days (Monday, Tuesday, etc.) → calculate next occurrence from current date.

IMPORTANT: Do NOT skip date extraction just because bucket is "log".
If a date is mentioned, extract it.

7. mood (JOURNAL ONLY)
Choose up to 3:
great, good, okay, low, tired,
anxious, overwhelmed, frustrated,
scattered, grateful, hopeful,
focused, calm

8. target_date (ALL LOG SUBTYPES)
Extract ANY date mentioned, in YYYY-MM-DD format.
This is when an event IS or HAPPENS — reference information.

9. event_time (ALL LOG SUBTYPES)
Extract time if mentioned, in HH:mm format (24-hour).

--------------------------------
TAGS (ALL TYPES):
--------------------------------
8. tags
- 2–4 lowercase, hyphenated
- Category + topic
- No filler words
- No people names (people go in the people array instead)

--------------------------------
PEOPLE EXTRACTION:
--------------------------------
9. people
Extract names of people mentioned in the text. Include:
- Explicit names: "John", "Sarah", "Dr. Smith", "Dave"
- Relationship words: "mom", "dad", "sister", "brother", "boss", "wife", "husband"
- Possessive patterns: 
  - "Dave's birthday" → extract "Dave"
  - "dad's anniversary" → extract "dad"
  - "mom's birthday" → extract "mom"
  - "Sarah's wedding" → extract "Sarah"
- Referenced people: "the one Sarah recommended" → extract "Sarah"
- Birthday/event context: "birthday April 27" with name in context → extract that name

Return as array of strings, max 10 people.

=== OUTPUT ===
Return ONLY valid JSON.

For TODOS:
{
  "tags": ["tag1", "tag2"],
  "time_estimate_minutes": number | null,
  "time_window": "morning" | "day" | "evening" | null,
  "energy_type": "deep_focus" | "administrative" | "physical" | "social" | "quick",
  "target_date": "YYYY-MM-DD" | null,
  "scheduled_date": "YYYY-MM-DD" | null,
  "date_type_ambiguous": boolean,
  "people": ["name1", "name2"] | []
}

For HABITS:
{
  "tags": ["tag1", "tag2"],
  "time_estimate_minutes": number | null,
  "time_window": "morning" | "day" | "evening" | null,
  "energy_type": "deep_focus" | "administrative" | "physical" | "social" | "quick",
  "extracted_frequency": "daily" | "2x/week" | "weekly" | etc,
  "extracted_days": [0, 1, 2] | null,
  "extracted_start_date": "YYYY-MM-DD" | null,
  "people": ["name1", "name2"] | []
}

For LOGS (journal):
{
  "tags": ["tag1", "tag2"],
  "mood": ["anxious", "grateful"] | null,
  "target_date": "YYYY-MM-DD" | null,
  "event_time": "HH:mm" | null,
  "people": ["name1", "name2"] | []
}

For LOGS (idea/general):
{
  "tags": ["tag1", "tag2"],
  "target_date": "YYYY-MM-DD" | null,
  "event_time": "HH:mm" | null,
  "people": ["name1", "name2"] | []
}`;

        const t0 = Date.now();

        try {
          const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${key}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [{ role: 'system', content: phase2Prompt }],
              temperature: 0.2,
              max_tokens: 300,
              response_format: { type: 'json_object' },
            }),
          });

          const oj = await res.json();
          const latency = Date.now() - t0;

          if (!res.ok) {
            console.log('[Phase2] API error', { error: oj.error, latency_ms: latency });
            return j({ error: 'enrichment_failed', latency_ms: latency }, 200);
          }

          const rawContent = oj?.choices?.[0]?.message?.content ?? '{}';
          let parsed;
          try {
            parsed = JSON.parse(rawContent);
          } catch {
            console.log('[Phase2] Parse error', { raw: rawContent });
            return j({ error: 'parse_failed', latency_ms: latency }, 200);
          }

          // Debug: Log date extraction from LLM
          console.log('[Phase2:DateDebug]', {
            inputText: text.substring(0, 100),
            currentDate,
            dayOfWeek,
            timezone,
            llm_target_date: parsed.target_date,
            llm_scheduled_date: parsed.scheduled_date,
            llm_extracted_date: parsed.extracted_date,
            llm_date_type_ambiguous: parsed.date_type_ambiguous,
          });

          // Validate and normalize tags
          let tags = Array.isArray(parsed.tags) ? parsed.tags : [];
          tags = tags
            .map((t) =>
              String(t)
                .toLowerCase()
                .replace(/\s+/g, '-')
                .replace(/[^a-z0-9-]/g, ''),
            )
            .filter((t) => t.length >= 2 && t.length <= 30)
            .filter((t) => !isStopTag(t))
            .slice(0, 7);

          // Validate time estimate
          let timeEstimate = null;
          if (bucket === 'todo' || bucket === 'habit') {
            const num = Number(parsed.time_estimate_minutes);
            if (Number.isFinite(num) && num > 0) {
              // Round to nearest 5 minutes, clamp between 5 and 240
              timeEstimate = Math.min(240, Math.max(5, Math.round(num / 5) * 5));
            }
          }

          // Validate time_window
          let timeWindow = null;
          if (parsed.time_window) {
            const validWindows = ['morning', 'day', 'evening'];
            const normalized = String(parsed.time_window).toLowerCase().trim();
            timeWindow = validWindows.includes(normalized) ? normalized : null;
          }

          // Validate energy_type
          let energyType = null;
          if (bucket === 'todo' || bucket === 'habit') {
            const validEnergyTypes = [
              'deep_focus',
              'administrative',
              'physical',
              'social',
              'quick',
            ];
            if (validEnergyTypes.includes(parsed.energy_type)) {
              energyType = parsed.energy_type;
            } else {
              energyType = 'administrative'; // default fallback
            }
          }

          // Validate date intelligence fields (todos only)
          let targetDate = null;
          let scheduledDate = null;
          let dateTypeAmbiguous = false;
          if (bucket === 'todo') {
            // Target date (when something IS or is DUE)
            if (parsed.target_date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.target_date)) {
              targetDate = parsed.target_date;
            }

            // Scheduled date (when user will DO the work)
            if (parsed.scheduled_date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.scheduled_date)) {
              scheduledDate = parsed.scheduled_date;
            }

            // Ambiguity flag
            dateTypeAmbiguous = parsed.date_type_ambiguous === true;

            // Backward compatibility: if old extracted_date exists and no new fields, use it as scheduled_date
            if (
              !targetDate &&
              !scheduledDate &&
              parsed.extracted_date &&
              /^\d{4}-\d{2}-\d{2}$/.test(parsed.extracted_date)
            ) {
              scheduledDate = parsed.extracted_date;
            }
          }

          // Event dates for logs (notes that are events)
          let noteTargetDate = null;
          let eventTime = null;
          if (bucket === 'log') {
            if (parsed.target_date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.target_date)) {
              noteTargetDate = parsed.target_date;
            }
            if (parsed.event_time && /^\d{2}:\d{2}$/.test(parsed.event_time)) {
              eventTime = parsed.event_time;
            }
          }

          // Validate extracted_start_date (habits)
          let extractedStartDate = null;
          if (bucket === 'habit' && parsed.extracted_start_date) {
            if (/^\d{4}-\d{2}-\d{2}$/.test(parsed.extracted_start_date)) {
              extractedStartDate = parsed.extracted_start_date;
            }
          }

          // Validate extracted_frequency (habits)
          let extractedFrequency = null;
          if (bucket === 'habit' && parsed.extracted_frequency) {
            extractedFrequency = String(parsed.extracted_frequency).trim();
          }

          // Validate extracted_days (habits)
          let extractedDays = null;
          if (bucket === 'habit') {
            if (Array.isArray(parsed.extracted_days) && parsed.extracted_days.length > 0) {
              const validDays = parsed.extracted_days
                .map((d) => Number(d))
                .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
              if (validDays.length > 0) {
                extractedDays = [...new Set(validDays)].sort((a, b) => a - b);
              }
            }
            // Fallback: parse from text
            if (!extractedDays) {
              extractedDays = parseDaysFromText(text);
            }
          }

          // Validate people
          let people = [];
          if (Array.isArray(parsed.people)) {
            people = parsed.people
              .map((p) => String(p).trim())
              .filter((p) => p.length > 0 && p.length < 50)
              .slice(0, 10);
          }

          // Validate mood (journals only)
          let mood = null;
          if (bucket === 'log' && subtype === 'journal' && Array.isArray(parsed.mood)) {
            mood = parsed.mood
              .map((m) => String(m).toLowerCase().trim())
              .filter((m) => VALID_MOODS.includes(m))
              .slice(0, 3);
            if (mood.length === 0) mood = null;
          }

          console.log('[Phase2]', {
            tags_count: tags.length,
            has_time_estimate: timeEstimate !== null,
            has_window: timeWindow !== null,
            has_energy: energyType !== null,
            has_target_date: targetDate !== null || noteTargetDate !== null,
            has_scheduled_date: scheduledDate !== null,
            date_ambiguous: dateTypeAmbiguous,
            has_event_time: eventTime !== null,
            has_frequency: extractedFrequency !== null,
            has_days: extractedDays !== null,
            has_start_date: extractedStartDate !== null,
            has_people: people.length > 0,
            has_mood: mood !== null,
            latency_ms: latency,
          });

          return j({
            tags,
            time_estimate_minutes: timeEstimate,
            time_window: timeWindow,
            energy_type: energyType,
            // New date intelligence fields for todos
            target_date: bucket === 'todo' ? targetDate : noteTargetDate,
            scheduled_date: scheduledDate,
            date_type_ambiguous: dateTypeAmbiguous,
            event_time: eventTime,
            // Keep existing habit fields
            extracted_start_date: extractedStartDate,
            extracted_frequency: extractedFrequency,
            extracted_days: extractedDays,
            // Other fields
            people,
            mood,
            latency_ms: latency,
          });
        } catch (err) {
          const latency = Date.now() - t0;
          console.log('[Phase2] Error', { error: String(err), latency_ms: latency });
          return j({ error: 'enrichment_failed', detail: String(err), latency_ms: latency }, 200);
        }
      }

      // --- EXISTING LOGIC BELOW (unchanged) ---
      const baseModel = body.model || 'gpt-4o-mini';

      const baseTemperature = Number.isFinite(body.temperature)
        ? body.temperature
        : type === 'classify'
          ? 0.1
          : 0.2;

      const baseMaxTokens = Number.isFinite(body.max_tokens)
        ? body.max_tokens
        : Number.isFinite(body.maxTokens)
          ? body.maxTokens
          : Number.isFinite(body.max_completion_tokens)
            ? body.max_completion_tokens
            : type === 'classify'
              ? 160
              : 200;

      const isSpaceChatLane = lane === 'space_chat' && type !== 'classify';
      const actualModel = isSpaceChatLane ? 'gpt-4.1' : baseModel;

      const temperature =
        actualModel === 'gpt-4.1' && !Number.isFinite(body.temperature) ? 0.7 : baseTemperature;

      // FIX 3: Increased token limit for Space Chat (was 400, now 800)
      const maxTokensValue = isSpaceChatLane ? 800 : baseMaxTokens;

      console.log('[MODEL]', {
        lane,
        model: actualModel,
        streaming: wantsStreaming,
        maxTokens: maxTokensValue,
      });

      let originalText = '';
      let messages = Array.isArray(body.messages) ? body.messages : [];

      if (type === 'classify') {
        const sysOverride = body.system || body.systemPrompt || null;
        const text = body.text || body.prompt || body.input || body.message || '';
        originalText = String(text || '');

        const masterPrompt = `You are classifying personal thoughts and tasks for a productivity app.
 
 BUCKETS (choose one):
 
 - 'todo': Clear, unhedged action. Has specific verb + object.
 - 'habit': Recurring behavior with explicit frequency.
 - 'log-journal': Emotional reflection.
 - 'log-idea': Brainstorming or conceptual.
 - 'log-general': Everything meaningful but not a todo/habit.
 - 'unsorted': Only gibberish.
 
 Return ONLY JSON:
 {
  "bucket": "...",
  "confidence": 0-100,
  "title": "...",
  "tags": ["a","b"]
 }`;

        messages = [{ role: 'system', content: masterPrompt }];
        if (sysOverride) messages.push({ role: 'system', content: String(sysOverride) });
        messages.push({ role: 'user', content: originalText });
      } else {
        if (messages.length === 0) {
          const sys = body.system || body.systemPrompt || null;
          const text =
            body.text || body.prompt || body.input || body.message || 'Respond succinctly.';
          originalText = String(text || '');
          messages = [];
          if (sys) messages.push({ role: 'system', content: String(sys) });
          messages.push({ role: 'user', content: text });
        } else {
          const lastUser = [...messages].reverse().find((m) => m.role === 'user');
          originalText = lastUser && typeof lastUser.content === 'string' ? lastUser.content : '';
        }

        // FIX 1: Updated Space Chat formatting prompt - balanced, helpful without being pushy
        if (isSpaceChatLane) {
          const spaceChatFormattingPrompt = `FORMATTING RULES (Gremly mobile chat):

Keep responses concise and scannable for mobile.
- Use **bold** for key phrases (1-2 per response max)
- Short paragraphs (2-3 sentences max)
- Bullets only when listing 3+ items (max 4 bullets)
- 50-150 words for most responses
- No markdown headers (#), tables, or code blocks
- No exclamation marks—keep it calm

=== SAVE SUGGESTIONS ===
Do NOT mention saving in your response text. When your response contains useful content worth saving, append a hidden block AFTER your response.

**When to suggest saving:**
- TODO: Clear, completable action (verb + object)
- HABIT: Recommendation with explicit frequency ("daily", "3x per week")
- NOTE: Reference info, summaries, or explanations worth keeping
- STEPS: When you provide 2+ actionable steps

**When NOT to suggest:**
- Simple factual answers
- Clarifying questions back to the user
- Emotional support responses
- Very short responses (under 50 words)
- Exploratory conversation

**Format:** After your response, on a NEW LINE:
<!--SAVE:{"type":"todo","title":"Your title here","steps":["Step 1","Step 2"]}-->

Rules:
- type: "todo", "habit", or "note"
- title: 2-6 words, action-oriented for todos/habits
- steps: Extract distinct actionable items (max 8)
- JSON must be valid (proper quotes, no trailing commas)`;

          const exists = messages.some(
            (m) =>
              m.role === 'system' &&
              typeof m.content === 'string' &&
              m.content.includes('FORMATTING RULES'),
          );

          if (!exists) {
            messages.unshift({ role: 'system', content: spaceChatFormattingPrompt });
          }
        }
      }

      // ============================================================================
      // STREAMING RESPONSE FOR SPACE CHAT
      // ============================================================================
      if (isSpaceChatStreaming && isSpaceChatLane) {
        console.log('[SpaceChat:Streaming] Starting SSE stream');

        // Space Chat routing - conservative, default to 4.1
        const lastUserMsgSpace = messages.filter((m) => m.role === 'user').pop()?.content || '';
        const msgLowerSpace = lastUserMsgSpace.toLowerCase();
        const canUseMiniSpace =
          lastUserMsgSpace.length < 50 &&
          (lastUserMsgSpace.match(/\?/g) || []).length <= 1 &&
          messages.filter((m) => m.role === 'user').length < 3 &&
          !msgLowerSpace.includes('why') &&
          !msgLowerSpace.includes('how do i') &&
          !msgLowerSpace.includes('help me') &&
          !msgLowerSpace.includes('feeling') &&
          !msgLowerSpace.includes('explain') &&
          !msgLowerSpace.includes('research');

        const spaceModel = canUseMiniSpace ? 'gpt-4o-mini' : 'gpt-4.1';
        const spaceMaxTokens =
          lastUserMsgSpace.length > 100 ||
          msgLowerSpace.includes('plan') ||
          msgLowerSpace.includes('steps')
            ? 800
            : 600;
        console.log('[SpaceChat:Streaming] Model routing:', {
          model: spaceModel,
          maxTokens: spaceMaxTokens,
          canUseMini: canUseMiniSpace,
        });

        // Create TransformStream early so we can send fetching indicators
        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();

        // Send initial SSE ping to establish line ending detection
        (async () => {
          await writer.write(encoder.encode(': ping\n\n'));
        })();

        // Detect URLs in the user's message
        const detectedUrlsSpace = extractUrlsFromText(lastUserMsgSpace);
        let urlContextSpace = '';
        let fetchedUrlSpace = null;

        if (detectedUrlsSpace.length > 0) {
          console.log('[SpaceChat:Streaming] URLs detected:', detectedUrlsSpace);

          // Fetch the first URL
          const urlToFetch = detectedUrlsSpace[0];

          // Send "fetching" indicator to client
          await writer.write(
            encoder.encode(
              `data: ${JSON.stringify({
                fetching: true,
                fetchingUrl: urlToFetch,
                done: false,
              })}\n\n`,
            ),
          );

          const extracted = await executeTavilyExtract(urlToFetch, env.TAVILY_API_KEY);

          if (extracted && extracted.success) {
            fetchedUrlSpace = {
              url: extracted.url,
              title: extracted.title,
            };

            urlContextSpace = `\n\n=== EXTRACTED CONTENT FROM URL ===\nURL: ${extracted.url}\nTitle: ${extracted.title}\n\n${extracted.content}\n\n=== END EXTRACTED CONTENT ===\n\nThe user has shared this link. Summarize the key points and answer any questions they have about it. If they just shared the link without a specific question, provide a helpful summary of what the content covers.`;

            console.log('[SpaceChat:Streaming] URL content extracted');
          } else {
            urlContextSpace = `\n\n[Note: The user shared a link (${urlToFetch}) but I couldn't access its content. It may be paywalled, require login, or be temporarily unavailable. Let the user know and offer to help if they can paste the content directly.]`;

            console.log('[SpaceChat:Streaming] URL extraction failed');
          }

          // Clear fetching indicator
          await writer.write(
            encoder.encode(
              `data: ${JSON.stringify({
                fetching: false,
                done: false,
              })}\n\n`,
            ),
          );
        }

        // Check if previous messages contain search results to avoid redundant searches
        const previousSearchContext = messages
          .filter((m) => m.role === 'assistant' && m.sources?.length > 0)
          .slice(-1)[0];

        // === USER PROFILE & SESSION CONTEXT FOR SPACE CHAT ===
        let spaceSessionContextStr = '';
        let spaceUserProfile = null;
        let spaceContentData = null;
        if (body.userId) {
          try {
            // Fetch all context in parallel
            const [sessionData, profile, spaceContent] = await Promise.all([
              getSessionContext(body.userId, env),
              getUserProfile(body.userId, env),
              body.spaceId
                ? getSpaceContent(body.spaceId, body.userId, env)
                : Promise.resolve(null),
            ]);
            spaceSessionContextStr = buildSessionContextString(sessionData, {
              spaceId: body.spaceId,
            });
            spaceUserProfile = profile;
            spaceContentData = spaceContent;
            if (spaceSessionContextStr || spaceUserProfile || spaceContentData) {
              console.log('[SpaceChat] Context loaded', {
                userId: body.userId.slice(0, 8),
                sessionContextLength: spaceSessionContextStr?.length || 0,
                hasUserProfile: !!spaceUserProfile,
                spaceContent: spaceContentData?.counts || null,
              });
            }
          } catch (err) {
            console.error('[SpaceChat] Context error', err);
          }
        }

        // Build context injection for space chat
        let spaceContextInjection = '';

        // Get age guidance using both time and data signals
        const spaceAgeInfo = getAgeGuidance(
          spaceUserProfile?.relationshipStartedAt,
          spaceUserProfile?.signals,
        );
        console.log(`[SpaceChat] ${spaceAgeInfo.logSummary}`);
        spaceContextInjection += `\n${spaceAgeInfo.promptGuidance}\n`;

        if (spaceUserProfile?.profileText) {
          spaceContextInjection += `\n=== ABOUT THIS USER ===\n${spaceUserProfile.profileText}\n`;
        } else {
          spaceContextInjection += `\n=== ABOUT THIS USER ===\nNew user — no patterns observed yet.\n`;
        }

        // Add space content (notes, todos, habits saved to this space)
        const spaceContentStr = spaceContentData
          ? buildSpaceContentString(spaceContentData, body.spaceName || 'This Space')
          : '';
        if (spaceContentStr) {
          spaceContextInjection += `\n${spaceContentStr}\n`;
        }

        if (spaceSessionContextStr) {
          spaceContextInjection += `\n${spaceSessionContextStr}`;
        }

        // Build messages with optional search context hint, injecting URL context if present
        const processedMessagesSpace = messages.map((msg, idx, arr) => {
          // Add URL context to the last user message
          if (urlContextSpace && idx === arr.length - 1 && msg.role === 'user') {
            return { ...msg, content: msg.content + urlContextSpace };
          }
          return msg;
        });

        let spaceChatMessages = [...processedMessagesSpace];

        // Add context injection as a separate system message
        if (spaceContextInjection) {
          spaceChatMessages.unshift({
            role: 'system',
            content: spaceContextInjection,
          });
        }

        if (previousSearchContext) {
          spaceChatMessages.push({
            role: 'system',
            content: `Note: You previously searched and found information about this topic. The sources were: ${previousSearchContext.sources.map((s) => s.title).join(', ')}. For follow-up questions on the same topic, use this context rather than searching again unless the user asks for new/different information.`,
          });
        }

        const openaiPayload = {
          model: spaceModel,
          messages: spaceChatMessages,
          temperature,
          stream: true,
          tools: [WEB_SEARCH_TOOL],
          tool_choice: 'auto',
        };

        if (spaceModel === 'gpt-4.1' || spaceModel === 'gpt-4o') {
          openaiPayload.max_completion_tokens = spaceMaxTokens;
        } else {
          openaiPayload.max_tokens = spaceMaxTokens;
        }

        const t0 = Date.now();

        const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(openaiPayload),
        });

        if (!openaiRes.ok) {
          const errText = await openaiRes.text().catch(() => '');
          console.log('[SpaceChat:Streaming] OpenAI error', {
            status: openaiRes.status,
            error: errText,
          });
          return j({ error: `openai_error: ${openaiRes.status}`, detail: errText }, 200);
        }

        (async () => {
          const reader = openaiRes.body.getReader();
          let buffer = '';
          let fullContent = '';

          // Track tool calls accumulation (array for multiple calls)
          let toolCalls = [];

          try {
            // eslint-disable-next-line no-constant-condition
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split(/\r?\n/);
              buffer = lines.pop() || '';

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed === 'data: [DONE]') continue;
                if (!trimmed.startsWith('data: ')) continue;

                try {
                  const json = JSON.parse(trimmed.slice(6));
                  const delta = json.choices?.[0]?.delta?.content;

                  if (delta) {
                    fullContent += delta;
                    const sseData = JSON.stringify({ delta, done: false });
                    await writer.write(encoder.encode(`data: ${sseData}\n\n`));
                  }

                  // Check for tool calls (handle multiple)
                  const toolCallDeltas = json.choices?.[0]?.delta?.tool_calls;
                  if (toolCallDeltas && Array.isArray(toolCallDeltas)) {
                    for (const tcd of toolCallDeltas) {
                      const idx = tcd.index ?? 0;
                      if (!toolCalls[idx]) {
                        toolCalls[idx] = { id: null, name: null, arguments: '' };
                      }
                      if (tcd.id) toolCalls[idx].id = tcd.id;
                      if (tcd.function?.name) toolCalls[idx].name = tcd.function.name;
                      if (tcd.function?.arguments)
                        toolCalls[idx].arguments += tcd.function.arguments;
                    }
                  }
                } catch (parseErr) {
                  console.log('[SpaceChat:Streaming] Chunk parse error', {
                    line: trimmed.slice(0, 100),
                  });
                }
              }
            }

            // Track search metadata
            let sources = undefined;
            let searchQueries = [];

            // Filter to only web_search tool calls with arguments
            const webSearchCalls = toolCalls.filter(
              (tc) => tc.name === 'web_search' && tc.arguments,
            );

            if (webSearchCalls.length > 0) {
              console.log('[SpaceChat:Streaming] Web search triggered', {
                searchCount: webSearchCalls.length,
              });

              // Notify client we're searching (show first query)
              let firstQuery = '';
              try {
                const firstArgs = JSON.parse(webSearchCalls[0].arguments);
                firstQuery = firstArgs.query || '';
              } catch {
                const match = webSearchCalls[0].arguments.match(/"query"\s*:\s*"([^"]+)"/);
                firstQuery = match ? match[1] : 'multiple topics';
              }
              const searchNotice =
                webSearchCalls.length > 1
                  ? `${firstQuery} (+${webSearchCalls.length - 1} more)`
                  : firstQuery;
              await writer.write(
                encoder.encode(
                  `data: ${JSON.stringify({ searching: true, query: searchNotice })}\n\n`,
                ),
              );

              // Execute all searches in parallel
              const searchT0 = Date.now();
              const searchPromises = webSearchCalls.map(async (tc) => {
                try {
                  let query;
                  try {
                    const args = JSON.parse(tc.arguments);
                    query = args.query;
                  } catch (parseErr) {
                    // Try regex extraction for malformed JSON
                    const match = tc.arguments.match(/"query"\s*:\s*"([^"]+)"/);
                    if (match) {
                      query = match[1];
                      console.log(
                        '[SpaceChat:Streaming] Recovered query from malformed JSON:',
                        query,
                      );
                    } else {
                      console.log(
                        '[SpaceChat:Streaming] Could not parse tool arguments:',
                        tc.arguments.slice(0, 200),
                      );
                      return { toolCallId: tc.id, query: null, results: null };
                    }
                  }

                  searchQueries.push(query);
                  const results = await executeTavilySearch(query, env.TAVILY_API_KEY);
                  return { toolCallId: tc.id, query, results };
                } catch (err) {
                  console.log('[SpaceChat:Streaming] Individual search error:', err);
                  return { toolCallId: tc.id, query: null, results: null };
                }
              });

              const searchResults = await Promise.all(searchPromises);
              const searchLatency = Date.now() - searchT0;

              const successfulSearches = searchResults.filter(
                (sr) => sr.results && sr.results.results.length > 0,
              );
              console.log('[SpaceChat:Streaming] Searches complete', {
                total: searchResults.length,
                successful: successfulSearches.length,
                latency: searchLatency,
              });

              if (successfulSearches.length > 0) {
                // Build follow-up messages with ALL tool results
                const assistantToolCalls = successfulSearches.map((sr) => ({
                  id: sr.toolCallId,
                  type: 'function',
                  function: {
                    name: 'web_search',
                    arguments: JSON.stringify({ query: sr.query }),
                  },
                }));

                const toolResultMessages = successfulSearches.map((sr) => ({
                  role: 'tool',
                  tool_call_id: sr.toolCallId,
                  content: JSON.stringify(sr.results),
                }));

                const followUpMessages = [
                  ...messages,
                  {
                    role: 'assistant',
                    content: null,
                    tool_calls: assistantToolCalls,
                  },
                  ...toolResultMessages,
                ];

                // Second API call for final response - with real streaming
                const followUpRes = await fetch('https://api.openai.com/v1/chat/completions', {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${key}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    model: actualModel,
                    messages: followUpMessages,
                    temperature,
                    max_completion_tokens: 800,
                    stream: true,
                  }),
                });

                // Stream the follow-up response to client
                const followUpReader = followUpRes.body.getReader();
                const followUpDecoder = new TextDecoder();
                let followUpBuffer = '';
                let readerDone = false;

                while (!readerDone) {
                  const result = await followUpReader.read();
                  readerDone = result.done;
                  if (readerDone) break;
                  const value = result.value;

                  followUpBuffer += followUpDecoder.decode(value, { stream: true });

                  // Process complete lines only
                  const lines = followUpBuffer.split('\n');
                  followUpBuffer = lines.pop() || ''; // Keep incomplete line in buffer

                  for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed.startsWith('data:')) continue;

                    const jsonStr = trimmed.replace(/^data:\s*/, '').trim();
                    if (jsonStr === '[DONE]') continue;

                    try {
                      const json = JSON.parse(jsonStr);
                      const delta = json.choices?.[0]?.delta?.content;
                      if (delta) {
                        fullContent += delta;
                        await writer.write(
                          encoder.encode(`data: ${JSON.stringify({ delta, done: false })}\n\n`),
                        );
                      }
                    } catch {
                      // Skip malformed JSON
                    }
                  }
                }

                // Process any remaining buffer
                if (followUpBuffer.trim()) {
                  const trimmed = followUpBuffer.trim();
                  if (trimmed.startsWith('data:')) {
                    const jsonStr = trimmed.replace(/^data:\s*/, '').trim();
                    if (jsonStr !== '[DONE]') {
                      try {
                        const json = JSON.parse(jsonStr);
                        const delta = json.choices?.[0]?.delta?.content;
                        if (delta) {
                          fullContent += delta;
                          await writer.write(
                            encoder.encode(`data: ${JSON.stringify({ delta, done: false })}\n\n`),
                          );
                        }
                      } catch {
                        // Skip
                      }
                    }
                  }
                }

                // Combine all sources
                sources = successfulSearches.flatMap((sr) =>
                  sr.results.results.map((r) => ({ title: r.title, url: r.url })),
                );
              }
            }

            // Fallback: if tool calls were made but we have no content, respond without search
            if (webSearchCalls.length > 0 && !fullContent) {
              console.log(
                '[SpaceChat:Streaming] Search fallback - responding without search results',
              );

              const fallbackRes = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${key}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  model: actualModel,
                  messages: [
                    ...messages,
                    {
                      role: 'system',
                      content:
                        'Web search is temporarily unavailable. Please respond based on your knowledge, and let the user know you could not search for the latest information.',
                    },
                  ],
                  temperature,
                  max_completion_tokens: 600,
                }),
              });

              const fallbackData = await fallbackRes.json();
              fullContent =
                fallbackData?.choices?.[0]?.message?.content ??
                'I had trouble searching for that information. Could you try rephrasing your question?';

              // Stream the fallback content
              const words = fullContent.split(' ');
              for (let i = 0; i < words.length; i += 3) {
                const chunk = words.slice(i, i + 3).join(' ') + ' ';
                await writer.write(
                  encoder.encode(`data: ${JSON.stringify({ delta: chunk, done: false })}\n\n`),
                );
                await new Promise((resolve) => setTimeout(resolve, 15));
              }
            }

            // For final event, use first search query or combined
            const searchQuery = searchQueries.length > 0 ? searchQueries.join(' | ') : undefined;

            // Extract smart save suggestion (inline from model)
            const { suggestion: smartSuggestion, cleanContent } =
              extractSaveSuggestion(fullContent);

            // Use cleaned content for display
            fullContent = cleanContent;

            // Use smart suggestion if available
            const save_suggestion = smartSuggestion || null;

            if (smartSuggestion) {
              console.log('[SpaceChat:Streaming] Extracted save suggestion:', {
                type: smartSuggestion.type,
                title: smartSuggestion.title,
                hasSteps: !!smartSuggestion.steps?.length,
              });
            }

            const latency = Date.now() - t0;

            const finalData = JSON.stringify({
              done: true,
              full_content: fullContent,
              save_suggestion,
              sources,
              search_query: searchQuery,
              latency_ms: latency,
              fetchedUrl: fetchedUrlSpace,
            });
            await writer.write(encoder.encode(`data: ${finalData}\n\n`));

            console.log('[SpaceChat:Streaming] Complete', {
              latency_ms: latency,
              content_length: fullContent.length,
              used_search: !!searchQuery,
            });
          } catch (streamErr) {
            console.log('[SpaceChat:Streaming] Stream error', { error: String(streamErr) });
            const errorData = JSON.stringify({
              error: String(streamErr),
              done: true,
              full_content: fullContent,
            });
            await writer.write(encoder.encode(`data: ${errorData}\n\n`));
          } finally {
            await writer.close();
          }
        })();

        return new Response(readable, {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
          },
        });
      }
      // ============================================================================
      // END SPACE CHAT STREAMING
      // ============================================================================

      // --- NON-STREAMING (original logic, with web search for space_chat) ---
      const t0NonStream = Date.now();

      // Space Chat routing - conservative, default to 4.1
      const lastUserMsgNonStream = messages.filter((m) => m.role === 'user').pop()?.content || '';
      const msgLowerNonStream = lastUserMsgNonStream.toLowerCase();
      const canUseMiniNonStream =
        isSpaceChatLane &&
        lastUserMsgNonStream.length < 50 &&
        (lastUserMsgNonStream.match(/\?/g) || []).length <= 1 &&
        messages.filter((m) => m.role === 'user').length < 3 &&
        !msgLowerNonStream.includes('why') &&
        !msgLowerNonStream.includes('how do i') &&
        !msgLowerNonStream.includes('help me') &&
        !msgLowerNonStream.includes('feeling') &&
        !msgLowerNonStream.includes('explain') &&
        !msgLowerNonStream.includes('research');

      const nonStreamModel = isSpaceChatLane
        ? canUseMiniNonStream
          ? 'gpt-4o-mini'
          : 'gpt-4.1'
        : actualModel;
      const nonStreamMaxTokens = isSpaceChatLane
        ? lastUserMsgNonStream.length > 100 ||
          msgLowerNonStream.includes('plan') ||
          msgLowerNonStream.includes('steps')
          ? 800
          : 600
        : maxTokensValue;

      if (isSpaceChatLane) {
        console.log('[SpaceChat] Model routing:', {
          model: nonStreamModel,
          maxTokens: nonStreamMaxTokens,
          canUseMini: canUseMiniNonStream,
        });
      }

      const openaiPayload = { model: nonStreamModel, messages, temperature, stream: false };

      if (nonStreamModel === 'gpt-4.1' || nonStreamModel === 'gpt-4o') {
        openaiPayload.max_completion_tokens = nonStreamMaxTokens;
      } else {
        openaiPayload.max_tokens = nonStreamMaxTokens;
      }

      // Add web search tools for space_chat lane
      if (isSpaceChatLane) {
        openaiPayload.tools = [WEB_SEARCH_TOOL];
        openaiPayload.tool_choice = 'auto';
      }

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(openaiPayload),
      });

      const oj = await res.json();

      if (!res.ok) {
        return j(
          { error: (oj && (oj.error?.message || oj.message)) || 'openai_error', code: res.status },
          200,
        );
      }

      // Handle web search for space_chat lane
      let content = oj?.choices?.[0]?.message?.content ?? oj?.choices?.[0]?.text ?? '';
      let sources = undefined;
      let searchQuery = undefined;

      if (isSpaceChatLane) {
        const toolCall = oj?.choices?.[0]?.message?.tool_calls?.[0];

        if (toolCall?.function?.name === 'web_search') {
          try {
            const args = JSON.parse(toolCall.function.arguments);
            searchQuery = args.query;

            console.log('[SpaceChat] Web search triggered', { query: searchQuery });

            const searchT0 = Date.now();
            const searchResults = await executeTavilySearch(searchQuery, env.TAVILY_API_KEY);
            const searchLatency = Date.now() - searchT0;

            console.log('[SpaceChat] Search complete', {
              resultCount: searchResults?.results?.length || 0,
              latency: searchLatency,
            });

            if (searchResults && searchResults.results.length > 0) {
              // Build follow-up messages
              const followUpMessages = [
                ...messages,
                {
                  role: 'assistant',
                  content: null,
                  tool_calls: [
                    {
                      id: toolCall.id,
                      type: 'function',
                      function: toolCall.function,
                    },
                  ],
                },
                {
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  content: JSON.stringify(searchResults),
                },
              ];

              // Second API call
              const followUpRes = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${key}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  model: actualModel,
                  messages: followUpMessages,
                  temperature,
                  max_completion_tokens: 800,
                }),
              });

              const followUpData = await followUpRes.json();
              content = followUpData?.choices?.[0]?.message?.content ?? '';
              sources = searchResults.results.map((r) => ({ title: r.title, url: r.url }));
            }
          } catch (searchErr) {
            console.log('[SpaceChat] Search error:', searchErr);
          }
        }

        const latency = Date.now() - t0NonStream;
        console.log('[SpaceChat] Complete', {
          latency_ms: latency,
          content_length: content.length,
          used_search: !!searchQuery,
        });
      }

      if (type === 'classify') {
        const rawContent = oj?.choices?.[0]?.message?.content ?? '';
        const cleaned = rawContent
          .replace(/```json\n?/g, '')
          .replace(/```\n?/g, '')
          .trim();

        let parsed;
        try {
          parsed = JSON.parse(cleaned);
        } catch {
          return j({ error: 'classification_unparsable', raw: rawContent }, 200);
        }

        const VALID_BUCKETS = [
          'todo',
          'habit',
          'log-journal',
          'log-idea',
          'log-general',
          'unsorted',
        ];

        let bucket = (parsed.bucket || '').toLowerCase().trim();
        if (!VALID_BUCKETS.includes(bucket)) bucket = 'log-general';

        let confidence = Number(parsed.confidence ?? 50);
        if (!Number.isFinite(confidence)) confidence = 50;
        confidence = Math.max(0, Math.min(100, confidence));

        const tags = Array.isArray(parsed.tags)
          ? parsed.tags.map((t) => String(t)).slice(0, 5)
          : [];

        const title =
          typeof parsed.title === 'string' && parsed.title.trim().length > 0
            ? parsed.title.trim()
            : originalText.split(/\s+/).slice(0, 7).join(' ');

        return j({
          id: String(oj.id || crypto.randomUUID()),
          classification: {
            bucket,
            type: bucket === 'todo' ? 'todo' : bucket === 'habit' ? 'habit' : 'log',
            subtype:
              bucket === 'log-journal'
                ? 'journal'
                : bucket === 'log-idea'
                  ? 'idea'
                  : bucket === 'log-general'
                    ? 'general'
                    : null,
            category: bucket,
            tags,
            confidence,
            title,
          },
          aiTitle: title,
          aiTagsDebug: tags,
        });
      }

      // For non-space_chat lanes, extract content here (space_chat already has it from tool handling above)
      if (!isSpaceChatLane) {
        content = oj?.choices?.[0]?.message?.content ?? oj?.choices?.[0]?.text ?? '';
      }

      let save_suggestion = null;
      if (lane === 'space_chat') {
        // save_suggestion removed
      }

      return j({
        id: String((oj.id || '').replace(/^chatcmpl-/, 'cmpl-')),
        content,
        model: oj.model,
        usage: oj.usage || null,
        save_suggestion,
        sources,
        search_query: searchQuery,
      });
    } catch (err) {
      return j({ error: 'proxy_error', detail: String(err?.message || 'unknown') }, 200);
    }
  },
};

function j(obj, status = 200) {
  return Response.json
    ? Response.json(obj, {
        status,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
      })
    : new Response(JSON.stringify(obj), {
        status,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
      });
}

// Safe JSON parser that handles markdown fences and malformed responses
function safeParseJson(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let s = raw.trim();
  // Strip markdown code fences
  s = s
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  // Extract first {...} block if there's extra text
  const firstBrace = s.indexOf('{');
  const lastBrace = s.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    s = s.slice(firstBrace, lastBrace + 1);
  }
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
