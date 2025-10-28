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

function normalizeCategoryToType(value: unknown): 'todo' | 'habit' | 'note' {
  const raw = (typeof value === 'string' ? value : String(value ?? '')).toLowerCase();
  const norm = raw.replace(/[^a-z]/g, '');
  if (
    norm === 'todo' ||
    norm === 'task' ||
    norm === 'action' ||
    norm === 'reminder' ||
    norm === 'appointment' ||
    norm === 'schedule' ||
    norm === 'event'
  ) {
    return 'todo';
  }
  if (norm === 'habit' || norm === 'routine') return 'habit';
  return 'note';
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

const SYSTEM_PROMPT = `You are Gremly, an assistant that classifies short inputs. Classify this input.
Output strict JSON with the keys: type, subtype, aiPlaced, whyString, frequency, undefinedDue.
- type must be one of: "habit", "todo", "note".
- For type "habit", frequency must be "daily", "weekly", or "monthly".
- For type "todo", undefinedDue should be a boolean and you must never schedule for today.
- For type "note", subtype must be "journal", "list", or "catchall".
- whyString should explain the classification succinctly for the user.
Never include additional commentary outside the JSON.`;

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

        const out = normaliseToCortexOutput(normalized);
        if (DEBUG) console.log('[CORTEX][LLM] classify route mapped:', out);
        return out;
      }
      if (DEBUG) console.warn('[CORTEX][LLM] classify route failed:', classifyRes.error);
    } catch (err) {
      if (DEBUG) console.warn('[CORTEX][LLM] classify route exception:', String(err));
    }

    try {
      if (DEBUG) console.log('[CORTEX][LLM] model:', this.model);

      const messages: ChatMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
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
      if (DEBUG)
        console.log('[CORTEX][Normalized]', { parsedKeys: Object.keys(parsed || {}), result });
      return result;
    } catch (error) {
      if (DEBUG) console.error('[CORTEX][LLM] error:', String(error));
      throw error;
    }
  }
}
