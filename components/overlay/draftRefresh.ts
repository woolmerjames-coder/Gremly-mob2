/**
 * The overlay's draft when the item changes in the store while the overlay is
 * open. Gremly changes an item from the item's own chat, which sits on top of
 * the overlay; other screens can change it too.
 *
 * The draft is a snapshot taken when the overlay opens, and Save writes all of
 * it. Left as it was, the overlay would go on showing the item as it used to
 * be, and a Save would write that over what had just changed. So:
 *
 *  - A part of the draft the person has not touched takes the item's new value.
 *  - A part they have changed stays theirs: they are mid-edit, and their words
 *    win.
 *  - The notes are the one part with a middle way. When they have typed in
 *    them and the item's notes only grew at the end (Gremly added to them),
 *    what was added goes on the end of theirs, so saving their edit keeps it.
 *    When that addition is taken back (Undo on the card), it comes off the
 *    end of theirs again.
 *
 * Everything here compares values. Nothing reads what the words mean.
 */

/** The parts of the draft that hold a kind's own fields, with the field its notes are in. */
const TEXT_FIELD: Record<string, string> = { log: 'body', todo: 'details', habit: 'notes' };

type Parts = Record<string, any>;

/** The same value, whatever order an object's keys come in. */
export function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => same(x, b[i]));
  }
  const ak = Object.keys(a as Parts);
  const bk = Object.keys(b as Parts);
  const keys = new Set([...ak, ...bk]);
  for (const k of keys) {
    if (!same((a as Parts)[k], (b as Parts)[k])) return false;
  }
  return true;
}

/**
 * What was put on the end of a text, when that is all that happened to it.
 * Null when the text changed any other way, or did not grow.
 */
export function addedText(before: string, after: string): string | null {
  const base = before.trimEnd();
  if (after.length <= base.length || !after.startsWith(base)) return null;
  return after.slice(base.length).trim() || null;
}

/** Their words with what was added on the end, set apart as the change model sets it. */
function withAdded(theirs: string, added: string): string {
  return theirs.trim() ? `${theirs.trimEnd()}\n\n${added}` : added;
}

/** Their words with what was taken back off the end of them. */
function withoutEnd(theirs: string, removed: string): string {
  const t = theirs.trimEnd();
  return t.slice(0, t.length - removed.length).trimEnd();
}

/**
 * The parts of the draft to replace.
 *
 * @param draft what the overlay holds now
 * @param was   the draft as the item read before it changed
 * @param now   the draft as the item reads now
 * @param added what was put on the end of the item's notes, when that is all
 *              that happened to them (addedText), else null
 * @param removed what was taken off the end of the item's notes, when that is
 *              all that happened to them, else null
 */
export function refreshedDraft(
  draft: Parts,
  was: Parts,
  now: Parts,
  added: string | null,
  removed: string | null = null,
): Parts {
  const out: Parts = {};
  for (const key of Object.keys(now)) {
    const textField = TEXT_FIELD[key];
    if (!textField) {
      // the item did not change this part, or the person has
      if (same(was[key], now[key]) || !same(draft[key], was[key])) continue;
      out[key] = now[key];
      continue;
    }
    // a kind's own fields, one at a time
    const d: Parts = draft[key] ?? {};
    const w: Parts = was[key] ?? {};
    const n: Parts = now[key] ?? {};
    let next: Parts | null = null;
    for (const field of Object.keys(n)) {
      if (same(w[field], n[field])) continue;
      if (same(d[field], w[field])) {
        next = { ...(next ?? d), [field]: n[field] };
      } else if (field === textField && typeof d[field] === 'string') {
        // they have typed in the notes: theirs stay, with the end kept in step
        if (added) next = { ...(next ?? d), [field]: withAdded(d[field], added) };
        else if (removed && d[field].trimEnd().endsWith(removed)) {
          next = { ...(next ?? d), [field]: withoutEnd(d[field], removed) };
        }
      }
    }
    if (next) out[key] = next;
  }
  return out;
}

/** The fields of the item's record that changed, with their new values. */
export function changedFields(before: Parts, after: Parts): Parts {
  const out: Parts = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (!same(before[key], after[key])) out[key] = after[key] ?? null;
  }
  return out;
}
