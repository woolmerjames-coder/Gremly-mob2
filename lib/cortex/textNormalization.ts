import { parseDue } from './entities/datetime';

export interface TodoFieldResult {
  title: string;
  due?: string;
  removedDue: boolean;
  inferredDue?: string;
}

export interface TodoFieldOptions {
  /**
   * When true (default), attempt to infer due date from the source text if none provided explicitly.
   */
  inferDueFromText?: boolean;
}

export function tidyWhitespace(text: string): string {
  return text
    .replace(/[\s\u00A0]+/g, ' ')
    .replace(/\s+,/g, ',')
    .replace(/\s+\./g, '.')
    .replace(/\s+\?/g, '?')
    .replace(/\s+!/g, '!')
    .replace(/\s+: /g, ': ')
    .replace(/\s+;/g, ';')
    .trim();
}

export function finalizeTitle(
  text: string,
  opts: { removeLeadingPreposition?: boolean } = {},
): string {
  let cleaned = tidyWhitespace(text);

  if (opts.removeLeadingPreposition && cleaned) {
    cleaned = cleaned.replace(/^(for|on|by|at|due)\b[, ]*/i, '').trim();
    if (/^[a-z]/.test(cleaned)) {
      cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }
  }

  return cleaned;
}

export function buildTodoFields(
  source: string,
  existingDue?: string | null,
  options: TodoFieldOptions = {},
): TodoFieldResult {
  const { inferDueFromText = true } = options;
  const parsed = parseDue(source);
  const hasParsedText = Boolean(
    parsed && parsed.textWithoutWhen && parsed.textWithoutWhen !== source,
  );
  const dueFromText =
    inferDueFromText && parsed && parsed.confidence >= 0.7 ? parsed.iso : undefined;
  const due = existingDue ?? dueFromText ?? undefined;
  const baseText = hasParsedText && parsed ? parsed.textWithoutWhen : source;
  const title = finalizeTitle(baseText || source, { removeLeadingPreposition: hasParsedText });

  return {
    title: title || 'Untitled',
    due,
    removedDue: hasParsedText,
    inferredDue: dueFromText,
  };
}

export function buildHabitFields(
  source: string,
  existingFreq?: 'daily' | 'weekly' | 'custom' | null,
): { name: string; freq: 'daily' | 'weekly' | 'custom'; removedCadence: boolean } {
  const lower = source.toLowerCase();
  let freq = existingFreq ?? null;

  if (!freq) {
    if (
      /(every|each)\s+week\b/.test(lower) ||
      /weekly\b/.test(lower) ||
      /every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/.test(lower) ||
      /\b\d+\s+times?\s+(a|per)\s+week\b/.test(lower)
    ) {
      freq = 'weekly';
    } else if (/(monthly|every\s+month)/.test(lower)) {
      freq = 'custom';
    } else if (
      /(daily|every\s+day|each\s+day|per\s+day|a\s+day|every\s+(morning|evening|night))/.test(lower)
    ) {
      freq = 'daily';
    }
  }

  if (freq && freq !== 'daily' && freq !== 'weekly' && freq !== 'custom') {
    freq = 'custom';
  }

  const parsed = parseDue(source);
  const base = parsed && parsed.textWithoutWhen ? parsed.textWithoutWhen : source;

  const cleanedBase = base
    .replace(/\b(daily)\b/gi, '')
    .replace(/\bper\s+day\b/gi, '')
    .replace(/\ba\s+day\b/gi, '')
    .replace(/\b(each|every)\s+day\b/gi, '')
    .replace(/\b(each|every)\s+(morning|evening|night)\b/gi, '')
    .trim();

  const name =
    finalizeTitle(cleanedBase || source, { removeLeadingPreposition: false }) || 'Untitled';
  const removedCadence = cleanedBase !== base;

  return {
    name,
    freq: freq ?? 'daily',
    removedCadence,
  };
}
