import { OpenAiEngine } from '../../cortex/openAiEngine';

jest.mock('../../lib/cortex/CortexClient', () => ({
  callChat: jest.fn(),
  callClassify: jest.fn(),
}));

type CallChatType = typeof import('../../lib/cortex/CortexClient').callChat;
type CallClassifyType = typeof import('../../lib/cortex/CortexClient').callClassify;

const { callChat, callClassify } = require('../../lib/cortex/CortexClient') as {
  callChat: jest.MockedFunction<CallChatType>;
  callClassify: jest.MockedFunction<CallClassifyType>;
};

describe('OpenAiEngine Phase 1 prompt polish', () => {
  const engine = new OpenAiEngine({ apiKey: 'proxy', model: 'gpt-4o-mini', timeoutMs: 2000 });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('maps "To-Do" from classify route to todo', async () => {
    callClassify.mockResolvedValueOnce({
      ok: true,
      id: 'x',
      classification: { category: 'To-Do', tags: [], spaceName: null, confidence: 0.9 },
    });
    const res = await engine.classify({ text: 'Book dentist appointment tomorrow', spaceId: null });
    expect(res.type).toBe('todo');
    expect((res as any).undefinedDue).toBe(true);
  });

  it('maps appointment-like chat content to todo via JSON extraction', async () => {
    callClassify.mockResolvedValueOnce({ ok: false, error: 'no-classify-route' });
    callChat.mockResolvedValueOnce({
      ok: true,
      data: {
        id: 'y',
        content: JSON.stringify({
          type: 'task',
          subtype: 'appointment',
          aiPlaced: true,
          whyString: 'Appointment request',
          frequency: 'one-time',
          undefinedDue: true,
        }),
        model: 'gpt-4o-mini',
      },
    });
    const res = await engine.classify({ text: 'Call doctor next week', spaceId: null });
    expect(res.type).toBe('todo');
  });

  it('falls back to note/catchall when content is not parseable JSON', async () => {
    callClassify.mockResolvedValueOnce({ ok: false, error: 'no-classify-route' });
    callChat.mockResolvedValueOnce({
      ok: true,
      data: { id: 'z', content: 'Hi! How can I help?' },
    });
    const res = await engine.classify({ text: 'random thought', spaceId: null });
    expect(res.type).toBe('note');
    expect((res as any).subtype).toBe('catchall');
  });

  it('coerces idea-style todo classification to note list (classify route)', async () => {
    callClassify.mockResolvedValueOnce({
      ok: true,
      id: 'ideas',
      classification: { category: 'To-Do', tags: [], spaceName: null, confidence: 0.7 },
    });
    const res = await engine.classify({ text: 'Ideas for weekend trip', spaceId: null });
    expect(res).toEqual({
      type: 'note',
      subtype: 'list',
      aiPlaced: true,
      whyString: 'Ideas/list capture',
    });
  });

  it('coerces idea-style todo classification to note list (chat route)', async () => {
    callClassify.mockResolvedValueOnce({ ok: false, error: 'no-classify-route' });
    callChat.mockResolvedValueOnce({
      ok: true,
      data: {
        id: 'ideas-chat',
        content: JSON.stringify({
          type: 'todo',
          subtype: 'catchall',
          aiPlaced: true,
          whyString: 'Plan ideas',
          frequency: 'daily',
          undefinedDue: true,
        }),
        model: 'gpt-4o-mini',
      },
    });
    const res = await engine.classify({ text: 'Brainstorm packing list ideas', spaceId: null });
    expect(res).toEqual({
      type: 'note',
      subtype: 'list',
      aiPlaced: true,
      whyString: 'Ideas/list capture',
    });
  });
});
