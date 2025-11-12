import { parseDue } from '../../lib/cortex/entities/datetime';
import { firstLine } from '../../lib/text/firstLine';
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
  'love',
  'loves',
  'loved',
  'loving',
  'like',
  'likes',
  'liked',
  'liking',
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

const PROPER_NAME_REGEX = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;

export function sanitizeSuggestedTags(text: string, aiTags: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  const push = (tag: string | null | undefined) => {
    if (!tag) return;
    const key = tag.toLowerCase();
    if (!key) return;
    if (seen.has(key)) return;
    seen.add(key);
    result.push(tag);
  };

  const makeTopicTag = (value: string): string | null => {
    const normalized = value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    if (!normalized) return null;
    if (STOP_WORDS.has(normalized)) return null;
    if (/^\d+$/.test(normalized)) return null;
    if (normalized.length < 2) return null;
    if (normalized.length === 2 && !ALLOWED_TAGS.has(normalized)) return null;
    return `#${normalized}`;
  };

  const makeMentionTag = (value: string): string | null => {
    const collapsed = value.replace(/[^A-Za-z0-9]/g, '');
    if (!collapsed) return null;
    return `@${collapsed}`;
  };

  const properNames = new Map<string, string>();
  if (typeof text === 'string' && text) {
    let match: RegExpExecArray | null;
    const regex = new RegExp(PROPER_NAME_REGEX);
    while ((match = regex.exec(text)) !== null) {
      const candidate = match[1]?.trim();
      if (!candidate) continue;
      const normalized = candidate.toLowerCase();
      if (!normalized || STOP_WORDS.has(normalized)) continue;
      properNames.set(normalized, candidate);
    }
  }

  const consider = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;

    const prefix = trimmed[0];
    const body = trimmed.slice(1);

    if (prefix === '*') {
      const normalized = body.trim().toLowerCase();
      if (!normalized || STOP_WORDS.has(normalized)) return;
      push(`*${normalized}`);
      return;
    }

    if (prefix === '#') {
      push(makeTopicTag(body));
      return;
    }

    if (prefix === '@') {
      push(makeMentionTag(body));
      return;
    }

    const lower = trimmed.toLowerCase();
    if (STOP_WORDS.has(lower)) return;
    if (/^\d+$/.test(lower)) return;

    const synonym = matchSynonym(trimmed) || matchSynonym(lower);
    if (synonym) {
      push(makeTopicTag(synonym));
      return;
    }

    const properFromText = properNames.get(lower);
    if (properFromText) {
      push(makeMentionTag(properFromText));
      return;
    }

    if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*$/.test(trimmed)) {
      push(makeMentionTag(trimmed));
      return;
    }

    push(makeTopicTag(trimmed));
  };

  const lowerText = (text ?? '').toLowerCase();
  if (lowerText) {
    for (const rule of SYNONYM_RULES) {
      if (rule.pattern.test(lowerText)) {
        push(makeTopicTag(rule.tag));
      }
    }
  }

  for (const entry of aiTags ?? []) {
    if (typeof entry !== 'string') continue;
    consider(entry);
  }

  return result;
}

export function toCreateOrUpdateInput(baseType: BaseType, s: V2State, spaceIdProp: string | null) {
  const sanitized = sanitizeSuggestedTags('', Array.isArray(s.tags) ? s.tags : []);
  const stripPrefix = (tag: string) => tag.replace(/^[#*@]+/, '');
  const normalizedKeys = sanitized.map(stripPrefix);
  const tagsForSave =
    baseType === 'log' ? sanitized : sanitized.filter((tag) => stripPrefix(tag) !== 'journal');
  if (baseType === 'todo') {
    const rawTitle = s.todo?.title ?? '';
    const cleanTitle = rawTitle.trim();

    const payload = {
      type: 'todo' as const,
      title: cleanTitle,
      name: cleanTitle,
      details: s.todo.details || null,
      due_at: s.todo.due_at ?? s.reminderAt ?? null,
      space_id: s.spaceId ?? spaceIdProp ?? null,
      origin: 'catchall' as const,
      tags: [...tagsForSave],
    };

    const derived = (s.todo?.title || firstLine(s.todo?.details) || 'Untitled').trim();
    payload.name = payload.name || derived;
    payload.title = payload.title || derived;

    if (!payload.due_at) {
      const titleForParse = payload.title || '';
      const detailsForParse = s.todo?.details || '';
      const bodyForParse = s.log?.body || '';
      const candidate = [titleForParse, detailsForParse, bodyForParse]
        .map((segment) => (typeof segment === 'string' ? segment.trim() : ''))
        .filter((segment) => segment.length > 0)
        .join('\n');

      if (candidate.length > 0) {
        const parsed = parseDue(candidate);
        const iso = parsed?.iso ?? null;
        (s as V2State).suggestedDue = iso;
      } else {
        (s as V2State).suggestedDue = null;
      }
    } else {
      (s as V2State).suggestedDue = null;
    }

    return payload;
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
  };

  const moodPatch = normalizedKeys.includes('journal') ? { mood: s.mood ?? 'neu' } : { mood: null };

  let fmtVal: any = null;
  if (normalizedKeys.includes('list')) fmtVal = 'checkboxes';
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
