/**
 * Tests for callWorldChatStreaming and callChapterChatStreaming.
 *
 * Covers:
 * - Guard: missing CORTEX_URL → calls onError immediately
 * - Guard: AI disabled → calls onError immediately
 * - Sends correct lane ('world_chat' / 'chapter_chat') in POST body
 * - SSE data.error event → calls onError + closes stream
 * - SSE data.delta event → accumulates text + calls onChunk
 * - SSE data.done event → calls onComplete with richResult containing save_suggestion
 * - SSE error event → calls onError from error listener
 * - Returns a { close } handle that shuts down the EventSource
 */

// ─── Mutable test state ────────────────────────────────────────────────────
// IMPORTANT: jest.mock() calls are hoisted above all module-level code by Babel
// so we cannot reference module-level classes inside mock factories.
// We use `global` as a side-channel to let the in-factory class write the
// captured EventSource back into test scope.

let mockCortexUrl: string | null = 'https://cortex.test';
let mockAiDisabled = false;
let mockSessionToken: string | null = 'test-token';

// ─── Mocks ─────────────────────────────────────────────────────────────────

// react-native-sse: define FakeEventSource INSIDE the factory (not hoisted)
jest.mock('react-native-sse', () => {
  class FakeEventSource {
    url: string;
    options: any;
    listeners: Record<string, Array<(event: any) => void>> = {};
    closed = false;

    constructor(url: string, options: any) {
      this.url = url;
      this.options = options;
      // Store in global so test code can access the instance
      (global as any).__lastFakeEs = this;
    }

    addEventListener(type: string, handler: (event: any) => void) {
      if (!this.listeners[type]) this.listeners[type] = [];
      this.listeners[type].push(handler);
    }

    removeEventListener(type: string, handler: (event: any) => void) {
      if (this.listeners[type]) {
        this.listeners[type] = this.listeners[type].filter((h: any) => h !== handler);
      }
    }

    close() {
      this.closed = true;
    }

    emit(type: string, payload: any) {
      (this.listeners[type] || []).forEach((h: any) => h(payload));
    }

    emitMessage(data: object) {
      this.emit('message', { data: JSON.stringify(data) });
    }
  }

  return { __esModule: true, default: FakeEventSource };
});

jest.mock('../../env', () => ({
  env: { cortexUrl: 'https://cortex.test' },
  getEnv: (key: string) => {
    if (key === 'EXPO_PUBLIC_CORTEX_URL') return mockCortexUrl ?? '';
    if (key === 'EXPO_PUBLIC_DISABLE_AI') return mockAiDisabled ? 'true' : '';
    return undefined;
  },
}));

jest.mock('../getSessionToken', () => ({
  getSessionToken: async () => mockSessionToken,
  getSessionTokenSync: () => mockSessionToken,
}));

jest.mock('../../date/DateService', () => ({
  getDateService: () => ({
    now: () => new Date('2026-05-01T12:00:00Z'),
    today: () => '2026-05-01',
    getHour: () => 12,
    getTimezone: () => 'UTC',
  }),
  nowTimestamp: () => '2026-05-01T12:00:00Z',
}));

jest.mock('../../events/EventBus', () => ({
  eventBus: { emit: jest.fn() },
}));

// ─── CUT ───────────────────────────────────────────────────────────────────

import { callWorldChatStreaming, callChapterChatStreaming } from '../CortexClient';

// ─── Fixtures ──────────────────────────────────────────────────────────────

const messages = [{ role: 'user' as const, content: 'Hello world' }];
const worldOpts = { scopeId: 'world-1', scopeName: 'Health', chatId: 'chat-1', userId: 'u-1' };
const chapterOpts = { scopeId: 'ch-1', scopeName: 'Sprint 1', chatId: 'chat-2', userId: 'u-1' };

function makeCallbacks() {
  return {
    onChunk: jest.fn(),
    onComplete: jest.fn(),
    onError: jest.fn(),
    onSearching: jest.fn(),
    onFetching: jest.fn(),
  };
}

