/**
 * Inngest Jobs Worker - User Profile Synthesis v2
 *
 * Now includes:
 * - Pattern analysis (todos, habits, moods)
 * - Chat message fact extraction (space chats + entity chats)
 */

import { Inngest, InngestMiddleware } from 'inngest';
import { serve } from 'inngest/cloudflare';

// Cloudflare Workers middleware to inject env bindings
const bindings = new InngestMiddleware({
  name: 'Cloudflare Workers bindings',
  init({ client, fn }) {
    return {
      onFunctionRun({ ctx, fn, steps, reqArgs }) {
        return {
          transformInput({ ctx, fn, steps }) {
            const env = reqArgs[1];
            return {
              ctx: {
                env,
              },
            };
          },
        };
      },
    };
  },
});

const inngest = new Inngest({
  id: 'gremly',
  isDev: false,
  middleware: [bindings],
});

// Dispatcher: fetch active users and fan out one event per user
const dailySynthesisDispatcher = inngest.createFunction(
  {
    id: 'daily-synthesis-dispatcher',
    name: 'Daily Synthesis Dispatcher',
  },
  [
    { cron: '0 4 * * *' }, // 4 AM UTC daily
    { event: 'app/profiles.sync' }, // Manual trigger
  ],
  async ({ step, env }) => {
    const activeUsers = await step.run('get-active-users', async () => {
      const response = await fetch(
        `${env.SUPABASE_URL}/rest/v1/rpc/get_active_users_needing_synthesis`,
        {
          method: 'POST',
          headers: {
            apikey: env.SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to get active users: ${response.statusText}`);
      }

      return response.json();
    });

    console.log(`[Dispatcher] Found ${activeUsers.length} active users`);

    // Fan out: send one event per user
    if (activeUsers.length > 0) {
      await step.sendEvent(
        'dispatch-users',
        activeUsers.map((u) => ({
          name: 'app/user.synthesize',
          data: { user_id: u.user_id },
        })),
      );
    }

    return { dispatched: activeUsers.length };
  },
);

// Per-user worker: synthesize profile + generate suggestions as separate steps
const synthesizeSingleUser = inngest.createFunction(
  {
    id: 'synthesize-single-user',
    name: 'Synthesize Single User',
    concurrency: { limit: 5 },
  },
  { event: 'app/user.synthesize' },
  async ({ event, step, env }) => {
    const userId = event.data.user_id;
    console.log(`[UserSynth] Starting for user: ${userId}`);

    const profileResult = await step.run('synthesize-profile', async () => {
      return synthesizeUserProfile(userId, env);
    });

    const suggestionsResult = await step.run('generate-suggestions', async () => {
      return generateSpaceSuggestions(userId, env);
    });

    return {
      user_id: userId,
      profile: profileResult,
      suggestions: suggestionsResult,
    };
  },
);

// ============================================================================
// DCO (Daily Context Object) generation
// ============================================================================

function getUserLocalDate(timezone) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(now);
  return parts; // en-CA gives YYYY-MM-DD format
}

// Dispatcher: hourly check for users in their 5 AM window, fan out DCO generation
const dcoDispatcher = inngest.createFunction(
  {
    id: 'dco-dispatcher',
    name: 'DCO Dispatcher',
  },
  [
    { cron: '0 * * * *' }, // Hourly — check timezone windows each run
    { event: 'app/dco.generate' }, // Manual trigger
  ],
  async ({ step, env }) => {
    // Step 1: Clean up expired DCO rows
    const cleaned = await step.run('cleanup-expired', async () => {
      const res = await fetch(
        `${env.SUPABASE_URL}/rest/v1/user_daily_state?expires_at=lt.${new Date().toISOString()}`,
        {
          method: 'DELETE',
          headers: {
            apikey: env.SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
          },
        },
      );

      const deleted = res.ok ? (await res.json()).length : 0;
      console.log(`[DCO Dispatcher] Cleaned up ${deleted} expired rows`);
      return deleted;
    });

    // Step 2: Get all users who need a DCO today
    const allUsers = await step.run('get-users-needing-dco', async () => {
      const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/get_users_needing_dco`, {
        method: 'POST',
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        throw new Error(`Failed to get users needing DCO: ${res.statusText}`);
      }

      return res.json(); // [{ user_id, timezone }]
    });

    // Step 3: Filter to users whose local time is in the 5:xx AM window
    const readyUsers = await step.run('filter-by-timezone-window', async () => {
      const now = new Date();
      return allUsers.filter((u) => {
        try {
          const userTime = new Intl.DateTimeFormat('en-US', {
            hour: 'numeric',
            hour12: false,
            timeZone: u.timezone,
          }).format(now);
          const hour = parseInt(userTime, 10);
          return hour === 4; // Generate DCO at 4:xx AM — always ready before morning notifications
        } catch {
          return false;
        }
      });
    });

    console.log(
      `[DCO Dispatcher] ${allUsers.length} active users, ${readyUsers.length} in 5 AM window`,
    );

    // Step 4: Fan out DCO generation for each ready user
    if (readyUsers.length > 0) {
      await step.sendEvent(
        'dispatch-dco-users',
        readyUsers.map((u) => ({
          name: 'app/dco.generate-user',
          data: { user_id: u.user_id, timezone: u.timezone },
        })),
      );
    }

    return { cleaned, total_active: allUsers.length, dispatched: readyUsers.length };
  },
);

// Per-user worker: fetch data, run extraction + analysis, store DCO
const generateSingleUserDco = inngest.createFunction(
  {
    id: 'generate-single-user-dco',
    name: 'Generate Single User DCO',
    concurrency: { limit: 5 },
  },
  { event: 'app/dco.generate-user' },
  async ({ event, step, env }) => {
    const userId = event.data.user_id;
    const timezone = event.data.timezone;

    try {
      // Step 1: Fetch all input data for DCO generation
      const inputData = await step.run('fetch-user-data', async () => {
        return fetchDcoInputData(userId, timezone, env);
      });

      // Step 2: Extraction pass (gpt-4.1-nano)
      const extractionResult = await step.run('run-extraction', async () => {
        return runDcoExtraction(inputData, env);
      });

      // Step 3: Analysis pass (gpt-4.1-mini)
      const analysisResult = await step.run('run-analysis', async () => {
        return runDcoAnalysis(extractionResult, inputData, env);
      });

      // Step 4: Upsert DCO into user_daily_state
      await step.run('store-dco', async () => {
        const headers = {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates',
        };

        const now = new Date();
        const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days
        const todayLocal = getUserLocalDate(timezone);

        const res = await fetch(
          `${env.SUPABASE_URL}/rest/v1/user_daily_state?on_conflict=user_id,date`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              user_id: userId,
              date: todayLocal,
              dco: analysisResult,
              extraction_raw: extractionResult,
              created_at: now.toISOString(),
              updated_at: now.toISOString(),
              expires_at: expiresAt.toISOString(),
            }),
          },
        );

        if (!res.ok) {
          throw new Error(`Failed to store DCO: ${res.statusText}`);
        }

        console.log(`[DCO] Stored DCO for user ${userId} (${todayLocal})`);
      });

      return { user_id: userId, success: true };
    } catch (error) {
      console.error(`[DCO] Failed for user ${userId}:`, error);
      return { user_id: userId, success: false, error: String(error) };
    }
  },
);

// ============================================================================
// DCO data fetching
// ============================================================================

function sevenDaysAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return formatDateOnly(d);
}

function fourteenDaysAgoStr() {
  const d = new Date();
  d.setDate(d.getDate() - 14);
  return formatDateOnly(d);
}

function fourteenDaysFromNow() {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return formatDateOnly(d);
}

