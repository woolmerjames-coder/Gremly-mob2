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

    // Step 2: Process each user
    let succeeded = 0;
    let failed = 0;

    for (const user of activeUsers) {
      const result = await step.run(`synthesize-${user.user_id.slice(0, 8)}`, async () => {
        return synthesizeUserProfile(user.user_id, env);
      });

      if (result.success) succeeded++;
      else failed++;
    }

    console.log(`[SynthesizeProfiles] Complete: ${succeeded} succeeded, ${failed} failed`);

    return { processed: activeUsers.length, succeeded, failed };
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

  const prompt = `Analyze this user's productivity data and write a brief profile (~100-150 words).

DATA:
- Todos: ${input.todoCount} total, ${input.completedCount} completed or archived (90 days)
- Habits (30 days): ${habitSummary}
- Mood patterns: ${moodSummary}
- Life areas: ${input.spaces.join(', ') || 'None defined'}

RULES:
- Never sound judgmental
- Use neutral framing ("often gets rescheduled" not "avoids")
- Focus on patterns, not character
- Be specific — use their data
- ~100-150 words, no headers

Output ONLY the profile text.`;

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
