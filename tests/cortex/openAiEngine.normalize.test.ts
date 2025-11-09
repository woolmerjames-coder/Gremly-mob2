import { OpenAiEngine } from '../../cortex/openAiEngine';
import * as CortexClient from '../../lib/cortex/CortexClient';

describe('OpenAiEngine normalize', () => {
  const engine = new OpenAiEngine({ apiKey: 'test', model: 'gpt-test', timeoutMs: 1000 });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('parses fenced JSON and maps to todo', async () => {
    jest.spyOn(CortexClient, 'callChat').mockResolvedValueOnce({
      ok: true,
      data: {
        choices: [
          {
            message: {
              content:
                '```json\n{"type":"todo","undefinedDue":true,"whyString":"auto","aiPlaced":false}\n```',
            },
          },
        ],
      },
    } as any);

    const result = await engine.classify({ text: 'Finish report' });
    expect(result).toEqual({
      type: 'todo',
      undefinedDue: true,
      aiPlaced: false,
      whyString: 'auto',
      tags: [],
    });
  });

  test('invalid JSON falls back to safe default', async () => {
    jest.spyOn(CortexClient, 'callChat').mockResolvedValueOnce({
      ok: true,
      data: {
        choices: [
          {
            message: {
              content: 'No JSON here',
            },
          },
        ],
      },
    } as any);

    const result = await engine.classify({ text: 'Random thought' });
    expect(result).toEqual({
      type: 'note',
      subtype: 'catchall',
      aiPlaced: false,
      whyString: 'Saved from Catch-All Notepad',
      tags: [],
    });
  });
});
