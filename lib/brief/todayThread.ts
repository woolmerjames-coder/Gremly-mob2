/**
 * Today's thread, as the rest of the app needs to know it (Daily brief in
 * Chat): whether the brief is waiting unread (the CHAT dot, Gremly's line on
 * Drop, the speech bubble on Today, the pinned card), and when Chat was last
 * on screen (the 5-minute resume window).
 *
 * Unread means today's thread has a brief written and no seen_at. The thread
 * is read again when the app comes back to the front, when the ritual day
 * rolls over at the Day Boundary, and after the brief is written or seen.
 */

import { create } from 'zustand';
import { getDailyThread, type DailyThread } from '../repo/dailyThreadRepo';
import { getDateService } from '../date/DateService';
import { useGremlyStore } from '../store/useGremlyStore';
import { briefInChatOn } from './flag';
import type { DailyThreadMeta } from './types';

/** Chat reopens the chat that was on screen if it was left this recently. */
export const RESUME_WINDOW_MS = 5 * 60 * 1000;

export interface TodayThreadState {
  ritualDay: string | null;
  thread: DailyThread | null;
  /** When Chat was last on screen (ms since epoch), and the chat it showed */
  chatLeftAt: number | null;
  chatLeftId: string | null;
  /** Read today's thread again (never creates it) */
  refresh: () => Promise<DailyThread | null>;
  /** A thread the screen already has (just opened or made) */
  setThread: (thread: DailyThread | null) => void;
  /** Merge fields into the thread's metadata here, after saving them */
  patchMeta: (threadId: string, patch: Partial<DailyThreadMeta>) => void;
  /** Chat went off screen, showing this chat (null for the fresh home) */
  noteChatLeft: (chatId: string | null, at: number) => void;
}

/** A brief has been written into the thread and has not been on screen yet. */
export function isBriefUnread(
  thread: Pick<DailyThread, 'metadata_json'> | null | undefined,
): boolean {
  const meta = thread?.metadata_json as Partial<DailyThreadMeta> | undefined;
  return !!meta?.brief_written_at && !meta.seen_at;
}

/** Whether Chat, opened now, should show the chat it was left on. */
export function withinResumeWindow(
  state: Pick<TodayThreadState, 'chatLeftAt' | 'chatLeftId'>,
  nowMs: number,
): boolean {
  return (
    state.chatLeftAt !== null &&
    state.chatLeftId !== null &&
    nowMs - state.chatLeftAt <= RESUME_WINDOW_MS
  );
}

export const useTodayThread = create<TodayThreadState>((set, get) => ({
  ritualDay: null,
  thread: null,
  chatLeftAt: null,
  chatLeftId: null,

  refresh: async () => {
    const userId = useGremlyStore.getState().userId;
    if (!userId) return null;
    const day = getDateService().ritualDay();
    try {
      const thread = await getDailyThread(userId, day);
      // a slower read for an earlier day must not replace a newer one
      if (getDateService().ritualDay() !== day) return get().thread;
      set({ ritualDay: day, thread });
      return thread;
    } catch (err) {
      console.warn("[DailyBrief] could not read today's thread:", err);
      return get().thread;
    }
  },

  setThread: (thread) => {
    const meta = thread?.metadata_json as Partial<DailyThreadMeta> | undefined;
    if (thread && meta?.ritual_day && meta.ritual_day !== getDateService().ritualDay()) return;
    set({ thread, ritualDay: getDateService().ritualDay() });
  },

  patchMeta: (threadId, patch) => {
    const t = get().thread;
    if (!t || t.id !== threadId) return;
    set({ thread: { ...t, metadata_json: { ...t.metadata_json, ...patch } } });
  },

  noteChatLeft: (chatId, at) => set({ chatLeftId: chatId, chatLeftAt: at }),
}));

/** Unread brief, with the switch on: drives the dot, the Drop line, the bubble and the card. */
export function useBriefUnread(): boolean {
  const on = briefInChatOn(useGremlyStore((s) => s.briefInChat));
  const unread = useTodayThread((s) => isBriefUnread(s.thread));
  return on && unread;
}
