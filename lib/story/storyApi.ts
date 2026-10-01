/**
 * Data for the person's story screen, Gremly's open questions and "Not right?".
 *
 * Everything here reads the signed-in person's own rows (row level security
 * limits each query to them). Writes that change what Gremly knows go through
 * the cortex worker's not-right route, which hands them to the context
 * pipeline: the same path a correction in chat takes, so a fix or an answer
 * reaches the brief, chat, the story and Worlds straight away.
 */

import { supabase } from '../supabase/client';
import { callNotRight } from '../cortex/CortexClient';

export type StoryKind = 'milestone' | 'shift' | 'proud' | 'pattern' | 'person';
export type PatternKind = 'loves' | 'avoids' | 'often' | 'rarely' | 'rhythm';

export interface StoryItem {
  id: string;
  kind: StoryKind;
  pattern_kind: PatternKind | null;
  title: string;
  body: string;
  period_start: string | null;
  period_end: string | null;
  private: boolean;
}

export interface StoryHeader {
  storyForThem: string | null;
  writtenAt: string | null;
}

export interface Story {
  header: StoryHeader;
  items: StoryItem[];
}

export interface UsagePeriod {
  period_start: string;
  active_days: number;
  drops: number;
  chat_messages: number;
  todos_done: number;
  habit_checkins: number;
  journals: number;
  sweeps: number;
  age_ups?: number;
  world_visits?: number;
  app_opens?: number;
}

export type UsageGrain = 'week' | 'month' | 'year';

export interface GremlyQuestion {
  id: string;
  question: string;
  created_at: string;
}

export async function fetchStory(): Promise<Story> {
  const [{ data: mapRows, error: mapError }, { data: items, error: itemsError }] = await Promise.all([
    supabase.from('user_life_map').select('life_map').limit(1),
    supabase
      .from('story_items')
      .select('id,kind,pattern_kind,title,body,period_start,period_end,private')
      .eq('state', 'current')
      .order('period_start', { ascending: true, nullsFirst: false })
      .limit(200),
  ]);
  if (mapError) throw mapError;
  if (itemsError) throw itemsError;
  const story = (mapRows?.[0]?.life_map as { story?: Record<string, unknown> } | null)?.story ?? null;
  return {
    header: {
      storyForThem: typeof story?.story_for_them === 'string' && story.story_for_them.trim() ? story.story_for_them : null,
      writtenAt: typeof story?.written_at === 'string' ? story.written_at : null,
    },
    items: (items ?? []) as StoryItem[],
  };
}

export async function fetchUsage(grain: UsageGrain): Promise<UsagePeriod | null> {
  const { data, error } = await supabase.rpc('my_usage_rollup', { p_grain: grain, p_periods: 1 });
  if (error) throw error;
  const periods = (data as { periods?: UsagePeriod[] } | null)?.periods;
  return periods?.[0] ?? null;
}

export async function fetchOpenQuestions(): Promise<GremlyQuestion[]> {
  const { data, error } = await supabase
    .from('gremly_questions')
    .select('id,question,created_at')
    .in('status', ['open', 'asked'])
    .order('created_at', { ascending: true })
    .limit(20);
  if (error) throw error;
  return (data ?? []) as GremlyQuestion[];
}

/** Skip: the question is dismissed and nothing about their life changes. */
export async function dismissQuestion(id: string): Promise<void> {
  const { error } = await supabase.from('gremly_questions').update({ status: 'dismissed' }).eq('id', id);
  if (error) throw error;
}

/** An answer goes through the correction pipeline, which updates the ledger and marks the question answered. */
export async function answerQuestion(id: string, answer: string): Promise<boolean> {
  const res = await callNotRight({ surface: 'question', targetId: id, said: answer });
  return res.ok;
}

export type NotRightKind = 'wrong' | 'changed' | 'done' | 'private';

export interface NotRightInput {
  /** What Gremly said that the person marked. */
  targetText: string;
  /** Where it was: story, world, chapter, chat, brief. */
  targetKind: string;
  targetId?: string | null;
  kind: NotRightKind;
  /** What is true, in their words (optional). */
  said?: string;
}

export async function sendNotRight(input: NotRightInput): Promise<boolean> {
  const res = await callNotRight({
    surface: 'not_right',
    targetText: input.targetText,
    targetKind: input.targetKind,
    targetId: input.targetId ?? null,
    kind: input.kind,
    said: input.said?.trim() || undefined,
  });
  return res.ok;
}
