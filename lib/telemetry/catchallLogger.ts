import { getEnv } from '../env';
import { nowTimestamp } from '../date/DateService';

// Lightweight non-crypto hash (DJB2 variant). Not for security.
export function hashString(input: string): string {
  const s = String(input ?? '');
  let hash = 5381;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 33) ^ s.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

export type Surface = 'catchall' | 'space_chat';

export interface DecisionLog {
  ts?: string; // defaults to now
  userId?: string | null; // never sent raw; hashed
  text?: string; // never sent raw; hashed
  surface: Surface;
  engine: 'LLM' | 'HEURISTIC' | 'DISABLED';
  modelVersion?: string;
  intent: string;
  confidence: number;
  mode: 'auto' | 'ask' | 'keep' | 'unsorted' | 'reply' | 'none';
  decision: string;
  latencyMs?: number;
  createdTodos?: number;
  createdNotes?: number;
  createdHabits?: number;
  dropId?: string | null;
}

export async function logCatchallDecision(d: DecisionLog): Promise<void> {
  try {
    const enabled = (getEnv('EXPO_PUBLIC_CORTEX_LOGS') || 'off').toLowerCase() === 'on';
    if (!enabled) return;

    const url = getEnv('EXPO_PUBLIC_CORTEX_LOGS_URL');
    if (!url) return;

    const ts = d.ts ?? nowTimestamp();

    const payload = {
      ts,
      user_id_hash: hashString(d.userId ?? ''),
      text_hash: hashString(d.text ?? ''),
      surface: d.surface,
      engine: d.engine,
      model_version: d.modelVersion ?? '',
      intent: d.intent,
      confidence: d.confidence ?? 0,
      mode: d.mode,
      decision: d.decision,
      latency_ms: d.latencyMs ?? '',
      created_todos: d.createdTodos ?? '',
      created_notes: d.createdNotes ?? '',
      created_habits: d.createdHabits ?? '',
      drop_id: d.dropId ?? '',
    };

    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {});
  } catch {
    // swallow
  }
}
