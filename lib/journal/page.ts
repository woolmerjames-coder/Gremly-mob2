/**
 * The journal page as the person is writing it: a column of cards, each a
 * prompt with its answer, or free writing.
 *
 * Words are never dropped. Choosing another page keeps every card that has
 * been written on, removes the prompts left empty, and adds the new page's
 * prompts. Free writing is gathered into one card where it already sat, and
 * the last card is always free writing.
 *
 * Everything here returns a new page and leaves the one it was given alone.
 */
import { countWords, hasWords, htmlToText, joinHtml, textToHtml } from './html';
import { FREEFORM, type JournalPageDef } from './pages';

export type JournalCard = {
  /** A new id whenever the words were rewritten from outside the editor, so the editor shows them */
  id: string;
  /** The prompt: null for free writing, and an empty one while the person is still typing theirs */
  q: string | null;
  /** What is written, as the editor's rich text */
  html: string;
  /** A prompt the person typed themselves */
  custom?: boolean;
};

export type JournalPage = {
  /** The page chosen, by id */
  tpl: string;
  cards: JournalCard[];
};

/** A page as it is kept on a journal entry, beside the entry's plain words. */
export type JournalLayout = {
  v: 1;
  tpl: string;
  cards: { q: string | null; html: string }[];
  /** The plain words it was saved with. When the entry's words no longer match, it was changed elsewhere. */
  text: string;
};

/** Where the layout sits in an entry's views */
export const LAYOUT_KEY = 'journal_page';

let made = 0;
export function card(q: string | null = null, html = '', custom = false): JournalCard {
  made += 1;
  return custom ? { id: `card-${made}`, q, html, custom } : { id: `card-${made}`, q, html };
}

const written = (c: JournalCard) => hasWords(c.html);

/** Neighbouring free writing becomes one card. An empty one beside a written one goes. */
function gather(cards: JournalCard[]): JournalCard[] {
  const out: JournalCard[] = [];
  for (const c of cards) {
    const prev = out[out.length - 1];
    if (c.q !== null || !prev || prev.q !== null) {
      out.push(c);
    } else if (written(c)) {
      out[out.length - 1] = written(prev) ? card(null, joinHtml(prev.html, c.html)) : c;
    }
  }
  return out;
}

function endOnFree(cards: JournalCard[]): JournalCard[] {
  const last = cards[cards.length - 1];
  return last && last.q === null ? cards : [...cards, card(null)];
}

/** The page with another page's prompts on it. */
export function applyPage(page: JournalPage, def: JournalPageDef): JournalPage {
  const hadPrompts = page.cards.some((c) => c.q !== null);
  const end = page.cards[page.cards.length - 1];
  // free writing under the prompts stays under them; on a freeform page it stays on top
  const tail = hadPrompts && end && end.q === null && written(end) ? end : null;
  const kept = page.cards.filter((c) => written(c) && c !== tail);
  const answered = new Map<string, JournalCard>();
  for (const c of kept) if (c.q) answered.set(c.q, c);
  const others = kept.filter((c) => !(c.q && def.prompts.includes(c.q)));
  const prompts = def.prompts.map((q) => {
    const c = answered.get(q);
    if (!c) return card(q);
    return c.custom ? { id: c.id, q: c.q, html: c.html } : c;
  });
  return { tpl: def.id, cards: gather([...others, ...prompts, tail ?? card(null)]) };
}

export function newPage(def: JournalPageDef): JournalPage {
  return applyPage({ tpl: FREEFORM, cards: [] }, def);
}

/** A prompt of the person's own, above the free writing at the end when that is still empty. */
export function addPrompt(page: JournalPage): { page: JournalPage; id: string } {
  const fresh = card('', '', true);
  const cards = [...page.cards];
  const end = cards[cards.length - 1];
  const at = end && end.q === null && !written(end) ? cards.length - 1 : cards.length;
  cards.splice(at, 0, fresh);
  return { page: { tpl: page.tpl, cards: endOnFree(cards) }, id: fresh.id };
}

/** Take a prompt off the page. What was written under it stays, as free writing. */
export function removePrompt(page: JournalPage, id: string): JournalPage {
  const cards = page.cards.flatMap((c) => {
    if (c.id !== id) return [c];
    return written(c) ? [card(null, c.html)] : [];
  });
  return { tpl: page.tpl, cards: endOnFree(gather(cards)) };
}

