import type { CortexInput, CortexOutput, ICortexEngine } from './ICortexEngine';
import { callChat, callClassify, type ChatMessage } from '../lib/cortex/CortexClient';
import { normalizeTag, normalizeTags } from '../lib/tags/normalize';
import { heuristicEngine } from './heuristicEngine';

interface OpenAiEngineConfig {
  apiKey: string; // Kept for backward compatibility but no longer used
  model: string;
  timeoutMs: number;
  baseUrl?: string; // Kept for backward compatibility but no longer used
}

interface RawClassification {
  type?: string;
  subtype?: string;
  aiPlaced?: boolean;
  whyString?: string;
  frequency?: string;
  undefinedDue?: boolean;
  tags?: string[] | null;
}

type ExternalClassification = Partial<RawClassification> & { category?: unknown };

const TODO_KEYWORDS = new Set([
  'todo',
  'task',
  'action',
  'reminder',
  'appointment',
  'schedule',
  'event',
  'followup',
]);

const HABIT_KEYWORDS = new Set(['habit', 'routine', 'practice']);

const NOTE_KEYWORDS = new Set([
  'note',
  'notes',
  'list',
  'ideas',
  'idea',
  'brainstorm',
  'wishlist',
  'packinglist',
  'itinerary',
]);

function normalizeCategoryToType(value: unknown): 'todo' | 'habit' | 'note' {
  const raw = (typeof value === 'string' ? value : String(value ?? '')).toLowerCase();
  const norm = raw.replace(/[^a-z]/g, '');
  if (TODO_KEYWORDS.has(norm)) return 'todo';
  if (HABIT_KEYWORDS.has(norm)) return 'habit';
  if (NOTE_KEYWORDS.has(norm)) return 'note';
  return 'note';
}

function isNonActionIdeasNote(text: string): boolean {
  const t = (text || '').toLowerCase().trim();
  return (
    /\bideas?\b/.test(t) ||
    /\bbrainstorm\b/.test(t) ||
    /\bwish\s*list\b/.test(t) ||
    /\bwishlist\b/.test(t) ||
    /\bpacking\s*list\b/.test(t) ||
    (/\blist\b/.test(t) && !/\bchecklist\b/.test(t)) ||
    /\bitinerary\b/.test(t) ||
    (/\bplan\b/.test(t) &&
      !/(?:\bplan a call|\bplan to call|\bplan to email|\bplan to book)/.test(t))
  );
}

function normalizeExternal(raw: unknown): RawClassification {
  const source: ExternalClassification =
    raw && typeof raw === 'object' ? (raw as ExternalClassification) : {};

  const result: RawClassification = { ...source };

  const incomingType = source.type ?? source.category;
  result.type = normalizeCategoryToType(incomingType);

  const st = typeof source.subtype === 'string' ? source.subtype.toLowerCase() : '';
  if (st === 'appointment' && result.type !== 'habit') {
    result.type = 'todo';
    result.subtype = 'catchall';
  }

  const frequencyRaw = typeof source.frequency === 'string' ? source.frequency.toLowerCase() : '';
  if (result.type === 'habit') {
    result.frequency =
      frequencyRaw === 'weekly' ? 'weekly' : frequencyRaw === 'monthly' ? 'monthly' : 'daily';
  }

  if (typeof source.undefinedDue === 'string') {
    result.undefinedDue = false;
  } else if (typeof source.undefinedDue === 'boolean') {
    result.undefinedDue = source.undefinedDue;
  } else if (result.type === 'todo') {
    result.undefinedDue = true;
  }

  if (typeof result.whyString !== 'string' || !result.whyString.trim()) {
    result.whyString = 'Auto-classified by LLM';
  }

  if (Array.isArray(source.tags)) {
    result.tags = source.tags.filter((tag): tag is string => typeof tag === 'string');
  }

  return result;
}

