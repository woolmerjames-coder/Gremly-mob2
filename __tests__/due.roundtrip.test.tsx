import { toCreateOrUpdateInput } from '../components/overlay/overlayV2.mapping';
import { initialV2State } from '../components/overlay/overlayV2.state';
import { formatDue } from '../app/screens/CatchAllNotepad';

describe('Mind Drop — Due date round-trip', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-11-14T09:00:00.000Z'));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('persists due_at through provisional save and renders badge text', () => {
    const dueAt = new Date('2025-11-14T18:30:00.000Z').toISOString();

    const state = {
      ...initialV2State,
      baseType: 'todo' as const,
      todo: {
        ...initialV2State.todo,
        title: 'Follow up with planner',
        details: 'Follow up with planner',
        due_at: dueAt,
      },
    };

    const payload = toCreateOrUpdateInput('todo', state, null);

    expect(payload.due_at).toBe(dueAt);

    const badge = formatDue(payload.due_at);
    expect(badge).toContain('due');
    expect(badge).not.toBe('no deadline yet');
  });

  it('clearing due_at removes badge text after save', () => {
    const state = {
      ...initialV2State,
      baseType: 'todo' as const,
      todo: {
        ...initialV2State.todo,
        title: 'Clear due date example',
        details: 'Clear due date example',
        due_at: null,
      },
    };

    const payload = toCreateOrUpdateInput('todo', state, null);
    expect(payload.due_at).toBeNull();
    expect(formatDue(payload.due_at)).toBe('no deadline yet');
  });
});
