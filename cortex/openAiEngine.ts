import type { CortexInput, CortexOutput, ICortexEngine } from './ICortexEngine';
import { callChat, callClassify, type ChatMessage } from '../lib/cortex/CortexClient';

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

  return result;
}

function clamp01(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
}

const SYSTEM_PROMPT = `
You are Gremly's classifier. Output ONLY a single JSON object, nothing else. Do not greet or explain.
Schema:
{
  "type": "habit|todo|note",
  "subtype": "journal|list|catchall",
  "aiPlaced": boolean,
  "whyString": string,
  "frequency": "daily|weekly|monthly",
  "undefinedDue": boolean
}

Rules:
- Never include any text outside the single JSON object (no greetings, no code fences).
- Map synonyms to our schema:
  - todo: "todo","to-do","to do","task","action","reminder","appointment","schedule","event","followup","follow-up"
  - habit: "habit","routine","practice"
  - note: "note","journal","thought","idea","list"
- If "appointment" or "schedule" is implied, treat as todo (subtype => "catchall").
- For type="habit", frequency must be one of: "daily","weekly","monthly" (default "daily" if unclear).
- For type="todo", set "undefinedDue": true unless an explicit non-today due date is provided elsewhere (you must NOT schedule for today).
- For type="note", subtype must be "journal","list", or "catchall" (default "catchall").
- Always provide a concise "whyString".
- aiPlaced=true for "todo" and "habit"; aiPlaced=false for "note" when subtype="catchall".
`;

function normaliseToCortexOutput(raw: RawClassification): CortexOutput {
  const aiPlaced =
    raw.aiPlaced !== undefined ? !!raw.aiPlaced : raw.type !== 'note' || raw.subtype !== 'catchall';
  const whyString = raw.whyString?.trim() || 'No rationale provided.';

  if (raw.type === 'habit') {
    const freq = (raw.frequency || 'daily').toLowerCase();
    type HabitFrequency = Extract<CortexOutput, { type: 'habit' }>['frequency'];
    const frequency: HabitFrequency =
      freq === 'weekly' ? 'weekly' : freq === 'monthly' ? 'monthly' : 'daily';
    return { type: 'habit', frequency, aiPlaced, whyString };
  }

  if (raw.type === 'todo') {
    const undefinedDue = raw.undefinedDue !== undefined ? !!raw.undefinedDue : true;
    return { type: 'todo', undefinedDue, aiPlaced, whyString };
  }

  const subtype = raw.subtype === 'journal' || raw.subtype === 'list' ? raw.subtype : 'catchall';
  return {
    type: 'note',
    subtype,
    aiPlaced: subtype === 'catchall' ? false : aiPlaced,
    whyString,
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

        let out = normaliseToCortexOutput(normalized) as any;
        if (isNonActionIdeasNote(text) && out.type === 'todo') {
          if (DEBUG) console.log('[CORTEX][LLM] safety override → note.list for ideas input');
          out = { type: 'note', subtype: 'list', aiPlaced: true, whyString: 'Ideas/list capture' };
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
        // Todo with date-ish language (we still return undefinedDue: true; real date parsing is downstream)
        {
          role: 'user',
          content: 'Book dentist appointment tomorrow',
        },
        {
          role: 'assistant',
          content: JSON.stringify({
            type: 'todo',
            subtype: 'catchall',
            aiPlaced: true,
            whyString: 'Detected actionable appointment request.',
            frequency: 'daily', // ignored for todo
            undefinedDue: true,
          }),
        },

        // Habit signal
        {
          role: 'user',
          content: 'Run 3 times a week',
        },
        {
          role: 'assistant',
          content: JSON.stringify({
            type: 'habit',
            subtype: 'catchall',
            aiPlaced: true,
            whyString: 'Detected recurring activity.',
            frequency: 'weekly',
            undefinedDue: true,
          }),
        },

        // Note catchall
        {
          role: 'user',
          content: 'Ideas for weekend trip',
        },
        {
          role: 'assistant',
          content: JSON.stringify({
            type: 'note',
            subtype: 'list',
            aiPlaced: true,
            whyString: 'Non-actionable list capture.',
            frequency: 'daily',
            undefinedDue: true,
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
        return normaliseToCortexOutput({
          type: 'note',
          subtype: 'catchall',
          aiPlaced: false,
          whyString: 'Saved from Catch-All Notepad',
          undefinedDue: true,
        });
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
        };
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
