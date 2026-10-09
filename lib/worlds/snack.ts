/**
 * The one message at a time the Worlds screens show at the bottom, with its
 * way back (Undo) when there is one. Kept outside any screen so a message
 * still shows after the screen changes (start a Chapter on the home screen,
 * see "Started" on the Chapter's page).
 */
import type { Undo } from './actions';

export interface Snack {
  id: number;
  text: string;
  undo: Undo | null;
}

type Listener = (s: Snack | null) => void;

let current: Snack | null = null;
let nextId = 1;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<Listener>();

/** How long a message stays, in milliseconds. */
export const SNACK_MS = 5200;

function emit() {
  for (const l of listeners) l(current);
}

/** Show a message, with Undo when a way back is given. */
export function showSnack(text: string, undo?: Undo | null): void {
  current = { id: nextId++, text, undo: undo || null };
  if (timer) clearTimeout(timer);
  timer = setTimeout(hideSnack, SNACK_MS);
  emit();
}

export function hideSnack(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!current) return;
  current = null;
  emit();
}

let announced = 0;
/** True the first time a message asks to be read out, so two hosts never read it twice. */
export function firstToAnnounce(id: number): boolean {
  if (id === announced) return false;
  announced = id;
  return true;
}

export function currentSnack(): Snack | null {
  return current;
}

export function onSnack(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/**
 * Say plainly that a change did not save. The screen has already been put
 * back by the action; the error itself goes to the log.
 */
export function showFailed(what: string, err: unknown): void {
  console.warn(`[Worlds] ${what} did not save:`, err);
  showSnack(`${what} did not save. Check your connection and try again.`);
}
