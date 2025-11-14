import type { LogSubtype } from '../types';
import { TAG_STOP_WORDS } from './constants';

const STAR_TAGS = ['*journal', '*list', '*meeting', '*idea'] as const;

const STAR_TAG_SUBTYPE: Record<(typeof STAR_TAGS)[number], LogSubtype> = {
  '*journal': 'journal',
  '*list': 'list',
  '*meeting': 'list',
  '*idea': 'idea',
};

const INVALID_STAR_MESSAGE = 'Use one of *journal, *list, *meeting, or *idea.';

export type NormalizeResult = {
  tag: string | null;
  error?: string;
};

export function allowedTypeTags(): string[] {
  return [...STAR_TAGS];
}

function sanitizeHashtagBody(body: string): string | null {
  const normalized = body
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '');

  if (!normalized) {
    return null;
  }

  return `#${normalized}`;
}

function sanitizeStarTag(body: string): NormalizeResult {
  const normalized = body
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');

  if (!normalized) {
    return { tag: null };
  }

  const candidate = `*${normalized}` as (typeof STAR_TAGS)[number] | string;

  if (!STAR_TAG_SUBTYPE[candidate as (typeof STAR_TAGS)[number]]) {
    return { tag: null, error: INVALID_STAR_MESSAGE };
  }

  return { tag: candidate };
}

function sanitizeMentionBody(body: string): string | null {
  const trimmed = body.trim();
  if (!trimmed) {
    return null;
  }

  const collapsed = trimmed.replace(/\s+/g, '');
  if (!collapsed) {
    return null;
  }

  return `@${collapsed}`;
}

export function normalizeTag(rawInput: string): NormalizeResult {
  const trimmed = rawInput.trim();

  if (!trimmed) {
    return { tag: null };
  }

  const prefix = trimmed[0];
  const body = trimmed.slice(1);

  if (prefix === '#') {
    return { tag: sanitizeHashtagBody(body) };
  }

  if (prefix === '*') {
    return sanitizeStarTag(body);
  }

  if (prefix === '@') {
    return { tag: sanitizeMentionBody(body) };
  }

  return { tag: sanitizeHashtagBody(trimmed) };
}

function getDedupeKey(tag: string): string {
  if (!tag) {
    return '';
  }

  if (tag.startsWith('*')) {
    return 'star';
  }

  if (tag.startsWith('#')) {
    return `#${tag.slice(1).toLowerCase()}`;
  }

  if (tag.startsWith('@')) {
    return `@${tag.slice(1).toLowerCase()}`;
  }

  return tag.toLowerCase();
}

export function normalizeTags(input: string[]): string[] {
  const dedupe = new Map<string, string>();

  for (const raw of input) {
    if (!raw) continue;

    const { tag } = normalizeTag(raw);
    if (!tag) continue;

    if (tag.startsWith('*')) {
      dedupe.delete('star');
      dedupe.set('star', tag);
      continue;
    }

    const key = getDedupeKey(tag);
    if (dedupe.has(key)) {
      continue;
    }

    dedupe.set(key, tag);
  }

  return Array.from(dedupe.values());
}

function toJunkKey(tag: string): string {
  return tag
    .replace(/^[#@*]+/, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isJunkNormalizedTag(tag: string): boolean {
  if (!tag) return true;
  if (tag.startsWith('*')) return false;

  const key = toJunkKey(tag);
  if (!key) return true;
  if (TAG_STOP_WORDS.has(key)) return true;

  const tokens = key.split(' ').filter(Boolean);
  if (tokens.length === 0) return true;
  if (tokens.some((token) => !TAG_STOP_WORDS.has(token))) {
    return false;
  }

  return true;
}

export function filterAndNormalizeTags(input: string[]): string[] {
  if (!Array.isArray(input)) return [];

  const mentions = new Map<string, string>();
  const collected: string[] = [];

  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;

    const { tag } = normalizeTag(trimmed);
    if (!tag) continue;
    if (isJunkNormalizedTag(tag)) continue;

    if (tag.startsWith('@')) {
      const base = tag.slice(1).toLowerCase();
      if (!base) continue;
      mentions.set(base, tag);
      continue;
    }

    collected.push(tag);
  }

  const filtered = [
    ...mentions.values(),
    ...collected.filter((tag) => {
      if (tag.startsWith('#')) {
        const base = tag.slice(1).toLowerCase();
        return base ? !mentions.has(base) : false;
      }

      if (tag.startsWith('@')) {
        const base = tag.slice(1).toLowerCase();
        return base ? mentions.get(base) === tag : false;
      }

      return true;
    }),
  ];

  return normalizeTags(filtered);
}

export function addTag(current: string[], next: string): string[] {
  return normalizeTags([...current, next]);
}

export function removeTag(current: string[], target: string): string[] {
  const keyToRemove = getDedupeKey(target);
  return normalizeTags(current.filter((tag) => getDedupeKey(tag) !== keyToRemove));
}

export function getTagIdentifier(tag: string): string {
  return getDedupeKey(tag);
}

export function recordRemovedTags(
  removed: Set<string>,
  previous: string[] | null | undefined,
  next: string[] | null | undefined,
): string[] {
  const prevNormalized = normalizeTags(previous ?? []);
  const nextNormalized = normalizeTags(next ?? []);

  const toKey = (value: string) => value.toLowerCase();
  const nextKeys = new Set(nextNormalized.map((tag) => toKey(tag)));

  for (const tag of prevNormalized) {
    const key = toKey(tag);
    if (!nextKeys.has(key)) {
      removed.add(key);
    }
  }

  for (const tag of nextNormalized) {
    removed.delete(toKey(tag));
  }

  return nextNormalized;
}

export function deriveLogSubtypeFromTags(tags?: string[]): LogSubtype {
  const normalized = normalizeTags(tags ?? []);
  const starTag = normalized.find((tag) => tag.startsWith('*')) as
    | (typeof STAR_TAGS)[number]
    | undefined;

  if (!starTag) {
    return 'everything_else';
  }

  return STAR_TAG_SUBTYPE[starTag] ?? 'everything_else';
}
