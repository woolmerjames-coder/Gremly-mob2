/* Minimal, deterministic signal detection shared by Mind Drop and Chat.
   EN-only, regex-based, fast. Extend as needed in later phases. */

const ACTION_PATTERNS: RegExp[] = [
  /\b(call|email|dm|text|message|ping)\b/i,
  /\b(buy|order|purchase|pick up|pick-up|get)\b/i,
  /\b(book|schedule|reserve|arrange)\b/i,
  /\b(finish|complete|submit|send|ship|pay|renew|cancel|review)\b/i,
  /\b(remind me|remember to)\b/i,
  /\b(need to|have to|must|should|ought to|gotta|gonna)\b/i,
];

const DOW =
  /\b(mon(day)?|tue(s(day)?)?|wed(nesday)?|thu(r(s(day)?)?)?|fri(day)?|sat(urday)?|sun(day)?)\b/i;

const TIME_PATTERNS: RegExp[] = [
  /\b(today|tomorrow|tonight)\b/i,
  /\b(this|next)\s+(week|month|weekend)\b/i,
  DOW,
  // times like 3pm, 11:45 am
  /\b([01]?\d|2[0-3]):[0-5]\d\s?(am|pm)?\b/i,
  /\b([1-9]|1[0-2])\s?(am|pm)\b/i,
  // ISO-like date or MM/DD/YYYY, M/D/YY
  /\b\d{4}-\d{1,2}-\d{1,2}\b/,
  /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/,
  // textual dates like Nov 3 or 3 Nov
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}\b/i,
  /\b\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i,
];

function testAny(text: string, patterns: RegExp[]): boolean {
  const t = String(text ?? '').trim();
  if (!t) return false;
  return patterns.some((re) => re.test(t));
}

/** Does the text contain action language or imperative hints? */
export function detectActionSignal(text: string): boolean {
  return testAny(text, ACTION_PATTERNS);
}

/** Does the text contain due-date or time hints? */
export function detectTimeSignal(text: string): boolean {
  return testAny(text, TIME_PATTERNS);
}

/** Convenience wrapper: returns both action/time booleans. */
export function detectSignals(text: string): { hasActionSignal: boolean; hasTimeSignal: boolean } {
  return {
    hasActionSignal: detectActionSignal(text),
    hasTimeSignal: detectTimeSignal(text),
  };
}