const TYPE_TAG_PRIORITY: Array<'*journal' | '*list' | '*meeting' | '*idea'> = [
  '*journal',
  '*list',
  '*meeting',
  '*idea',
];

const TYPE_TAG_SET = new Set(TYPE_TAG_PRIORITY);

function coerceTypeTag(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('*')) {
    const { tag } = normalizeTag(trimmed);
    return tag && TYPE_TAG_SET.has(tag as (typeof TYPE_TAG_PRIORITY)[number]) ? tag : null;
  }

  const collapsed = trimmed.toLowerCase().replace(/[^a-z]/g, '');
  if (!collapsed) return null;
  const candidate = `*${collapsed}` as (typeof TYPE_TAG_PRIORITY)[number] | string;
  return TYPE_TAG_SET.has(candidate as (typeof TYPE_TAG_PRIORITY)[number]) ? candidate : null;
}

function sanitizeTags(rawTags: RawClassification['tags']): string[] {
  if (!Array.isArray(rawTags)) return [];

  const mentions: string[] = [];
  const topics: string[] = [];
  let chosenType: string | null = null;
  let chosenPriority = TYPE_TAG_PRIORITY.length;

  for (const value of rawTags) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;

    const coercedType = coerceTypeTag(trimmed);
    if (coercedType) {
      const priority = TYPE_TAG_PRIORITY.indexOf(coercedType as (typeof TYPE_TAG_PRIORITY)[number]);
      if (priority !== -1 && priority < chosenPriority) {
        chosenType = coercedType;
        chosenPriority = priority;
      }
      continue;
    }

    const { tag } = normalizeTag(trimmed);
    if (!tag) continue;

    if (tag.startsWith('@')) {
      if (!mentions.includes(tag)) mentions.push(tag);
      continue;
    }

    if (tag.startsWith('*')) {
      const priority = TYPE_TAG_PRIORITY.indexOf(tag as (typeof TYPE_TAG_PRIORITY)[number]);
      if (priority !== -1 && priority < chosenPriority) {
        chosenType = tag;
        chosenPriority = priority;
      }
      continue;
    }

    topics.push(tag);
  }

  return normalizeTags([...mentions, ...(chosenType ? [chosenType] : []), ...topics]);
}

function extractExplicitDateTag(text: string): string | null {
  const isoMatch = text.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (isoMatch) {
    const [, year, monthRaw, dayRaw] = isoMatch;
    const month = monthRaw.padStart(2, '0');
    const day = dayRaw.padStart(2, '0');
    return `#${year}-${month}-${day}`;
  }

  const monthMatch = text.match(
    /(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{2,4}))?/i,
  );
  if (monthMatch) {
    const [, monthRaw, dayRaw, yearRaw] = monthMatch;
    if (!yearRaw) return null;

    const monthKey = monthRaw.toLowerCase();
    const monthIndex = [
      'january',
      'february',
      'march',
      'april',
      'may',
      'june',
      'july',
      'august',
      'september',
      'october',
      'november',
      'december',
    ].findIndex((name) => name.startsWith(monthKey));

    if (monthIndex === -1) return null;

    const day = dayRaw.padStart(2, '0');
    let year = yearRaw.trim();
    if (year.length === 2) {
      year = Number(year) < 50 ? `20${year}` : `19${year}`;
    }
    if (!/\d{4}/.test(year)) return null;

    const month = String(monthIndex + 1).padStart(2, '0');
    return `#${year}-${month}-${day}`;
  }

  return null;
}

