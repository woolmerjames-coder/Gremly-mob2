/**
 * The pages a journal entry can be written on. A page is a short set of
 * prompts, each shown as a card. Freeform has none.
 *
 * The built in ones are common ways of journaling. People can also keep
 * pages of their own, which are held with these.
 */

export type JournalPageIcon = 'free' | 'proud' | 'good' | 'rose' | 'review' | 'head' | 'own';

export type JournalPageDef = {
  id: string;
  name: string;
  /** One line under the page chips, saying what the page is for */
  about: string;
  prompts: string[];
  icon: JournalPageIcon;
  /** A page the person made themselves */
  own?: boolean;
};

export const FREEFORM = 'free';

export const BUILT_IN_PAGES: JournalPageDef[] = [
  { id: FREEFORM, name: 'Freeform', about: '', prompts: [], icon: 'free' },
  {
    id: 'proud',
    name: 'Proud and grateful',
    about: 'Four short answers about today.',
    prompts: [
      'What am I proud of today?',
      'What am I grateful for?',
      'What did I notice?',
      'What would have made today better?',
    ],
    icon: 'proud',
  },
  {
    id: 'three-good',
    name: 'Three good things',
    about: 'What went well today, and why.',
    prompts: [
      'One good thing, and why it happened',
      'A second good thing, and why',
      'A third good thing, and why',
    ],
    icon: 'good',
  },
  {
    id: 'rose',
    name: 'Rose, thorn, bud',
    about: 'A highlight, a hard part, and something with promise.',
    prompts: [
      'Rose: the best part of today',
      'Thorn: the hard part',
      'Bud: something with promise',
    ],
    icon: 'rose',
  },
  {
    id: 'review',
    name: 'Evening review',
    about: 'An honest look back, then tomorrow.',
    prompts: [
      'Did I do what I set out to do?',
      'What could I have done better?',
      'What did I learn that helps tomorrow?',
    ],
    icon: 'review',
  },
  {
    id: 'clear',
    name: 'Clear my head',
    about: 'Empty it out before bed.',
    prompts: ['What is still on my mind?', 'What can wait?', 'What comes first tomorrow?'],
    icon: 'head',
  },
];

/** Every page to choose from: the built in ones, then the person's own. */
export function allPages(own: JournalPageDef[] = []): JournalPageDef[] {
  return [...BUILT_IN_PAGES, ...own.map((p) => ({ ...p, own: true, icon: 'own' as const }))];
}

/** The page with this id, or Freeform when it is not one we know (a page since deleted, say). */
export function pageById(
  id: string | null | undefined,
  own: JournalPageDef[] = [],
): JournalPageDef {
  return allPages(own).find((p) => p.id === id) ?? BUILT_IN_PAGES[0];
}
