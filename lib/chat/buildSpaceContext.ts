/**
 * Builds context object for Space-aware AI conversations
 *
 * Provides Gremly with awareness of:
 * - Space goal/milestone
 * - User's "why" (from space_meta)
 * - Current habits, open tasks, saved guides
 */

export interface SpaceContext {
  spaceName: string;
  milestone?: {
    name: string;
    targetDate: string;
    daysRemaining: number;
    isPast: boolean;
  };
  meta?: {
    why?: string;
    notes?: string;
  };
  todos: Array<{ title: string; completed: boolean; due_date?: string | null }>;
  habits: Array<{ name: string; frequency: string; completionSummary?: string }>;
  guides: Array<{ title: string }>;
  summary: {
    todoCount: number;
    completedTodoCount: number;
    habitCount: number;
    noteCount: number;
  };
}

export function buildSpaceContext(params: {
  space: { id: string; name: string } | null;
  milestone: { name: string; target_date: string; status: string } | null;
  meta: { why?: string; notes?: string } | null;
  countdown: { days: number; isPast: boolean } | null;
  todos: Array<{
    name?: string;
    title?: string;
    completed_at: string | null;
    due_date?: string | null;
  }>;
  habits: Array<{ name: string; frequency?: string; completionSummary?: string }>;
  notes: Array<{ name?: string; title?: string }>;
}): SpaceContext | null {
  const { space, milestone, meta, countdown, todos, habits, notes } = params;

  if (!space) return null;

  const completedTodos = todos.filter((t) => !!t.completed_at);

  return {
    spaceName: space.name,
    milestone: milestone
      ? {
          name: milestone.name,
          targetDate: milestone.target_date,
          daysRemaining: countdown?.days ?? 0,
          isPast: countdown?.isPast ?? false,
        }
      : undefined,
    meta: meta
      ? {
          why: meta.why || undefined,
          notes: meta.notes || undefined,
        }
      : undefined,
    todos: todos.map((t) => ({
      title: t.name || t.title || 'Untitled',
      completed: !!t.completed_at,
      due_date: t.due_date ?? undefined,
    })),
    habits: habits.map((h) => ({
      name: h.name,
      frequency: h.frequency || 'daily',
      completionSummary: h.completionSummary,
    })),
    guides: notes.map((n) => ({
      title: n.name || n.title || 'Untitled',
    })),
    summary: {
      todoCount: todos.length,
      completedTodoCount: completedTodos.length,
      habitCount: habits.length,
      noteCount: notes.length,
    },
  };
}

export function formatSpaceContextForPrompt(context: SpaceContext): string {
  const lines: string[] = [];

  lines.push(`Space: ${context.spaceName}`);

  if (context.milestone) {
    const { name, daysRemaining, isPast } = context.milestone;
    if (isPast) {
      lines.push(`Goal: "${name}" (${Math.abs(daysRemaining)} days past target)`);
    } else if (daysRemaining === 0) {
      lines.push(`Goal: "${name}" (target is today)`);
    } else {
      lines.push(`Goal: "${name}" (${daysRemaining} days remaining)`);
    }
  }

  if (context.meta?.why) {
    lines.push(`Why: ${context.meta.why}`);
  }

  // Current habits
  if (context.habits.length > 0) {
    lines.push('');
    lines.push('Current habits:');
    context.habits.slice(0, 5).forEach((h) => {
      const summary = h.completionSummary ? `, ${h.completionSummary}` : '';
      lines.push(`- ${h.name} (${h.frequency}${summary})`);
    });
  }

  // Open tasks (incomplete only, max 5)
  const openTodos = context.todos.filter((t) => !t.completed);
  if (openTodos.length > 0) {
    lines.push('');
    lines.push('Open tasks:');
    openTodos.slice(0, 5).forEach((t) => {
      lines.push(`- ${t.title}`);
    });
    if (openTodos.length > 5) {
      lines.push(`  (+${openTodos.length - 5} more)`);
    }
  }

  // Saved guides (max 5)
  if (context.guides.length > 0) {
    lines.push('');
    lines.push('Saved guides:');
    context.guides.slice(0, 5).forEach((g) => {
      lines.push(`- ${g.title}`);
    });
    if (context.guides.length > 5) {
      lines.push(`  (+${context.guides.length - 5} more)`);
    }
  }

  return lines.join('\n');
}
