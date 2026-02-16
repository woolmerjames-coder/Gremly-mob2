/**
 * Tests for callHabitBuilderStreaming in lib/cortex/CortexClient.ts
 *
 * Tests the SSE-based streaming chat function for the Habit Builder.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Mock react-native-sse EventSource
// All state MUST be created inside the factory (jest.mock is hoisted before
// const declarations, so module-level variables are in TDZ at factory time).
// ─────────────────────────────────────────────────────────────────────────────

jest.mock('react-native-sse', () => {
  const _listeners: Record<string, (event: any) => void> = {};
  const _close = jest.fn();
  const _ctorMock = jest.fn();

  class MockES {
    constructor(...args: any[]) {
      _ctorMock(...args);
    }
    addEventListener(type: string, handler: (event: any) => void) {
      _listeners[type] = handler;
    }
    close() {
      _close();
    }
  }

  return { __esModule: true, default: MockES, _listeners, _close, _ctorMock };
});

// Get references via require (NOT hoisted — runs after mock is registered)
const _sseMock = require('react-native-sse');
const MockEventSource: jest.Mock = _sseMock._ctorMock;
const eventListeners: Record<string, (event: any) => void> = _sseMock._listeners;
const mockClose: jest.Mock = _sseMock._close;

// Mock env — must set process.env so readCortexUrl / isAiDisabled work
process.env.EXPO_PUBLIC_CORTEX_URL = 'https://test-cortex.example.com';
process.env.EXPO_PUBLIC_DISABLE_AI = '';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

jest.mock('../../env', () => ({
  env: { cortexUrl: 'https://test-cortex.example.com', supabaseAnonKey: 'test-anon-key' },
  getEnv: (key: string) => {
    const map: Record<string, string> = {
      EXPO_PUBLIC_CORTEX_URL: 'https://test-cortex.example.com',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
      EXPO_PUBLIC_DISABLE_AI: '',
    };
    return map[key] ?? '';
  },
}));

// Mock date service
jest.mock('../../date/DateService', () => ({
  getDateService: () => ({
    getCurrentDate: () => '2025-12-15',
  }),
}));

import { callHabitBuilderStreaming } from '../CortexClient';
import type { HabitBuilderRequest, HabitBuilderStreamingCallbacks } from '../../types';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeRequest(): HabitBuilderRequest {
  return {
    type: 'habit-builder',
    stream: true,
    messages: [{ role: 'user', content: 'I want to meditate daily' }],
    context: {
      currentDate: '2025-12-15',
      dayOfWeek: 'Monday',
      existingHabits: [],
      spaces: [],
      prefill: undefined,
    },
  };
}

function makeCallbacks(): HabitBuilderStreamingCallbacks & { calls: Record<string, any[]> } {
  const calls: Record<string, any[]> = { onDelta: [], onComplete: [], onError: [], onSearching: [] };
  return {
    calls,
    onDelta: jest.fn((d) => calls.onDelta.push(d)),
    onComplete: jest.fn((r) => calls.onComplete.push(r)),
    onError: jest.fn((e) => calls.onError.push(e)),
    onSearching: jest.fn((q) => calls.onSearching.push(q)),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  // Clear captured listeners
  Object.keys(eventListeners).forEach((k) => delete eventListeners[k]);
});

describe('callHabitBuilderStreaming', () => {
  it('creates an EventSource with correct URL and payload', () => {
    const request = makeRequest();
    const callbacks = makeCallbacks();

    callHabitBuilderStreaming(request, callbacks);

    expect(MockEventSource).toHaveBeenCalledTimes(1);
    const [url, opts] = MockEventSource.mock.calls[0];
    expect(url).toBe('https://test-cortex.example.com');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.type).toBe('habit-builder');
    expect(body.stream).toBe(true);
    expect(body.messages).toEqual(request.messages);
  });

  it('returns a close function', () => {
    const { close } = callHabitBuilderStreaming(makeRequest(), makeCallbacks());
    expect(typeof close).toBe('function');
    close();
    expect(mockClose).toHaveBeenCalled();
  });

  it('accumulates deltas and calls onDelta', () => {
    const callbacks = makeCallbacks();
    callHabitBuilderStreaming(makeRequest(), callbacks);

    // Simulate streaming chunks
    eventListeners.message({ data: JSON.stringify({ delta: 'Hello ' }) });
    eventListeners.message({ data: JSON.stringify({ delta: 'world' }) });

    expect(callbacks.onDelta).toHaveBeenCalledTimes(2);
    expect(callbacks.calls.onDelta).toEqual(['Hello ', 'world']);
  });

  it('calls onComplete with full content on done event', () => {
    const callbacks = makeCallbacks();
    callHabitBuilderStreaming(makeRequest(), callbacks);

    eventListeners.message({ data: JSON.stringify({ delta: 'Sure, ' }) });
    eventListeners.message({
      data: JSON.stringify({
        done: true,
        full_content: 'Sure, let\'s set that up!',
        resolved_fields: {
          name: 'Meditate', habit_type: 'start_habit', cadence: 'daily', target: 7,
          start_date: null, time_window: 'morning', space_name: null,
          notes: null, end_date: null, time_estimate_minutes: 10,
          is_confirmation: false, next_field: 'cadence', required_count: 2,
          suggested_chips: ['daily', 'weekdays'],
        },
        latency_ms: 1200,
      }),
    });

    expect(callbacks.onComplete).toHaveBeenCalledTimes(1);
    const result = callbacks.calls.onComplete[0];
    expect(result.content).toBe('Sure, let\'s set that up!');
    expect(result.resolved_fields.name).toBe('Meditate');
    expect(result.latency_ms).toBe(1200);
    expect(mockClose).toHaveBeenCalled();
  });

  it('uses accumulated content when full_content is missing from done event', () => {
    const callbacks = makeCallbacks();
    callHabitBuilderStreaming(makeRequest(), callbacks);

    eventListeners.message({ data: JSON.stringify({ delta: 'Hello ' }) });
    eventListeners.message({ data: JSON.stringify({ delta: 'there' }) });
    eventListeners.message({
      data: JSON.stringify({
        done: true,
        resolved_fields: {
          name: null, habit_type: null, cadence: null, target: null,
          start_date: null, time_window: null, space_name: null,
          notes: null, end_date: null, time_estimate_minutes: null,
          is_confirmation: false, next_field: null, required_count: 0,
          suggested_chips: null,
        },
      }),
    });

    const result = callbacks.calls.onComplete[0];
    expect(result.content).toBe('Hello there');
  });

  it('calls onError when stream returns error data', () => {
    const callbacks = makeCallbacks();
    callHabitBuilderStreaming(makeRequest(), callbacks);

    eventListeners.message({ data: JSON.stringify({ error: 'Rate limit exceeded' }) });

    expect(callbacks.onError).toHaveBeenCalledTimes(1);
    expect(callbacks.calls.onError[0].message).toBe('Rate limit exceeded');
    expect(mockClose).toHaveBeenCalled();
  });

  it('calls onError on EventSource error event', () => {
    const callbacks = makeCallbacks();
    callHabitBuilderStreaming(makeRequest(), callbacks);

    eventListeners.error({ message: 'Connection failed' });

    expect(callbacks.onError).toHaveBeenCalledTimes(1);
    expect(callbacks.calls.onError[0].message).toBe('Connection failed');
  });

  it('calls onSearching when search event is received', () => {
    const callbacks = makeCallbacks();
    callHabitBuilderStreaming(makeRequest(), callbacks);

    eventListeners.message({ data: JSON.stringify({ searching: true, query: 'meditation apps' }) });

    expect(callbacks.onSearching).toHaveBeenCalledTimes(1);
    expect(callbacks.calls.onSearching[0]).toBe('meditation apps');
  });

  it('provides default resolved_fields when done event lacks them', () => {
    const callbacks = makeCallbacks();
    callHabitBuilderStreaming(makeRequest(), callbacks);

    eventListeners.message({
      data: JSON.stringify({ done: true, full_content: 'Done!' }),
    });

    const result = callbacks.calls.onComplete[0];
    expect(result.resolved_fields).toBeDefined();
    expect(result.resolved_fields.is_confirmation).toBe(false);
    expect(result.resolved_fields.required_count).toBe(0);
  });

  it('ignores parse errors for malformed chunks', () => {
    const callbacks = makeCallbacks();
    callHabitBuilderStreaming(makeRequest(), callbacks);

    // Bad JSON shouldn't throw
    eventListeners.message({ data: 'not-json{{{' });
    eventListeners.message({ data: JSON.stringify({ delta: 'ok' }) });

    expect(callbacks.onDelta).toHaveBeenCalledTimes(1);
    expect(callbacks.onError).not.toHaveBeenCalled();
  });
});
