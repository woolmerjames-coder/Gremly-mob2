import type { V2State, BaseType } from './overlayV2.state';
import { TAG_STOP_WORDS } from '../../lib/tags/constants';

// Common filler words that we discard from AI tag suggestions so only meaningful tags persist.
const STOP_WORDS = TAG_STOP_WORDS;

const DEFAULT_ALLOWED_TAGS = [
  'running',
  'fitness',
  'exercise',
  'workout',
  'health',
  'wellness',
  'sleep',
  'meditation',
  'mindfulness',
  'gratitude',
  'focus',
  'planning',
  'errands',
  'shopping',
  'groceries',
  'cleaning',
  'organization',
  'work',
  'career',
  'learning',
  'study',
  'reading',
  'writing',
  'creative',
  'travel',
  'finance',
  'budget',
  'family',
  'friends',
  'relationship',
  'home',
  'self_care',
  'habit',
  'todo',
  'project',
  'review',
  'call',
  'email',
  'follow_up',
  'meeting',
  'idea',
  'list',
  'journal',
];

const envTagSources = [
  process.env.EXPO_PUBLIC_OVERLAY_TAG_TAXONOMY,
  process.env.EXPO_PUBLIC_TAG_TAXONOMY,
  process.env.EXPO_PUBLIC_ALLOWED_TAGS,
];

const envTagString = envTagSources.find(
  (value) => typeof value === 'string' && value.trim().length > 0,
);

const ENV_ALLOWED_TAGS = envTagString
  ? envTagString
      .split(/[\s,]+/)
      .map((entry: string) => entry.trim().toLowerCase())
      .filter(Boolean)
  : [];

const ALLOWED_TAGS = new Set(
  (ENV_ALLOWED_TAGS.length > 0 ? ENV_ALLOWED_TAGS : DEFAULT_ALLOWED_TAGS).map((tag: string) =>
    tag.toLowerCase(),
  ),
);

const SYNONYM_RULES: Array<{ pattern: RegExp; tag: string }> = [
  { pattern: /\b(run(?:ning)?|jog(?:ging)?|route)\b/i, tag: 'running' },
];

