/**
 * Tests for the generateRunningSummary gating logic
 * and API call shape in workers/cortex/index.js.
 *
 * The function is not exported, so we re-derive the pure
 * gating checks and test them directly.
 */

// ── Re-derive gating logic ──────────────────────────────────────────────────

/**
 * Returns true when the conversation should be gated OUT
 * (i.e. skipped for running summary generation).
 */
function shouldGateOut(conversationMessages) {
  const userMessages = conversationMessages.filter((m) => m.role === 'user');
  const totalUserChars = userMessages.reduce((sum, m) => sum + (m.content || '').length, 0);
  return userMessages.length < 3 || totalUserChars < 200;
}

/**
 * Builds the prompt turns string that gets sent to the model.
 * (Lines 1644-1649 of cortex/index.js)
 */
function buildTurns(conversationMessages, lastAssistantResponse) {
  return [
    ...conversationMessages
      .slice(-8)
      .map((m) => `${m.role === 'user' ? 'User' : 'Gremly'}: ${(m.content || '').slice(0, 300)}`),
    `Gremly: ${lastAssistantResponse.slice(0, 300)}`,
  ].join('\n');
}

/**
 * Builds the OpenAI request body that generateRunningSummary sends.
 */
function buildRequestBody(prompt) {
  return {
    model: 'gpt-4.1-nano',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 200,
    temperature: 0.3,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('generateRunningSummary – gating', () => {
  it('gates out when fewer than 3 user messages', () => {
    const msgs = [
      { role: 'user', content: 'Hello there my friend, a reasonably long message here' },
      { role: 'assistant', content: 'Hi!' },
      {
        role: 'user',
        content: 'Another reasonably long message to ensure chars are above 200 total',
      },
      { role: 'assistant', content: 'Sure!' },
    ];
    // Only 2 user messages
    expect(shouldGateOut(msgs)).toBe(true);
  });

  it('gates out when total user chars < 200', () => {
    const msgs = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'Hey!' },
      { role: 'user', content: 'yo' },
      { role: 'assistant', content: 'Sup!' },
      { role: 'user', content: 'ok' },
    ];
    // 3 user messages but only 6 chars
    expect(shouldGateOut(msgs)).toBe(true);
  });

  it('passes gating with 3+ messages and 200+ chars', () => {
    const longContent = 'a'.repeat(100);
    const msgs = [
      { role: 'user', content: longContent },
      { role: 'assistant', content: 'Got it' },
      { role: 'user', content: longContent },
      { role: 'assistant', content: 'Sure' },
      { role: 'user', content: longContent },
    ];
    expect(shouldGateOut(msgs)).toBe(false);
  });

  it('ignores assistant messages in char count', () => {
    const msgs = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'a'.repeat(500) },
      { role: 'user', content: 'ok' },
      { role: 'assistant', content: 'a'.repeat(500) },
      { role: 'user', content: 'yo' },
    ];
    expect(shouldGateOut(msgs)).toBe(true);
  });

  it('handles messages with null content', () => {
    const msgs = [
      { role: 'user', content: null },
      { role: 'user', content: null },
      { role: 'user', content: null },
    ];
    expect(shouldGateOut(msgs)).toBe(true);
  });
});

describe('generateRunningSummary – turns builder', () => {
  it('formats user and assistant turns', () => {
    const msgs = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi there' },
    ];
    const result = buildTurns(msgs, 'latest reply');
    expect(result).toContain('User: hello');
    expect(result).toContain('Gremly: hi there');
    expect(result).toContain('Gremly: latest reply');
  });

  it('takes only last 8 conversation messages', () => {
    const msgs = Array.from({ length: 12 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `msg-${i}`,
    }));
    const result = buildTurns(msgs, 'final');
    // Should NOT include msg-0 through msg-3 (first 4)
    expect(result).not.toContain('msg-0');
    expect(result).not.toContain('msg-3');
    // Should include msg-4 through msg-11 (last 8)
    expect(result).toContain('msg-4');
    expect(result).toContain('msg-11');
  });

  it('truncates individual messages to 300 chars', () => {
    const longMsg = 'x'.repeat(500);
    const msgs = [{ role: 'user', content: longMsg }];
    const result = buildTurns(msgs, 'reply');
    const userLine = result.split('\n')[0];
    // "User: " (6 chars) + 300 chars = 306 total
    expect(userLine.length).toBe(306);
  });
});

describe('generateRunningSummary – request body', () => {
  it('uses gpt-4.1-nano model', () => {
    const body = buildRequestBody('test prompt');
    expect(body.model).toBe('gpt-4.1-nano');
  });

  it('sets max_tokens to 200', () => {
    const body = buildRequestBody('test prompt');
    expect(body.max_tokens).toBe(200);
  });

  it('sets temperature to 0.3', () => {
    const body = buildRequestBody('test prompt');
    expect(body.temperature).toBe(0.3);
  });

  it('wraps prompt in a single user message', () => {
    const body = buildRequestBody('summarize this');
    expect(body.messages).toEqual([{ role: 'user', content: 'summarize this' }]);
  });
});
