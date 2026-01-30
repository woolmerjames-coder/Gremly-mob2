import { inngest } from '../client';

// This function runs nightly to synthesize user profiles
export const synthesizeUserProfiles = inngest.createFunction(
  {
    id: 'synthesize-user-profiles',
    name: 'Synthesize User Profiles',
  },
  { cron: '0 4 * * *' }, // Run at 4 AM UTC daily
  async ({ step }) => {
    // Step 1: Get active users (activity in last 7 days)
    const activeUsers = await step.run('get-active-users', async () => {
      const supabaseUrl = process.env.SUPABASE_URL!;
      const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;

      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      // Get users who created todos, notes, or habits in last 7 days
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/get_active_users`, {
        method: 'POST',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ since: weekAgo.toISOString() }),
      });

      if (!response.ok) {
        throw new Error(`Failed to get active users: ${response.statusText}`);
      }

      return response.json() as Promise<{ user_id: string }[]>;
    });

    console.log(`[SynthesizeProfiles] Found ${activeUsers.length} active users`);

    // Step 2: Process each user (Inngest handles batching/retries)
    const results = await Promise.all(
      activeUsers.map((user) =>
        step.run(`synthesize-${user.user_id.slice(0, 8)}`, async () => {
          return synthesizeUserProfile(user.user_id);
        }),
      ),
    );

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    console.log(`[SynthesizeProfiles] Complete: ${succeeded} succeeded, ${failed} failed`);

    return { processed: activeUsers.length, succeeded, failed };
  },
);

// Helper: Synthesize a single user's profile
async function synthesizeUserProfile(
  userId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabaseUrl = process.env.SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;
  const openaiKey = process.env.OPENAI_API_KEY!;

  const headers = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
  };

  try {
    // Query user's 30-day history
    const [todos, habits, habitProgress, notes, spaces, gremlyAge] = await Promise.all([
      // Todos (last 90 days for struggle patterns)
      fetch(
        `${supabaseUrl}/rest/v1/todos?owner_id=eq.${userId}&created_at=gte.${ninetyDaysAgo()}&select=title,completed_at,sweep_reschedule_count,archived,due_day&limit=200`,
        { headers },
      ).then((r) => r.json()),

      // Habits
      fetch(
        `${supabaseUrl}/rest/v1/habits?owner_id=eq.${userId}&archived=eq.false&select=id,name,frequency,subtype,created_at&limit=20`,
        { headers },
      ).then((r) => r.json()),

      // Habit progress (last 30 days)
      fetch(
        `${supabaseUrl}/rest/v1/habit_progress?owner_id=eq.${userId}&occurred_day=gte.${thirtyDaysAgo()}&select=habit_id,occurred_day`,
        { headers },
      ).then((r) => r.json()),

      // Notes/journals (last 30 days)
      fetch(
        `${supabaseUrl}/rest/v1/notes?owner_id=eq.${userId}&created_at=gte.${thirtyDaysAgo()}&select=title,subtype,mood,created_at&limit=50`,
        { headers },
      ).then((r) => r.json()),

      // Spaces
      fetch(
        `${supabaseUrl}/rest/v1/spaces?owner_id=eq.${userId}&archived_at=is.null&select=name,created_at&limit=10`,
        { headers },
      ).then((r) => r.json()),

      // Gremly age (from wherever you store it)
      fetch(`${supabaseUrl}/rest/v1/user_settings?user_id=eq.${userId}&select=gremly_age`, {
        headers,
      })
        .then((r) => r.json())
        .then((data) => data[0]?.gremly_age ?? 0),
    ]);

    // Calculate habit completion rates
    const habitCompletionMap: Record<string, number> = {};
    for (const hp of habitProgress) {
      habitCompletionMap[hp.habit_id] = (habitCompletionMap[hp.habit_id] || 0) + 1;
    }

    const habitsWithCompletion = habits.map((h: any) => ({
      name: h.name,
      frequency: h.frequency,
      subtype: h.subtype,
      completionsLast30Days: habitCompletionMap[h.id] || 0,
    }));

    // Find struggle patterns (todos rescheduled 3+ times)
    const struggles = todos
      .filter((t: any) => (t.sweep_reschedule_count || 0) >= 3 && !t.completed_at)
      .map((t: any) => t.title);

    // Extract mood patterns from journals
    const moodCounts: Record<string, number> = {};
    for (const note of notes) {
      if (note.mood && Array.isArray(note.mood)) {
        for (const m of note.mood) {
          moodCounts[m] = (moodCounts[m] || 0) + 1;
        }
      }
    }

    // Build synthesis input
    const synthesisInput = {
      todoCount: todos.length,
      completedCount: todos.filter((t: any) => t.completed_at).length,
      struggles: struggles.slice(0, 10),
      habits: habitsWithCompletion,
      moodPatterns: moodCounts,
      spaces: spaces.map((s: any) => s.name),
      gremlyAge,
    };

    // Call LLM for synthesis
    const profileText = await synthesizeWithLLM(synthesisInput, openaiKey);

    // Store in user_profiles table
    const upsertResponse = await fetch(`${supabaseUrl}/rest/v1/user_profiles`, {
      method: 'POST',
      headers: {
        ...headers,
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        user_id: userId,
        profile_text: profileText,
        signals: synthesisInput,
        generated_at: new Date().toISOString(),
        model_used: 'gpt-4o-mini',
      }),
    });

    if (!upsertResponse.ok) {
      throw new Error(`Failed to store profile: ${upsertResponse.statusText}`);
    }

    return { success: true };
  } catch (error) {
    console.error(`[SynthesizeProfiles] Error for user ${userId.slice(0, 8)}:`, error);
    return { success: false, error: String(error) };
  }
}

// LLM synthesis
async function synthesizeWithLLM(input: any, apiKey: string): Promise<string> {
  const prompt = `You are analyzing a user's productivity data to build a brief profile that helps an AI assistant understand them better.

DATA:
- Todos: ${input.todoCount} total, ${input.completedCount} completed
- Frequently rescheduled items: ${input.struggles.length > 0 ? input.struggles.join(', ') : 'None'}
- Habits: ${input.habits.map((h: any) => `"${h.name}" (${h.completionsLast30Days}/30 days)`).join(', ') || 'None'}
- Mood patterns: ${
    Object.entries(input.moodPatterns)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ') || 'No journal entries'
  }
- Life areas (Spaces): ${input.spaces.join(', ') || 'None yet'}
- Gremly age: ${input.gremlyAge} days

Write a brief profile (~100-150 words) covering:
1. Productivity patterns (how they work)
2. Areas where extra support helps (based on rescheduled items)
3. Habits that are working vs need support
4. Life context (what matters to them based on Spaces)

TONE RULES:
- Never sound judgmental
- Use neutral framing ("phone calls often get rescheduled" not "avoids phone calls")
- Focus on patterns, not character assessments
- Be specific — use their actual data

Output ONLY the profile text, no headers or preamble.`;

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

// Helpers
// Note: For server-side background jobs, we use UTC dates for consistency
// since the job runs at 4 AM UTC regardless of user timezone
function formatDateOnly(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function thirtyDaysAgo(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return formatDateOnly(d);
}

function ninetyDaysAgo(): string {
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return formatDateOnly(d);
}