const EMOTION_WORDS = [
  'anxious',
  'grateful',
  'excited',
  'overwhelmed',
  'calm',
  'stressed',
] as const;
const PERSON_DISALLOWED = new Set([
  'Call',
  'Email',
  'Schedule',
  'Book',
  'Plan',
  'Meet',
  'Send',
  'Pay',
  'Pick',
  'Follow',
  'Check',
  'Draft',
  'Review',
  'Remind',
  'Tell',
  'Ask',
  'Bring',
  'Buy',
  'Organize',
  'Write',
  'Prepare',
  'Feeling',
  'Planning',
  'Thinking',
  'Working',
  'Starting',
  ...EMOTION_WORDS.map((word) => word.charAt(0).toUpperCase() + word.slice(1)),
]);
const PERSON_ALLOWED_SINGLE = new Set([
  'Mom',
  'Dad',
  'Grandma',
  'Grandpa',
  'Granddad',
  'Grandad',
  'Brother',
  'Sister',
  'Coach',
  'Boss',
  'Partner',
  'Therapist',
  'Doctor',
]);
const PERSON_BLOCK_VERBS = new Set(['feeling', 'planning', 'thinking', 'working', 'starting']);
const REFLECTION_PATTERNS = ['i feel', 'i think', 'reflection', 'felt ', 'feeling '] as const;
const IDEA_PATTERNS = ['idea:', 'what if', 'could we', 'maybe we'] as const;
const LIST_LINE_REGEX = /^\s*(?:[-*]|\d+[.)])\s+/;
const STOPWORDS = new Set([
  'the',
  'and',
  'or',
  'for',
  'with',
  'this',
  'that',
  'have',
  'today',
  'to',
  'a',
  'an',
  'i',
  'we',
  'you',
  'your',
  'about',
  'just',
  'very',
  'really',
  'maybe',
  'get',
  'got',
  'it',
]);

export function buildFallbackTags(
  text: string,
  type: 'habit' | 'todo' | 'note',
  subtype?: string,
): string[] {
  if (!text?.trim()) return [];

  const tags: string[] = [];
  const lower = text.toLowerCase();
  const lines = text.split(/\r?\n/);
  const words = text.split(/[^A-Za-z]+/).filter(Boolean);

  if (type === 'note') {
    const journalHint =
      subtype === 'journal' || REFLECTION_PATTERNS.some((pattern) => lower.includes(pattern));
    if (journalHint) {
      tags.push('*journal');
      for (const emotion of EMOTION_WORDS) {
        if (lower.includes(emotion)) {
          tags.push(`#${emotion}`);
        }
      }
    }

    if (IDEA_PATTERNS.some((pattern) => lower.includes(pattern))) {
      tags.push('*idea');
    }

    if (lines.some((line) => LIST_LINE_REGEX.test(line))) {
      tags.push('*list');
    }
  }

  const people = new Set<string>();
  const doctorMatches = text.match(/Dr\.?\s+[A-Z][a-z]+/g) ?? [];
  for (const match of doctorMatches) {
    if (people.size >= 2) break;
    const collapsed = match.replace(/\s+/g, '');
    const body = collapsed.replace(/^Dr\.?/, 'Dr').replace(/[^A-Za-z]/g, '');
    if (body) {
      people.add(`@${body}`);
    }
  }

  const tokens = text.split(/\s+/);
  const capitalizeRegex = /^[A-Z][a-z]{2,}$/;
  for (let i = 0; i < tokens.length && people.size < 2; i += 1) {
    const current = tokens[i].replace(/[^A-Za-z]/g, '');
    if (!current) continue;
    if (!capitalizeRegex.test(current)) continue;

    const currentLower = current.toLowerCase();
    if (PERSON_BLOCK_VERBS.has(currentLower)) continue;
    if (PERSON_DISALLOWED.has(current)) continue;
    if (EMOTION_WORDS.includes(currentLower as (typeof EMOTION_WORDS)[number])) continue;
    if (
      i === 0 &&
      (PERSON_BLOCK_VERBS.has(currentLower) ||
        PERSON_DISALLOWED.has(current) ||
        EMOTION_WORDS.includes(currentLower as (typeof EMOTION_WORDS)[number]))
    ) {
      continue;
    }

    const nextToken = tokens[i + 1]?.replace(/[^A-Za-z]/g, '') ?? null;
    const nextLower = nextToken ? nextToken.toLowerCase() : null;
    const nextIsCapitalized = nextToken ? capitalizeRegex.test(nextToken) : false;

    if (
      nextIsCapitalized &&
      nextToken &&
      !PERSON_DISALLOWED.has(nextToken) &&
      !(nextLower && PERSON_BLOCK_VERBS.has(nextLower))
    ) {
      const combined = `${current}${nextToken}`;
      people.add(`@${combined}`);
      i += 1;
      continue;
    }

    if (PERSON_ALLOWED_SINGLE.has(current)) {
      people.add(`@${current}`);
    }
  }

  tags.push(...people);

  const frequencyMap = new Map<string, number>();
  for (const word of words) {
    const lowerWord = word.toLowerCase();
    if (lowerWord.length < 3) continue;
    if (STOPWORDS.has(lowerWord)) continue;
    if (/^[A-Z]/.test(word) && people.has(`@${word}`)) continue;
    frequencyMap.set(lowerWord, (frequencyMap.get(lowerWord) ?? 0) + 1);
  }

  const dateTag = extractExplicitDateTag(text);
  if (dateTag) {
    tags.push(dateTag);
  }

  const sortedTopics = Array.from(frequencyMap.entries())
    .sort((a, b) => {
      const freqDiff = b[1] - a[1];
      if (freqDiff !== 0) return freqDiff;
      return a[0].localeCompare(b[0]);
    })
    .slice(0, 3)
    .map(([word]) => word);

  for (const word of sortedTopics) {
    const normalized = `#${word.replace(/\s+/g, '_')}`;
    tags.push(normalized);
  }

  const normalized = normalizeTags(tags);
  const typeTagPrecedence = ['*journal', '*idea', '*list', '*meeting'] as const;
  const chosenTypeTag = typeTagPrecedence.find((tag) => normalized.includes(tag)) ?? null;
  const filtered = chosenTypeTag
    ? normalized.filter((tag) => !tag.startsWith('*') || tag === chosenTypeTag)
    : normalized.filter((tag, index) => normalized.indexOf(tag) === index);

  return filtered;
}

