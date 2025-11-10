import { HeuristicEngine } from '../../cortex/heuristicEngine';

describe('HeuristicEngine tag generation', () => {
  const engine = new HeuristicEngine();

  test('extracts people, meeting, date, and topic tags for meetings', async () => {
    const result = await engine.classify({
      text: 'Meeting with Dr. Smith about marketing launch on March 3, 2025',
    });

    expect(result).toMatchObject({
      type: 'note',
      subtype: 'catchall',
      aiPlaced: false,
    });
    expect(Array.isArray(result.tags)).toBe(true);
    expect(result.tags).toEqual(
      expect.arrayContaining(['@DrSmith', '*meeting', '#2025-03-03', '#marketing', '#launch']),
    );
  });

  test('prioritizes journal type tag and adds emotion tags for reflections', async () => {
    const result = await engine.classify({
      text: 'Reflection: I feel anxious and grateful after the presentation',
    });

    expect(result).toMatchObject({
      type: 'note',
      subtype: 'journal',
      aiPlaced: true,
    });
    expect(Array.isArray(result.tags)).toBe(true);
    expect(result.tags).toEqual(expect.arrayContaining(['*journal', '#anxious', '#grateful']));
  });
});
