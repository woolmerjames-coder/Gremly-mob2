import {
  v2Reducer,
  initialV2State,
  classifyLogKind,
} from '../../components/overlay/overlayV2.state';

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

describe('Log kind classification (Phase L1)', () => {
  describe('classifyLogKind', () => {
    it('classifies journal entries', () => {
      expect(classifyLogKind('I feel great today!')).toBe('journal');
      expect(classifyLogKind("I'm feeling anxious about the meeting")).toBe('journal');
      expect(classifyLogKind('Today was amazing')).toBe('journal');
      expect(classifyLogKind('This morning I woke up early')).toBe('journal');
    });

    it('classifies ideas', () => {
      expect(classifyLogKind('Idea: create a new feature')).toBe('idea');
      expect(classifyLogKind('What if we tried a different approach?')).toBe('idea');
      expect(classifyLogKind('Maybe we could improve the design')).toBe('idea');
      expect(classifyLogKind('We should brainstorm solutions')).toBe('idea');
    });

    it('classifies lists', () => {
      expect(classifyLogKind('- Task 1\n- Task 2\n- Task 3')).toBe('list');
      expect(classifyLogKind('* Item A\n* Item B\n* Item C')).toBe('list');
      expect(classifyLogKind('1. First\n2. Second\n3. Third')).toBe('list');
    });

    it('defaults to basic for other content', () => {
      expect(classifyLogKind('Just a regular note')).toBe('basic');
      expect(classifyLogKind('Some random text without special keywords')).toBe('basic');
      expect(classifyLogKind('')).toBe('basic');
    });

    it('prioritizes list over journal/idea', () => {
      expect(classifyLogKind('I feel great:\n- Task 1\n- Task 2')).toBe('list');
      expect(classifyLogKind('Idea:\n* Point A\n* Point B')).toBe('list');
    });
  });

  describe('SET_TEXT updates log kind', () => {
    it('classifies log text as journal', () => {
      const s = { ...initialV2State, baseType: 'log' } as any;
      const after = v2Reducer(s, { type: 'SET_TEXT', text: 'I feel amazing today!' });
      expect(after.log.kind).toBe('journal');
      expect(after.log.body).toBe('I feel amazing today!');
    });

    it('classifies log text as idea', () => {
      const s = { ...initialV2State, baseType: 'log' } as any;
      const after = v2Reducer(s, { type: 'SET_TEXT', text: 'What if we tried a new approach?' });
      expect(after.log.kind).toBe('idea');
      expect(after.log.body).toBe('What if we tried a new approach?');
    });

    it('classifies log text as list', () => {
      const s = { ...initialV2State, baseType: 'log' } as any;
      const after = v2Reducer(s, { type: 'SET_TEXT', text: '- Item 1\n- Item 2\n- Item 3' });
      expect(after.log.kind).toBe('list');
      expect(after.log.body).toBe('- Item 1\n- Item 2\n- Item 3');
    });

    it('does not affect todo or habit types', () => {
      const sTodo = { ...initialV2State, baseType: 'todo' } as any;
      const afterTodo = v2Reducer(sTodo, { type: 'SET_TEXT', text: 'I feel great' });
      expect(afterTodo.todo.details).toBe('I feel great');

      const sHabit = { ...initialV2State, baseType: 'habit' } as any;
      const afterHabit = v2Reducer(sHabit, { type: 'SET_TEXT', text: 'I feel great' });
      expect(afterHabit.habit.notes).toBe('I feel great');
    });
  });

  describe('SET_BASE_TYPE updates kind when switching to log', () => {
    it('classifies text when switching from todo to log', () => {
      const s = {
        ...initialV2State,
        baseType: 'todo',
        todo: { ...initialV2State.todo, details: 'I feel wonderful today' },
      } as any;
      const after = v2Reducer(s, { type: 'SET_BASE_TYPE', to: 'log' });
      expect(after.baseType).toBe('log');
      expect(after.log.body).toBe('I feel wonderful today');
      expect(after.log.kind).toBe('journal');
    });

    it('classifies text when switching from habit to log', () => {
      const s = {
        ...initialV2State,
        baseType: 'habit',
        habit: { ...initialV2State.habit, notes: 'What if we could improve this?' },
      } as any;
      const after = v2Reducer(s, { type: 'SET_BASE_TYPE', to: 'log' });
      expect(after.baseType).toBe('log');
      expect(after.log.body).toBe('What if we could improve this?');
      expect(after.log.kind).toBe('idea');
    });
  });
});
