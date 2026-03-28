/**
 * Classification Trace ID Generator
 *
 * Generates unique trace IDs for classification observability.
 * The trace ID is carried through the entire pipeline:
 * - Client store record
 * - Phase 1 API request
 * - Phase 2 API request
 * - Supabase row (via views.trace_id)
 */

/**
 * Generate a UUID v4 string (inline to avoid circular deps)
 */
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

/**
 * Generate a new classification trace ID
 */
export function generateTraceId(): string {
  return `trace-${generateUUID()}`;
}

/**
 * Classification trace context passed through pipeline
 */
export interface TraceContext {
  /** Unique trace ID for this classification */
  trace_id: string;

  /** Original input text */
  input_text: string;

  /** Timestamp when classification started */
  started_at: string;

  /** Drop ID for correlation */
  drop_id: string;

  /** Source of submission */
  source: string;
}

/**
 * Create a new trace context
 */
import { nowTimestamp } from '../date/DateService';

export function createTraceContext(
  inputText: string,
  dropId: string,
  source: string,
): TraceContext {
  return {
    trace_id: generateTraceId(),
    input_text: inputText,
    started_at: nowTimestamp(),
    drop_id: dropId,
    source,
  };
}

/**
 * Log a trace event (dev only)
 */
export function logTraceEvent(
  traceId: string,
  event: string,
  data: Record<string, unknown>,
): void {
  if (!__DEV__) return;

  console.log(`[TRACE:${traceId.slice(-8)}] ${event}`, data);
}
