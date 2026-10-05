/**
 * The journal page while the app is open: what is asking for it to be shown,
 * the pages kept half written, and the page the person used last.
 *
 * Any screen opens the page through here, so there is one journal page for
 * the whole app. A page closed before Done is kept as a draft on the phone
 * and comes back the next time that day's page, or that entry, is opened.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDateService } from '../date/DateService';
import type { Mood } from '../shared/moods';
import { card, type JournalLayout, type JournalPage } from './page';
import { FREEFORM } from './pages';

export type JournalPart = 'morning' | 'afternoon' | 'evening';

/** What the page hands over on Done */
export type JournalWritten = { text: string; layout: JournalLayout; moods: Mood[] };
export type JournalSaveResult = { ok: true } | { ok: false; message: string };

/** The goal a check in is written for, and the Space that goal is in */
export type JournalGoal = { goal_id: string; goal_name: string; space_id: string };

export type JournalOpen = {
  /** The person's day the page is for */
  day: string;
  /** A saved entry to open. Left out for the day's own page. */
  entryId?: string;
  /**
   * A new check in on a goal, from its Space. It is an entry of its own, kept
   * with the goal, and not the day's page.
   */
  goal?: JournalGoal;
  /** Show a saved entry to read, with Edit. Otherwise the page opens to write on. */
  reading?: boolean;
  /** The part of the day it is written in, for the header and the entry's first title */
  part?: JournalPart;
  /** Words already typed in the chat box, to start the page with */
  carry?: string;
  /**
   * Saves the entry in place of the page's own saving. The wrap up gives this,
   * so the entry is saved as part of the evening and answered in the thread.
   */
  save?: (written: JournalWritten) => Promise<JournalSaveResult>;
};

export type JournalDraft = {
  tpl: string;
  cards: { q: string | null; html: string; custom?: boolean }[];
  moods: Mood[];
  /** When it was kept */
  at: string;
};

interface JournalSession {
  /** What is on screen. `turn` changes with each opening, so the page starts afresh. */
  open: (JournalOpen & { turn: number }) | null;
  drafts: Record<string, JournalDraft>;
  /** The page chosen last, which the next new page opens on */
  lastPage: string;
}

export const useJournalSession = create<JournalSession>()(
  persist((): JournalSession => ({ open: null, drafts: {}, lastPage: FREEFORM }), {
    name: 'gremly-journal-page-v1',
    storage: createJSONStorage(() => AsyncStorage),
    // what is on screen holds a function and is only for now
    partialize: (s) => ({ drafts: s.drafts, lastPage: s.lastPage }),
  }),
);

let turns = 0;

export function openJournal(request: JournalOpen): void {
  turns += 1;
  useJournalSession.setState({ open: { ...request, turn: turns } });
}

export function closeJournal(): void {
  useJournalSession.setState({ open: null });
}

/**
 * Where a draft is kept: with the saved entry it changes, with the goal a new
 * check in is for, or with the day it is for.
 */
export function draftKey(at: {
  day: string;
  entryId?: string | null;
  goalId?: string | null;
}): string {
  if (at.entryId) return `entry:${at.entryId}`;
  return at.goalId ? `goal:${at.goalId}` : `day:${at.day}`;
}

export function keepDraft(key: string, left: { page: JournalPage; moods: Mood[] }): void {
  const draft: JournalDraft = {
    tpl: left.page.tpl,
    cards: left.page.cards.map((c) =>
      c.custom ? { q: c.q, html: c.html, custom: true } : { q: c.q, html: c.html },
    ),
    moods: left.moods,
    at: getDateService().nowTimestamp(),
  };
  useJournalSession.setState((s) => ({ drafts: { ...s.drafts, [key]: draft } }));
}

export function dropDraft(key: string): void {
  useJournalSession.setState((s) => {
    if (!(key in s.drafts)) return s;
    const drafts = { ...s.drafts };
    delete drafts[key];
    return { drafts };
  });
}

export function draftFor(key: string): JournalDraft | null {
  return useJournalSession.getState().drafts[key] ?? null;
}

/** A draft as a page to carry on writing. */
export function pageOfDraft(draft: JournalDraft): JournalPage {
  const cards = draft.cards.map((c) => card(c.q, c.html, !!c.custom));
  const last = cards[cards.length - 1];
  return { tpl: draft.tpl, cards: last && last.q === null ? cards : [...cards, card(null)] };
}

export function setLastPage(id: string): void {
  useJournalSession.setState({ lastPage: id });
}
