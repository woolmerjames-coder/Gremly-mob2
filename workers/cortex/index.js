/**
 * Cortex Proxy Worker
 *
 * Features:
 * - Phase 1 classification (non-streaming) - UPDATED with semantic classification + MULTI-ENTITY DETECTION
 * - Phase 2 enrichment (streaming with flush fixes, padding, heartbeat)
 * - Space Chat (streaming OR non-streaming based on stream flag)
 * - Space Chat Save (v2.8) - classify + enrich in single call for chat saves
 * - Entity Chat (v4.0) - NEW: scoped chat for individual entities (todos, habits, notes)
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
        return t
          .split(/\s+/)
          .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
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
        const validBuckets = ['todo', 'habit', 'log'];
        let b = String(bucket || '').toLowerCase();
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

        if (!smartTitle || smartTitle.length < 3) smartTitle = text.substring(0, 60).trim();

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
        if (entity.body) entityContextParts.push(`Details: "${entity.body.substring(0, 500)}"`);
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
              'The user wants to research or learn more about this. Help them explore relevant aspects and find useful information.',
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

        const entityChatSystemPrompt = `You are Gremly, helping a user work through a specific item in their productivity app.
 
 === ENTITY CONTEXT ===
 ${entityContext}${sweepContextStr}${presetInstruction}
 
 === YOUR ROLE ===
 Help the user with THIS SPECIFIC ITEM. You can:
 - Break it down into steps
 - Help research or explore aspects of it
 - Surface what might be blocking them
 - Help them think through approach
 - Suggest actionable checklists or notes worth saving
 
 === TONE & FORMAT ===
 - Warm but concise (this is mobile)
 - Reference specifics from the entity
 - 40-100 words typically (be brief!)
 - Use **bold** for 1 key phrase per response
 - Bullets only for 3+ items, max 4 bullets
 - No markdown headers (#), tables, or code blocks
 - No exclamation marks
 - Get to the point fast, no preamble
 
 === SAVE HANDLING ===
 Do NOT mention saving in your response. The app handles save UI separately.
 Never say: "Save this", "Worth saving", "Keep this", "You can save this", "Worth keeping"
 Just provide the helpful content and stop.
 
 === SPACE PROMOTION (USE VERY SPARINGLY) ===
 Only suggest creating a Space if ALL of these are true:
 - The conversation has revealed 3+ distinct sub-tasks or workstreams
 - These sub-tasks have different timelines or people involved
 - The user seems to be managing something that will take weeks, not days
 
 When suggesting, be gentle and brief:
 "This is becoming a solid project. Want me to set up a Space for it?"
 
 Do NOT suggest a Space just because:
 - The task is difficult or complex
 - You've given a detailed breakdown
 - The checklist has several items
 - You've had a few back-and-forths
 
 Most entity chats should NEVER suggest a Space. It's a rare recommendation.`;

        // Build messages array for OpenAI
        const openaiMessages = [
          { role: 'system', content: entityChatSystemPrompt },
          ...messages.slice(-20), // Keep last 20 messages for context
        ];

        const t0 = Date.now();

        // =========================
        // STREAMING ENTITY CHAT
        // =========================
        if (isEntityChatStreaming) {
          console.log('[EntityChat:Streaming] Starting SSE stream');

          const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${key}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'gpt-4.1',
              messages: openaiMessages,
              temperature: 0.7,
              max_completion_tokens: 600,
              stream: true,
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

          const { readable, writable } = new TransformStream();
          const writer = writable.getWriter();
          const encoder = new TextEncoder();
          const decoder = new TextDecoder();

          (async () => {
            const reader = openaiRes.body.getReader();
            let buffer = '';
            let fullContent = '';

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
                  } catch (parseErr) {
                    console.log('[EntityChat:Streaming] Chunk parse error', {
                      line: trimmed.slice(0, 100),
                    });
                  }
                }
              }

              // Detect saveable content in final response
              const saveable = detectSaveableContent(fullContent);

              // Extract save suggestion (fast post-pass)
              const save_suggestion = null;

              // Detect space promotion suggestion
              const promotion = detectSpacePromotion(fullContent, messages.length);

              const latency = Date.now() - t0;
              const finalData = JSON.stringify({
                done: true,
                full_content: fullContent,
                saveable,
                save_suggestion,
                promotion,
                latency_ms: latency,
              });
              await writer.write(encoder.encode(`data: ${finalData}\n\n`));

              console.log('[EntityChat:Streaming] Complete', {
                latency_ms: latency,
                content_length: fullContent.length,
                has_saveable: saveable?.detected,
                has_promotion: promotion?.suggested,
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
        try {
          const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${key}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'gpt-4.1',
              messages: openaiMessages,
              temperature: 0.7,
              max_completion_tokens: 600,
            }),
          });

          const oj = await res.json();
          const latency = Date.now() - t0;

          if (!res.ok) {
            console.log('[EntityChat] API error', { error: oj.error, latency_ms: latency });
            return j(
              { error: 'entity_chat_failed', detail: oj.error?.message, latency_ms: latency },
              200,
            );
          }

          const content = oj?.choices?.[0]?.message?.content ?? '';

          // Detect saveable content
          const saveable = detectSaveableContent(content);

          // Extract save suggestion (fast post-pass)
          const save_suggestion = null;

          // Detect space promotion suggestion
          const promotion = detectSpacePromotion(content, messages.length);

          console.log('[EntityChat] Complete', {
            latency_ms: latency,
            content_length: content.length,
            has_saveable: saveable?.detected,
            has_promotion: promotion?.suggested,
          });

          return j({
            content,
            saveable,
            save_suggestion,
            promotion,
            latency_ms: latency,
          });
        } catch (err) {
          const latency = Date.now() - t0;
          console.log('[EntityChat] Error', { error: String(err), latency_ms: latency });
          return j({ error: 'entity_chat_failed', detail: String(err), latency_ms: latency }, 200);
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
        const detectedTemporal = body.detectedTemporal || null;
        const ambiguityReason = body.ambiguityReason || 'unclear intent';

        const phase1_5Prompt = `You generate clarifying questions for ambiguous inputs in a productivity app.

=== CONTEXT ===
INPUT: "${text}"
DETECTED TEMPORAL: ${detectedTemporal || 'none'}
AMBIGUITY REASON: ${ambiguityReason}

=== YOUR GOAL ===

Generate a short question and 2-3 option labels that will RESOLVE the ambiguity.

The user will tap one option, and THAT tells us how to classify the item.

=== WHAT MAKES GOOD OPTIONS ===

**Each option must represent a DIFFERENT user situation.**

Ask yourself: "If 10 people typed '${text}', what different things might they mean?"

**Options must lead to different outcomes:**
- One option might mean they have something (noting/awareness)
- Another might mean they need to DO something (action required)
- Another might mean they want to build a routine (habit)

**BAD options (too similar):**
- "Passport expiring soon" / "Passport needs attention" → Both vaguely imply action, doesn't clarify
- "Going to gym" / "Planning to exercise" → Same thing, different words

**GOOD options (meaningfully different):**
- "I have a trip in June" (noting event) vs "It expires — need to renew" (action required)
- "Just going this Monday" (one-time) vs "Starting to go regularly" (building habit)
- "I have an appointment" (existing event) vs "I need to book one" (action required)

=== OPTION LABELS ===

Write labels as if the user is completing the sentence "I..."
- 3-8 words
- Natural language, not formal
- Mutually exclusive (picking one rules out the others)

=== OUTPUT FORMAT ===

Return ONLY valid JSON:

{
  "question": "Short question under 50 chars",
  "options": [
    { "id": "option_1", "label": "First option label" },
    { "id": "option_2", "label": "Second option label" }
  ]
}

- question: Natural, friendly, specific to the input
- options: 2-3 options, each with id (snake_case) and label (what user taps)
- NO bucket, action, or classification data — just labels

=== EXAMPLES ===

INPUT: "dentist Tuesday"
AMBIGUITY REASON: "noun + date, unclear if existing appointment or need to book"
{
  "question": "What's the dentist situation?",
  "options": [
    { "id": "have_appointment", "label": "I have an appointment Tuesday" },
    { "id": "need_to_book", "label": "I need to book/call about it" }
  ]
}

INPUT: "passport June"
AMBIGUITY REASON: "noun + date, unclear if trip or expiration"
{
  "question": "What's happening with the passport?",
  "options": [
    { "id": "trip", "label": "I have a trip in June" },
    { "id": "expiring", "label": "It expires — need to renew" }
  ]
}

INPUT: "gym Monday"
AMBIGUITY REASON: "activity + date, unclear if one-time or habit"
{
  "question": "One-time or building a habit?",
  "options": [
    { "id": "one_time", "label": "Just going this Monday" },
    { "id": "habit", "label": "Starting to go regularly" }
  ]
}

INPUT: "mom birthday March 5"
AMBIGUITY REASON: "noun + date, unclear if noting or action needed"
{
  "question": "What about mom's birthday?",
  "options": [
    { "id": "noting", "label": "Just noting the date" },
    { "id": "gift", "label": "I need to get a gift" },
    { "id": "party", "label": "I need to plan something" }
  ]
}

INPUT: "standing desk"
AMBIGUITY REASON: "bare noun, unclear if buying or noting idea"
{
  "question": "What's the plan?",
  "options": [
    { "id": "buy", "label": "I want to buy one" },
    { "id": "idea", "label": "Just exploring the idea" }
  ]
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
              messages: [{ role: 'system', content: phase1_5Prompt }],
              temperature: 0.1,
              max_tokens: 200,
              response_format: { type: 'json_object' },
            }),
          });

          const oj = await res.json();
          const latency = Date.now() - t0;

          if (!res.ok) {
            console.log('[Phase1.5] API error', { error: oj.error, latency_ms: latency });
            return j({ success: false, reason: 'api_error', latency_ms: latency });
          }

          const rawContent = oj?.choices?.[0]?.message?.content ?? '{}';

          let parsed;
          try {
            parsed = JSON.parse(rawContent);
          } catch {
            console.log('[Phase1.5] Parse error', { raw: rawContent });
            return j({ success: false, reason: 'parse_error', latency_ms: latency });
          }

          // Validate options
          if (!Array.isArray(parsed.options) || parsed.options.length < 2) {
            console.log('[Phase1.5] Invalid options', { latency_ms: latency });
            return j({ success: false, reason: 'invalid_options', latency_ms: latency });
          }

          // Clean options (just id and label, no action/bucket)
          const cleanedOptions = parsed.options
            .slice(0, 3)
            .map((opt) => ({
              id: String(opt.id || '').substring(0, 30).replace(/[^a-z0-9_]/gi, '_'),
              label: String(opt.label || '').substring(0, 80),
            }))
            .filter((opt) => opt.id && opt.label);

          if (cleanedOptions.length < 2) {
            console.log('[Phase1.5] Not enough valid options', { latency_ms: latency });
            return j({ success: false, reason: 'insufficient_options', latency_ms: latency });
          }

          const question =
            typeof parsed.question === 'string'
              ? parsed.question.trim().substring(0, 60)
              : 'What did you mean?';

          console.log('[Phase1.5] Success', {
            question: question.substring(0, 40),
            options_count: cleanedOptions.length,
            latency_ms: latency,
          });

          return j({
            success: true,
            question,
            options: cleanedOptions,
            latency_ms: latency,
          });
        } catch (err) {
          const latency = Date.now() - t0;
          console.log('[Phase1.5] Error', { error: String(err), latency_ms: latency });
          return j({ success: false, reason: 'request_error', latency_ms: latency });
        }
      }

      // =========================
      // === RECLASSIFY AFTER CLARIFICATION ===
      // Generates updated title + confirmation message after user clarifies intent
      // =========================
      if (type === 'reclassify-after-clarification') {
        const text = body.text || '';
        const selectedLabel = body.selectedLabel || '';
        // eslint-disable-next-line no-restricted-syntax -- Cloudflare Worker doesn't have dateService
        const currentDate = body.currentDate || new Date().toISOString().split('T')[0];
        const targetBucket = body.targetBucket || null;

        const reclassifyPrompt = `You classify and enrich a productivity item after the user clarified their intent.

=== CONTEXT ===
ORIGINAL INPUT: "${text}"
USER SELECTED: "${selectedLabel}"
CURRENT DATE: ${currentDate}

The user was asked a clarifying question and selected the option above. Now classify based on what they ACTUALLY meant.

=== THE THREE BUCKETS ===

**TODO** — A discrete, completable action
The user will eventually "check this off." A clear DONE state exists.

TODO signals from clarification:
- "I need to book/call/schedule..." → action required → TODO
- "I need to renew/cancel/fix..." → action required → TODO  
- "I need to get a gift/buy..." → action required → TODO
- "I want to buy one" → action required → TODO

**HABIT** — A trackable, recurring behavior
The user wants to TRACK this over time.

HABIT signals from clarification:
- "Starting to go regularly" → building routine → HABIT
- "Want to do this daily/weekly" → recurring intent → HABIT
- "Building a habit" → explicit → HABIT

**LOG** — Capture for reflection, not action
A thought, event, idea, or information. No action required from the user.

LOG signals from clarification:
- "I have an appointment/meeting" → existing event → LOG/general
- "I have a trip" → noting travel → LOG/general
- "Just noting the date" → awareness → LOG/general
- "Just exploring the idea" → brainstorming → LOG/idea

=== DATE INTELLIGENCE ===

The original input may contain a date. The clarification tells us the user's INTENT. Combine both to determine how to handle dates.

**RULE 1: Never invent dates.**
Only set dates that were mentioned in the ORIGINAL INPUT. If there was no date, both fields are null.

**RULE 2: Use the clarification to determine date TYPE.**

If clarification reveals EXISTING EVENT/APPOINTMENT:
- "I have an appointment Monday" → target_date = Monday (it's when the appointment IS)
- "I have a trip in June" → target_date = June (it's when the trip IS)

If clarification reveals ACTION NEEDED but specifies WHEN TO DO IT:
- "I need to book, will call Monday" → scheduled_date = Monday (when they'll do the task)
- "I'll handle it tomorrow" → scheduled_date = tomorrow

If clarification reveals ACTION NEEDED but doesn't specify what the date means:
- "I need to book" (original had "Monday") → We don't know if Monday is when they want the appointment or when they'll call
- In this case: target_date = the original date, scheduled_date = null, date_type_ambiguous = true
- Reasoning: Safer to assume the date is when they want it scheduled FOR, and let Sweep ask when they'll DO it

**RULE 3: Flag ambiguity when date meaning wasn't resolved.**

Set date_type_ambiguous: true when:
- Original input had a date
- Clarification confirmed action is needed (TODO)
- But clarification did NOT explicitly say what the date means

Examples:
- "chiropractor Monday" + "I need to book" → target_date: Monday, scheduled_date: null, date_type_ambiguous: true
- "chiropractor Monday" + "I have an appointment" → target_date: Monday, scheduled_date: null, date_type_ambiguous: false
- "chiropractor Monday" + "I'll call Monday to book" → target_date: null, scheduled_date: Monday, date_type_ambiguous: false
- "standing desk" + "I want to buy one" → target_date: null, scheduled_date: null, date_type_ambiguous: false (no date in original)

=== TITLE RULES ===

Generate a 3-7 word title that reflects the CLARIFIED intent:

- For TODOs: Action verb + object ("Book Dentist Appointment", "Renew Passport", "Buy Gift For Mom")
- For HABITs: Activity name ("Regular Gym Sessions", "Daily Meditation")
- For LOGs: Topic/event name ("Dentist Appointment Tuesday", "Trip In June", "Standing Desk Idea")

NO temporal words in titles (tomorrow, Tuesday, next week) — dates are stored separately.

=== CONFIRMATION MESSAGE (4-10 words) ===

This is Gremly's voice — warm, specific, gently playful. Like a supportive friend who actually listened.

CORE RULES:
- Reference something SPECIFIC from their input (proves you understood)
- Add a touch of warmth or gentle humor
- Feel human, not robotic
- No exclamation marks (too perky)
- No generic acknowledgments

NEVER SAY:
- "Got it", "Added", "Noted" (alone)
- "Task added to your list"
- "I've captured that for you"
- "Added as a todo/habit"
- "Successfully saved"
- Anything that sounds like a system notification

GOOD — Specific + Personality:

For TODOs:
- "Bella's gonna love that walk."
- "Mom would love to hear from you."
- "Reservations — fancy."
- "That bug won't fix itself."
- "Vitamins for the win."
- "Adulting at its finest."
- "Consider it on the radar."
- "Dentist called, you answered."

For HABITs:
- "Gym time, let's build the streak."
- "Morning runs hit different."
- "Your future self will thank you."
- "Consistency starts now."
- "One day at a time."

For LOG/journal:
- "Your brain needed to dump that."
- "Big feelings, safely captured."
- "Sometimes you just gotta write it out."
- "Heard. All of it."
- "That's a lot — it's safe here."

For LOG/idea:
- "Idea logged, let it marinate."
- "Could be something there."
- "Tucked away for when you're ready."
- "Creative brain doing its thing."

For LOG/general (ambiguous):
- "Captured — you'll sort it in Sweep."
- "Holding onto this one."
- "Parked for now."
- "Safe with me."

THE VIBE:
- Supportive friend, not assistant robot
- Knows what you said, reflects it back with warmth
- Brief but human
- Gently playful when appropriate, not forced

${targetBucket === 'todo' || targetBucket === 'habit' ? `
=== TIME ESTIMATE ===

Estimate in 5-minute increments (5 to 240 minutes).

Factor-based reasoning:
1. Core action time
2. Leave house? +15-20 min
3. Other people involved? +10-15 min
4. Physical vs digital
5. What commonly goes wrong? +5-15 min

Round UP. When uncertain, choose higher estimate.

=== ENERGY TYPE ===

Choose ONE:
- deep_focus: thinking, writing, creating, planning
- administrative: emails, forms, scheduling, booking, logistics
- physical: exercise, errands, movement, cleaning
- social: calls, meetings, conversations
- quick: small tasks under 10 min
` : ''}

=== OUTPUT FORMAT ===

Return ONLY valid JSON:

{
  "bucket": "todo" | "habit" | "log",
  "subtype": "general" | "idea" | "journal" | null,
  "habit_subtype": "start_habit" | "break_habit" | null,
  "smart_title": "3-7 Word Title",
  "confirmation_message": "Warm, specific message",
  "target_date": "YYYY-MM-DD" | null,
  "scheduled_date": "YYYY-MM-DD" | null,
  "date_type_ambiguous": boolean,
  "time_estimate_minutes": number | null,
  "energy_type": "deep_focus" | "administrative" | "physical" | "social" | "quick" | null
}

Rules:
- subtype only when bucket is "log"
- habit_subtype only when bucket is "habit"
- time_estimate_minutes and energy_type only for todo/habit
- date_type_ambiguous: true when original had date but clarification didn't resolve its meaning
- Dates in YYYY-MM-DD format`;

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
              smart_title: text.substring(0, 50),
              confirmation_message: 'Updated.',
              target_date: null,
              scheduled_date: null,
              time_estimate_minutes: null,
              energy_type: null,
              latency_ms: latency,
            });
          }

          const rawContent = oj?.choices?.[0]?.message?.content ?? '{}';
          const parsed = JSON.parse(rawContent);

          // Validate bucket
          const validBuckets = ['todo', 'habit', 'log'];
          let bucket = validBuckets.includes(parsed.bucket) ? parsed.bucket : 'log';

          // Validate subtype
          let subtype = null;
          if (bucket === 'log') {
            const validSubtypes = ['general', 'idea', 'journal'];
            subtype = validSubtypes.includes(parsed.subtype) ? parsed.subtype : 'general';
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

          // Validate time estimate
          let timeEstimate = null;
          if (typeof parsed.time_estimate_minutes === 'number') {
            timeEstimate = Math.max(5, Math.min(240, Math.round(parsed.time_estimate_minutes / 5) * 5));
          }

          // Validate energy type
          const validEnergyTypes = ['deep_focus', 'administrative', 'physical', 'social', 'quick'];
          const energyType = validEnergyTypes.includes(parsed.energy_type)
            ? parsed.energy_type
            : null;

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
            time_estimate: timeEstimate,
            energy_type: energyType,
            latency_ms: latency,
          });

          return j({
            bucket,
            subtype,
            habit_subtype: habitSubtype,
            smart_title: parsed.smart_title || text.substring(0, 50),
            confirmation_message: confirmationMessage,
            target_date: targetDate,
            scheduled_date: scheduledDate,
            date_type_ambiguous: dateTypeAmbiguous,
            time_estimate_minutes: timeEstimate,
            energy_type: energyType,
            latency_ms: latency,
          });
        } catch (err) {
          const latency = Date.now() - t0;
          console.log('[Reclassify] Error', { error: String(err), latency_ms: latency });
          return j({
            bucket: 'log',
            subtype: 'general',
            habit_subtype: null,
            smart_title: text.substring(0, 50),
            confirmation_message: 'Updated.',
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

        const phase1Prompt = `You classify "mind drops" for Gremly, a productivity app. Your job is to understand the user's TRUE INTENT using semantic understanding, not keyword matching.

=== THE THREE BUCKETS ===

**TODO** — A discrete, completable action
The user will eventually "check this off." A clear DONE state exists.
Ask: "Can this be marked DONE when complete?"

**HABIT** — A trackable, recurring behavior
The user wants to TRACK this over time. It's concrete and observable.
Ask: "Can this be tracked with a yes/no each day/week?"

**LOG** — Capture for reflection, not action
A thought, feeling, idea, or fuzzy aspiration. No clear done state or tracking intent.
Ask: "Is this reflection, exploration, venting, or too vague to act on?"

=== SEMANTIC CLASSIFICATION (PRIMARY) ===

Use your language understanding to determine intent. Don't pattern-match keywords.

**TODO SEMANTIC TEST:**
A TODO has ALL of these:
1. A discrete action (not ongoing)
2. A clear completion point (you'll know when it's done)
3. Something the user would "check off"

Examples that pass the test:
- "Have vit c and iron supplement" → Done when taken ✓
- "Call mom" → Done when call ends ✓
- "Buy groceries" → Done when purchased ✓
- "Fix the login bug" → Done when bug is fixed ✓
- "Submit the report" → Done when submitted ✓
- "Book dentist appointment" → Done when booked ✓
- "Cancel Netflix" → Done when cancelled ✓
- "Improve the onboarding screen" → Done when improvement ships ✓

Examples that FAIL the test:
- "Be healthier" → No clear done state ✗
- "Improve my relationship with dad" → No discrete completion ✗
- "Work on the app" → Too vague, no end point ✗

**HABIT SEMANTIC TEST:**
A HABIT has ALL of these:
1. A CONCRETE, OBSERVABLE behavior (not abstract)
2. Something trackable with yes/no (did I do it today?)
3. EXPLICIT intent to repeat (frequency stated OR stop/quit pattern)

The "trackable" test:
- "Stop smoking" → Trackable: "Did I smoke today? No ✓" → HABIT
- "Run every morning" → Trackable: "Did I run this morning? Yes ✓" → HABIT
- "Stop overthinking" → NOT trackable (mental state, not behavior) → LOG
- "Be more patient" → NOT trackable (abstract quality) → LOG

STRICT REQUIREMENT — Habits need explicit signals:
- Explicit frequency: "daily", "every day", "every morning", "3x/week", "weekly", "twice a day"
- OR stop/quit + concrete behavior: "stop smoking", "quit drinking", "no phone after 9pm"

WITHOUT explicit frequency or stop/quit → NOT a habit, even if repeatable.
- "Go to the gym" (no frequency) → TODO (single instance)
- "Drink water" (no frequency) → LOG/general (vague aspiration)
- "Go to the gym every day" → HABIT (explicit frequency)

**LOG SEMANTIC TEST:**
A LOG is for content that doesn't fit TODO or HABIT:

LOG/journal — Emotional expression or reflection:
- Processing feelings: "feeling anxious about the presentation"
- Past reflection: "I realized I've been avoiding this"
- Venting/self-talk: "why do I always procrastinate"
- Gratitude/mood: "grateful for the good weather"

LOG/idea — Exploration without commitment:
- Brainstorming: "what if we added dark mode"
- Weighing options: "necklace or scarf for mom" (no action verb, comparing)
- Vague interest: "pottery class sometime"
- Not decided: "thinking about switching careers"

LOG/general — Reference information where NO ACTION is plausible:
- Reference info with existence verb: "john's number is 555-1234", "mum's birthday is August 22nd"
- Status updates with existence verb: "meeting is moved to thursday", "office is closed friday"
- Completed events: "went to dentist", "finished the report"

**NOT for LOG/general — these should be AMBIGUOUS:**
- Bare nouns without verbs: "dentist", "standing desk", "groceries"
- Service + date without action verb: "dermatologist next week", "car inspection Tuesday"
- Vague aspirations that could be habits: "drink more water", "exercise more"

=== STRUCTURAL SIGNALS (SUPPORTING EVIDENCE) ===

These patterns provide EVIDENCE to support your semantic classification. They don't override semantic understanding — they confirm it.

**Strong TODO signals:**
- Imperative structure: verb + object with no subject
  "Have my supplements", "Call mom", "Fix the bug", "Water the plants"
- Reminder phrasing: "make sure to...", "don't forget to...", "remember to...", "remind me to..."
- Obligation language: "need to...", "have to...", "gotta...", "should..." (+ specific action)

**Strong HABIT signals:**
- Explicit frequency: "daily", "every [day/morning/week]", "3x per week", "twice a day"
- Stop/quit + concrete behavior: "stop smoking", "quit scrolling", "no phone after 9"
- Tracking language: "track my...", "start doing X every..."

**Strong LOG signals:**
- Past tense reflection: "I realized...", "I felt...", "I noticed..."
- Emotional language: "feeling...", "stressed about...", "grateful for...", "anxious"
- Exploration hedging (WITHOUT action verb): "thinking about...", "what if...", "maybe...", "might be nice to..."
- Comparing options: "X or Y for...", "either... or..."

**CRITICAL DISTINCTION — Hedging + Action Verb:**
- "Maybe buy groceries" → TODO (has action verb "buy" — the "maybe" is soft commitment, not exploration)
- "Should probably call mom" → TODO (has action verb "call")
- "Thinking I need to submit the report" → TODO (has action verb "submit")

vs. Hedging WITHOUT action verb:
- "Maybe a necklace for mom" → LOG/idea (no verb, just considering options)
- "Thinking about career change" → LOG/idea (no specific action)

The test: **Is there a clear action verb (buy, call, text, send, book, submit, take, have, make, do, get, pick up, cancel, fix, etc.)?**
- YES + hedging → Still TODO (they intend to do it)
- NO + hedging → LOG/idea (they're exploring)

=== CONFIDENCE & FALLBACK ===

Confidence reflects how much EVIDENCE exists in the input — not how sure you feel about an interpretation.

**THE EVIDENCE TEST:**
Before classifying, ask: "What SPECIFIC WORDS in this input tell me the user's intent?"

Words that count as evidence:
- Action verbs: "book", "call", "buy", "schedule", "cancel", "fix", "submit", "send", "pick up"
- Existence verbs: "is", "have", "got", "was"
- Frequency words: "daily", "every morning", "3x/week", "weekly"
- Emotional language: "feeling", "stressed", "anxious", "grateful", "overwhelmed"
- Stop/quit language: "stop", "quit", "no more", "avoid"

**How evidence maps to confidence:**

High confidence: You can point to specific words that reveal intent.

Medium confidence: The input leans one way based on context, but no single word proves it.

Low confidence: Multiple interpretations are equally valid. You cannot point to words that disambiguate.

**How evidence relates to ambiguity:**

When you have evidence, you know. When you don't have evidence, you're guessing.

If you're guessing between interpretations, the user needs to clarify — that's what is_ambiguous is for.

**EXAMPLES:**

"book chiropractor Monday"
→ Evidence: "book" (action verb)
→ You know: User needs to do something
→ Result: TODO, high confidence, not ambiguous

"chiropractor appointment is Monday"
→ Evidence: "is" (existence verb)
→ You know: User is stating a fact
→ Result: LOG/general, high confidence, not ambiguous

"chiropractor Monday"
→ Evidence: None — no action verb, no existence verb
→ You don't know: Could be "I have an appointment" or "I need to book"
→ Result: Guessing, low confidence, ambiguous

"standing desk"
→ Evidence: None
→ You don't know: Could be "want to buy", "just an idea", "researching"
→ Result: Guessing, low confidence, ambiguous

"mum's birthday is August 22nd"
→ Evidence: "is" (existence verb)
→ You know: User is stating a fact
→ Result: LOG/general, high confidence, not ambiguous

"mum birthday August 22"
→ Evidence: None
→ You don't know: Could be "just noting" or "need to get gift" or "need to plan"
→ Result: Guessing, low confidence, ambiguous

"feeling overwhelmed about the move"
→ Evidence: "feeling overwhelmed" (emotional language)
→ You know: User is processing emotions
→ Result: LOG/journal, high confidence, not ambiguous

"the move"
→ Evidence: None
→ You don't know: Could be reflection, could be tasks, could be noting
→ Result: Guessing, low confidence, ambiguous

=== AMBIGUITY DETECTION ===

Flag ambiguity when you're MISSING INFORMATION needed to handle this item correctly. Use semantic reasoning — apply the LOGIC to any input, don't match against example strings.

**THREE SEMANTIC TESTS:**

**TEST 1: BUCKET CLARITY**
Ask: "Do I KNOW if this is something to DO vs TRACK vs KNOW?"

CLEAR (not ambiguous):
- Has action verb (call, buy, book, send, fix, submit, schedule) → DO something
- Has explicit frequency (daily, every morning, 3x/week) → TRACK something
- Has emotional/reflective content → KNOW something

UNCLEAR (ambiguous):
- Bare noun with no verb or intent signal
- Could reasonably be multiple buckets
→ is_ambiguous: true, ambiguity_type: "bucket"

**TEST 2: ACTION CLARITY** (apply when input has noun + date/time but no clear action verb)
Ask: "Do I know if the user HAS something or NEEDS TO DO something?"

CLEAR (not ambiguous):
- Has action verb: "book dentist", "call therapist", "schedule vet" → NEEDS TO DO
- Has existence language: "appointment is Tuesday", "I have a meeting" → HAS

UNCLEAR (ambiguous):
- Noun + date with NO VERB: [service/appointment] + [day/date]
- Could be existing appointment OR need to book/schedule
→ is_ambiguous: true, ambiguity_type: "action"

**TEST 3: DATE TYPE CLARITY** (apply when bucket IS clear but date meaning isn't)
Ask: "Do I know if this date is when something IS/DUE or when to DO the work?"

CLEAR (not ambiguous):
- Has deadline signal: "due April 15", "by Friday", "before the 10th" → TARGET DATE
- Has event signal: "race is Feb 1", "wedding on June 15", "[event] is [date]" → TARGET DATE
- Action directly tied to time: "call tomorrow", "do tonight", "[verb] [time]" → SCHEDULED DATE

UNCLEAR (ambiguous):
- Action verb + noun + date WITHOUT deadline/event signal
- Example reasoning: "Book half marathon Feb 1" — Is Feb 1 when the race IS, or when to book?
→ is_ambiguous: true, ambiguity_type: "date_type"

**THE KEY QUESTION:**
"If I had to set this up correctly in the user's productivity system, what information am I MISSING that would CHANGE how I handle it?"

**WHEN is_ambiguous IS TRUE:**
- confidence: 0.5-0.6
- smart_title: Stay CLOSE TO ORIGINAL TEXT
- ambiguity_type: "bucket" | "action" | "date_type"
- ambiguity_reason: Short explanation (e.g., "noun + date without verb, unclear if existing or need to schedule")
- confirmation_message: "Quick question — tap me" or similar

**CRITICAL:** These are SEMANTIC TESTS. Apply the REASONING to any input. Do NOT pattern-match against specific strings.

**TEST 4: BARE NOUN TEST**
If the input is a noun/noun phrase with:
- No action verb (call, buy, book, schedule, etc.)
- No existence verb (is, have, got)
- No explicit emotional content

→ is_ambiguous: true, ambiguity_type: "bucket"

Examples:
- "dentist" → No verb → AMBIGUOUS
- "standing desk" → No verb → AMBIGUOUS
- "groceries" → No verb → AMBIGUOUS
- "new laptop" → No verb → AMBIGUOUS

**TEST 5: SERVICE + TIME WITHOUT VERB**
If the input has a service/appointment noun + time reference but NO verb:

→ is_ambiguous: true, ambiguity_type: "action"

Examples:
- "dermatologist next week" → No verb → AMBIGUOUS
- "car inspection Tuesday" → No verb → AMBIGUOUS
- "accountant April" → No verb → AMBIGUOUS
- "therapist soon" → No verb → AMBIGUOUS

**THE CORE QUESTION:**
"What specific words in this input tell me the user's intent?"

If you can point to evidence, classify with confidence. If you can't, you're guessing — and the user should clarify.

=== EXAMPLES ===

**TODO** (discrete, completable, clear done state):
- "Have vit c and iron supplement" → TODO (imperative, done when taken)
- "Call mom" → TODO
- "Buy groceries" → TODO
- "Maybe buy groceries" → TODO (has "buy" — hedging doesn't change it)
- "Should probably call the dentist" → TODO (has "call")
- "Fix the login bug" → TODO (specific, done when fixed)
- "Improve the onboarding screen" → TODO (specific work, done when shipped)
- "Submit the expense report" → TODO
- "Don't forget to text Sarah" → TODO (reminder phrasing)
- "Make sure to lock the door" → TODO (reminder phrasing)
- "Cancel the subscription" → TODO (one-time action)
- "Stop by the pharmacy" → TODO (errand, not habit)
- "Water the plants" → TODO (single instance, no frequency)

**HABIT** (trackable, recurring, explicit frequency or stop/quit):
- "Run every morning" → HABIT (explicit frequency)
- "Meditate daily" → HABIT (explicit frequency)
- "Go to gym 3x per week" → HABIT (explicit frequency)
- "Stop smoking" → HABIT (stop + concrete trackable behavior)
- "Quit biting my nails" → HABIT (quit + concrete behavior)
- "No phone after 9pm" → HABIT (concrete rule to track)
- "Drink 8 glasses of water daily" → HABIT (explicit frequency)

**LOG/journal** (emotional, reflective):
- "Feeling anxious about tomorrow" → LOG/journal
- "Stressed about work" → LOG/journal
- "I realized I've been avoiding this" → LOG/journal
- "Why do I always procrastinate" → LOG/journal (self-talk)
- "Grateful for the support" → LOG/journal
- "Had a rough day" → LOG/journal

**LOG/idea** (exploring, not committed):
- "Necklace or scarf for mom" → LOG/idea (comparing options, no verb)
- "What if we added dark mode" → LOG/idea (brainstorming)
- "Pottery class sometime" → LOG/idea (vague interest)
- "Thinking about switching careers" → LOG/idea (exploring, no action)
- "App idea: calorie tracker" → LOG/idea (concept capture)

**LOG/general** (reference info with existence verbs, completed events):
- "John's number is 555-1234" → LOG/general (reference info, has "is")
- "Meeting is moved to Thursday" → LOG/general (status update, has "is")
- "Mum's birthday is August 22nd" → LOG/general (stating fact, has "is")
- "Went to dentist yesterday" → LOG/general (completed event, past tense)
- "Finished the report" → LOG/general (completed event)

**AMBIGUOUS** (must flag, do NOT put in LOG/general):
- "Dentist" → is_ambiguous: true, ambiguity_type: "bucket" (bare noun, no verb)
- "Standing desk" → is_ambiguous: true, ambiguity_type: "bucket" (bare noun, no verb)
- "Dermatologist next week" → is_ambiguous: true, ambiguity_type: "action" (service + time, no verb)
- "Car inspection Tuesday" → is_ambiguous: true, ambiguity_type: "action" (service + time, no verb)
- "Drink more water" → is_ambiguous: true, ambiguity_type: "bucket" (could be habit to track)
- "Exercise more" → is_ambiguous: true, ambiguity_type: "bucket" (could be habit to track)

**NOT habits** (missing explicit frequency):
- "Go to the gym" → TODO (single instance, no frequency stated)
- "Drink water" → LOG/general (vague, no frequency)
- "Run" → TODO (single run, no frequency)
- "Stop overthinking" → LOG/journal (not trackable — mental state)
- "Be more patient" → LOG/general (abstract quality, not trackable)

=== HABIT SUBTYPE ===

If classifying as HABIT, also determine:
- **start_habit**: Building/doing something (run, meditate, read, exercise, drink water)
- **break_habit**: Stopping/avoiding something (stop smoking, quit scrolling, no phone after 9)

=== SMART TITLE (3-7 words) ===

Generate a title that captures the SUBJECT/TOPIC — what it IS, not WHEN it happens.

Type-specific guidance:
- TODO: Action + object ("Buy Groceries", "Call Mom", "Fix Login Bug")
- HABIT: Activity only, NO frequency in title ("Morning Run", "Meditation", "No Late Phone")
- LOG/journal: Topic or situation ("Work Stress", "Presentation Anxiety")
- LOG/idea: The concept ("Gift Ideas For Mom", "Dark Mode Feature")
- LOG/general: The topic ("Career Thoughts", "Standing Desk")

TITLE RULES:

1. Never include TEMPORAL words (these become stale):
   - "tomorrow", "today", "tonight", "this morning", "this evening", "this afternoon"
   - "next week", "this week", "next Monday", "on Friday", "next Tuesday"
   - "later", "soon", "in an hour", "in 30 minutes"
   - "for tomorrow", "for tonight", "for next week"
   
   Extract the WHAT, not the WHEN:
   - "book restaurant for tomorrow" → "Book Restaurant"
   - "call mom this evening" → "Call Mom"
   - "dentist appointment next Tuesday" → "Dentist Appointment"
   - "submit report by Friday" → "Submit Report"
   - "pick up groceries later" → "Pick Up Groceries"

2. Never include FREQUENCY words for habits (tracked separately):
   - "run every morning" → "Morning Run"
   - "meditate daily" → "Meditation"
   - "gym 3x per week" → "Gym"

3. Never start with meta-verbs:
   - "Reflect on...", "Journal about...", "Track...", "Remember to..."

4. Never include mood words:
   - anxious, stressed, grateful, overwhelmed, worried, excited

5. Title case, 3-7 words

=== CONFIRMATION MESSAGE (4-10 words) ===

This is Gremly's voice — warm, specific, gently playful. Like a supportive friend who actually listened.

CORE RULES:
- Reference something SPECIFIC from their input (proves you understood)
- Add a touch of warmth or gentle humor
- Feel human, not robotic
- No exclamation marks (too perky)
- No generic acknowledgments

NEVER SAY:
- "Got it", "Added", "Noted" (alone)
- "Task added to your list"
- "I've captured that for you"
- "Added as a todo/habit"
- "Successfully saved"
- Anything that sounds like a system notification

GOOD — Specific + Personality:

For TODOs:
- "Bella's gonna love that walk."
- "Mom would love to hear from you."
- "Reservations — fancy."
- "That bug won't fix itself."
- "Vitamins for the win."
- "Adulting at its finest."
- "Consider it on the radar."
- "Dentist called, you answered."

For HABITs:
- "Gym time, let's build the streak."
- "Morning runs hit different."
- "Your future self will thank you."
- "Consistency starts now."
- "One day at a time."

For LOG/journal:
- "Your brain needed to dump that."
- "Big feelings, safely captured."
- "Sometimes you just gotta write it out."
- "Heard. All of it."
- "That's a lot — it's safe here."

For LOG/idea:
- "Idea logged, let it marinate."
- "Could be something there."
- "Tucked away for when you're ready."
- "Creative brain doing its thing."

For LOG/general (ambiguous):
- "Captured — you'll sort it in Sweep."
- "Holding onto this one."
- "Parked for now."
- "Safe with me."

THE VIBE:
- Supportive friend, not assistant robot
- Knows what you said, reflects it back with warmth
- Brief but human
- Gently playful when appropriate, not forced

=== OUTPUT FORMAT ===

Return ONLY valid JSON:

{
  "bucket": "todo" | "habit" | "log",
  "confidence": 0.0-1.0,
  "subtype": "journal" | "idea" | "general" | null,
  "habitSubtype": "start_habit" | "break_habit" | null,
  "smart_title": "3-7 Word Title",
  "confirmation_message": "4-8 word warm message",
  "is_ambiguous": true | false,
  "ambiguity_type": "bucket" | "action" | "date_type" | null,
  "ambiguity_reason": "Short reason why it's ambiguous" | null
}

Rules:
- subtype is only set when bucket is "log"
- habitSubtype is only set when bucket is "habit"
- ambiguity_type and ambiguity_reason are only set when is_ambiguous is true
- When is_ambiguous is true, smart_title should stay close to original text
- When is_ambiguous is true, confirmation_message should be a "tap me" variant:
  - "Quick question — tap me"
  - "Need your input — tap here"
  - "One quick thing — tap me"
  - "Help me understand — tap here"`;

        const phase1Messages = [
          { role: 'system', content: phase1Prompt },
          { role: 'user', content: text.substring(0, 1000) },
        ];

        const t0 = Date.now();
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

        const oj = await res.json();
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
          // Title case
          smartTitle = smartTitle
            .split(/\s+/)
            .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
            .join(' ');
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
        const isAmbiguous = parsed.is_ambiguous === true;
        const ambiguityReason = isAmbiguous && typeof parsed.ambiguity_reason === 'string'
          ? parsed.ambiguity_reason.trim().substring(0, 200)
          : null;
        const ambiguityType = isAmbiguous && typeof parsed.ambiguity_type === 'string'
          && ['bucket', 'action', 'date_type'].includes(parsed.ambiguity_type)
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

        const phase2Prompt = `You extract core, durable metadata for Gremly, a calm productivity app.
Your goal is to capture only information that is intrinsic to the item.
Do NOT include planning or scheduling logic.

=== DATE CONTEXT ===
Today is ${currentDate} (${dayOfWeek}).
User timezone: ${timezone}.

Date rules:
- "tomorrow" = today + 1 day
- Named days refer to the NEXT occurrence
- Use YYYY-MM-DD format

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
- Deadlines: "due April 15", "by Friday", "before the 10th"
- Events: "dentist Tuesday 2pm", "wedding June 15", "mom's birthday March 5"
- Expiration: "passport expires June", "lease ends March 1"

Signals: "due", "by", "before", "deadline", "expires", "is on", "appointment"

**SCHEDULED DATE** — When user plans to DO the work (internal, movable)
- Action + time: "call mom tomorrow", "go to gym Monday"
- Planning: "work on taxes Saturday", "start running next week"
- Intent: "do this tonight", "handle it tomorrow morning"

Signals: Action verb + time reference, "do", "work on", "handle", "start"

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
"call mom tomorrow" → target_date: null, scheduled_date: "2026-01-27"
"dentist Tuesday 2pm" → target_date: "2026-01-28", scheduled_date: null (appointment)
"work on report, due Friday" → target_date: "2026-01-31", scheduled_date: null (can add scheduled later)
"go to gym Monday" → target_date: null, scheduled_date: "2026-01-27"
"passport June" → target_date: "2026-06-01", date_type_ambiguous: true

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
FOR JOURNAL ONLY:
--------------------------------
7. mood
Choose up to 3:
great, good, okay, low, tired,
anxious, overwhelmed, frustrated,
scattered, grateful, hopeful,
focused, calm

--------------------------------
TAGS (ALL TYPES):
--------------------------------
8. tags
- 2–4 lowercase, hyphenated
- Category + topic
- No filler words
- No people names

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
  "event_time": "HH:mm" | null
}

For LOGS (idea/general):
{
  "tags": ["tag1", "tag2"],
  "target_date": "YYYY-MM-DD" | null,
  "event_time": "HH:mm" | null
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
 - Use **bold** for key phrases (1-2 per response)
 - Short paragraphs (2-3 sentences max)
 - Bullets only when listing 3+ items (max 5 bullets)
 - 50-150 words for most responses
 - No markdown headers (#), tables, or code blocks
 
 When giving structured advice, keep it tight:
 **Start small**  2-3 short runs per week, same days.
 **Be consistent**  Consistency beats intensity early on.
 **Track it**  Seeing progress helps motivation.`;

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
        console.log('[STREAMING] Starting SSE stream for space_chat');

        const openaiPayload = {
          model: actualModel,
          messages,
          temperature,
          stream: true,
        };

        if (actualModel === 'gpt-4.1' || actualModel === 'gpt-4o') {
          openaiPayload.max_completion_tokens = maxTokensValue;
        } else {
          openaiPayload.max_tokens = maxTokensValue;
        }

        const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(openaiPayload),
        });

        if (!openaiRes.ok) {
          const errText = await openaiRes.text().catch(() => '');
          console.log('[STREAMING] OpenAI error', { status: openaiRes.status, error: errText });
          return j({ error: `openai_error: ${openaiRes.status}`, detail: errText }, 200);
        }

        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();

        (async () => {
          const reader = openaiRes.body.getReader();
          let buffer = '';
          let fullContent = '';

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
                } catch (parseErr) {
                  console.log('[STREAMING] Chunk parse error', { line: trimmed.slice(0, 100) });
                }
              }
            }
            const save_suggestion = null;

            const finalData = JSON.stringify({
              done: true,
              full_content: fullContent,
              save_suggestion,
            });
            await writer.write(encoder.encode(`data: ${finalData}\n\n`));
          } catch (streamErr) {
            console.log('[STREAMING] Stream error', { error: String(streamErr) });
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

      // --- NON-STREAMING (original logic, unchanged) ---
      const openaiPayload = { model: actualModel, messages, temperature, stream: false };

      if (actualModel === 'gpt-4.1' || actualModel === 'gpt-4o') {
        openaiPayload.max_completion_tokens = maxTokensValue;
      } else {
        openaiPayload.max_tokens = maxTokensValue;
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

      const content = oj?.choices?.[0]?.message?.content ?? oj?.choices?.[0]?.text ?? '';

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
} // Paste your worker code here