function clamp01(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
}

const SYSTEM_PROMPT = `
You are Gremly's classification engine. Output ONLY a single JSON object, nothing else. Do not greet or explain.
Analyze the user's text and decide if it should be a habit, todo, or note for the Mind Drop system.

Schema:
{
  "type": "habit|todo|note",
  "subtype": "journal|list|idea|catchall",
  "aiPlaced": boolean,
  "whyString": string,
  "frequency": "daily|weekly|monthly",
  "undefinedDue": boolean,
  "tags": string[]
}

Rules:
- Never include any text outside the single JSON object (no greetings, no code fences).
- Map synonyms to our schema:
  - todo: "todo","to-do","to do","task","action","reminder","appointment","schedule","event","followup","follow-up"
  - habit: "habit","routine","practice"
  - note: "note","journal","thought","idea","list"
- If "appointment" or "schedule" is implied, treat as todo (subtype => "catchall").
- If the text has multiple lines that start with list markers ('-', '*', numbers like '1)', or checkbox '- [ ]'), classify as note.list.
- If the text begins with "Idea:" or includes ideation phrases ("what if", "we could", "maybe we", "I have an idea", "could we"), classify as note.idea unless it is a direct question ending with '?'.
- For type="habit", frequency must be one of: "daily","weekly","monthly" (default "daily" if unclear).
- For type="todo", set "undefinedDue": true unless an explicit non-today due date is provided elsewhere (you must NOT schedule for today).
- For type="note", subtype must be "journal","list", "idea", or "catchall" (default "catchall" when uncertain).
- Always provide a concise "whyString" that explains the classification logic.
- aiPlaced=true for "todo" and "habit"; aiPlaced=false for "note" when subtype="catchall".
- Always return "tags" as an array of strings (use [] if none apply).

Tag Rules:
- People tags use the @ prefix (example: "@Mom"). Preserve name casing and drop spaces.
- Include exactly one type tag with the * prefix from this set: "*journal","*list","*meeting","*idea" when applicable.
- Topic/emotion/date tags use the # prefix, lowercase, and replace spaces with underscores. Aim for 2-3 solid topic tags when possible.
- Add emotion #tags only for journal-style reflections.
- Add a #date_YYYY-MM-DD tag when a concrete date is mentioned.
`;

