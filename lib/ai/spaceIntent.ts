import type { AppRecord, SpaceChat } from '../types';

export type SpaceIntent = 'habit' | 'trip' | 'goal' | 'other';

type Input = {
  habits: AppRecord[];
  todos: AppRecord[];
  notes: AppRecord[];
  chats: SpaceChat[];
};

const travelKeywords = [
  'flight',
  'hotel',
  'itinerary',
  'packing',
  'pack',
  'trip',
  'travel',
  'airport',
  'train',
  'stay',
  'airbnb',
  'check-in',
  'check in',
  'boarding',
];

const goalKeywords = ['goal', 'milestone', 'plan', 'roadmap', 'okr', 'objective', 'target'];

function textOf(rec: AppRecord): string {
  if (rec.type === 'todo') return (rec as any).name || (rec as any).title || '';
  if (rec.type === 'habit') return (rec as any).name || (rec as any).title || '';
  const n = rec as any;
  return n.title || (n.body || '').slice(0, 120);
}

function includesAny(text: string, words: string[]): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return words.some((w) => lower.includes(w));
}

function withinDays(iso: string | null | undefined, days: number): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  const now = Date.now();
  const horizon = now + days * 24 * 60 * 60 * 1000;
  return t >= now && t <= horizon;
}

/**
 * inferSpaceIntent - very simple heuristics to bias the space vibe.
 * - habit: has habits, dominates content
 * - trip: travel-ish words and/or many dated items soon
 * - goal: planning/goal words or many open todos
 * - other: fallback when no clear signal
 */
export function inferSpaceIntent({ habits, todos, notes }: Input): SpaceIntent {
  const habitScore = (habits?.length || 0) * 2;

  // Trip scoring: travel words + near-term dated todos/notes
  const travelWordHits =
    (todos || []).reduce((acc, t) => acc + (includesAny(textOf(t), travelKeywords) ? 1 : 0), 0) +
    (notes || []).reduce((acc, n) => acc + (includesAny(textOf(n), travelKeywords) ? 1 : 0), 0);
  const soonDatedTodos = (todos || []).reduce(
    (acc, t: any) => acc + (withinDays(t.due_date, 30) ? 1 : 0),
    0,
  );
  const tripScore = travelWordHits * 2 + soonDatedTodos;

  // Goal scoring: goal-ish words + quantity of open todos
  const goalWordHits =
    (todos || []).reduce((acc, t) => acc + (includesAny(textOf(t), goalKeywords) ? 1 : 0), 0) +
    (notes || []).reduce((acc, n) => acc + (includesAny(textOf(n), goalKeywords) ? 1 : 0), 0);
  const openTodos = (todos || []).filter((t: any) => !t.completed_at).length;
  const goalScore = goalWordHits * 2 + (openTodos > 5 ? 2 : openTodos > 2 ? 1 : 0);

  const max = Math.max(habitScore, tripScore, goalScore);
  if (max === 0) return 'other';
  if (max === habitScore) return 'habit';
  if (max === tripScore) return 'trip';
  if (max === goalScore) return 'goal';
  return 'other';
}

export default inferSpaceIntent;
