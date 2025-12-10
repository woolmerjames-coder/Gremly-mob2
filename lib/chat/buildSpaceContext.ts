/**
 * Builds context object for Space-aware AI conversations
 *
 * Provides Gremly with awareness of:
 * - Space goal/milestone
 * - User's "why" (from space_meta)
 * - Items in the Space
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
  todos: Array<{ completed_at: string | null }>;
  habits: Array<any>;
  notes: Array<any>;
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

  lines.push(`## Space: ${context.spaceName}`);

  if (context.milestone) {
    const { name, targetDate, daysRemaining, isPast } = context.milestone;
    if (isPast) {
      lines.push(`Goal: "${name}" (target was ${targetDate}, ${Math.abs(daysRemaining)} days ago)`);
    } else if (daysRemaining === 0) {
      lines.push(`Goal: "${name}" (target is TODAY!)`);
    } else {
      lines.push(`Goal: "${name}" (${daysRemaining} days remaining, target: ${targetDate})`);
    }
  }

  if (context.meta?.why) {
    lines.push(`Why this matters: ${context.meta.why}`);
  }

  if (context.meta?.notes) {
    lines.push(`Notes: ${context.meta.notes}`);
  }

  const { todoCount, completedTodoCount, habitCount, noteCount } = context.summary;
  const progress =
    todoCount > 0 ? `${completedTodoCount}/${todoCount} todos complete` : 'No todos yet';

  lines.push(`Progress: ${progress}, ${habitCount} habits, ${noteCount} notes/guides`);

  return lines.join('\n');
}
