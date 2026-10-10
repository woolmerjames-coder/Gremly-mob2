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

/**
 * A capital for the first character; every other character stays as written.
 * A first word that already has a capital after its first letter (iPhone,
 * eBay) is a name written its own way, and is left as it is (final check
 * item 18). Letter case only: nothing here reads what the words say.
 */
export function sentenceCase(s) {
  const t = String(s ?? '').trim();
  if (!t) return '';
  const first = t.split(/\s/)[0];
  if (/\p{Lu}/u.test(first.slice(1))) return t;
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

/**
 * The reaction's length cut James agreed: over max characters, cut with an
 * ellipsis, logged. It counts and cuts by code point, so it never splits an
 * emoji in two, and it steps back over a joiner, a variation selector or a
 * skin tone at the cut, so a joined emoji is kept whole or left out whole
 * (final check item 18).
 */
export function lengthBackstop(reaction, max, route) {
  const s = String(reaction ?? '');
  const points = Array.from(s);
  if (points.length <= max) return s;
  console.warn('[MindDropReaction] reaction over its length, cut', {
    route,
    length: points.length,
    max,
  });
  let end = Math.max(0, max - 3);
  const joins = (p) => {
    const c = p ? p.codePointAt(0) : 0;
    return c === 0x200d || c === 0xfe0f || (c >= 0x1f3fb && c <= 0x1f3ff);
  };
  // the cut never leaves part of a joined emoji: step back to its start
  while (end > 0 && (joins(points[end]) || points[end - 1] === '\u200d')) end -= 1;
  return points.slice(0, end).join('') + '...';
}