async function fetchDcoInputData(userId, timezone, env) {
  const headers = {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };

  const todayLocal = getUserLocalDate(timezone);

  const [
    todos,
    habits,
    habitProgress,
    notes,
    spaces,
    milestones,
    eventNotes,
    weeklySummaries,
    previousDco,
    userProfile,
  ] = await Promise.all([
    // Todos (last 7 days)
    fetch(
      `${env.SUPABASE_URL}/rest/v1/todos?owner_id=eq.${userId}&created_at=gte.${sevenDaysAgo()}&select=id,name,status,completed_at,target_date,space_id&limit=100`,
      { headers },
    ).then((r) => r.json()),

    // Habits (active only)
    fetch(
      `${env.SUPABASE_URL}/rest/v1/habits?owner_id=eq.${userId}&archived=eq.false&select=id,name,frequency&limit=20`,
      { headers },
    ).then((r) => r.json()),

    // Habit progress (last 7 days)
    fetch(
      `${env.SUPABASE_URL}/rest/v1/habit_progress?owner_id=eq.${userId}&occurred_day=gte.${sevenDaysAgo()}&select=habit_id,occurred_day`,
      { headers },
    ).then((r) => r.json()),

    // Notes (last 7 days) — includes target_date and is_goal for event notes
    fetch(
      `${env.SUPABASE_URL}/rest/v1/notes?owner_id=eq.${userId}&created_at=gte.${sevenDaysAgo()}&select=id,title,text,subtype,mood,space_id,created_at,target_date,is_goal&limit=100`,
      { headers },
    ).then((r) => r.json()),

    // Spaces (active)
    fetch(
      `${env.SUPABASE_URL}/rest/v1/spaces?owner_id=eq.${userId}&archived_at=is.null&select=id,name&limit=20`,
      { headers },
    ).then((r) => r.json()),

    // Space milestones (all active, with dates)
    fetch(
      `${env.SUPABASE_URL}/rest/v1/space_milestones?owner_id=eq.${userId}&is_active=eq.true&select=name,date,space_id,completed&order=date.asc&limit=50`,
      { headers },
    ).then((r) => r.json()),

    // Event notes by target_date (travel dates, key dates — regardless of when created)
    fetch(
      `${env.SUPABASE_URL}/rest/v1/notes?owner_id=eq.${userId}&subtype=eq.event&archived=eq.false&target_date=gte.${fourteenDaysAgoStr()}&target_date=lte.${fourteenDaysFromNow()}&select=id,title,target_date,is_goal,space_id`,
      { headers },
    ).then((r) => r.json()),

    // Weekly summary (latest)
    fetch(
      `${env.SUPABASE_URL}/rest/v1/weekly_summaries?owner_id=eq.${userId}&select=summary_text&order=created_at.desc&limit=1`,
      { headers },
    ).then((r) => r.json()),

    // Previous DCO (yesterday or most recent)
    fetch(
      `${env.SUPABASE_URL}/rest/v1/user_daily_state?user_id=eq.${userId}&date=lt.${todayLocal}&select=dco&order=date.desc&limit=1`,
      { headers },
    ).then((r) => r.json()),

    // User profile (Soul Document — durable identity context)
    fetch(
      `${env.SUPABASE_URL}/rest/v1/user_profiles?user_id=eq.${userId}&select=profile_text&limit=1`,
      { headers },
    ).then((r) => r.json()),
  ]);

  return {
    userId,
    todayLocal,
    timezone,
    todos,
    habits,
    habitProgress,
    notes,
    spaces,
    milestones,
    eventNotes,
    weeklySummary: weeklySummaries[0]?.summary_text || null,
    previousDco: previousDco[0]?.dco || null,
    userProfile: userProfile?.[0]?.profile_text || null,
  };
}

// ============================================================================
// DCO extraction (gpt-4.1-nano)
// ============================================================================

