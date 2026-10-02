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
  'brief-changes',
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

/**
 * Lines a rewrite replaced before anyone saw them are never shown, and an
 * offer held back for the question stays hidden (a copy of it is added once
 * the question is answered or skipped).
 */
export function visibleThreadMessages<T extends Pick<SpaceChatMessage, 'metadata_json'>>(
  messages: T[],
): T[] {
  return messages.filter((m) => {
    const meta = briefMetaOf(m);
    if (!meta) return true;
    if (meta.superseded) return false;
    return !(meta.type === 'brief-offer' && meta.held);
  });
}

/** The offer held back for the question, if it has not been shown yet. */
export function heldOffer(messages: SpaceChatMessage[]): SpaceChatMessage | null {
  const revealed = new Set<string>();
  for (const m of messages) {
    const meta = briefMetaOf(m);
    if (meta?.type === 'brief-offer' && meta.revealed_from) revealed.add(meta.revealed_from);
  }
  for (let i = messages.length - 1; i >= 0; i--) {
    const meta = briefMetaOf(messages[i]);
    if (
      meta?.type === 'brief-offer' &&
      meta.held &&
      !meta.superseded &&
      !revealed.has(messages[i].id)
    )
      return messages[i];
  }
  return null;
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

/** Gremly's question, when it is the last thing said and no one has replied to it yet. */
export function liveQuestion(messages: SpaceChatMessage[]): SpaceChatMessage | null {
  const id = liveOfferId(visibleThreadMessages(messages));
  if (!id) return null;
  const m = messages.find((x) => x.id === id) ?? null;
  const meta = briefMetaOf(m);
  return meta?.type === 'brief-offer' && meta.kind === 'question' && meta.question_id ? m : null;
}

/**
 * The plan offer to bring back once a change made in the thread is done: the
 * day's latest offer, when it offers planning, nothing was chosen on it, the
 * thread has moved past it, no plan has been made since, and it is not itself
 * one brought back already.
 */
export function planOfferToBringBack(messages: SpaceChatMessage[]): SpaceChatMessage | null {
  const visible = visibleThreadMessages(messages);
  if (liveOfferId(visible)) return null;
  for (let i = visible.length - 1; i >= 0; i--) {
    const meta = briefMetaOf(visible[i]);
    if (meta?.type === 'brief-plan') return null;
    if (meta?.type !== 'brief-offer') continue;
    if (meta.chosen || meta.brought_back_from || meta.kind === 'question') return null;
    return meta.buttons.some((b) => b.action === 'plan') ? visible[i] : null;
  }
  return null;
}