// ─── Setup ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockCortexUrl = 'https://cortex.test';
  mockAiDisabled = false;
  mockSessionToken = 'test-token';
  (global as any).__lastFakeEs = null;
});

// ─── callWorldChatStreaming ─────────────────────────────────────────────────

describe('callWorldChatStreaming', () => {
  it('calls onError immediately when CORTEX_URL is missing', () => {
    mockCortexUrl = null;
    const cbs = makeCallbacks();
    callWorldChatStreaming(messages, worldOpts, cbs);
    expect(cbs.onError).toHaveBeenCalledWith('Missing CORTEX_URL', '');
    expect((global as any).__lastFakeEs).toBeNull();
  });

  it('calls onError immediately when AI is disabled', () => {
    mockAiDisabled = true;
    const cbs = makeCallbacks();
    callWorldChatStreaming(messages, worldOpts, cbs);
    expect(cbs.onError).toHaveBeenCalledWith('AI disabled', '');
    expect((global as any).__lastFakeEs).toBeNull();
  });

  it('opens EventSource to the cortex URL', () => {
    const cbs = makeCallbacks();
    callWorldChatStreaming(messages, worldOpts, cbs);
    expect((global as any).__lastFakeEs).not.toBeNull();
    expect(((global as any).__lastFakeEs as any).url).toBe('https://cortex.test');
  });

  it('sends lane: world_chat in the POST body', () => {
    const cbs = makeCallbacks();
    callWorldChatStreaming(messages, worldOpts, cbs);
    const body = JSON.parse(((global as any).__lastFakeEs as any).options.body);
    expect(body.lane).toBe('world_chat');
    expect(body.scopeId).toBe('world-1');
    expect(body.scopeName).toBe('Health');
    expect(body.chatId).toBe('chat-1');
    expect(body.type).toBe('chat');
    expect(body.stream).toBe(true);
  });

  it('includes Authorization header when session token exists', () => {
    const cbs = makeCallbacks();
    callWorldChatStreaming(messages, worldOpts, cbs);
    expect(((global as any).__lastFakeEs as any).options.headers.Authorization).toBe(
      'Bearer test-token',
    );
  });

  it('calls onChunk with delta and accumulated text', () => {
    const cbs = makeCallbacks();
    callWorldChatStreaming(messages, worldOpts, cbs);
    const es = (global as any).__lastFakeEs as any;
    es.emitMessage({ delta: 'Hello' });
    es.emitMessage({ delta: ' world' });
    expect(cbs.onChunk).toHaveBeenCalledTimes(2);
    expect(cbs.onChunk).toHaveBeenNthCalledWith(1, 'Hello', 'Hello');
    expect(cbs.onChunk).toHaveBeenNthCalledWith(2, ' world', 'Hello world');
  });

  it('calls onComplete with full content and richResult on data.done', () => {
    const cbs = makeCallbacks();
    callWorldChatStreaming(messages, worldOpts, cbs);
    const es = (global as any).__lastFakeEs as any;
    es.emitMessage({ delta: 'Great' });
    es.emitMessage({
      done: true,
      full_content: 'Great response',
      save_suggestion: { title: 'Save me' },
      saveable: true,
      latency_ms: 300,
    });
    expect(cbs.onComplete).toHaveBeenCalledTimes(1);
    const [content, rich] = (cbs.onComplete as jest.Mock).mock.calls[0];
    expect(content).toBe('Great response');
    expect(rich.save_suggestion).toEqual({ title: 'Save me' });
    expect(rich.saveable).toBe(true);
    expect(rich.latency_ms).toBe(300);
    expect(es.closed).toBe(true);
  });

  it('calls onError and closes on data.error message', () => {
    const cbs = makeCallbacks();
    callWorldChatStreaming(messages, worldOpts, cbs);
    const es = (global as any).__lastFakeEs as any;
    es.emitMessage({ error: 'rate_limited' });
    expect(cbs.onError).toHaveBeenCalledWith('rate_limited', '');
    expect(es.closed).toBe(true);
  });

  it('calls onError from the SSE error event', () => {
    const cbs = makeCallbacks();
    callWorldChatStreaming(messages, worldOpts, cbs);
    const es = (global as any).__lastFakeEs as any;
    es.emit('error', { message: 'network fail' });
    expect(cbs.onError).toHaveBeenCalledWith('network fail', '');
    expect(es.closed).toBe(true);
  });

  it('returns a close() handle that shuts the EventSource', () => {
    const cbs = makeCallbacks();
    const handle = callWorldChatStreaming(messages, worldOpts, cbs);
    handle.close();
    expect(((global as any).__lastFakeEs as any).closed).toBe(true);
  });

  it('falls back to accumulated text when full_content is absent in done event', () => {
    const cbs = makeCallbacks();
    callWorldChatStreaming(messages, worldOpts, cbs);
    const es = (global as any).__lastFakeEs as any;
    es.emitMessage({ delta: 'Partial' });
    es.emitMessage({ done: true }); // no full_content
    const [content] = (cbs.onComplete as jest.Mock).mock.calls[0];
    expect(content).toBe('Partial');
  });
});

