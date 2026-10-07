/**
 * Pages of the person's own: a name and a short set of questions, kept on
 * their account so they are there on every phone they sign in on.
 *
 * A copy stays on the phone, so the pages are on the journal page the moment
 * it opens, signal or not. Saving and deleting go to the account first: a
 * page is only shown as kept once the account has it.
 */
import { useEffect } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase/client';
import type { JournalPageDef } from './pages';
import { keepFor } from './session';
import { JOURNAL_COPY, tooManyPages } from './words';

/** A name fits a chip. A question fits two lines of a card. */
export const OWN_NAME_MAX = 26;
export const OWN_PROMPT_MAX = 70;
export const OWN_PROMPTS_MAX = 6;
/** More than this and the row of pages is too long to choose from */
export const OWN_PAGES_MAX = 12;

/** What the person filled in: a new page, or changes to one they have */
export type OwnPageForm = { id?: string | null; name: string; prompts: string[] };
export type OwnPageSaved = { ok: true; page: JournalPageDef } | { ok: false; message: string };
export type OwnPageGone = { ok: true } | { ok: false; message: string };

const TABLE = 'journal_pages';
const FIELDS = 'id,name,prompts';

interface OwnPagesState {
  /** Whose pages the copy on the phone is */
  owner: string | null;
  pages: JournalPageDef[];
}

export const useOwnPagesStore = create<OwnPagesState>()(
  persist((): OwnPagesState => ({ owner: null, pages: [] }), {
    name: 'gremly-journal-own-pages-v1',
    storage: createJSONStorage(() => AsyncStorage),
  }),
);

/** The person's pages, as the journal page shows them. */
export function ownPages(): JournalPageDef[] {
  return useOwnPagesStore.getState().pages;
}

export function useOwnPages(): JournalPageDef[] {
  return useOwnPagesStore((s) => s.pages);
}

function toPage(row: { id?: unknown; name?: unknown; prompts?: unknown }): JournalPageDef | null {
  if (typeof row.id !== 'string') return null;
  const prompts = Array.isArray(row.prompts)
    ? row.prompts.map((q) => String(q ?? '').trim()).filter(Boolean)
    : [];
  if (!prompts.length) return null;
  return {
    id: row.id,
    name: String(row.name ?? '').trim() || JOURNAL_COPY.ownNameDefault,
    about: '',
    prompts,
    icon: 'own',
    own: true,
  };
}

/** A question as it is kept: trimmed, and cut to the length a card has room for. */
export function cleanPrompt(q: string): string {
  return q.trim().slice(0, OWN_PROMPT_MAX).trim();
}

/**
 * What is filled in, as it is kept: the name and questions trimmed and cut to
 * length, questions left empty dropped. Null when there is no question.
 */
export function cleanForm(form: OwnPageForm): { name: string; prompts: string[] } | null {
  const prompts = form.prompts.map(cleanPrompt).filter(Boolean).slice(0, OWN_PROMPTS_MAX);
  if (!prompts.length) return null;
  const name = form.name.trim().slice(0, OWN_NAME_MAX).trim() || JOURNAL_COPY.ownNameDefault;
  return { name, prompts };
}

async function signedIn(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data?.session?.user?.id ?? null;
}

/** The copy on the phone belongs to one person. Someone else signing in starts without it. */
function claim(userId: string): void {
  keepFor(userId);
  const s = useOwnPagesStore.getState();
  if (s.owner === userId) return;
  useOwnPagesStore.setState({ owner: userId, pages: [] });
}

/**
 * Bring the person's pages from their account. When that cannot be reached,
 * the copy on the phone stays as it is.
 */
export async function loadOwnPages(): Promise<void> {
  try {
    const userId = await signedIn();
    if (!userId) return;
    claim(userId);
    const { data, error } = await supabase
      .from(TABLE)
      .select(FIELDS)
      .order('created_at', { ascending: true });
    if (error) throw error;
    // signed in as someone else while it loaded
    if (useOwnPagesStore.getState().owner !== userId) return;
    const pages = ((data ?? []) as Record<string, unknown>[])
      .map(toPage)
      .filter((p): p is JournalPageDef => !!p);
    useOwnPagesStore.setState({ pages });
  } catch (err) {
    console.warn('[Journal] could not load your own pages:', err);
  }
}

/** Keep a new page, or the changes to one. */
export async function saveOwnPage(form: OwnPageForm): Promise<OwnPageSaved> {
  const clean = cleanForm(form);
  if (!clean) return { ok: false, message: JOURNAL_COPY.ownNeedsQuestion };
  const held = ownPages();
  if (!form.id && held.length >= OWN_PAGES_MAX) {
    return { ok: false, message: tooManyPages(OWN_PAGES_MAX) };
  }
  try {
    const userId = await signedIn();
    if (!userId) return { ok: false, message: JOURNAL_COPY.ownNotSaved };
    claim(userId);
    const query = form.id
      ? supabase.from(TABLE).update(clean).eq('id', form.id)
      : supabase.from(TABLE).insert({ ...clean, user_id: userId });
    const { data, error } = await query.select(FIELDS).single();
    if (error) throw error;
    const page = toPage((data ?? {}) as Record<string, unknown>);
    if (!page) return { ok: false, message: JOURNAL_COPY.ownNotSaved };
    useOwnPagesStore.setState((s) => ({
      pages: s.pages.some((p) => p.id === page.id)
        ? s.pages.map((p) => (p.id === page.id ? page : p))
        : [...s.pages, page],
    }));
    return { ok: true, page };
  } catch (err) {
    console.warn('[Journal] could not save your page:', err);
    return { ok: false, message: JOURNAL_COPY.ownNotSaved };
  }
}

/** Delete a page. Entries written on it keep their questions and their words. */
export async function deleteOwnPage(id: string): Promise<OwnPageGone> {
  try {
    const { error } = await supabase.from(TABLE).delete().eq('id', id);
    if (error) throw error;
    useOwnPagesStore.setState((s) => ({ pages: s.pages.filter((p) => p.id !== id) }));
    return { ok: true };
  } catch (err) {
    console.warn('[Journal] could not delete your page:', err);
    return { ok: false, message: JOURNAL_COPY.ownNotDeleted };
  }
}

/**
 * Keeps the pages in step with who is signed in: loaded when the app opens
 * signed in, and again whenever someone signs in.
 */
export function useOwnPagesSync(): void {
  useEffect(() => {
    void loadOwnPages();
    const listener = supabase.auth.onAuthStateChange((event) => {
      // after the sign in has finished: asking the account for anything from inside this call can stall it
      if (event === 'SIGNED_IN') setTimeout(() => void loadOwnPages(), 0);
    });
    return () => listener?.data?.subscription?.unsubscribe();
  }, []);
}
