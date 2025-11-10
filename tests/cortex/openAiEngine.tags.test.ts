import { OpenAiEngine } from '../../cortex/openAiEngine';
import * as CortexClient from '../../lib/cortex/CortexClient';

describe('OpenAiEngine tag sanitization', () => {
  const engine = new OpenAiEngine({ apiKey: 'test', model: 'gpt-test', timeoutMs: 1000 });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('deduplicates and orders tags from chat fallback', async () => {
    jest.spyOn(CortexClient, 'callClassify').mockResolvedValueOnce({
      ok: false,
      error: 'missing cortex url',
    });

    jest.spyOn(CortexClient, 'callChat').mockResolvedValueOnce({
      ok: true,
      data: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                type: 'note',
                subtype: 'journal',
                aiPlaced: true,
                whyString: 'Example rationale.',
                tags: [
                  ' @Alice ',
                  '@Alice',
                  '*Meeting',
                  '*List',
                  '#Project Plans',
                  'random',
                  ' @Bob ',
                ],
              }),
            },
          },
        ],
      },
    } as any);

    const result = await engine.classify({ text: 'Plan launch with Alice and Bob' });

    expect(result).toEqual({
      type: 'note',
      subtype: 'journal',
      aiPlaced: true,
      whyString: 'Example rationale.',
      tags: ['@Alice', '@Bob', '*list', '#project_plans', '#random'],
    });
  });
});
