import { heuristicEngine } from '../../cortex/heuristicEngine';

describe('HeuristicEngine', () => {
  test('detects habit daily', async () => {
    const out = await heuristicEngine.classify({ text: 'Habit: meditate every day' });
    expect(out.type).toBe('habit');
    // @ts-expect-error - accessing discriminated union property
    expect(out.frequency).toBe('daily');
  });

  test('detects todo', async () => {
    const out = await heuristicEngine.classify({ text: 'Call the dentist' });
    expect(out.type).toBe('todo');
    // @ts-expect-error - accessing discriminated union property
    expect(out.undefinedDue).toBe(true);
  });

  test('detects list', async () => {
    const out = await heuristicEngine.classify({ text: '- buy milk\n- eggs' });
    expect(out.type).toBe('note');
    // Lists are no longer a subtype - heuristicEngine returns 'reference'
    // @ts-expect-error - accessing discriminated union property
    expect(out.subtype).toBe('reference');
  });

  test('default catchall', async () => {
    const out = await heuristicEngine.classify({ text: 'random brain dump' });
    expect(out.type).toBe('note');
    // @ts-expect-error - accessing discriminated union property
    expect(out.subtype).toBe('catchall');
  });
});