// ─── callChapterChatStreaming ───────────────────────────────────────────────

describe('callChapterChatStreaming', () => {
  it('calls onError immediately when CORTEX_URL is missing', () => {
    mockCortexUrl = null;
    const cbs = makeCallbacks();
    callChapterChatStreaming(messages, chapterOpts, cbs);
    expect(cbs.onError).toHaveBeenCalledWith('Missing CORTEX_URL', '');
    expect((global as any).__lastFakeEs).toBeNull();
  });

  it('calls onError immediately when AI is disabled', () => {
    mockAiDisabled = true;
    const cbs = makeCallbacks();
    callChapterChatStreaming(messages, chapterOpts, cbs);
    expect(cbs.onError).toHaveBeenCalledWith('AI disabled', '');
  });

  it('sends lane: chapter_chat in the POST body', () => {
    const cbs = makeCallbacks();
    callChapterChatStreaming(messages, chapterOpts, cbs);
    const body = JSON.parse(((global as any).__lastFakeEs as any).options.body);
    expect(body.lane).toBe('chapter_chat');
    expect(body.scopeId).toBe('ch-1');
    expect(body.scopeName).toBe('Sprint 1');
    expect(body.chatId).toBe('chat-2');
  });

  it('calls onChunk on delta events', () => {
    const cbs = makeCallbacks();
    callChapterChatStreaming(messages, chapterOpts, cbs);
    ((global as any).__lastFakeEs as any).emitMessage({ delta: 'Hi' });
    expect(cbs.onChunk).toHaveBeenCalledWith('Hi', 'Hi');
  });

  it('calls onComplete on done event', () => {
    const cbs = makeCallbacks();
    callChapterChatStreaming(messages, chapterOpts, cbs);
    const es = (global as any).__lastFakeEs as any;
    es.emitMessage({ done: true, full_content: 'Done text', save_suggestion: null });
    expect(cbs.onComplete).toHaveBeenCalledTimes(1);
    const [content, rich] = (cbs.onComplete as jest.Mock).mock.calls[0];
    expect(content).toBe('Done text');
    expect(rich.save_suggestion).toBeNull();
    expect(es.closed).toBe(true);
  });

  it('calls onError and closes on data.error message', () => {
    const cbs = makeCallbacks();
    callChapterChatStreaming(messages, chapterOpts, cbs);
    ((global as any).__lastFakeEs as any).emitMessage({ error: 'quota_exceeded' });
    expect(cbs.onError).toHaveBeenCalledWith('quota_exceeded', '');
    expect(((global as any).__lastFakeEs as any).closed).toBe(true);
  });

  it('returns a close() handle', () => {
    const cbs = makeCallbacks();
    const handle = callChapterChatStreaming(messages, chapterOpts, cbs);
    handle.close();
    expect(((global as any).__lastFakeEs as any).closed).toBe(true);
  });
});