export function setCardHtml(page: JournalPage, id: string, html: string): JournalPage {
  return { tpl: page.tpl, cards: page.cards.map((c) => (c.id === id ? { ...c, html } : c)) };
}

export function setCardPrompt(page: JournalPage, id: string, q: string): JournalPage {
  return { tpl: page.tpl, cards: page.cards.map((c) => (c.id === id ? { ...c, q } : c)) };
}

/** Free writing sent from the chat box while a page is open or kept as a draft. */
export function addWords(page: JournalPage, text: string): JournalPage {
  const html = textToHtml(text);
  if (!html) return page;
  return { tpl: page.tpl, cards: endOnFree(gather([...page.cards, card(null, html)])) };
}

export function isEmpty(page: JournalPage): boolean {
  return !page.cards.some(written);
}

export function pageWordCount(page: JournalPage): number {
  return page.cards.reduce((n, c) => n + countWords(c.html), 0);
}

/** The prompts on the page, in order, as they would be kept in a page of the person's own. */
export function promptsOf(page: JournalPage): string[] {
  return page.cards.map((c) => (c.q ?? '').trim()).filter(Boolean);
}

/** Whether the prompts on the page are a set that is not already one of the pages. */
export function isNewSet(page: JournalPage, pages: JournalPageDef[]): boolean {
  const prompts = promptsOf(page);
  if (!prompts.length) return false;
  const key = prompts.join('\n');
  return !pages.some((p) => p.prompts.join('\n') === key);
}

/**
 * The entry's plain words: each prompt on its own line with its answer under
 * it, and an empty line between cards. This is what the rest of the app and
 * Gremly read.
 */
export function pageText(page: JournalPage): string {
  return page.cards
    .filter(written)
    .map((c) => {
      const q = (c.q ?? '').trim();
      const words = htmlToText(c.html);
      return q ? `${q}\n${words}` : words;
    })
    .join('\n\n');
}

export function toLayout(page: JournalPage): JournalLayout {
  return {
    v: 1,
    tpl: page.tpl,
    cards: page.cards.filter(written).map((c) => ({ q: (c.q ?? '').trim() || null, html: c.html })),
    text: pageText(page),
  };
}

export function readLayout(views: unknown): JournalLayout | null {
  const raw = (views as Record<string, unknown> | null | undefined)?.[LAYOUT_KEY] as
    | Partial<JournalLayout>
    | null
    | undefined;
  if (!raw || raw.v !== 1 || typeof raw.tpl !== 'string' || typeof raw.text !== 'string')
    return null;
  if (!Array.isArray(raw.cards)) return null;
  const cards: JournalLayout['cards'] = [];
  for (const c of raw.cards as { q?: unknown; html?: unknown }[]) {
    if (!c || typeof c.html !== 'string') return null;
    if (c.q !== null && typeof c.q !== 'string') return null;
    cards.push({ q: c.q, html: c.html });
  }
  return { v: 1, tpl: raw.tpl, cards, text: raw.text };
}

/**
 * The page for an entry that is already saved. One written on the page comes
 * back as its cards. One written anywhere else, or changed elsewhere since,
 * comes back as free writing holding its words.
 *
 * `toWrite` adds the free writing at the end, for a page that is being edited.
 */
export function pageOfEntry(
  entry: { body?: string | null; views?: unknown },
  pages: JournalPageDef[],
  opts: { toWrite?: boolean } = {},
): JournalPage {
  const body = String(entry.body ?? '').trim();
  const layout = readLayout(entry.views);
  let page: JournalPage;
  if (layout && layout.text.trim() === body) {
    const known = new Set(pages.flatMap((p) => p.prompts));
    page = {
      tpl: pages.some((p) => p.id === layout.tpl) ? layout.tpl : FREEFORM,
      cards: layout.cards.map((c) => card(c.q, c.html, !!c.q && !known.has(c.q))),
    };
  } else {
    page = { tpl: FREEFORM, cards: body ? [card(null, textToHtml(body))] : [] };
  }
  return opts.toWrite || !page.cards.length
    ? { tpl: page.tpl, cards: endOnFree(page.cards) }
    : page;
}