function normaliseToCortexOutput(raw: RawClassification): CortexOutput {
  const tags = sanitizeTags(raw.tags);
  const aiPlaced =
    raw.aiPlaced !== undefined ? !!raw.aiPlaced : raw.type !== 'note' || raw.subtype !== 'catchall';
  const whyString = raw.whyString?.trim() || 'No rationale provided.';

  if (raw.type === 'habit') {
    const freq = (raw.frequency || 'daily').toLowerCase();
    type HabitFrequency = Extract<CortexOutput, { type: 'habit' }>['frequency'];
    const frequency: HabitFrequency =
      freq === 'weekly' ? 'weekly' : freq === 'monthly' ? 'monthly' : 'daily';
    return { type: 'habit', frequency, aiPlaced, whyString, tags };
  }

  if (raw.type === 'todo') {
    const undefinedDue = raw.undefinedDue !== undefined ? !!raw.undefinedDue : true;
    return { type: 'todo', undefinedDue, aiPlaced, whyString, tags };
  }

  const subtype =
    raw.subtype === 'journal' || raw.subtype === 'list' || raw.subtype === 'idea'
      ? raw.subtype
      : 'catchall';
  return {
    type: 'note',
    subtype,
    aiPlaced: subtype === 'catchall' ? false : aiPlaced,
    whyString,
    tags,
  };
}

function readMessageContent(content: unknown): string | null {
  if (!content) return null;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((chunk) => {
        if (typeof chunk === 'string') return chunk;
        if (
          chunk &&
          typeof chunk === 'object' &&
          'text' in chunk &&
          typeof chunk.text === 'string'
        ) {
          return chunk.text;
        }
        return '';
      })
      .join('');
  }
  if (typeof content === 'object' && 'text' in (content as { text?: unknown })) {
    const maybeText = (content as { text?: unknown }).text;
    return typeof maybeText === 'string' ? maybeText : null;
  }
  return null;
}

function extractFirstJson(text: string): unknown | null {
  if (!text) return null;
  const fencedMatch = text.match(/```json([\s\S]*?)```/i);
  const fenced = fencedMatch ? fencedMatch[1] : text;
  const objMatch = fenced.match(/\{[\s\S]*\}/);
  if (!objMatch) return null;
  try {
    return JSON.parse(objMatch[0]);
  } catch {
    return null;
  }
}

export class OpenAiEngine implements ICortexEngine {
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor({ model, timeoutMs }: OpenAiEngineConfig) {
    // NOTE: No longer stores API key - uses secure proxy via CortexClient
    this.model = model;
    this.timeoutMs = timeoutMs;
  }

