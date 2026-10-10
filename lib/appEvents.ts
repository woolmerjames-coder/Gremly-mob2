/**
 * First-party usage log (public.app_events): app opens and visits to Worlds,
 * World and Chapter screens. It powers the person's own usage stats (week,
 * month, year), which chat and their story read, and tells the pipeline when
 * someone is back after time away. Nothing here leaves Gremly's own database.
 *
 * Logging never blocks or fails the UI: errors are swallowed, and repeat
 * events for the same thing are throttled so a quick back-and-forth counts once.
 */

import { useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from './supabase/client';
import { getDateService } from './date/DateService';

export type AppEventKind =
  | 'app_open'
  | 'world_view'
  | 'chapter_view'
  | 'story_view'
  // One per Mind Drop: how long it took to sort, save and settle, with no words
  // (Mind Drop rethink stage 4; stage 12 compares it with the baseline)
  | 'drop_timing'
  // One per split answered: what the classifier said (clear or unsure) and what
  // the person tapped (split, keep as one, not now), with no words (stage 7)
  | 'split_answer';

// How long the same event for the same thing counts once (0: every one counts).
const THROTTLE_MS: Record<AppEventKind, number> = {
  app_open: 30 * 60 * 1000,
  world_view: 10 * 60 * 1000,
  chapter_view: 10 * 60 * 1000,
  story_view: 10 * 60 * 1000,
  drop_timing: 0,
  split_answer: 0,
};

const lastLogged = new Map<string, number>();

export async function logAppEvent(
  kind: AppEventKind,
  target?: { type: string; id?: string | null },
  meta?: Record<string, unknown>,
): Promise<void> {
  try {
    const now = getDateService().now().getTime();
    const key = `${kind}:${target?.type ?? ''}:${target?.id ?? ''}`;
    const last = lastLogged.get(key);
    if (last != null && now - last < THROTTLE_MS[kind]) return;
    if (THROTTLE_MS[kind] > 0) lastLogged.set(key, now);

    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user?.id;
    if (!userId) return;
    await supabase.from('app_events').insert({
      user_id: userId,
      kind,
      target_type: target?.type ?? null,
      target_id: target?.id ?? null,
      meta: meta ?? null,
    });
  } catch {
    // Usage logging is best effort.
  }
}

/** Log a screen visit each time the screen comes into focus (throttled). */
export function useAppEventOnFocus(
  kind: AppEventKind,
  target?: { type: string; id?: string | null },
): void {
  const type = target?.type;
  const id = target?.id;
  useFocusEffect(
    useCallback(() => {
      void logAppEvent(kind, type ? { type, id } : undefined);
    }, [kind, type, id]),
  );
}

/** For tests. */
export function __resetAppEventThrottle(): void {
  lastLogged.clear();
}
