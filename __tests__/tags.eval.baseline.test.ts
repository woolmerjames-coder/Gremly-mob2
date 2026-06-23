import { normalizeTags } from '../lib/tags/normalize';
import { classifyTextForEval } from '../cortex/openAiEngine';

const EMOTION_TAGS = new Set([
  '#anxious',
  '#grateful',
  '#excited',
  '#overwhelmed',
  '#calm',
  '#stressed',
]);

const SAMPLE_INPUTS = [
  'I feel anxious yet grateful for today.',
  'Idea: build a shared shopping list for the cabin trip.',
  'Meeting with Dr. Jones about lab results.',
  '- milk\n- bread\n- eggs',
  'Reflection: thinking about progress on the cabin project.',
];

const evalTest = typeof fetch === 'function' ? test : test.skip;

describe('tags eval baseline', () => {
  for (const input of SAMPLE_INPUTS) {
    evalTest(`ensures stable tag shape for: ${input.slice(0, 32)}…`, async () => {
      const { raw, finalTags } = await classifyTextForEval(input);
      const normalized = normalizeTags(finalTags);
      const typeTags = normalized.filter((tag) => tag.startsWith('*'));
      const topicTags = normalized.filter((tag) => {
        if (!tag.startsWith('#')) return false;
        if (EMOTION_TAGS.has(tag)) return false;
        return !/\d/.test(tag);
      });

      expect(typeTags).toHaveLength(1);
      expect(topicTags.length).toBeLessThanOrEqual(3);

      expect(raw.tags ?? []).toEqual(expect.arrayContaining(finalTags));
    });
  }
});
