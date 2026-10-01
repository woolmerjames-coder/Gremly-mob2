/**
 * Reading the day's thread: which messages are brief messages, and which of
 * them are shown.
 */

import type { SpaceChatMessage } from '../types';
import type { BriefMeta, BriefMessageType, DayPart } from './types';

const BRIEF_TYPES: ReadonlySet<string> = new Set<BriefMessageType>([
  'brief-text',
  'brief-day-card',
  'brief-offer',
  'brief-plan',
  'brief-event',
  'brief-reply',
]);

/** The brief metadata on a message, or null when it is an ordinary chat message. */
export function briefMetaOf(
  m: Pick<SpaceChatMessage, 'metadata_json'> | null | undefined,
): BriefMeta | null {
  const meta = m?.metadata_json as { type?: unknown } | null | undefined;
  if (!meta || typeof meta.type !== 'string' || !BRIEF_TYPES.has(meta.type)) return null;
  return meta as unknown as BriefMeta;
}

export function isBriefMessage(m: Pick<SpaceChatMessage, 'metadata_json'>): boolean {
  return briefMetaOf(m) !== null;
}

/** Lines a rewrite replaced before anyone saw them are never shown. */
export function visibleThreadMessages<T extends Pick<SpaceChatMessage, 'metadata_json'>>(
  messages: T[],
): T[] {
  return messages.filter((m) => !briefMetaOf(m)?.superseded);
}

/** Morning until noon, afternoon until 5pm, then evening. */
export function dayPartAt(hour: number): DayPart {
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

/**
 * Whether a Gremly line follows another Gremly message directly, so it is
 * drawn without the GREMLY mark above it.
 */
export function followsGremly(prev: SpaceChatMessage | undefined): boolean {
  if (!prev) return false;
  const meta = briefMetaOf(prev);
  if (meta) return meta.type !== 'brief-reply' && meta.type !== 'brief-event';
  return prev.role === 'assistant';
}

/**
 * The one offer whose buttons are live: the newest offer with nothing chosen
 * and nothing said after it. Older offers keep their words but lose their
 * buttons, so there is only ever one set to tap.
 */
export function liveOfferId(messages: SpaceChatMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const meta = briefMetaOf(m);
    if (m.role === 'user') return null;
    if (meta?.type === 'brief-offer') {
      if (meta.superseded || meta.chosen) return null;
      return m.id;
    }
  }
  return null;
}