async function runDcoExtraction(inputData, env) {
  const t0 = Date.now();

  // Build a compact data summary for nano
  const todosCompleted = inputData.todos.filter((t) => t.status === 'completed').length;
  const todosOverdue = inputData.todos.filter(
    (t) => t.target_date && t.target_date < inputData.todayLocal && t.status !== 'completed',
  ).length;

  const habitCompletions = {};
  for (const hp of inputData.habitProgress) {
    habitCompletions[hp.habit_id] = (habitCompletions[hp.habit_id] || 0) + 1;
  }

  const habitsFormatted = inputData.habits.map((h) => ({
    name: h.name,
    frequency: h.frequency,
    completions_7d: habitCompletions[h.id] || 0,
  }));

  // Notes with truncated body text for richer extraction
  const noteDetails = inputData.notes
    .filter((n) => n.title && n.subtype !== 'event')
    .slice(0, 20)
    .map((n) => {
      const body = n.text ? ` — ${n.text.slice(0, 150)}` : '';
      const sub = n.subtype ? ` [${n.subtype}]` : '';
      return `${n.title}${sub}${body}`;
    });

  // Event notes with dates — fetched by target_date window, not created_at
  const events = (inputData.eventNotes || [])
    .filter((n) => n.title)
    .slice(0, 10)
    .map((n) => {
      const date = n.target_date || 'no date';
      const goal = n.is_goal ? ' [GOAL]' : '';
      const space = inputData.spaces.find((s) => s.id === n.space_id);
      const spaceName = space ? ` (${space.name})` : '';
      return `${n.title}: ${date}${spaceName}${goal}`;
    });

  // Today's specific events — for calendar-aware headlines
  const todaysEvents = (inputData.eventNotes || [])
    .filter((n) => n.target_date === inputData.todayLocal)
    .map((n) => n.title)
    .filter(Boolean);

  // Milestones with dates
  const milestones = (inputData.milestones || []).slice(0, 10).map((m) => {
    const space = inputData.spaces.find((s) => s.id === m.space_id);
    const spaceName = space ? ` (${space.name})` : '';
    const status = m.completed ? ' [DONE]' : '';
    return `${m.name}: ${m.date || 'no date'}${spaceName}${status}`;
  });

  const moods = inputData.notes.flatMap((n) => n.mood || []);
  const moodCounts = {};
  for (const m of moods) {
    moodCounts[m] = (moodCounts[m] || 0) + 1;
  }

  const spaceNames = inputData.spaces.map((s) => s.name);

  const dataPayload = `DATA SNAPSHOT (last 7 days):
Today's date: ${inputData.todayLocal}
User timezone: ${inputData.timezone}
Todos: ${inputData.todos.length} total, ${todosCompleted} completed, ${todosOverdue} overdue
Habits: ${JSON.stringify(habitsFormatted)}
Key dates & events: ${events.length > 0 ? events.join('; ') : 'none'}
Today's schedule: ${todaysEvents.length > 0 ? todaysEvents.join(', ') : 'no events today'}
Milestones: ${milestones.length > 0 ? milestones.join('; ') : 'none'}
Recent drops: ${noteDetails.length > 0 ? noteDetails.join('\n  ') : 'none'}
Mood signals: ${
    Object.entries(moodCounts)
      .map(([k, v]) => `${k}:${v}`)
      .join(', ') || 'none'
  }
Active spaces: ${spaceNames.join(', ') || 'none'}
Weekly digest: ${inputData.weeklySummary || 'none'}`;

  const systemPrompt = `You are a structured fact extractor. Given a 7-day data snapshot from a productivity app, extract ONLY observable facts. Never interpret, score, or infer feelings.

Output JSON:
{
  "people_mentioned": ["name1", "name2"],
  "places_mentioned": ["place1"],
  "active_projects_or_trips": ["label1"],
  "drop_count_7d": number,
  "completed_count_7d": number,
  "overdue_count": number,
  "habit_completions": [{"name": "X", "done": N, "frequency": "daily"}],
  "mood_signals": {"mood": count},
  "key_events_with_dates": [{"title": "X", "date": "YYYY-MM-DD", "space": "space name"}],
  "notable_drop_titles": ["title1", "title2"],
  "emotional_themes": ["theme1", "theme2"],
  "spaces_active": ["space1"],
  "todays_event_count": number,
  "todays_events": ["event title 1", "event title 2"]
}

Rules:
- Only include people/places/projects explicitly named in the data
- Do not invent or assume anything not present
- Keep arrays empty if no data found
- Extract recurring emotional themes from drop content if they appear across multiple drops or are strongly expressed in one
- Keep arrays empty if nothing stands out
- Output ONLY valid JSON, nothing else`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  let response;
  try {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'gpt-4.1-nano',
        temperature: 0.1,
        max_tokens: 1500,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: dataPayload },
        ],
      }),
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      throw new Error('DCO extraction timed out after 30s');
    }
    throw err;
  }
  clearTimeout(timeout);

  if (!response.ok) {
    throw new Error(`DCO extraction failed: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '{}';

  const EXTRACTION_FALLBACK = {
    people_mentioned: [],
    places_mentioned: [],
    active_projects_or_trips: [],
    drop_count_7d: 0,
    completed_count_7d: 0,
    overdue_count: 0,
    habit_completions: [],
    mood_signals: {},
    key_events_with_dates: [],
    notable_drop_titles: [],
    spaces_active: [],
  };

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (parseErr) {
    // Try to fix common truncation: missing closing brace
    let fixed = content.trim();
    if (!fixed.endsWith('}')) {
      fixed += '}';
    }
    try {
      parsed = JSON.parse(fixed);
      console.warn('[DCO:Nano] Recovered truncated JSON after appending }');
    } catch {
      console.error('[DCO:Nano] JSON parse failed, using fallback. Raw:', content.slice(0, 200));
      parsed = EXTRACTION_FALLBACK;
    }
  }

  const latency = Date.now() - t0;

  console.log(`[DCO:Nano] Extraction complete in ${latency}ms`);
  return parsed;
}

// ============================================================================
// DCO analysis (gpt-4.1-mini)
// ============================================================================

async function runDcoAnalysis(extraction, inputData, env) {
  const t0 = Date.now();

  const timezoneContext = `USER TIMEZONE: ${inputData.timezone} (this indicates their current physical location)
TODAY'S DATE: ${inputData.todayLocal}
Use the timezone and today's date to determine where the user is RIGHT NOW by comparing against their key dates and events.`;

  // Include previous DCO for delta comparison
  const previousContext = inputData.previousDco
    ? `PREVIOUS DCO (for delta comparison):\n${JSON.stringify(inputData.previousDco, null, 2)}`
    : 'No previous DCO available (new user or first generation).';

  const userProfileContext = inputData.userProfile
    ? `USER PROFILE (durable identity — who this person is):\n${inputData.userProfile}`
    : 'No user profile available yet.';

  const systemPrompt = `You are Gremly's daily context engine. Given structured facts extracted from a user's last 7 days, produce a Daily Context Object (DCO) — a JSON snapshot of their current life situation.

${timezoneContext}

${previousContext}

${userProfileContext}

Output this exact JSON shape:
{
  "life_moment": "short phrase describing their current life situation" | null,
  "life_moment_confidence": "high" | "medium" | "low",
  "tone": "relaxed" | "focused" | "stretched" | "recovering" | "celebratory",
  "brief_headline": "one-liner Gremly says to the user" | null,
  "named_anchors": [{"label": "Name", "type": "person|trip|project|event", "source": "drop|space"}],
  "active_today": {
    "overdue_todos": number,
    "habit_streak_risk": ["habit names at risk"],
    "upcoming_in_7d": ["event or date descriptions"]
  },
  "deltas": {
    "drop_velocity": "high" | "normal" | "low",
    "habit_health": "high" | "normal" | "low",
    "mood_signal": "positive" | "neutral" | "negative" | "mixed",
    "notable_change": "one sentence describing the most notable change vs recent baseline" | null
  },
  "weekly_digest": "one sentence summary" | null
}

CRITICAL RULES:
1. DELTA RULE: Every observation MUST compare against recent baseline. "3 todos completed" means nothing. "3 todos completed vs 8 last week — slower pace" means something. If no previous DCO exists, note this is a first impression.
2. ANTI-GENERIC RULE: If nothing specific stands out, set brief_headline to null. NEVER output generic filler like "Busy day ahead!", "Stay focused!", "You've got this!". Silence is better than generic.
3. VOICE RULE for brief_headline: Write as Gremly speaking directly to the user. Short, warm, situationally specific. No exclamation marks. No corporate motivational tone. No third person.
   Good: "Day 6 in Italy. The pile can wait."
   Good: "Big pitch today — you've prepped for this."
   Bad: "User is on honeymoon, day 6."
   Bad: "Stay focused and have a productive day!"
4. If there is very little data (fewer than 3 drops and no habits), set life_moment_confidence to "low" and keep observations conservative.
5. tone should reflect the OVERALL vibe, not individual items. Someone on vacation with 2 overdue todos is still "relaxed".
6. named_anchors: only include proper nouns explicitly present in the data. Never invent people or places.
7. ROUTINE WEEK STRATEGY: When there is no standout life event (no travel, no major milestone, no significant emotional shift), DO NOT try to force a dramatic life_moment. Instead:
   - Set life_moment to a practical summary: "normal work week" or "steady routine"
   - Set life_moment_confidence to "low"
   - For brief_headline, be PRACTICAL and reference what's actually on today's plate: habits due, events scheduled, or projects in progress.
   - Use the user profile to make it personal. Name specific things from THEIR life, not generic categories.
   - If the user has events today, reference those specifically.
   - A good routine headline names 1-2 specific things from TODAY, not generic observations about the week.
   - Vary the structure. Do not always use "X and Y. Short comment." format.
   - Examples: "Three Sage meetings before lunch.", "Quiet calendar — good day for the backlog.", "Running and a Gremly sprint. Not bad for a Tuesday."
8. SPARSE DATA / NO CALENDAR STRATEGY: When there is no calendar data or very few items to work with:
   - NEVER say "not much data", "quiet week", or "still getting started" without adding something specific. Even "Just the habits today. That counts." is better than nothing.
   - Look for PATTERNS over individual items: "Third week of consistent yoga" is better than "You did yoga."
   - Reference habit streaks or trends: "Running streak at 5 days" or "Social media habit building momentum."
   - Note space activity shifts: "Kitchen renovation space getting active" or "Wedding planning winding down."
   - If mood signals show a consistent direction, acknowledge it: "Good week by the numbers" or "Quieter week than usual."
   - For users with a profile but thin recent data, bridge the two: use what you know about them to contextualize recent activity. "Still settling into the running habit — 2 of 3 this week."
   - If a user has very few drops but they are concentrated in one space, reference that space.
   - LAST RESORT: If there is genuinely almost nothing to work with, acknowledge the user's app engagement streak if one exists (consecutive days with drops or sweeps). Frame as observation, not cheerleading: "Day 4 in a row. Rhythm's there." NOT "Great streak, keep it up!"

Output ONLY valid JSON, nothing else.`;

  const extractionPayload = JSON.stringify(extraction, null, 2);

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4.1-mini',
      temperature: 0.4,
      max_tokens: 800,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `EXTRACTED FACTS:\n${extractionPayload}` },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`DCO analysis failed: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '{}';
  const dco = JSON.parse(content);
  const latency = Date.now() - t0;

  console.log(`[DCO:Mini] Analysis complete in ${latency}ms`, {
    life_moment: dco.life_moment,
    tone: dco.tone,
    has_headline: !!dco.brief_headline,
  });

  // Attach metadata
  dco.user_id = inputData.userId;
  dco.date = inputData.todayLocal;
  dco.generated_at = new Date().toISOString();
  dco.ttl_days = 7;
  dco.today_focus = null; // Populated later by Morning Brief
  dco.input_sources = ['todos', 'habits', 'notes', 'spaces'];
  if (inputData.weeklySummary) dco.input_sources.push('weekly_summary');
  dco.model_used = 'gpt-4.1-mini';

  return dco;
}

// ============================================================================
// Core synthesis logic
// ============================================================================

async function synthesizeUserProfile(userId, env) {
  const headers = {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };

  try {
    // Parallel fetch: structured data + chat messages
    const [todos, habits, habitProgress, notes, spaces, spaceChatMessages, overrides] =
      await Promise.all([
        // Todos (90 days) - include views for entity chat
        fetch(
          `${env.SUPABASE_URL}/rest/v1/todos?owner_id=eq.${userId}&created_at=gte.${ninetyDaysAgo()}&select=title,completed_at,archived,views&limit=200`,
          { headers },
        ).then((r) => r.json()),

        // Habits - include views for entity chat
        fetch(
          `${env.SUPABASE_URL}/rest/v1/habits?owner_id=eq.${userId}&archived=eq.false&select=id,name,frequency,views&limit=20`,
          { headers },
        ).then((r) => r.json()),

        // Habit progress (30 days)
        fetch(
          `${env.SUPABASE_URL}/rest/v1/habit_progress?owner_id=eq.${userId}&occurred_day=gte.${thirtyDaysAgo()}&select=habit_id,occurred_day`,
          { headers },
        ).then((r) => r.json()),

        // Notes (30 days) - include views for entity chat
        fetch(
          `${env.SUPABASE_URL}/rest/v1/notes?owner_id=eq.${userId}&created_at=gte.${thirtyDaysAgo()}&select=title,subtype,mood,views&limit=50`,
          { headers },
        ).then((r) => r.json()),

        // Spaces
        fetch(
          `${env.SUPABASE_URL}/rest/v1/spaces?owner_id=eq.${userId}&archived_at=is.null&select=name&limit=10`,
          { headers },
        ).then((r) => r.json()),

        // Space chat messages (user role only, last 30 days)
        fetch(
          `${env.SUPABASE_URL}/rest/v1/space_chat_messages?user_id=eq.${userId}&role=eq.user&created_at=gte.${thirtyDaysAgo()}&select=content&limit=100`,
          { headers },
        ).then((r) => r.json()),

        // User profile overrides (add/remove facts)
        fetch(
          `${env.SUPABASE_URL}/rest/v1/user_profile_overrides?user_id=eq.${userId}&select=action,fact_text`,
          { headers },
        )
          .then((r) => r.json())
          .catch(() => []),
      ]);

    // ========================================================================
    // Part 1: Pattern Analysis
    // ========================================================================

    // Habit completion rates
    const habitIds = habits.map((h) => h.id);
    const habitCompletionMap = {};
    for (const hp of habitProgress) {
      habitCompletionMap[hp.habit_id] = (habitCompletionMap[hp.habit_id] || 0) + 1;
    }

    const habitsWithCompletion = habits.map((h) => ({
      name: h.name,
      frequency: h.frequency,
      completions: habitCompletionMap[h.id] || 0,
      expected: getExpectedCompletions(h.frequency),
    }));

    // Todo completion rate
    const doneCount = todos.filter((t) => t.completed_at || t.archived).length;

    // Mood patterns
    const moodCounts = {};
    for (const note of notes) {
      if (note.mood && Array.isArray(note.mood)) {
        for (const m of note.mood) {
          moodCounts[m] = (moodCounts[m] || 0) + 1;
        }
      }
    }

    // ========================================================================
    // Part 2: Extract User Messages from All Chat Sources
    // ========================================================================

    const userMessages = [];

    // Space chat messages (already filtered to user role)
    for (const msg of spaceChatMessages) {
      if (msg.content) {
        userMessages.push(msg.content);
      }
    }

    // Entity chat messages from todos
    for (const todo of todos) {
      const messages = extractEntityChatMessages(todo.views);
      userMessages.push(...messages);
    }

    // Entity chat messages from habits
    for (const habit of habits) {
      const messages = extractEntityChatMessages(habit.views);
      userMessages.push(...messages);
    }

    // Entity chat messages from notes
    for (const note of notes) {
      const messages = extractEntityChatMessages(note.views);
      userMessages.push(...messages);
    }

    console.log(
      `[User ${userId.slice(0, 8)}] Found ${userMessages.length} user messages for fact extraction`,
    );

    // ========================================================================
    // Part 3: Two-Pass LLM Synthesis
    // ========================================================================

    // Pass 1: Pattern profile
    const patternInput = {
      todoCount: todos.length,
      completedCount: doneCount,
      habits: habitsWithCompletion,
      moodPatterns: moodCounts,
      spaces: spaces.map((s) => s.name),
    };

    const patternProfile = await synthesizePatterns(patternInput, env.OPENAI_API_KEY);

    // Pass 2: Fact extraction (only if we have messages)
    let extractedFacts = [];
    if (userMessages.length > 0) {
      extractedFacts = await extractFacts(userMessages, env.OPENAI_API_KEY);
    }

    // Apply user overrides to extracted facts
    if (overrides && overrides.length > 0) {
      // Remove facts the user deleted
      const removedFacts = overrides
        .filter((o) => o.action === 'remove')
        .map((o) => o.fact_text.toLowerCase());

      extractedFacts = extractedFacts.filter(
        (fact) =>
          !removedFacts.some(
            (removed) =>
              fact.toLowerCase().includes(removed) || removed.includes(fact.toLowerCase()),
          ),
      );

      // Add facts the user added
      const addedFacts = overrides.filter((o) => o.action === 'add').map((o) => o.fact_text);

      extractedFacts = [...extractedFacts, ...addedFacts];

      console.log(`[User ${userId.slice(0, 8)}] Applied ${overrides.length} overrides`);
    }

    // Combine into final profile
    const finalProfile = combineProfile(patternProfile, extractedFacts);

    // ========================================================================
    // Part 4: Store Result
    // ========================================================================

    // Check if profile exists (for setting relationship_started_at on first synthesis)
    const existingProfile = await fetch(
      `${env.SUPABASE_URL}/rest/v1/user_profiles?user_id=eq.${userId}&select=user_id`,
      { headers },
    ).then((r) => r.json());

    const profileData = {
      user_id: userId,
      profile_text: finalProfile,
      signals: {
        patterns: patternInput,
        facts: extractedFacts,
        message_count: userMessages.length,
        overrides_applied: overrides?.length || 0,
      },
      generated_at: new Date().toISOString(),
      model_used: 'gpt-4o-mini',
    };

    // Set relationship start on first synthesis
    if (!existingProfile || existingProfile.length === 0) {
      profileData.relationship_started_at = await getFirstActivityDate(userId, env);
      console.log(
        `[SynthesizeProfiles] First synthesis for ${userId.slice(0, 8)}, relationship started: ${profileData.relationship_started_at}`,
      );
    }

    const upsertResponse = await fetch(`${env.SUPABASE_URL}/rest/v1/user_profiles`, {
      method: 'POST',
      headers: {
        ...headers,
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify(profileData),
    });

    if (!upsertResponse.ok) {
      throw new Error(`Failed to store profile: ${upsertResponse.statusText}`);
    }

    console.log(`[SynthesizeProfiles] Completed for user ${userId.slice(0, 8)}`);
    return { success: true };
  } catch (error) {
    console.error(`[SynthesizeProfiles] Error for user ${userId.slice(0, 8)}:`, error);
    return { success: false, error: String(error) };
  }
}

// ============================================================================
// Helper: Extract user messages from entity views.chat
// ============================================================================

function extractEntityChatMessages(views) {
  const messages = [];

  if (!views || !views.chat || !views.chat.messages) {
    return messages;
  }

  for (const msg of views.chat.messages) {
    if (msg.role === 'user' && msg.content) {
      messages.push(msg.content);
    }
  }

  return messages;
}

// ============================================================================
// Helper: Expected completions by frequency
// ============================================================================

function getExpectedCompletions(frequency) {
  switch (frequency) {
    case 'daily':
      return 30;
    case 'weekly':
      return 4;
    case '2x/week':
      return 8;
    case '3x/week':
      return 12;
    case '4x/week':
      return 16;
    case '5x/week':
      return 20;
    case '6x/week':
      return 24;
    case '5x/month':
      return 5;
    case 'monthly':
      return 1;
    default:
      return 30; // assume daily if unknown
  }
}

// ============================================================================
// LLM: Pattern synthesis
// ============================================================================

async function synthesizePatterns(input, apiKey) {
  const habitSummary =
    input.habits.length > 0
      ? input.habits
          .map((h) => `"${h.name}" ${h.completions}/${h.expected} (${h.frequency})`)
          .join(', ')
      : 'None tracked';

  const moodSummary =
    Object.keys(input.moodPatterns).length > 0
      ? Object.entries(input.moodPatterns)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ')
      : 'No mood data';

  const prompt = `You are writing notes for a supportive companion about someone they care about.

DATA:
- Todos: ${input.todoCount} total, ${input.completedCount} completed or archived (90 days)
- Habits (30 days): ${habitSummary}
- Mood patterns: ${moodSummary}
- Life areas: ${input.spaces.join(', ') || 'None defined'}

Write a warm, supportive profile (~100-150 words) that:
1. Leads with what they care about (interests, life areas) — not metrics
2. Treats low habit completion as totally normal for new habits
3. Highlights any positive patterns, however small
4. If there is struggle, frame it as "building" or "working on"

EXAMPLES (good vs bad):
❌ "Struggling to engage with wellness habits, lots of unmet commitments"
✅ "Building several wellness habits — all still early. Showing up for meditation most consistently."

❌ "Low completion rate suggests difficulty following through"
✅ "Has a lot on their plate across work and personal life — still finding their rhythm"

Output ONLY the profile text, no headers.`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 300,
        temperature: 0.7,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`OpenAI error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      console.error('[synthesizePatterns] OpenAI request timed out after 90s');
    }
    throw err;
  }
}

