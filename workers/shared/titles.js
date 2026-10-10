/**
 * titles.js: Mind Drop's titles, and the two backstops on Gremly's reaction
 * (Mind Drop rethink stage 2, 9 Oct 2026). Shared by the cortex Worker and the
 * app (stage 4: the app saves a drop before its title call may have answered,
 * with the same rule for its own words as a title).
 *
 * Formatting only: nothing here reads what the words say. The prompts in
 * minddropPrompts.js decide the words; these only put a capital first, stand
 * in for a title call that failed or returned nothing, and catch a dash or an
 * over long reaction. Every stand in and every backstop logs a console.warn
 * when it fires, so a prompt problem is never hidden.
 */

export const FALLBACK_TITLE_MAX = 60;

/** A capital for the first character; every other character stays as written. */
export function sentenceCase(s) {
  const t = String(s ?? '').trim();
  if (!t) return '';
  return t[0].toUpperCase() + t.slice(1);
}

/**
 * The drop's own words as a title: in sentence case, cut at the last whole word
 * within 60 characters. A single word longer than that is kept whole. Quiet:
 * the app uses it for a drop saved before its title call has answered, which
 * the title then replaces.
 */
export function wordsAsTitle(text) {
  const t = String(text ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
  if (t.length <= FALLBACK_TITLE_MAX) return sentenceCase(t);
  const space = t.lastIndexOf(' ', FALLBACK_TITLE_MAX);
  return sentenceCase(space > 0 ? t.slice(0, space) : t.split(' ')[0]);
}

/**
 * The drop's own words as its title, only for a title call that failed or
 * returned nothing (wordsAsTitle), logged every time.
 */
export function fallbackTitle(text, route) {
  const t = String(text ?? '').trim();
  console.warn("[MindDropTitle] title call gave no title; using the drop's own words", {
    route,
    length: t.length,
  });
  return wordsAsTitle(t);
}

/** The dash swap James agreed: a dash in the reaction becomes a comma, logged. */
export function dashBackstop(reaction, route) {
  const s = String(reaction ?? '');
  if (!/[–—]/.test(s)) return s;
  console.warn('[MindDropReaction] dash in the reaction, swapped for a comma', { route });
  return s.replace(/\s*[–—]\s*/g, ', ').trim();
}

/** The reaction's length cut James agreed: over max, cut with an ellipsis, logged. */
export function lengthBackstop(reaction, max, route) {
  const s = String(reaction ?? '');
  if (s.length <= max) return s;
  console.warn('[MindDropReaction] reaction over its length, cut', {
    route,
    length: s.length,
    max,
  });
  return s.substring(0, max - 3) + '...';
}
