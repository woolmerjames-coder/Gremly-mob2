import { v2Reducer, initialV2State } from '../../components/overlay/overlayV2.state';

describe('v2Reducer - Phase 4 actions', () => {
  it('toggles expanded', () => {
    const s = { ...initialV2State, expanded: false };
    const next = v2Reducer(s, { type: 'TOGGLE_EXPANDED' });
    expect(next.expanded).toBe(true);
  });

  it('sets person, space, format and reminder', () => {
    const s = { ...initialV2State };
    const person = { id: 'p1', display: 'Sam' } as any;
    const afterPerson = v2Reducer(s, { type: 'SET_PERSON', person });
    expect(afterPerson.person).toEqual(person);

    const afterSpace = v2Reducer(afterPerson, { type: 'SET_SPACE', spaceId: 'space-1' });
    expect(afterSpace.spaceId).toBe('space-1');

    const afterFmt = v2Reducer(afterSpace, { type: 'SET_FORMAT', fmt: 'checkboxes' });
    expect(afterFmt.format).toBe('checkboxes');

    const afterRem = v2Reducer(afterFmt, {
      type: 'SET_REMINDER',
      when: '2025-01-01T00:00:00.000Z',
    });
    expect(afterRem.reminderAt).toBe('2025-01-01T00:00:00.000Z');
  });

  it('sets todo due date', () => {
    const s = { ...initialV2State, baseType: 'todo' } as any;
    const after = v2Reducer(s, { type: 'SET_TODO_DUE', due_at: '2025-02-02T00:00:00.000Z' });
    expect(after.todo.due_at).toBe('2025-02-02T00:00:00.000Z');
  });
});
