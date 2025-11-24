import {
  appendLineageToWhyString,
  convertLogListToTodo,
  convertTodoToLogList,
  hasChecklist,
} from '../conversion';
import type { CreateRecordInput, UpdateRecordInput, IRepo } from '../repo/IRepo';
import type { Note, Todo } from '../types';

describe('conversion lineage helpers', () => {
  it('appends lineage to why_string', () => {
    expect(appendLineageToWhyString('', { originId: 'n1', source: 'log-list' })).toBe(
      'origin:n1;source:log-list',
    );
    expect(
      appendLineageToWhyString('Proxy classify: Note (70%)', {
        originId: 'n1',
        source: 'log-list',
      }),
    ).toBe('Proxy classify: Note (70%) | origin:n1;source:log-list');

    expect(
      appendLineageToWhyString('origin:n1;source:log-list', {
        originId: 'n1',
        source: 'log-list',
      }),
    ).toBe('origin:n1;source:log-list');
  });
});

type MinimalRepo = Pick<IRepo, 'getById' | 'create' | 'update'>;

const makeNote = (overrides: Partial<Note> = {}): Note => {
  const iso = new Date().toISOString();
  return {
    id: 'note-1',
    type: 'note',
    title: 'Daily Log',
    body: '- [ ] Stretch\n- [x] Meditate',
    subtype: 'reference',
    space_id: null,
    ai_placed: false,
    archived: false,
    why_string: '',
    origin: 'manual',
    canonicalType: 'log',
    labels: [],
    views: undefined,
    created_at: iso,
    updated_at: iso,
    owner_id: 'user-1',
    fmt: 'checkboxes',
    tags: null,
    date: null,
    mood: null,
    reminders: null,
    journal_subtype: null,
    has_list: true,
    list_items: [
      { id: 'item-1', text: 'Stretch', checked: false },
      { id: 'item-2', text: 'Meditate', checked: true },
    ],
    body_legacy: null,
    ...overrides,
  };
};

const makeTodo = (overrides: Partial<Todo> = {}): Todo => {
  const iso = new Date().toISOString();
  return {
    id: 'todo-1',
    type: 'todo',
    name: 'Follow up',
    title: undefined,
    body: '- [ ] Email team\n- [x] Update doc',
    space_id: null,
    due_date: null,
    due_time: null,
    reminders: null,
    undefined_due: undefined,
    notes: null,
    tags: null,
    subtype: null,
    ai_placed: false,
    archived: false,
    why_string: '',
    origin: 'manual',
    canonicalType: 'todo',
    labels: [],
    views: undefined,
    created_at: iso,
    updated_at: iso,
    owner_id: 'user-1',
    has_list: false,
    list_items: null,
    body_legacy: null,
    ...overrides,
  };
};

