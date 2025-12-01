import { toCreateOrUpdateInput } from '../components/overlay/overlayV2.mapping';
import { initialV2State } from '../components/overlay/overlayV2.state';
import { formatDue } from '../lib/date/formatDue';

describe('Mind Drop — Due date round-trip (Gremly date model)', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-11-14T09:00:00.000Z'));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('persists due_day and due_time through provisional save', () => {
    // Gremly date model: use due_day (YYYY-MM-DD) and due_time instead of due_at
    const dueDay = '2025-11-14';
    const dueTime = '18:30:00';

    const state = {
      ...initialV2State,
      baseType: 'todo' as const,
      todo: {
        ...initialV2State.todo,
        title: 'Follow up with planner',
        details: 'Follow up with planner',
        due_day: dueDay,
        due_time: dueTime,
      },
    };

    const payload = toCreateOrUpdateInput('todo', state, null);

    // Gremly date model: due_at is always null, use due_day/due_time instead
    expect(payload.due_at).toBeNull();
    expect(payload.due_day).toBe(dueDay);
    expect(payload.due_time).toBe(dueTime);
  });

  it('clearing due_day removes due date after save', () => {
    const state = {
      ...initialV2State,
      baseType: 'todo' as const,
      todo: {
        ...initialV2State.todo,
        title: 'Clear due date example',
        details: 'Clear due date example',
        due_day: null,
        due_time: null,
      },
    };

    const payload = toCreateOrUpdateInput('todo', state, null);
    expect(payload.due_at).toBeNull();
    expect(payload.due_day).toBeNull();
    expect(formatDue(payload.due_at)).toBe('no deadline yet');
  });
});