  async classify({ text }: CortexInput): Promise<CortexOutput> {
    const DEBUG =
      String(process.env.EXPO_PUBLIC_DEBUG_CORTEX ?? 'false').toLowerCase() === 'true' ||
      String(process.env.EXPO_PUBLIC_DEBUG_CORTEX ?? '').toLowerCase() === 'on';

    if (DEBUG) console.log('[CORTEX][LLM] classify input:', { textLen: (text || '').length });

    try {
      const classifyRes = await callClassify({
        text,
        model: this.model,
        timeoutMs: this.timeoutMs,
      });
      if (classifyRes.ok) {
        const c = classifyRes.classification;
        if (DEBUG) console.log('[CORTEX][LLM] classify route raw category:', c.category);

        const normalized = normalizeExternal({
          category: c.category,
          whyString: `Proxy classify: ${c.category} (${Math.round((c.confidence ?? 0) * 100)}%)`,
        });

        let out = normaliseToCortexOutput(normalized) as CortexOutput & { confidence?: number };
        if (!out.tags || out.tags.length === 0) {
          out.tags = buildFallbackTags(
            text,
            out.type,
            out.type === 'note' ? out.subtype : undefined,
          );
        }
        if (isNonActionIdeasNote(text) && out.type === 'todo') {
          if (DEBUG) console.log('[CORTEX][LLM] safety override → note.list for ideas input');
          out = {
            type: 'note',
            subtype: 'list',
            aiPlaced: true,
            whyString: 'Ideas/list capture',
            tags: [],
          } as CortexOutput & { confidence?: number };
          if (!out.tags || out.tags.length === 0) {
            out.tags = buildFallbackTags(
              text,
              out.type,
              out.type === 'note' ? out.subtype : undefined,
            );
          }
        }
        out.confidence = clamp01(c?.confidence ?? 0);
        if (DEBUG) console.log('[CORTEX][LLM] classify route mapped:', out);
        return out;
      }
      if (DEBUG) console.warn('[CORTEX][LLM] classify route failed:', classifyRes.error);
    } catch (err) {
      if (DEBUG) console.warn('[CORTEX][LLM] classify route exception:', String(err));
    }

    try {
      if (DEBUG) console.log('[CORTEX][LLM] model:', this.model);

      const fewShots: ChatMessage[] = [
        {
          role: 'user',
          content: 'Call mom about trip',
        },
        {
          role: 'assistant',
          content: JSON.stringify({
            type: 'todo',
            subtype: 'catchall',
            aiPlaced: true,
            whyString: 'Actionable reminder directed at a specific person.',
            frequency: 'daily',
            undefinedDue: true,
            tags: ['@Mom', '#family', '#trip'],
          }),
        },
        {
          role: 'user',
          content: 'Feeling anxious today',
        },
        {
          role: 'assistant',
          content: JSON.stringify({
            type: 'note',
            subtype: 'journal',
            aiPlaced: true,
            whyString: 'Reflective emotional log with no action.',
            frequency: 'daily',
            undefinedDue: true,
            tags: ['#anxious', '*journal'],
          }),
        },
        {
          role: 'user',
          content: 'Start going to gym',
        },
        {
          role: 'assistant',
          content: JSON.stringify({
            type: 'habit',
            subtype: 'catchall',
            aiPlaced: true,
            whyString: 'Ongoing routine request with weekly cadence implied.',
            frequency: 'weekly',
            undefinedDue: true,
            tags: ['#health'],
          }),
        },
        {
          role: 'user',
          content: '- milk\n- eggs\n- bread',
        },
        {
          role: 'assistant',
          content: JSON.stringify({
            type: 'note',
            subtype: 'list',
            aiPlaced: true,
            whyString: 'Multi-line checklist detected.',
            frequency: 'daily',
            undefinedDue: true,
            tags: ['*list', '#shopping'],
          }),
        },
        {
          role: 'user',
          content: 'Meeting with Dr Smith at 3pm',
        },
        {
          role: 'assistant',
          content: JSON.stringify({
            type: 'note',
            subtype: 'catchall',
            aiPlaced: false,
            whyString: 'Calendar-style reference without explicit task ownership.',
            frequency: 'daily',
            undefinedDue: true,
            tags: ['@DrSmith', '*meeting'],
          }),
        },
      ];

      const messages: ChatMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...fewShots,
        { role: 'user', content: `Classify this input: ${text}` },
      ];

      const response = await callChat(messages, {
        model: this.model,
        temperature: 0,
        maxTokens: 400,
      });
      if (!response.ok) throw new Error(response.error || 'Cortex proxy request failed');

      const rawData = response.data as unknown;
      const data = (rawData && typeof rawData === 'object' ? rawData : {}) as Record<
        string,
        unknown
      >;
      const keys = Object.keys(data);
      if (DEBUG) console.log('[CORTEX][LLM] raw keys:', keys);

      const choicesRaw = (data as { choices?: unknown }).choices;
      const choices = Array.isArray(choicesRaw) ? choicesRaw : [];
      const firstChoice = (choices[0] ?? {}) as {
        message?: { content?: unknown };
        text?: unknown;
      };

      const contentFromChat = readMessageContent(firstChoice.message?.content);
      const fallbackText = typeof firstChoice.text === 'string' ? firstChoice.text : null;
      const content =
        contentFromChat ?? (typeof data.content === 'string' ? data.content : null) ?? fallbackText;

      if (DEBUG) console.log('[CORTEX][LLM] content preview:', (content || '').slice(0, 200));
      if (!content) throw new Error('LLM response missing content');

      const parsed = extractFirstJson(content);
      if (!parsed) {
        console.warn(
          '[OpenAiEngine] Unable to parse classification JSON. Falling back to default.',
          (content || '').slice(0, 160),
        );
        const fallback = normaliseToCortexOutput({
          type: 'note',
          subtype: 'catchall',
          aiPlaced: false,
          whyString: 'Saved from Catch-All Notepad',
          undefinedDue: true,
        });
        if (!fallback.tags || fallback.tags.length === 0) {
          fallback.tags = buildFallbackTags(
            text,
            fallback.type,
            fallback.type === 'note' ? fallback.subtype : undefined,
          );
        }
        return fallback;
      }

      const normalized = normalizeExternal(parsed);
      const result = normaliseToCortexOutput(normalized);
      let finalResult = result;
      if (isNonActionIdeasNote(text) && result.type === 'todo') {
        if (DEBUG) console.log('[CORTEX][LLM] safety override → note.list for ideas input');
        finalResult = {
          type: 'note',
          subtype: 'list',
          aiPlaced: true,
          whyString: 'Ideas/list capture',
          tags: [],
        };
      }
      if (!finalResult.tags || finalResult.tags.length === 0) {
        finalResult.tags = buildFallbackTags(
          text,
          finalResult.type,
          finalResult.type === 'note' ? finalResult.subtype : undefined,
        );
      }
      if (DEBUG)
        console.log('[CORTEX][Normalized]', {
          parsedKeys: Object.keys(parsed || {}),
          result: finalResult,
        });
      return finalResult;
    } catch (error) {
      if (DEBUG) console.error('[CORTEX][LLM] error:', String(error));
      throw error;
    }
  }
}

