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

describe('OpenAiEngine safety overrides for ideas/brainstorm/list inputs', () => {
  const engine = new OpenAiEngine({ apiKey: 'proxy', model: 'gpt-4o-mini', timeoutMs: 2000 });

  afterEach(() => jest.resetAllMocks());

  it('overrides classify route "To-Do" to note.list for "ideas for weekend trip"', async () => {
    callClassify.mockResolvedValueOnce({
      ok: true,
      id: 'c1',
      classification: { category: 'To-Do', tags: [], spaceName: null, confidence: 0.88 },
    });

    const res = await engine.classify({ text: 'Ideas for weekend trip', spaceId: null });
    expect(res.type).toBe('note');
    expect((res as any).subtype).toBe('list');
  });

  it('overrides chat JSON "task/appointment" to note.list for ideas phrasing', async () => {
    callClassify.mockResolvedValueOnce({ ok: false, error: 'no-classify-route' });
    callChat.mockResolvedValueOnce({
      ok: true,
      data: {
        id: 'c2',
        content: JSON.stringify({
          type: 'task',
          subtype: 'appointment',
          aiPlaced: true,
          whyString: 'Appointment request',
          frequency: 'one-time',
          undefinedDue: true,
        }),
      },
    });
    const res = await engine.classify({ text: 'Ideas for weekend trip', spaceId: null });
    expect(res.type).toBe('note');
    expect((res as any).subtype).toBe('list');
  });
});
