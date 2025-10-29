import { parseDue, ParsedDue } from '../../../lib/nlp/datetime/parseDue';

export interface DuePrefillResult {
  dueDate?: string; // ISO local string if high-confidence
  confidence: number;
  granularity?: ParsedDue['granularity'];
  matched?: string;
  textWithoutWhen?: string;
}

/**
 * Compute a high-confidence due date for chat prefill.
 * - Returns dueDate only when confidence > 0.9 (explicit dates/times).
 * - Otherwise returns no dueDate (UI stays unchanged).
 */
export function computeDuePrefill(userText: string, opts?: { now?: Date }): DuePrefillResult {
  const parsed = parseDue(userText, opts?.now);
  if (!parsed) {
    return { confidence: 0 };
  }

  const result: DuePrefillResult = {
    confidence: parsed.confidence,
    granularity: parsed.granularity,
    matched: parsed.matched,
    textWithoutWhen: parsed.textWithoutWhen,
  };

  if (parsed.confidence > 0.9) {
    result.dueDate = parsed.iso;
  }

  return result;
}
