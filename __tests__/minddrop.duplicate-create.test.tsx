import { __mindDropTestHooks } from '../app/screens/CatchAllNotepad';

describe('Mind Drop Idempotency', () => {
  it('coalesces concurrent work for the same drop id', async () => {
    const { withDropLock } = __mindDropTestHooks;
    const dropId = '00000000-0000-4000-8000-000000000001';

    const task = jest.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return 'todo-123';
    });

    const first = withDropLock(dropId, task);
    const second = withDropLock(dropId, task);

    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult).toBe('todo-123');
    expect(secondResult).toBe('todo-123');
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('allows subsequent drop ids to execute independently', async () => {
    const { withDropLock } = __mindDropTestHooks;
    const results: string[] = [];

    await Promise.all([
      withDropLock('00000000-0000-4000-8000-0000000000aa', async () => {
        results.push('first');
        return 'first';
      }),
      withDropLock('00000000-0000-4000-8000-0000000000bb', async () => {
        results.push('second');
        return 'second';
      }),
    ]);

    expect(results).toHaveLength(2);
    expect(results.sort()).toEqual(['first', 'second']);
  });
});