function coerceIsoTimestamp(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

function matchSynonym(candidate: string): string | null {
  for (const rule of SYNONYM_RULES) {
    if (rule.pattern.test(candidate)) {
      return rule.tag;
    }
  }
  return null;
}

function normalizeCandidate(raw: string): string | null {
  if (!raw) return null;
  let trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;

  if (trimmed.startsWith('#') || trimmed.startsWith('*') || trimmed.startsWith('@')) {
    return null;
  }

  trimmed = trimmed.replace(/^[#*@]+/, '');
  if (!trimmed) return null;

  if (STOP_WORDS.has(trimmed)) {
    return null;
  }

  const synonym = matchSynonym(trimmed);
  if (synonym) {
    return synonym;
  }

  const cleaned = trimmed
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;

  const cleanedSynonym = matchSynonym(cleaned);
  if (cleanedSynonym) {
    return cleanedSynonym;
  }

  if (STOP_WORDS.has(cleaned)) {
    return null;
  }

  if (ALLOWED_TAGS.has(cleaned)) {
    return cleaned;
  }

  const tokens = cleaned.split(' ');
  for (const token of tokens) {
    if (!token) continue;
    if (STOP_WORDS.has(token)) continue;
    const tokenSynonym = matchSynonym(token);
    if (tokenSynonym) {
      return tokenSynonym;
    }
    if (ALLOWED_TAGS.has(token)) {
      return token;
    }
  }

  const collapsed = cleaned.replace(/\s+/g, '_');
  if (!collapsed || STOP_WORDS.has(collapsed)) {
    return null;
  }

  if (ALLOWED_TAGS.has(collapsed)) {
    return collapsed;
  }

  return null;
}

/**
 * Booking appointment words that indicate "book" is a verb, not a tag-worthy noun.
 * Used to filter out #book tags from Mind Drop todos that start with "Book [appointment]".
 */
const BOOKING_APPOINTMENT_WORDS = new Set([
  'doctor',
  'dentist',
  'haircut',
  'flight',
  'table',
  'appointment',
  'reservation',
  'tickets',
  'ticket',
  'hotel',
  'room',
  'car',
  'massage',
  'spa',
  'consultation',
  'meeting',
  'call',
  'slot',
  'time',
]);

/**
 * Filter Mind Drop todo tags with "Book" heuristic.
 * If the text starts with "Book " followed by appointment words (doctor, dentist, etc.),
 * strip the "book" tag but keep meaningful tags like #appointment, #doctor, or weekday tags.
 *
 * Example:
 * - Text: "Book doctor appointment tomorrow"
 * - Tags: ['book', 'doctor', 'appointment', 'tomorrow']
 * - Result: ['doctor', 'appointment', 'tomorrow'] (removed 'book')
 */
export function filterMindDropTodoTags(text: string, tags: string[]): string[] {
  const textLower = text.trim().toLowerCase();

  // Check if text starts with "book " or "book a/an/the "
  const startsWithBook =
    textLower.startsWith('book ') ||
    textLower.startsWith('book a ') ||
    textLower.startsWith('book an ') ||
    textLower.startsWith('book the ');

  if (!startsWithBook) {
    return tags; // No filtering needed
  }

  // Extract the word after "book" (skip articles)
  const afterBook = textLower
    .replace(/^book\s+(a|an|the)\s+/, 'book ')
    .replace(/^book\s+/, '')
    .split(/\s+/)[0];

  // Check if it's a booking appointment word
  if (afterBook && BOOKING_APPOINTMENT_WORDS.has(afterBook)) {
    // Filter out "book" tag, keep everything else
    return tags.filter((tag) => {
      const normalized = tag
        .trim()
        .toLowerCase()
        .replace(/^[#@*]/, '');
      return normalized !== 'book';
    });
  }

  return tags; // No filtering if not an appointment booking
}

export function sanitizeSuggestedTags(text: string, aiTags: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  const add = (tag: string | null | undefined) => {
    if (!tag) return;
    const slug = tag.trim().toLowerCase();
    if (!slug) return;

    const isMention = slug.startsWith('@');
    if (isMention) {
      const mentionSubject = slug.slice(1);
      if (!mentionSubject || STOP_WORDS.has(mentionSubject)) return;
    } else {
      if (STOP_WORDS.has(slug)) return;
      if (!ALLOWED_TAGS.has(slug)) return;
    }

    if (seen.has(slug)) return;
    seen.add(slug);
    result.push(slug);
  };

  const lowerText = (text ?? '').toLowerCase();
  if (lowerText) {
    for (const rule of SYNONYM_RULES) {
      if (rule.pattern.test(lowerText)) {
        add(rule.tag);
      }
    }
  }

  const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  for (const entry of aiTags ?? []) {
    if (typeof entry !== 'string') continue;
    const raw = entry.trim();
    if (!raw) continue;

    const baseCandidate = raw
      .replace(/^[#@*]+/, '')
      .trim()
      .toLowerCase();
    if (baseCandidate) {
      const mentionPattern = new RegExp(
        `(^|[^a-z0-9_])@${escapeRegExp(baseCandidate)}($|[^a-z0-9_])`,
      );
      if (mentionPattern.test(lowerText)) {
        add(`@${baseCandidate}`);
        continue;
      }

      const namePattern = new RegExp(
        `(^|[^a-z0-9_])${escapeRegExp(baseCandidate)}($|[^a-z0-9_])`,
        'i',
      );
      if (namePattern.test(text)) {
        const matches = text
          ? (text.match(new RegExp(`\\b${escapeRegExp(baseCandidate)}\\b`, 'gi')) ?? [])
          : [];
        const hasProperCasing = matches.some(
          (token) => token && token[0] === token[0].toUpperCase(),
        );
        const tagIsLikelyPerson =
          raw.startsWith('#') || raw.startsWith('@') || !ALLOWED_TAGS.has(baseCandidate);
        if (hasProperCasing && tagIsLikelyPerson) {
          // console.debug('[sanitizeSuggestedTags] promoting person mention', { raw, baseCandidate, text });
          add(`@${baseCandidate}`);
          continue;
        }
      }
    }

    const normalized = normalizeCandidate(raw);
    add(normalized);
  }

  return result;
}

export function toCreateOrUpdateInput(
  baseType: BaseType,
  s: V2State,
  spaceIdProp: string | null,
  existingEntity?: any,
) {
  const textForTags = (() => {
    const logText = `${s.log.title ?? ''}\n${s.log.body ?? ''}`;
    if (baseType === 'log') return logText;

    if (baseType === 'todo') {
      const todoDetails = s.todo.details || s.log.body || '';
      return `${s.todo.title ?? ''}\n${todoDetails}`;
    }

    return `${s.habit.title ?? ''}\n${s.habit.notes ?? ''}`;
  })();
  const normalizeMetaValues = (values: string[] | undefined | null): string[] => {
    if (!Array.isArray(values)) return [];
    const normalized = values
      .map((value) => (typeof value === 'string' ? value.trim().toLowerCase() : ''))
      .filter(Boolean);
    return Array.from(new Set(normalized));
  };
  const normalizedStickyMeta = normalizeMetaValues(s.stickyTags);
  const normalizedTombstonesMeta = normalizeMetaValues(s.tagTombstones);

  const manualStickyKeys = normalizedStickyMeta
    .map((value) => {
      if (!value) return null;
      if (value.startsWith('#') || value.startsWith('@') || value.startsWith('*')) {
        const stripped = value.replace(/^[#@*]+/, '');
        return stripped || null;
      }
      return value;
    })
    .filter((value): value is string => !!value);

  const sanitized = sanitizeSuggestedTags(textForTags ?? '', Array.isArray(s.tags) ? s.tags : []);
  const combined = new Map<string, string>();
  sanitized.forEach((tag) => {
    const key = tag.toLowerCase();
    if (!combined.has(key)) combined.set(key, tag);
  });
  manualStickyKeys.forEach((tag) => {
    const key = tag.toLowerCase();
    if (!combined.has(key)) combined.set(key, tag);
  });

  const combinedTags = Array.from(combined.values());
  const tagsForSave =
    baseType === 'log'
      ? combinedTags
      : combinedTags.filter((tag) => {
          const normalized = tag.startsWith('#') ? tag.slice(1) : tag;
          return normalized !== 'journal';
        });

  // Preserve existing views and tags_meta if available
  const preservedViews = existingEntity?.views ?? {};
  const existingTagsMeta = existingEntity?.tags_meta ?? { sticky: [], tombstones: [] };

  // Only override tags_meta if we have new sticky/tombstone data, otherwise preserve existing
  const tagsMeta = {
    sticky:
      normalizedStickyMeta.length > 0 ? normalizedStickyMeta : (existingTagsMeta.sticky ?? []),
    tombstones:
      normalizedTombstonesMeta.length > 0
        ? normalizedTombstonesMeta
        : (existingTagsMeta.tombstones ?? []),
  };

  if (baseType === 'todo') {
    const derivedTitle = s.todo.title || s.todo.details.split(/\r?\n/)[0] || 'Untitled';
    const dueAt = coerceIsoTimestamp(s.todo.due_at) ?? coerceIsoTimestamp(s.reminderAt);
    return {
      type: 'todo' as const,
      title: derivedTitle,
      name: derivedTitle,
      details: s.todo.details || null,
      due_at: dueAt,
      space_id: s.spaceId ?? spaceIdProp ?? null,
      origin: 'catchall' as const,
      tags: [...tagsForSave],
      tags_meta: tagsMeta,
      views: preservedViews,
    };
  }
  if (baseType === 'habit') {
    return {
      type: 'habit' as const,
      title: s.habit.title || s.habit.notes.split(/\r?\n/)[0] || 'Untitled',
      notes: s.habit.notes || null,
      frequency: s.habit.schedule ?? 'custom',
      space_id: s.spaceId ?? spaceIdProp ?? null,
      origin: 'catchall' as const,
      tags: [...tagsForSave],
      tags_meta: tagsMeta,
      views: preservedViews,
    };
  }

  // note
  const base: any = {
    type: 'note' as const,
    subtype: 'catchall' as const,
    title: s.log.title || s.log.body.split(/\r?\n/)[0] || 'Untitled note',
    body: s.log.body,
    space_id: s.spaceId ?? spaceIdProp ?? null,
    origin: 'catchall' as const,
    tags: [...tagsForSave],
    tags_meta: tagsMeta,
    views: preservedViews,
  };

  const moodPatch = sanitized.includes('journal') ? { mood: s.mood ?? 'neu' } : { mood: null };

  let fmtVal: any = null;
  if (sanitized.includes('list')) fmtVal = 'checkboxes';
  else if (s.format) fmtVal = s.format;
  const fmtPatch = fmtVal ? { fmt: fmtVal } : {};

  const reminderIso = coerceIsoTimestamp(s.reminderAt);
  const datePatch = reminderIso ? { date: reminderIso } : {};

  return { ...base, ...moodPatch, ...fmtPatch, ...datePatch };
}

export async function linkSelectedPerson(repo: any, entityId?: string, personId?: string) {
  if (!entityId || !personId) return;
  const linkFn =
    (repo as any).linkPersonToEntity ??
    (repo as any).entities?.linkPerson ??
    (repo as any).people?.linkToEntity;
  if (typeof linkFn === 'function') {
    await linkFn.call(repo, { entityId, personId });
  }
}
