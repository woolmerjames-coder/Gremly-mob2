import type { CortexInput, CortexOutput, ICortexEngine } from './ICortexEngine';

interface OpenAiEngineConfig {
  apiKey: string;
  model: string;
  timeoutMs: number;
  baseUrl?: string;
}

interface RawClassification {
  type?: string;
  subtype?: string;
  aiPlaced?: boolean;
  whyString?: string;
  frequency?: string;
  undefinedDue?: boolean;
}

const SYSTEM_PROMPT = `You are Gremly, an assistant that classifies short note snippets.
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

export class OpenAiEngine implements ICortexEngine {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;

  constructor({ apiKey: _apiKey, model, timeoutMs, baseUrl }: OpenAiEngineConfig) {
    const key = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
    if (!key) {
      throw new Error('Missing EXPO_PUBLIC_OPENAI_API_KEY');
    }
    this.apiKey = key;
    this.model = model;
    this.timeoutMs = timeoutMs;
    this.baseUrl = baseUrl?.replace(/\/$/, '') || 'https://api.openai.com';
  }

  async classify({ text }: CortexInput): Promise<CortexOutput> {
    const DEBUG = (process.env.EXPO_PUBLIC_DEBUG_CORTEX ?? 'false') === 'true';
    const logPayload: CortexInput = { text };
    if (DEBUG) console.log('[CORTEX][LLM] classify input:', logPayload);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      if (DEBUG) console.log('[CORTEX][LLM] model:', this.model, 'hasKey:', !!this.apiKey);
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: `Classify this note: ${text}` },
          ],
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(`OpenAI request failed (${response.status}): ${errorBody}`);
      }

      const data = await response.json();
      if (DEBUG) console.log('[CORTEX][LLM] raw:', JSON.stringify(data).slice(0, 300));
      const choice = data?.choices?.[0];
      const message = choice?.message;
      const content = readMessageContent(message?.content);
      if (!content) {
        throw new Error('OpenAI response missing content');
      }

      let parsed: RawClassification;
      try {
        parsed = JSON.parse(content) as RawClassification;
      } catch (error) {
        if (__DEV__) {
          console.warn('[OpenAiEngine] Failed to parse JSON payload', error, content);
        }
        throw new Error('OpenAI response was not valid JSON');
      }

      const result = normaliseToCortexOutput(parsed);
      if (DEBUG) console.log('[CORTEX][LLM] parsed:', result);
      return result;
    } catch (error) {
      if (DEBUG) console.error('[CORTEX][LLM] error:', error);
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
