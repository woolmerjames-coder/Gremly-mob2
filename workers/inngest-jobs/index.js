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

// Main synthesis function
const synthesizeUserProfiles = inngest.createFunction(
  {
    id: 'synthesize-user-profiles',
    name: 'Synthesize User Profiles',
  },
  [
    { cron: '0 4 * * *' }, // 4 AM UTC daily
    { event: 'app/profiles.sync' }, // Manual trigger
  ],
  async ({ step, env }) => {
    // Step 1: Get active users who need synthesis (new activity since last profile)
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

    console.log(`[SynthesizeProfiles] Found ${activeUsers.length} active users`);

    // Step 2: Process each user - profile synthesis
    let profilesSucceeded = 0;
    let profilesFailed = 0;

    for (const user of activeUsers) {
      const result = await step.run(`synthesize-${user.user_id.slice(0, 8)}`, async () => {
        return synthesizeUserProfile(user.user_id, env);
      });

      if (result.success) profilesSucceeded++;
      else profilesFailed++;
    }

    console.log(`[SynthesizeProfiles] Complete: ${profilesSucceeded} succeeded, ${profilesFailed} failed`);

    // Step 3: Generate space suggestions for each user
    let suggestionsSucceeded = 0;
    let suggestionsFailed = 0;

    for (const user of activeUsers) {
      const result = await step.run(`suggestions-${user.user_id.slice(0, 8)}`, async () => {
        return generateSpaceSuggestions(user.user_id, env);
      });

      if (result.success) suggestionsSucceeded++;
      else suggestionsFailed++;
    }

    console.log(`[SpaceSuggestions] Complete: ${suggestionsSucceeded} succeeded, ${suggestionsFailed} failed`);

    return {
      processed: activeUsers.length,
      profiles: { succeeded: profilesSucceeded, failed: profilesFailed },
      suggestions: { succeeded: suggestionsSucceeded, failed: suggestionsFailed },
    };
  },
);

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
  });

  if (!response.ok) {
    throw new Error(`OpenAI error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
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
  });

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
    console.log(`[SpaceSuggestions] Starting for user: ${userId.slice(0, 8)}`);

    // Step 1: Check if user has enable_space_suggestions = true
    const userProfileResponse = await fetch(
      `${env.SUPABASE_URL}/rest/v1/user_profiles?user_id=eq.${userId}&select=enable_space_suggestions`,
      { headers },
    );
    const userProfiles = await userProfileResponse.json();
    const enableSuggestions = userProfiles[0]?.enable_space_suggestions ?? true;

    if (!enableSuggestions) {
      console.log(`[SpaceSuggestions] User ${userId.slice(0, 8)} has suggestions disabled, skipping`);
      return { success: true, skipped: true, reason: 'user_disabled' };
    }

    // Step 2: Fetch spaces (with disable_suggestions = false)
    const spacesResponse = await fetch(
      `${env.SUPABASE_URL}/rest/v1/spaces?owner_id=eq.${userId}&archived_at=is.null&disable_suggestions=eq.false&select=id,name,goal,description`,
      { headers },
    );
    const spaces = await spacesResponse.json();

    // Step 3: Fetch unassigned entities from last 14 days
    const fourteenDaysAgo = formatDateOnly(new Date(Date.now() - 14 * 24 * 60 * 60 * 1000));

    const [unassignedTodos, unassignedNotes, unassignedHabits] = await Promise.all([
      fetch(
        `${env.SUPABASE_URL}/rest/v1/todos?owner_id=eq.${userId}&space_id=is.null&archived=eq.false&created_at=gte.${fourteenDaysAgo}&select=id,title,body,tags,created_at&limit=50`,
        { headers },
      ).then((r) => r.json()),
      fetch(
        `${env.SUPABASE_URL}/rest/v1/notes?owner_id=eq.${userId}&space_id=is.null&archived=eq.false&created_at=gte.${fourteenDaysAgo}&select=id,title,body,tags,subtype,created_at&limit=50`,
        { headers },
      ).then((r) => r.json()),
      fetch(
        `${env.SUPABASE_URL}/rest/v1/habits?owner_id=eq.${userId}&space_id=is.null&archived=eq.false&created_at=gte.${fourteenDaysAgo}&select=id,name,tags,created_at&limit=20`,
        { headers },
      ).then((r) => r.json()),
    ]);

    // Combine and format unassigned entities
    const unassignedEntities = [
      ...unassignedTodos.map((t) => ({ id: t.id, type: 'todo', title: t.title, body: t.body, tags: t.tags, created_at: t.created_at })),
      ...unassignedNotes.map((n) => ({ id: n.id, type: 'note', title: n.title, body: n.body, tags: n.tags, subtype: n.subtype, created_at: n.created_at })),
      ...unassignedHabits.map((h) => ({ id: h.id, type: 'habit', title: h.name, tags: h.tags, created_at: h.created_at })),
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 100);

    console.log(`[SpaceSuggestions] Found ${spaces.length} spaces, ${unassignedEntities.length} unassigned entities`);

    // Step 4: Check skip conditions
    if (unassignedEntities.length < 5) {
      console.log(`[SpaceSuggestions] User ${userId.slice(0, 8)} has fewer than 5 unassigned entities, skipping`);
      return { success: true, skipped: true, reason: 'too_few_entities' };
    }

    if (spaces.length === 0 && unassignedEntities.length < 10) {
      console.log(`[SpaceSuggestions] User ${userId.slice(0, 8)} has no spaces and fewer than 10 entities, skipping`);
      return { success: true, skipped: true, reason: 'no_spaces_few_entities' };
    }

    // Step 5: Call AI to generate suggestions
    const aiSuggestions = await callAIForSpaceSuggestions(spaces, unassignedEntities, env.OPENAI_API_KEY);

    console.log(`[SpaceSuggestions] AI returned ${aiSuggestions.assign_to_existing?.length || 0} assign suggestions, ${aiSuggestions.suggest_new_spaces?.length || 0} new space suggestions`);

    // Step 6: Validate suggestions
    const validSpaceIds = new Set(spaces.map((s) => s.id));
    const validDropIds = new Set(unassignedEntities.map((e) => e.id));

    const validAssignSuggestions = (aiSuggestions.assign_to_existing || []).filter((s) => {
      if (!validSpaceIds.has(s.space_id)) return false;
      s.drop_ids = (s.drop_ids || []).filter((id) => validDropIds.has(id));
      return s.drop_ids.length > 0;
    });

    const validNewSpaceSuggestions = (aiSuggestions.suggest_new_spaces || []).filter((s) => {
      if (!s.suggested_name || s.suggested_name.length < 2) return false;
      s.drop_ids = (s.drop_ids || []).filter((id) => validDropIds.has(id));
      return s.drop_ids.length >= 3; // Need at least 3 items for a new space suggestion
    });

    // Step 7: Expire old pending suggestions
    await fetch(
      `${env.SUPABASE_URL}/rest/v1/space_suggestions?user_id=eq.${userId}&status=eq.pending`,
      {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'expired', updated_at: new Date().toISOString() }),
      },
    );

    // Step 8: Insert new suggestions
    const suggestionsToInsert = [];

    for (const s of validAssignSuggestions) {
      suggestionsToInsert.push({
        user_id: userId,
        suggestion_type: 'assign_to_space',
        space_id: s.space_id,
        suggested_name: null,
        reason: s.reason || null,
        drop_ids: s.drop_ids,
        confidence: 0.8,
        status: 'pending',
      });
    }

    for (const s of validNewSpaceSuggestions) {
      suggestionsToInsert.push({
        user_id: userId,
        suggestion_type: 'new_space',
        space_id: null,
        suggested_name: s.suggested_name,
        reason: s.reason || null,
        drop_ids: s.drop_ids,
        confidence: 0.8,
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
        throw new Error(`Failed to insert suggestions: ${insertResponse.statusText}`);
      }
    }

    console.log(`[SpaceSuggestions] Saved ${suggestionsToInsert.length} suggestions to database`);
    console.log(`[SpaceSuggestions] Complete for user: ${userId.slice(0, 8)}`);

    return {
      success: true,
      suggestions_created: {
        assign_to_existing: validAssignSuggestions.length,
        new_spaces: validNewSpaceSuggestions.length,
      },
    };
  } catch (error) {
    console.error(`[SpaceSuggestions] Error for user ${userId.slice(0, 8)}:`, error);
    return { success: false, error: String(error) };
  }
}

// ============================================================================
// AI call for space suggestions
// ============================================================================

async function callAIForSpaceSuggestions(spaces, unassignedEntities, apiKey) {
  const spacesText = spaces.length > 0
    ? spaces.map((s) => `- ${s.name}${s.goal ? ` (Goal: ${s.goal})` : ''}${s.description ? ` - ${s.description}` : ''}`).join('\n')
    : '(No existing spaces)';

  const entitiesText = unassignedEntities
    .map((e) => `- [${e.type}] ${e.id}: "${e.title}"${e.tags?.length ? ` (tags: ${e.tags.join(', ')})` : ''}${e.subtype ? ` [${e.subtype}]` : ''}`)
    .join('\n');

  const systemPrompt = `You analyze a user's captured items and suggest Space organization.
Be conservative - only suggest high-confidence matches.`;

  const userPrompt = `EXISTING SPACES:
${spacesText}

UNASSIGNED ITEMS (last 14 days):
${entitiesText}

TASKS:

1. ASSIGN TO EXISTING SPACES:
For each Space, identify unassigned items that CLEARLY belong there.
Only include items where you're >80% confident.

2. SUGGEST NEW SPACES:
If 5+ unassigned items share a clear theme NOT covered by existing Spaces,
suggest creating a new Space.
- Suggest a short, clear name (2-4 words)
- Don't suggest Spaces that would overlap with existing ones
- Maximum 2 new Space suggestions

OUTPUT FORMAT (JSON only, no explanation):
{
  "assign_to_existing": [
    {
      "space_id": "uuid",
      "drop_ids": ["uuid", "uuid"],
      "reason": "These relate to your TRR Report deadline"
    }
  ],
  "suggest_new_spaces": [
    {
      "suggested_name": "Health & Fitness",
      "drop_ids": ["uuid", "uuid", "uuid"],
      "reason": "12 items about running, gym, and diet"
    }
  ]
}

If no suggestions, return: { "assign_to_existing": [], "suggest_new_spaces": [] }`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 1000,
      temperature: 0.3, // Lower temp for structured output
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI error: ${response.statusText}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content?.trim() || '';

  try {
    // Parse JSON, handling markdown code fences
    let jsonStr = content;
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    }
    return JSON.parse(jsonStr);
  } catch (e) {
    console.warn('[SpaceSuggestions] Failed to parse AI response:', content);
    return { assign_to_existing: [], suggest_new_spaces: [] };
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
// Worker entry point
// ============================================================================

export default {
  fetch: serve({
    client: inngest,
    functions: [synthesizeUserProfiles],
    servePath: '/',
  }),
};
