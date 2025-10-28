import { parseDue } from '../../../lib/cortex/entities/datetime';

export interface DuePrefillResult {
  dueDate?: string; // ISO local string if high-confidence
  confidence: number;
  explain: string;
}

/**
 * Compute a high-confidence due date for chat prefill.
 * - Returns dueDate only when confidence >= 0.9 (explicit dates/times).
 * - Otherwise returns no dueDate (UI stays unchanged).
 */
export function computeDuePrefill(userText: string, opts?: { now?: Date }): DuePrefillResult {
  const parsed = parseDue(userText, { now: opts?.now });
  if (parsed.iso && parsed.confidence >= 0.9) {
    return { dueDate: parsed.iso, confidence: parsed.confidence, explain: parsed.explain };
  }
  return { confidence: parsed.confidence, explain: parsed.explain };
}
