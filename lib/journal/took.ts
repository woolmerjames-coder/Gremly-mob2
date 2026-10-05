/**
 * What Gremly took from a journal entry.
 *
 * His reader goes through each entry within the hour and keeps dated facts
 * about the person's life, each one marked with the entry it came from. This
 * reads those back, so the person can see what an entry added to his picture
 * of them.
 *
 * Nothing is said about an entry with none: he may not have read it yet, or
 * may have found nothing in it that lasts, and the app cannot tell which.
 */
import { useEffect } from 'react';
import { create } from 'zustand';
import { supabase } from '../supabase/client';

/** A fact Gremly kept, as the person is shown it */
export type EntryFact = {
  id: string;
  /** What he wrote down */
  statement: string;
  /** The words of the entry it came from, when he noted them */
  quote: string | null;
  /** About something personal enough that he keeps it to himself */
  private: boolean;
  /** Whether he still holds it as it stands, is unsure of it, or has updated it since */
  standing: 'held' | 'unsure' | 'updated';
};

/** The states a fact is in while he still holds it as it was written */
const HELD = ['current', 'planned', 'happened'];

interface EntryFactsState {
  byEntry: Record<string, EntryFact[]>;
}

export const useEntryFactsStore = create<EntryFactsState>()(() => ({ byEntry: {} }));

const NONE: EntryFact[] = [];

function toFact(row: Record<string, unknown>): EntryFact | null {
  const statement = typeof row.statement === 'string' ? row.statement.trim() : '';
  if (typeof row.id !== 'string' || !statement) return null;
  const state = String(row.state ?? '');
  const quote = typeof row.source_quote === 'string' ? row.source_quote.trim() : '';
  return {
    id: row.id,
    statement,
    quote: quote || null,
    private: row.private === true,
    standing: HELD.includes(state) ? 'held' : state === 'unconfirmed' ? 'unsure' : 'updated',
  };
}

/** Read what he kept from an entry. What was last read stays when it cannot be reached. */
export async function loadEntryFacts(noteId: string): Promise<EntryFact[]> {
  try {
    const { data, error } = await supabase
      .from('life_facts')
      .select('id,statement,state,private,source_quote,created_at')
      .eq('source_table', 'notes')
      .eq('source_id', noteId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    const facts = ((data ?? []) as Record<string, unknown>[])
      .map(toFact)
      .filter((f): f is EntryFact => !!f);
    useEntryFactsStore.setState((s) => ({ byEntry: { ...s.byEntry, [noteId]: facts } }));
    return facts;
  } catch (err) {
    console.warn('[Journal] could not read what Gremly took from an entry:', err);
    return useEntryFactsStore.getState().byEntry[noteId] ?? NONE;
  }
}

/** What he kept from an entry, read each time a screen first shows it. */
export function useEntryFacts(noteId: string | null | undefined): EntryFact[] {
  const facts = useEntryFactsStore((s) => (noteId ? s.byEntry[noteId] : undefined));
  useEffect(() => {
    if (noteId) void loadEntryFacts(noteId);
  }, [noteId]);
  return facts ?? NONE;
}

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

/** "Gremly took three things from this" */
export function tookLine(count: number): string {
  return `Gremly took ${WORDS[count] ?? count} ${count === 1 ? 'thing' : 'things'} from this`;
}

export const TOOK_COPY = {
  title: 'What Gremly took from this',
  section: 'What Gremly took',
  sub: 'A journal entry adds to his picture of you. He keeps what tells him something that lasts.',
  foot: 'He uses these when he talks with you and when he plans your day.',
  from: 'From',
  private: 'Private',
  unsure: 'He is not sure of this yet.',
  updated: 'He has updated this since.',
  close: 'Close',
} as const;
