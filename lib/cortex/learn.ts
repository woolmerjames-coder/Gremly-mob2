/**
 * Phase 10.6: Pure learning from events.
 * Input: recent events for a user, current prefs snapshot
 * Output: merged preferences delta + updated checkpoint timestamp
 *
 * Rules (simple, explainable):
 * - If we see repeated "user_override" or "moved_to_space" type signals containing keywords in the text,
 *   we strengthen a keyword→space mapping in prefs.routing_keywords.
 * - If we see the user often accepts auto-sorts in a space, we lightly bias tone to 'direct';
 *   if they often undo or override, bias tone to 'warm'.
 */

export type LeanEvent = {
  id: string;
  user_id: string;
  kind: string; // 'cortex_decision' | 'user_override' | ...
  payload_json: Record<string, any>;
  created_at: string;
};

export type CortexPreferences = {
  user_id: string;
  tone?: 'calm' | 'warm' | 'direct';
  routing_keywords?: Record<string, string[]>; // spaceKey -> keywords[]
  last_learned_at?: string | null;
  // other fields ignored here
};

export type LearnResult = {
  mergedPrefs: Partial<CortexPreferences>;
  learnedAt: string; // ISO timestamp used for last_learned_at
  debug?: Record<string, any>;
};

// very small tokenizer; split words, strip punctuation, lowercase
function tokenize(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

// de-dup & cap list length to avoid runaway prefs
function mergeKeywordList(existing: string[] = [], incoming: string[], cap = 24): string[] {
  const set = new Set<string>(existing);
  for (const kw of incoming) set.add(kw);
  return Array.from(set).slice(0, cap);
}

import { nowTimestamp } from '../date/DateService';

export function learnFromEvents(
  events: LeanEvent[],
  current: CortexPreferences,
): LearnResult {
  const learnedAt = nowTimestamp();
  const routing: Record<string, string[]> = { ...(current.routing_keywords || {}) };

  let acceptCount = 0;
  let overrideCount = 0;

  for (const ev of events) {
    const p = ev.payload_json || {};
    // 1) Keyword→Space inference
    //   Signals:
    //    - kind = 'user_override' with { toSpace: 'Work', text: '...' }
    //    - kind = 'cortex_decision' with { accepted:true, spaceId/name, text }
    const text: string = String(p.text || p.note || '');
    const toks = tokenize(text).filter((w) => w.length >= 3 && w.length <= 18);
    const topFew = toks.slice(0, 5); // simple, safe cap

    const spaceName: string | undefined = p.toSpaceName || p.spaceName || p.space || undefined;

    if (spaceName && topFew.length) {
      const key = spaceName.toLowerCase();
      routing[key] = mergeKeywordList(routing[key], topFew);
    }

    // 2) Tone nudging signals
    if (ev.kind === 'cortex_decision') {
      if (p.accepted === true) acceptCount++;
      if (p.accepted === false || p.userOverrode === true) overrideCount++;
    }
  }

  // Decide tone tweak (very light)
  let newTone: CortexPreferences['tone'] | undefined = current.tone;
  if (acceptCount + overrideCount >= 6) {
    if (acceptCount >= overrideCount * 1.5) newTone = 'direct';
    else if (overrideCount >= acceptCount * 1.5) newTone = 'warm';
    // else leave tone unchanged (or calm if none)
  }

  const mergedPrefs: Partial<CortexPreferences> = {
    routing_keywords: routing,
  };
  if (newTone && newTone !== current.tone) mergedPrefs.tone = newTone;

  return { mergedPrefs, learnedAt, debug: { acceptCount, overrideCount } };
}
