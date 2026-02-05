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
      `${env.SUPABASE_URL}/rest/v1/spaces?owner_id=eq.${userId}&archived_at=is.null&select=id,name,goal,target_date,disable_suggestions`,
      { headers },
    );
    const allSpaces = await spacesResponse.json();

    // Step 3: Fetch unassigned drops (last 14 days) with views data
    const fourteenDaysAgo = formatDateOnly(new Date(Date.now() - 14 * 24 * 60 * 60 * 1000));

    const [unassignedTodos, unassignedNotes, unassignedHabits] = await Promise.all([
      fetch(
        `${env.SUPABASE_URL}/rest/v1/todos?owner_id=eq.${userId}&space_id=is.null&archived=eq.false&created_at=gte.${fourteenDaysAgo}&select=id,title,body,tags,created_at,views&limit=50`,
        { headers },
      ).then((r) => r.json()),
      fetch(
        `${env.SUPABASE_URL}/rest/v1/notes?owner_id=eq.${userId}&space_id=is.null&archived=eq.false&created_at=gte.${fourteenDaysAgo}&select=id,title,body,tags,subtype,created_at,views&limit=50`,
        { headers },
      ).then((r) => r.json()),
      fetch(
        `${env.SUPABASE_URL}/rest/v1/habits?owner_id=eq.${userId}&space_id=is.null&archived=eq.false&created_at=gte.${fourteenDaysAgo}&select=id,name,tags,created_at,views&limit=20`,
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

    console.log(`[SpaceSuggestions] Found ${allSpaces.length} spaces, ${unassignedDrops.length} unassigned drops`);

    // Step 4: Check skip conditions
    if (unassignedDrops.length < 3) {
      console.log(`[SpaceSuggestions] Fewer than 3 unassigned drops, skipping`);
      return { success: true, skipped: 'too_few_drops' };
    }

    // Step 5: Build condensed profiles for each space (where disable_suggestions = false)
    const spacesForSuggestions = allSpaces.filter((s) => !s.disable_suggestions);
    const spaceProfiles = [];

    for (const space of spacesForSuggestions) {
      const profile = await buildSpaceProfile(space, env, headers);
      spaceProfiles.push(profile);
    }

    console.log(`[SpaceSuggestions] Built profiles for ${spaceProfiles.length} spaces`);

    // Step 6: Call AI to generate suggestions
    const aiSuggestions = await callAIForSpaceSuggestions(spaceProfiles, unassignedDrops, env.OPENAI_API_KEY);

    const assignCount = aiSuggestions.assign_to_existing?.length || 0;
    const newSpaceCount = aiSuggestions.suggest_new_spaces?.length || 0;
    console.log(`[SpaceSuggestions] AI response: ${assignCount} assign suggestions, ${newSpaceCount} new space suggestions`);

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
        console.warn(`[SpaceSuggestions] Filtered ${originalCount - s.drop_ids.length} invalid drop_ids`);
      }
      return s.drop_ids.length > 0;
    });

    const validNewSpaceSuggestions = (aiSuggestions.suggest_new_spaces || []).filter((s) => {
      if (!s.suggested_name || s.suggested_name.length < 2) {
        filteredOut++;
        return false;
      }
      const originalCount = s.drop_ids?.length || 0;
      s.drop_ids = (s.drop_ids || []).filter((id) => validDropIds.has(id));
      if (s.drop_ids.length < originalCount) {
        console.warn(`[SpaceSuggestions] Filtered ${originalCount - s.drop_ids.length} invalid drop_ids`);
      }
      return s.drop_ids.length >= 3; // Need at least 3 items for a new space suggestion
    });

    const validCount = validAssignSuggestions.length + validNewSpaceSuggestions.length;
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

    for (const s of validNewSpaceSuggestions) {
      suggestionsToInsert.push({
        user_id: userId,
        suggestion_type: 'new_space',
        space_id: null,
        suggested_name: s.suggested_name,
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
        new_spaces: validNewSpaceSuggestions.length,
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
  const [todos, notes, habits] = await Promise.all([
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
  const chats = await chatsResponse.json();

  return {
    space_id: space.id,
    name: space.name,
    goal: space.goal || null,
    target_date: space.target_date || null,
    top_tags: extractTopTags(allEntities, 10),
    top_keywords: extractTopKeywords(allEntities, 10),
    people_mentioned: extractPeopleFromEntities(allEntities, 5),
    chat_themes: extractChatThemes(chats, 3),
    item_count: allEntities.length,
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
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
  'from', 'up', 'about', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where',
  'why', 'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
  'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 's', 't', 'can', 'will', 'just',
  'don', 'should', 'now', 'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'you', 'your',
  'he', 'him', 'his', 'she', 'her', 'it', 'its', 'they', 'them', 'their', 'what', 'which',
  'who', 'whom', 'this', 'that', 'these', 'those', 'am', 'is', 'are', 'was', 'were', 'be',
  'been', 'being', 'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing', 'would',
  'could', 'ought', 'i\'m', 'you\'re', 'he\'s', 'she\'s', 'it\'s', 'we\'re', 'they\'re',
  'i\'ve', 'you\'ve', 'we\'ve', 'they\'ve', 'i\'d', 'you\'d', 'he\'d', 'she\'d', 'we\'d',
  'they\'d', 'i\'ll', 'you\'ll', 'he\'ll', 'she\'ll', 'we\'ll', 'they\'ll', 'isn\'t',
  'aren\'t', 'wasn\'t', 'weren\'t', 'hasn\'t', 'haven\'t', 'hadn\'t', 'doesn\'t', 'don\'t',
  'didn\'t', 'won\'t', 'wouldn\'t', 'shan\'t', 'shouldn\'t', 'can\'t', 'cannot', 'couldn\'t',
  'mustn\'t', 'let\'s', 'that\'s', 'who\'s', 'what\'s', 'here\'s', 'there\'s', 'when\'s',
  'where\'s', 'why\'s', 'how\'s', 'need', 'get', 'make', 'go', 'come', 'take', 'see', 'know',
  'want', 'look', 'use', 'find', 'give', 'tell', 'work', 'call', 'try', 'ask', 'put', 'keep',
  'let', 'begin', 'seem', 'help', 'show', 'hear', 'play', 'run', 'move', 'live', 'believe',
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
      if (!['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
            'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
            'September', 'October', 'November', 'December', 'Today', 'Tomorrow', 'Yesterday',
            'Morning', 'Evening', 'Night', 'Week', 'Month', 'Year'].includes(name)) {
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
// AI call for space suggestions (uses gpt-4o for better reasoning)
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

  const systemPrompt = `You analyze a user's captured items and suggest how they should be organized into Spaces.
A Space is a container for a life domain or project. Each Space has a name, optional goal,
and contains related todos, notes, and habits.

Your job is to:
1. Identify which unassigned items belong in existing Spaces
2. Identify clusters of unassigned items that suggest a NEW Space should be created

Be thoughtful but not overly conservative. If an item reasonably belongs somewhere, suggest it.
The user will make the final decision.`;

  const userPrompt = `EXISTING SPACES:
${spacesText}
UNASSIGNED ITEMS:
${dropsText}

ANALYSIS CRITERIA:
To determine if an item belongs in a Space, consider (in priority order):
1. SPACE PURPOSE: Does the item relate to the Space's name and goal?
2. ENTITY OVERLAP: Does the item reference projects or topics present in the Space?
3. KEYWORD/TAG OVERLAP: Do the item's keywords or tags match the Space's common ones?
4. DOMAIN FIT: Is the item in the same general life domain as the Space?
5. PEOPLE OVERLAP: Does the item mention people associated with the Space?
   (Weight this higher if the Space itself is about specific people)

For NEW SPACE suggestions:
- Look for 5+ unassigned items that share a clear theme
- The theme should be DISTINCT from existing Spaces
- Derive the Space name from what the items are actually about (be specific, not generic)

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
  ],
  "suggest_new_spaces": [
    {
      "suggested_name": "specific name derived from items",
      "drop_ids": ["uuid", "uuid", "uuid"],
      "reason": "what theme these items share",
      "confidence": 0.82
    }
  ]
}

Order results by confidence (highest first).
If no suggestions meet criteria, return empty arrays.
Maximum 3 new Space suggestions.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o', // Better reasoning for this daily task
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 1500,
      temperature: 0.3, // Lower temp for structured output
    }),
  });

  if (!response.ok) {
    console.error(`[SpaceSuggestions] OpenAI error: ${response.statusText}`);
    return { assign_to_existing: [], suggest_new_spaces: [] };
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
    console.error('[SpaceSuggestions] Failed to parse AI response:', content);
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