// ============================================================================
// LLM: Fact extraction from chat messages
// ============================================================================

async function extractFacts(messages, apiKey) {
  // Combine messages, truncate if too long
  const combinedText = messages.slice(0, 50).join('\n---\n');

  const prompt = `Extract personal facts about this user from their messages. Look for:
- Job, career, work situation
- Relationships, family
- Health conditions or challenges (physical, mental)
- Goals and aspirations
- Location or living situation
- Hobbies and interests
- Life circumstances

USER MESSAGES:
${combinedText}

RULES:
- Only include facts they explicitly stated or strongly implied
- Be specific (e.g., "works at an ad agency" not "has a job")
- Ignore generic requests/questions that don't reveal personal info
- Output as a JSON array of strings, e.g., ["works in tech", "has ADHD", "lives in LA"]
- If no personal facts found, output empty array: []

Output ONLY the JSON array, no explanation.`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
        temperature: 0.3, // Lower temp for extraction
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`OpenAI error (facts): ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content.trim();

    try {
      return JSON.parse(content);
    } catch {
      console.warn('Failed to parse facts JSON:', content);
      return [];
    }
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      console.error('[extractFacts] OpenAI request timed out after 90s');
    }
    throw err;
  }
}

// ============================================================================
// Combine pattern profile with extracted facts
// ============================================================================

function combineProfile(patternProfile, facts) {
  if (!facts || facts.length === 0) {
    return patternProfile;
  }

  // Add facts section
  const factsSection = `\n\nPersonal context: ${facts.join('. ')}.`;

  return patternProfile + factsSection;
}

// ============================================================================
// Helper: Get first activity date for relationship_started_at
// ============================================================================

async function getFirstActivityDate(userId, env) {
  const headers = {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
  };

  // Get earliest activity across all tables
  const [todos, habits, notes] = await Promise.all([
    fetch(
      `${env.SUPABASE_URL}/rest/v1/todos?owner_id=eq.${userId}&select=created_at&order=created_at.asc&limit=1`,
      { headers },
    ).then((r) => r.json()),
    fetch(
      `${env.SUPABASE_URL}/rest/v1/habits?owner_id=eq.${userId}&select=created_at&order=created_at.asc&limit=1`,
      { headers },
    ).then((r) => r.json()),
    fetch(
      `${env.SUPABASE_URL}/rest/v1/notes?owner_id=eq.${userId}&select=created_at&order=created_at.asc&limit=1`,
      { headers },
    ).then((r) => r.json()),
  ]);

  const dates = [todos[0]?.created_at, habits[0]?.created_at, notes[0]?.created_at].filter(Boolean);

  return dates.length > 0
    ? new Date(Math.min(...dates.map((d) => new Date(d)))).toISOString()
    : new Date().toISOString();
}

// ============================================================================
// Space Suggestions Generation
// ============================================================================

async function generateSpaceSuggestions(userId, env) {
  const headers = {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };

  try {
    console.log(`[SpaceSuggestions] Starting for user: ${userId}`);

    // Step 1: Check if user has enable_space_suggestions = true
    const userProfileResponse = await fetch(
      `${env.SUPABASE_URL}/rest/v1/user_profiles?user_id=eq.${userId}&select=enable_space_suggestions`,
      { headers },
    );
    const userProfiles = await userProfileResponse.json();
    const enableSuggestions = userProfiles[0]?.enable_space_suggestions ?? true;

    console.log(`[SpaceSuggestions] User setting enabled: ${enableSuggestions}`);

    if (!enableSuggestions) {
      return { success: true, skipped: 'user_disabled' };
    }

    // Step 2: Fetch ALL user's spaces (including disable_suggestions flag)
    const spacesResponse = await fetch(
      `${env.SUPABASE_URL}/rest/v1/spaces?owner_id=eq.${userId}&archived_at=is.null&select=id,name,disable_suggestions`,
      { headers },
    );
    const allSpacesData = await spacesResponse.json();

    // Ensure we have an array (Supabase returns error object on failure)
    const allSpaces = Array.isArray(allSpacesData) ? allSpacesData : [];
    if (!Array.isArray(allSpacesData)) {
      console.error('[SpaceSuggestions] Spaces query failed:', allSpacesData);
    }

    // Step 3: Fetch unassigned drops (last 14 days) with views data
    const fourteenDaysAgo = formatDateOnly(new Date(Date.now() - 14 * 24 * 60 * 60 * 1000));

    const [unassignedTodos, unassignedNotes, unassignedHabits] = await Promise.all([
      fetch(
        `${env.SUPABASE_URL}/rest/v1/todos?owner_id=eq.${userId}&space_id=is.null&archived=eq.false&completed_at=is.null&created_at=gte.${fourteenDaysAgo}&select=id,title,body,tags,created_at,views&limit=50`,
        { headers },
      ).then((r) => r.json()),
      fetch(
        `${env.SUPABASE_URL}/rest/v1/notes?owner_id=eq.${userId}&space_id=is.null&archived=eq.false&subtype=neq.journal&created_at=gte.${fourteenDaysAgo}&select=id,title,body,tags,subtype,created_at,views&limit=50`,
        { headers },
      ).then((r) => r.json()),
      fetch(
        `${env.SUPABASE_URL}/rest/v1/habits?owner_id=eq.${userId}&space_id=is.null&archived_at=is.null&created_at=gte.${fourteenDaysAgo}&select=id,name,tags,created_at,views&limit=20`,
        { headers },
      ).then((r) => r.json()),
    ]);

    // Combine and format unassigned entities
    const unassignedDrops = [
      ...unassignedTodos.map((t) => ({
        id: t.id,
        type: 'todo',
        subtype: null,
        title: t.title,
        body: t.body,
        tags: t.tags || [],
        keywords: t.views?.keywords || null,
        people: t.views?.people || null,
        mood: null,
        created_at: t.created_at,
      })),
      ...unassignedNotes.map((n) => ({
        id: n.id,
        type: 'note',
        subtype: n.subtype,
        title: n.title,
        body: n.body,
        tags: n.tags || [],
        keywords: n.views?.keywords || null,
        people: n.views?.people || null,
        mood: n.views?.mood || null,
        created_at: n.created_at,
      })),
      ...unassignedHabits.map((h) => ({
        id: h.id,
        type: 'habit',
        subtype: null,
        title: h.name,
        body: null,
        tags: h.tags || [],
        keywords: null,
        people: null,
        mood: null,
        created_at: h.created_at,
      })),
    ]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 100);

    console.log(
      `[SpaceSuggestions] Found ${allSpaces.length} spaces, ${unassignedDrops.length} unassigned drops`,
    );

    // Step 4: Check skip conditions
    if (unassignedDrops.length < 3) {
      console.log(`[SpaceSuggestions] Fewer than 3 unassigned drops, skipping`);
      return { success: true, skipped: 'too_few_drops' };
    }

    // Step 5: Build condensed profiles for each space (where disable_suggestions = false)
    const spacesForSuggestions = allSpaces.filter((s) => !s.disable_suggestions);
    const spaceProfiles = await Promise.all(
      spacesForSuggestions.map((space) => buildSpaceProfile(space, env, headers)),
    );

    console.log(`[SpaceSuggestions] Built profiles for ${spaceProfiles.length} spaces`);

    // Step 6: Call AI to generate suggestions
    const aiSuggestions = await callAIForSpaceSuggestions(
      spaceProfiles,
      unassignedDrops,
      env.OPENAI_API_KEY,
    );

    const assignCount = aiSuggestions.assign_to_existing?.length || 0;
    console.log(`[SpaceSuggestions] AI response: ${assignCount} assign suggestions`);

    // Step 7: Validate suggestions
    const validSpaceIds = new Set(spacesForSuggestions.map((s) => s.id));
    const validDropIds = new Set(unassignedDrops.map((e) => e.id));

    let filteredOut = 0;

    const validAssignSuggestions = (aiSuggestions.assign_to_existing || []).filter((s) => {
      if (!validSpaceIds.has(s.space_id)) {
        console.warn(`[SpaceSuggestions] Invalid space_id: ${s.space_id}`);
        filteredOut++;
        return false;
      }
      const originalCount = s.drop_ids?.length || 0;
      s.drop_ids = (s.drop_ids || []).filter((id) => validDropIds.has(id));
      if (s.drop_ids.length < originalCount) {
        console.warn(
          `[SpaceSuggestions] Filtered ${originalCount - s.drop_ids.length} invalid drop_ids`,
        );
      }
      return s.drop_ids.length > 0;
    });

    const validCount = validAssignSuggestions.length;
    console.log(`[SpaceSuggestions] Validation: ${validCount} valid, ${filteredOut} filtered out`);

    // Step 8: Expire old pending suggestions
    await fetch(
      `${env.SUPABASE_URL}/rest/v1/space_suggestions?user_id=eq.${userId}&status=eq.pending`,
      {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'expired', updated_at: new Date().toISOString() }),
      },
    );

    // Step 9: Insert new suggestions
    const suggestionsToInsert = [];

    for (const s of validAssignSuggestions) {
      suggestionsToInsert.push({
        user_id: userId,
        suggestion_type: 'assign_to_space',
        space_id: s.space_id,
        suggested_name: null,
        reason: s.reason || null,
        drop_ids: s.drop_ids,
        confidence: s.confidence || 0.8,
        status: 'pending',
      });
    }

    if (suggestionsToInsert.length > 0) {
      const insertResponse = await fetch(`${env.SUPABASE_URL}/rest/v1/space_suggestions`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify(suggestionsToInsert),
      });

      if (!insertResponse.ok) {
        console.error(`[SpaceSuggestions] Failed to insert: ${insertResponse.statusText}`);
        return { success: false, error: 'db_error' };
      }
    }

    console.log(`[SpaceSuggestions] Saved ${suggestionsToInsert.length} total suggestions`);
    console.log(`[SpaceSuggestions] Complete for user: ${userId}`);

    return {
      success: true,
      suggestions_created: {
        assign_to_existing: validAssignSuggestions.length,
      },
    };
  } catch (error) {
    console.error(`[SpaceSuggestions] Error for user ${userId}:`, error);
    return { success: false, error: String(error) };
  }
}

// ============================================================================
// Build condensed profile for a Space
// ============================================================================

async function buildSpaceProfile(space, env, headers) {
  // Fetch entities in this space
  const [todosData, notesData, habitsData] = await Promise.all([
    fetch(
      `${env.SUPABASE_URL}/rest/v1/todos?space_id=eq.${space.id}&archived=eq.false&select=title,tags,body`,
      { headers },
    ).then((r) => r.json()),
    fetch(
      `${env.SUPABASE_URL}/rest/v1/notes?space_id=eq.${space.id}&archived=eq.false&select=title,tags,body,subtype`,
      { headers },
    ).then((r) => r.json()),
    fetch(
      `${env.SUPABASE_URL}/rest/v1/habits?space_id=eq.${space.id}&archived=eq.false&select=name,tags`,
      { headers },
    ).then((r) => r.json()),
  ]);

  // Ensure arrays (Supabase returns error object on failure)
  const todos = Array.isArray(todosData) ? todosData : [];
  const notes = Array.isArray(notesData) ? notesData : [];
  const habits = Array.isArray(habitsData) ? habitsData : [];

  const allEntities = [
    ...todos.map((t) => ({ title: t.title, body: t.body, tags: t.tags || [] })),
    ...notes.map((n) => ({ title: n.title, body: n.body, tags: n.tags || [] })),
    ...habits.map((h) => ({ title: h.name, body: null, tags: h.tags || [] })),
  ];

  // Fetch recent chat themes
  const chatsResponse = await fetch(
    `${env.SUPABASE_URL}/rest/v1/space_chats?space_id=eq.${space.id}&select=running_summary,context_json&order=updated_at.desc&limit=3`,
    { headers },
  );
  const chatsData = await chatsResponse.json();
  const chats = Array.isArray(chatsData) ? chatsData : [];

  const sampleTitles = allEntities
    .map((e) => e.title)
    .filter(Boolean)
    .slice(0, 10);

  return {
    space_id: space.id,
    name: space.name,
    goal: null, // goal column doesn't exist on spaces table
    target_date: null, // target_date column doesn't exist on spaces table
    top_tags: extractTopTags(allEntities, 10),
    top_keywords: extractTopKeywords(allEntities, 10),
    people_mentioned: extractPeopleFromEntities(allEntities, 5),
    chat_themes: extractChatThemes(chats, 3),
    item_count: allEntities.length,
    sample_titles: sampleTitles,
  };
}

// ============================================================================
// Helper: Extract top tags by frequency
// ============================================================================

function extractTopTags(entities, limit = 10) {
  const tagCounts = {};
  for (const e of entities) {
    if (Array.isArray(e.tags)) {
      for (const tag of e.tags) {
        const normalized = String(tag).toLowerCase().trim();
        if (normalized) {
          tagCounts[normalized] = (tagCounts[normalized] || 0) + 1;
        }
      }
    }
  }
  return Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag]) => tag);
}

// ============================================================================
// Helper: Extract top keywords from titles and bodies
// ============================================================================

const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
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
  'from',
  'up',
  'about',
  'into',
  'through',
  'during',
  'before',
  'after',
  'above',
  'below',
  'between',
  'under',
  'again',
  'further',
  'then',
  'once',
  'here',
  'there',
  'when',
  'where',
  'why',
  'how',
  'all',
  'each',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'no',
  'nor',
  'not',
  'only',
  'own',
  'same',
  'so',
  'than',
  'too',
  'very',
  's',
  't',
  'can',
  'will',
  'just',
  'don',
  'should',
  'now',
  'i',
  'me',
  'my',
  'myself',
  'we',
  'our',
  'ours',
  'you',
  'your',
  'he',
  'him',
  'his',
  'she',
  'her',
  'it',
  'its',
  'they',
  'them',
  'their',
  'what',
  'which',
  'who',
  'whom',
  'this',
  'that',
  'these',
  'those',
  'am',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'having',
  'do',
  'does',
  'did',
  'doing',
  'would',
  'could',
  'ought',
  "i'm",
  "you're",
  "he's",
  "she's",
  "it's",
  "we're",
  "they're",
  "i've",
  "you've",
  "we've",
  "they've",
  "i'd",
  "you'd",
  "he'd",
  "she'd",
  "we'd",
  "they'd",
  "i'll",
  "you'll",
  "he'll",
  "she'll",
  "we'll",
  "they'll",
  "isn't",
  "aren't",
  "wasn't",
  "weren't",
  "hasn't",
  "haven't",
  "hadn't",
  "doesn't",
  "don't",
  "didn't",
  "won't",
  "wouldn't",
  "shan't",
  "shouldn't",
  "can't",
  'cannot',
  "couldn't",
  "mustn't",
  "let's",
  "that's",
  "who's",
  "what's",
  "here's",
  "there's",
  "when's",
  "where's",
  "why's",
  "how's",
  'need',
  'get',
  'make',
  'go',
  'come',
  'take',
  'see',
  'know',
  'want',
  'look',
  'use',
  'find',
  'give',
  'tell',
  'work',
  'call',
  'try',
  'ask',
  'put',
  'keep',
  'let',
  'begin',
  'seem',
  'help',
  'show',
  'hear',
  'play',
  'run',
  'move',
  'live',
  'believe',
]);

function extractTopKeywords(entities, limit = 10) {
  const wordCounts = {};
  for (const e of entities) {
    const text = `${e.title || ''} ${e.body || ''}`.toLowerCase();
    const words = text.match(/\b[a-z]{3,}\b/g) || [];
    for (const word of words) {
      if (!STOP_WORDS.has(word)) {
        wordCounts[word] = (wordCounts[word] || 0) + 1;
      }
    }
  }
  return Object.entries(wordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}

// ============================================================================
// Helper: Extract people names from entities
// ============================================================================

function extractPeopleFromEntities(entities, limit = 5) {
  const names = new Set();

  // Common name patterns: Capitalized words that look like names
  const namePattern = /\b[A-Z][a-z]{2,}\b/g;

  for (const e of entities) {
    const text = `${e.title || ''} ${e.body || ''}`;
    const matches = text.match(namePattern) || [];
    for (const name of matches) {
      // Filter out common non-names
      if (
        ![
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday',
          'Saturday',
          'Sunday',
          'January',
          'February',
          'March',
          'April',
          'May',
          'June',
          'July',
          'August',
          'September',
          'October',
          'November',
          'December',
          'Today',
          'Tomorrow',
          'Yesterday',
          'Morning',
          'Evening',
          'Night',
          'Week',
          'Month',
          'Year',
        ].includes(name)
      ) {
        names.add(name);
      }
    }
  }

  return Array.from(names).slice(0, limit);
}

// ============================================================================
// Helper: Extract chat themes from space chats
// ============================================================================

function extractChatThemes(chats, limit = 3) {
  const themes = [];
  for (const chat of chats) {
    if (chat.running_summary) {
      // Take first sentence or first 50 chars
      const summary = chat.running_summary.split('.')[0].trim();
      if (summary && summary.length > 5) {
        themes.push(summary.slice(0, 100));
      }
    }
    if (chat.context_json?.topic) {
      themes.push(chat.context_json.topic);
    }
  }
  return [...new Set(themes)].slice(0, limit);
}

// ============================================================================
// AI call for space suggestions (uses gpt-4.1-mini for assign-to-existing suggestions)
// ============================================================================

async function callAIForSpaceSuggestions(spaceProfiles, unassignedDrops, apiKey) {
  // Build space profiles text
  let spacesText = '';
  if (spaceProfiles.length > 0) {
    for (const sp of spaceProfiles) {
      spacesText += `\nSpace: ${sp.name}\n`;
      spacesText += `Goal: ${sp.goal || 'not set'}\n`;
      spacesText += `Target date: ${sp.target_date || 'not set'}\n`;
      spacesText += `Contains ${sp.item_count} items\n`;
      spacesText += `Sample items: ${sp.sample_titles?.length > 0 ? sp.sample_titles.join(', ') : 'none'}\n`;
      spacesText += `Common tags: ${sp.top_tags.length > 0 ? sp.top_tags.join(', ') : 'none'}\n`;
      spacesText += `Common keywords: ${sp.top_keywords.length > 0 ? sp.top_keywords.join(', ') : 'none'}\n`;
      spacesText += `People mentioned: ${sp.people_mentioned.length > 0 ? sp.people_mentioned.join(', ') : 'none'}\n`;
      spacesText += `Recent chat themes: ${sp.chat_themes.length > 0 ? sp.chat_themes.join('; ') : 'none'}\n`;
      spacesText += `Space ID: ${sp.space_id}\n`;
    }
  } else {
    spacesText = '(No existing spaces)\n';
  }

  // Build unassigned drops text
  const dropsText = unassignedDrops
    .map((d) => {
      let line = `\nID: ${d.id}\n`;
      line += `Title: ${d.title}\n`;
      line += `Type: ${d.type}${d.subtype ? '/' + d.subtype : ''}\n`;
      line += `Tags: ${d.tags?.length > 0 ? d.tags.join(', ') : 'none'}\n`;
      line += `Keywords: ${d.keywords || 'none'}\n`;
      line += `People: ${d.people || 'none'}\n`;
      return line;
    })
    .join('');

  const systemPrompt = `You analyze a user's captured items and suggest which ones belong in their existing Spaces.

A Space is a container for something a person is actively working on, planning, or managing in their life. The defining quality of a good Space is that the person would open it regularly to check progress, add new items, or figure out what to do next.

Your job is to identify which unassigned items belong in existing Spaces. Items that don't clearly fit any existing Space should be left unassigned — that's completely fine.`;

  const userPrompt = `EXISTING SPACES:
${spacesText}
UNASSIGNED ITEMS:
${dropsText}

ANALYSIS CRITERIA:
IMPORTANT: Be generous when assigning to existing Spaces. If an item could plausibly be part of an existing Space based on its title, topic, or context, assign it there. For example, if a Space contains app development tasks like 'Fix Lock-in Button' and 'Build Mind Drop Widget', then an item like 'Plan Your Tomorrow Section' clearly belongs in that same Space even if the keywords don't overlap exactly. Think about WHAT the items are about, not just whether tags match.

To determine if an item belongs in a Space, consider (in priority order):
1. SPACE PURPOSE: Does the item relate to the Space's name and goal?
2. ENTITY OVERLAP: Does the item reference projects or topics present in the Space?
3. KEYWORD/TAG OVERLAP: Do the item's keywords or tags match the Space's common ones?
4. DOMAIN FIT: Is the item in the same general life domain as the Space?
5. PEOPLE OVERLAP: Does the item mention people associated with the Space?
   (Weight this higher if the Space itself is about specific people)

Items that don't clearly fit any existing Space should be left unassigned.

CONFIDENCE SCORING:
- 90-100%: Clearly belongs based on Space purpose OR strong entity/keyword match
- 80-89%: Good fit based on multiple signals aligning
- 70-79%: Reasonable fit, some signals present
- Below 70%: Don't include

OUTPUT (JSON only, no explanation):
{
  "assign_to_existing": [
    {
      "space_id": "uuid",
      "drop_ids": ["uuid", "uuid"],
      "reason": "why these items belong in this Space",
      "confidence": 0.85
    }
  ]
}

Order results by confidence (highest first).
If no suggestions meet criteria, return an empty array.`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 4096,
        temperature: 0.3,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`[SpaceSuggestions] OpenAI error: ${response.statusText}`);
      return { assign_to_existing: [] };
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content?.trim() || '';
    console.log('[SpaceSuggestions] Raw AI response:', content.slice(0, 200));

    try {
      // Parse JSON, handling markdown code fences
      let jsonStr = content;
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
      }
      return JSON.parse(jsonStr);
    } catch (e) {
      console.error('[SpaceSuggestions] Failed to parse AI response:', content);
      return { assign_to_existing: [] };
    }
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      console.error('[callAIForSpaceSuggestions] OpenAI request timed out after 90s');
    }
    throw err;
  }
}

// ============================================================================
// Date helpers
// ============================================================================

// Format date as YYYY-MM-DD using UTC (intentional for server-side jobs)
function formatDateOnly(d) {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function thirtyDaysAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return formatDateOnly(d);
}

function ninetyDaysAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return formatDateOnly(d);
}

// ============================================================================
// CORS helpers
// ============================================================================

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function corsResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  });
}

// ============================================================================
// Worker entry point
// ============================================================================

// Inngest serve handler
const inngestHandler = serve({
  client: inngest,
  functions: [dailySynthesisDispatcher, synthesizeSingleUser, dcoDispatcher, generateSingleUserDco],
  servePath: '/',
});

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Custom API endpoint: manually trigger space suggestions for a user
    if (url.pathname === '/api/generate-space-suggestions' && request.method === 'POST') {
      try {
        const body = await request.json();
        const userId = body.user_id;

        if (!userId) {
          return corsResponse({ error: 'user_id is required' }, 400);
        }

        console.log(`[API] Manual space suggestions trigger for user: ${userId}`);

        // Call the space suggestions function directly
        const result = await generateSpaceSuggestions(userId, env);

        // Fetch pending suggestions for debug visibility
        const debugHeaders = {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        };
        const pendingRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/space_suggestions?user_id=eq.${userId}&status=eq.pending&select=*`,
          { headers: debugHeaders },
        );
        const pending = await pendingRes.json();

        return corsResponse({ success: true, ...result, pending_suggestions: pending });
      } catch (err) {
        console.error('[API] Error generating space suggestions:', err);
        return corsResponse({ error: err.message || 'Internal error' }, 500);
      }
    }

    // Custom API endpoint: force-generate DCO for one or all users (bypasses Inngest)
    if (url.pathname === '/api/force-generate-dco' && request.method === 'POST') {
      try {
        const body = await request.json().catch(() => ({}));
        const requestedUserId = body.user_id || null;

        const supaHeaders = {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
        };

        let users = [];

        if (requestedUserId) {
          // Single user — look up their timezone
          const tzRes = await fetch(
            `${env.SUPABASE_URL}/rest/v1/notification_preferences?user_id=eq.${requestedUserId}&select=user_id,timezone`,
            { headers: supaHeaders },
          );
          const tzRows = tzRes.ok ? await tzRes.json() : [];
          if (tzRows.length === 0) {
            return corsResponse(
              { error: `No notification_preferences row for user ${requestedUserId}` },
              404,
            );
          }
          users = [
            { user_id: tzRows[0].user_id, timezone: tzRows[0].timezone || 'America/New_York' },
          ];
        } else {
          // All users with a timezone
          const allRes = await fetch(
            `${env.SUPABASE_URL}/rest/v1/notification_preferences?timezone=not.is.null&select=user_id,timezone`,
            { headers: supaHeaders },
          );
          if (!allRes.ok) {
            return corsResponse(
              { error: 'Failed to fetch users from notification_preferences' },
              500,
            );
          }
          users = await allRes.json();
        }

        console.log(`[API] force-generate-dco: processing ${users.length} user(s)`);

        const results = [];

        for (const u of users) {
          try {
            // Run the full DCO pipeline directly (no Inngest)
            const inputData = await fetchDcoInputData(u.user_id, u.timezone, env);
            const extraction = await runDcoExtraction(inputData, env);
            const analysis = await runDcoAnalysis(extraction, inputData, env);

            // Upsert into user_daily_state (same pattern as store-dco step)
            const now = new Date();
            const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
            const todayLocal = getUserLocalDate(u.timezone);

            const upsertRes = await fetch(
              `${env.SUPABASE_URL}/rest/v1/user_daily_state?on_conflict=user_id,date`,
              {
                method: 'POST',
                headers: { ...supaHeaders, Prefer: 'resolution=merge-duplicates' },
                body: JSON.stringify({
                  user_id: u.user_id,
                  date: todayLocal,
                  dco: analysis,
                  extraction_raw: extraction,
                  created_at: now.toISOString(),
                  updated_at: now.toISOString(),
                  expires_at: expiresAt.toISOString(),
                }),
              },
            );

            if (!upsertRes.ok) {
              throw new Error(`Upsert failed: ${upsertRes.statusText}`);
            }

            console.log(`[API] DCO generated for ${u.user_id} (${todayLocal})`);
            results.push({
              user_id: u.user_id,
              timezone: u.timezone,
              date: todayLocal,
              success: true,
              headline: analysis.brief_headline || null,
              life_moment: analysis.life_moment || null,
            });
          } catch (userErr) {
            console.error(`[API] DCO failed for ${u.user_id}:`, userErr);
            results.push({
              user_id: u.user_id,
              timezone: u.timezone,
              date: null,
              success: false,
              headline: null,
              life_moment: null,
              error: userErr.message || String(userErr),
            });
          }
        }

        const succeeded = results.filter((r) => r.success).length;
        const failed = results.filter((r) => !r.success).length;

        return corsResponse({
          success: true,
          total: results.length,
          succeeded,
          failed,
          results,
        });
      } catch (err) {
        console.error('[API] Error in force-generate-dco:', err);
        return corsResponse({ error: err.message || 'Internal error' }, 500);
      }
    }

    // Pass through to Inngest handler for all other routes
    return inngestHandler(request, env, ctx);
  },
};
