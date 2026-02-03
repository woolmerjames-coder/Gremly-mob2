/**
 * Fetches content saved to a specific space
 * Returns notes (full), todos (title + status), habits (name + progress)
 * Uses KV caching (5 min TTL)
 */

/**
 * Helper: format date as YYYY-MM-DD without timezone issues
 * @param {Date} date
 * @returns {string}
 */
function formatDateOnly(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Helper: date 30 days ago
 * @returns {string}
 */
function thirtyDaysAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return formatDateOnly(d);
}

/**
 * Helper: expected completions by frequency
 * @param {string} frequency
 * @returns {number}
 */
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
    case 'monthly':
      return 1;
    default:
      return 30;
  }
}

/**
 * Fetches content saved to a specific space
 * @param {string} spaceId
 * @param {string} userId
 * @param {object} env - Cloudflare worker env with SUPABASE_URL, SUPABASE_SERVICE_KEY, CONTEXT_CACHE
 * @returns {Promise<object|null>}
 */
export async function getSpaceContent(spaceId, userId, env) {
  if (!spaceId || !userId) {
    console.log('[SpaceContent] Missing spaceId or userId');
    return null;
  }

  try {
    // Check KV cache first
    const cacheKey = `space-content:${spaceId}`;
    if (env.CONTEXT_CACHE) {
      const cached = await env.CONTEXT_CACHE.get(cacheKey);
      if (cached) {
        console.log(`[SpaceContent] Cache hit for space ${spaceId.slice(0, 8)}`);
        return JSON.parse(cached);
      }
    }

    const headers = {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    };

    const thirtyDaysAgoStr = thirtyDaysAgo();

    // Fetch notes, todos, habits in parallel
    const [notes, todos, habits, habitProgress] = await Promise.all([
      // Notes: full content (most important for reference)
      fetch(
        `${env.SUPABASE_URL}/rest/v1/notes?space_id=eq.${spaceId}&owner_id=eq.${userId}&archived=eq.false&select=id,title,body,subtype,created_at&order=created_at.desc&limit=20`,
        { headers },
      )
        .then((r) => r.json())
        .catch(() => []),

      // Todos: title + status
      fetch(
        `${env.SUPABASE_URL}/rest/v1/todos?space_id=eq.${spaceId}&owner_id=eq.${userId}&archived=eq.false&select=id,title,completed_at,scheduled_date,due_date&order=created_at.desc&limit=20`,
        { headers },
      )
        .then((r) => r.json())
        .catch(() => []),

      // Habits: name + frequency
      fetch(
        `${env.SUPABASE_URL}/rest/v1/habits?space_id=eq.${spaceId}&owner_id=eq.${userId}&archived=eq.false&select=id,name,frequency&order=created_at.desc&limit=10`,
        { headers },
      )
        .then((r) => r.json())
        .catch(() => []),

      // Habit progress (last 30 days) for completion tracking
      fetch(
        `${env.SUPABASE_URL}/rest/v1/habit_progress?owner_id=eq.${userId}&occurred_day=gte.${thirtyDaysAgoStr}&select=habit_id,occurred_day`,
        { headers },
      )
        .then((r) => r.json())
        .catch(() => []),
    ]);

    // Calculate habit completions
    const habitCompletionMap = {};
    for (const hp of habitProgress) {
      habitCompletionMap[hp.habit_id] = (habitCompletionMap[hp.habit_id] || 0) + 1;
    }

    // Build space content object
    const spaceContent = {
      notes: notes.map((n) => ({
        title: n.title,
        body: n.body || '',
        subtype: n.subtype,
      })),
      todos: todos.map((t) => ({
        title: t.title,
        done: !!t.completed_at,
        scheduledDate: t.scheduled_date || t.due_date || null,
      })),
      habits: habits.map((h) => ({
        name: h.name,
        frequency: h.frequency,
        completionsLast30Days: habitCompletionMap[h.id] || 0,
      })),
      counts: {
        notes: notes.length,
        todos: todos.length,
        habits: habits.length,
      },
    };

    console.log(`[SpaceContent] Loaded for space ${spaceId.slice(0, 8)}:`, spaceContent.counts);

    // Cache for 5 minutes
    if (env.CONTEXT_CACHE) {
      await env.CONTEXT_CACHE.put(cacheKey, JSON.stringify(spaceContent), { expirationTtl: 300 });
    }

    return spaceContent;
  } catch (error) {
    console.error('[SpaceContent] Error:', error);
    return null;
  }
}

/**
 * Builds a string representation of space content for injection into prompts
 * @param {object} spaceContent
 * @param {string} spaceName
 * @returns {string}
 */
export function buildSpaceContentString(spaceContent, spaceName) {
  if (!spaceContent) return '';

  const parts = [];

  parts.push(`=== CONTENT IN "${spaceName || 'This Space'}" ===`);

  // Notes (most important - include full content)
  if (spaceContent.notes.length > 0) {
    parts.push('\nSAVED NOTES:');
    for (const note of spaceContent.notes) {
      const typeLabel =
        note.subtype === 'journal' ? '[Journal]' : note.subtype === 'idea' ? '[Idea]' : '[Note]';
      parts.push(`${typeLabel} "${note.title}"`);
      if (note.body && note.body.trim()) {
        // Truncate very long notes
        const body = note.body.length > 500 ? note.body.slice(0, 500) + '...' : note.body;
        parts.push(`  ${body}`);
      }
    }
  }

  // Todos
  if (spaceContent.todos.length > 0) {
    parts.push('\nTODOS:');
    const pending = spaceContent.todos.filter((t) => !t.done);
    const done = spaceContent.todos.filter((t) => t.done);

    if (pending.length > 0) {
      parts.push(`Pending (${pending.length}):`);
      for (const todo of pending.slice(0, 10)) {
        const dateInfo = todo.scheduledDate ? ` (scheduled: ${todo.scheduledDate})` : '';
        parts.push(`  - ${todo.title}${dateInfo}`);
      }
      if (pending.length > 10) {
        parts.push(`  ... and ${pending.length - 10} more`);
      }
    }

    if (done.length > 0) {
      parts.push(
        `Recently completed (${done.length}): ${done
          .slice(0, 5)
          .map((t) => t.title)
          .join(', ')}`,
      );
    }
  }

  // Habits
  if (spaceContent.habits.length > 0) {
    parts.push('\nHABITS:');
    for (const habit of spaceContent.habits) {
      const expected = getExpectedCompletions(habit.frequency);
      parts.push(
        `  - "${habit.name}" (${habit.frequency}): ${habit.completionsLast30Days}/${expected} last 30 days`,
      );
    }
  }

  // Empty space
  if (
    spaceContent.notes.length === 0 &&
    spaceContent.todos.length === 0 &&
    spaceContent.habits.length === 0
  ) {
    parts.push('\nThis space is empty — no notes, todos, or habits saved here yet.');
  }

  return parts.join('\n');
}
