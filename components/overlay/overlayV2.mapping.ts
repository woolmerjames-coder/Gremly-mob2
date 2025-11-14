import type { V2State, BaseType } from './overlayV2.state';

const STOP_WORDS = new Set([
  'here',
  'near',
  'common',
  'the',
  'a',
  'an',
  'to',
  'of',
  'for',
  'with',
  'at',
  'on',
]);

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

export function sanitizeSuggestedTags(text: string, aiTags: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  const add = (tag: string | null | undefined) => {
    if (!tag) return;
    const slug = tag.trim().toLowerCase();
    if (!slug || STOP_WORDS.has(slug)) return;
    if (!ALLOWED_TAGS.has(slug)) return;
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

  for (const entry of aiTags ?? []) {
    const normalized = typeof entry === 'string' ? normalizeCandidate(entry) : null;
    add(normalized);
  }

  return result;
}

export function toCreateOrUpdateInput(baseType: BaseType, s: V2State, spaceIdProp: string | null) {
  const textForTags =
    baseType === 'log' ? s.log.body : baseType === 'todo' ? s.todo.details : s.habit.notes;
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

  const tagsMeta = {
    sticky: normalizedStickyMeta,
    tombstones: normalizedTombstonesMeta,
  };
  if (baseType === 'todo') {
    const derivedTitle = s.todo.title || s.todo.details.split(/\r?\n/)[0] || 'Untitled';
    return {
      type: 'todo' as const,
      title: derivedTitle,
      name: derivedTitle,
      details: s.todo.details || null,
      due_at: s.todo.due_at ?? s.reminderAt ?? null,
      space_id: s.spaceId ?? spaceIdProp ?? null,
      origin: 'catchall' as const,
      tags: [...tagsForSave],
      tags_meta: tagsMeta,
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
  };

  const moodPatch = sanitized.includes('journal') ? { mood: s.mood ?? 'neu' } : { mood: null };

  let fmtVal: any = null;
  if (sanitized.includes('list')) fmtVal = 'checkboxes';
  else if (s.format) fmtVal = s.format;
  const fmtPatch = fmtVal ? { fmt: fmtVal } : {};

  const datePatch = s.reminderAt ? { date: s.reminderAt } : {};

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