function parseTimeout(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function classifyTextForEval(
  text: string,
): Promise<{ raw: CortexOutput; finalTags: string[]; latencyMs: number | null }> {
  const model = process.env.EXPO_PUBLIC_CORTEX_MODEL ?? 'gpt-4o-mini';
  const timeoutMs = parseTimeout(process.env.EXPO_PUBLIC_CORTEX_TIMEOUT_MS, 2500);
  const apiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY || 'proxy';
  const baseUrl = process.env.EXPO_PUBLIC_OPENAI_BASE_URL;
  const engineFlag = (process.env.EXPO_PUBLIC_CORTEX_ENGINE ?? 'HEURISTIC').toUpperCase();
  const hasBackend = Boolean(
    process.env.EXPO_PUBLIC_CORTEX_URL || process.env.EXPO_PUBLIC_OPENAI_API_KEY,
  );

  const shouldUseHeuristic = engineFlag !== 'LLM' || !hasBackend;

  const engine = shouldUseHeuristic
    ? heuristicEngine
    : new OpenAiEngine({ apiKey, model, timeoutMs, baseUrl });
  const now =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? () => performance.now()
      : () => Date.now();
  const start = now();
  const raw = await engine.classify({ text, spaceId: null });
  const latencyMs = now() - start;
  const finalTags = normalizeTags(raw.tags ?? []);

  return { raw, finalTags, latencyMs };
}