const createMockRepo = () => {
  const repo: jest.Mocked<MinimalRepo> = {
    getById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  return repo;
};

describe('convertLogListToTodo', () => {
  it('creates a todo with checklist body and archives source note', async () => {
    const repo = createMockRepo();
    const sourceNote = makeNote();
    repo.getById.mockResolvedValue(sourceNote);

    let capturedCreate: CreateRecordInput | undefined;
    const createdTodo = makeTodo({ id: 'todo-42', why_string: 'origin:note-1;source:log-list' });
    repo.create.mockImplementation(async (input: CreateRecordInput) => {
      capturedCreate = input;
      return createdTodo;
    });

    let capturedUpdate: UpdateRecordInput | undefined;
    repo.update.mockImplementation(async (input: UpdateRecordInput) => {
      capturedUpdate = input;
      return {
        ...sourceNote,
        ...input.patch,
      } as Note;
    });

    const result = await convertLogListToTodo(repo as unknown as IRepo, sourceNote.id);

    expect(repo.getById).toHaveBeenCalledWith(sourceNote.id);
    expect(capturedCreate).toMatchObject({
      type: 'todo',
      name: 'Daily Log',
      body: '- [ ] Stretch\n- [x] Meditate',
      why_string: 'origin:note-1;source:log-list',
    });
    expect(repo.create).toHaveBeenCalledTimes(1);

    expect(capturedUpdate).toMatchObject({
      id: sourceNote.id,
      patch: {
        archived: true,
        why_string: 'origin:todo-42;source:todo',
      },
    });
    expect(result.todo).toBe(createdTodo);
    expect(result.updatedNote.archived).toBe(true);
  });

  it('resets checkbox completion when preserveState is false', async () => {
    const repo = createMockRepo();
    const sourceNote = makeNote();
    repo.getById.mockResolvedValue(sourceNote);

    let capturedCreate: CreateRecordInput | undefined;
    repo.create.mockImplementation(async (input: CreateRecordInput) => {
      capturedCreate = input;
      return makeTodo({
        id: 'todo-99',
        body: input.body ?? undefined,
        why_string: input.why_string ?? '',
      });
    });

    repo.update.mockImplementation(
      async (input: UpdateRecordInput) =>
        ({
          ...sourceNote,
          ...input.patch,
        }) as Note,
    );

    await convertLogListToTodo(repo as unknown as IRepo, sourceNote.id, { preserveState: false });

    expect(capturedCreate?.body).toBe('- [ ] Stretch\n- [ ] Meditate');
  });
});

describe('convertTodoToLogList', () => {
  it('creates a log list note from a todo and archives the todo', async () => {
    const repo = createMockRepo();
    const sourceTodo = makeTodo();
    repo.getById.mockResolvedValue(sourceTodo);

    let capturedCreate: CreateRecordInput | undefined;
    const createdNote = makeNote({ id: 'note-77', body: '- [ ] Email team\n- [x] Update doc' });
    repo.create.mockImplementation(async (input: CreateRecordInput) => {
      capturedCreate = input;
      return createdNote;
    });

    let capturedUpdate: UpdateRecordInput | undefined;
    repo.update.mockImplementation(async (input: UpdateRecordInput) => {
      capturedUpdate = input;
      return {
        ...sourceTodo,
        ...input.patch,
      } as Todo;
    });

    const result = await convertTodoToLogList(repo as unknown as IRepo, sourceTodo.id);

    expect(repo.getById).toHaveBeenCalledWith(sourceTodo.id);
    expect(capturedCreate).toMatchObject({
      type: 'note',
      title: 'Follow up',
      body: '- [ ] Email team\n- [x] Update doc',
      subtype: 'reference',
      fmt: 'checkboxes',
      why_string: 'origin:todo-1;source:todo',
      has_list: true,
    });
    expect(capturedCreate?.list_items).toHaveLength(2);
    expect(capturedCreate?.list_items?.[0]).toMatchObject({
      text: 'Email team',
      checked: false,
    });
    expect(capturedCreate?.list_items?.[1]).toMatchObject({
      text: 'Update doc',
      checked: true,
    });

    expect(capturedUpdate).toMatchObject({
      id: sourceTodo.id,
      patch: {
        archived: true,
        why_string: 'origin:note-77;source:log-list',
      },
    });

    expect(result.note).toBe(createdNote);
    expect(result.updatedTodo.archived).toBe(true);
  });

  it('clears completion state when preserveState is false', async () => {
    const repo = createMockRepo();
    const sourceTodo = makeTodo();
    repo.getById.mockResolvedValue(sourceTodo);

    let capturedCreate: CreateRecordInput | undefined;
    repo.create.mockImplementation(async (input: CreateRecordInput) => {
      capturedCreate = input;
      return makeNote({ id: 'note-88', body: input.body ?? undefined });
    });

    repo.update.mockImplementation(
      async (input: UpdateRecordInput) =>
        ({
          ...sourceTodo,
          ...input.patch,
        }) as Todo,
    );

    await convertTodoToLogList(repo as unknown as IRepo, sourceTodo.id, { preserveState: false });

    expect(capturedCreate?.body).toBe('- [ ] Email team\n- [ ] Update doc');
  });
});

describe('hasChecklist', () => {
  it('detects at least one markdown checkbox', () => {
    expect(hasChecklist('- [ ] Task A\nNot a checkbox')).toBe(true);
    expect(hasChecklist('Just plain text')).toBe(false);
    expect(hasChecklist(null)).toBe(false);
  });
});
