/**
 * The dot on the Worlds tab (Worlds rebuild, stage 3, the mockup's): set when
 * something new lands in Worlds from somewhere else, such as a Chapter or a
 * World started from a chat card, something saved from chat, or their first
 * Worlds arriving; gone once Worlds is opened.
 */
import { create } from 'zustand';

interface WorldsDot {
  on: boolean;
}

export const useWorldsDot = create<WorldsDot>(() => ({ on: false }));

/** Something new is in Worlds. */
export function markWorldsNew(): void {
  if (!useWorldsDot.getState().on) useWorldsDot.setState({ on: true });
}

/** Worlds was opened. */
export function clearWorldsNew(): void {
  if (useWorldsDot.getState().on) useWorldsDot.setState({ on: false });
}

/** Their first Worlds just arrived: from none to some. Pure. */
export const firstWorldsArrived = (before: number, now: number): boolean => before === 0 && now > 0;
