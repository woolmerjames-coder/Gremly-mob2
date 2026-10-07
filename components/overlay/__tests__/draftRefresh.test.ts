/**
 * The overlay's draft when its item changes in the store while it is open.
 */
import { addedText, changedFields, refreshedDraft, same } from '../draftRefresh';

describe('same', () => {
  it('compares values, whatever order the keys come in', () => {
    expect(same({ a: 1, b: [1, { c: 2, d: 3 }] }, { b: [1, { d: 3, c: 2 }], a: 1 })).toBe(true);
    expect(same({ a: 1 }, { a: 1, b: undefined })).toBe(true);
    expect(same(null, undefined)).toBe(true);
    expect(same({ a: 1 }, { a: 2 })).toBe(false);
    expect(same([1, 2], [2, 1])).toBe(false);
    expect(same('', null)).toBe(false);
  });
});

describe('addedText', () => {
  it('is what was put on the end, and nothing else', () => {
    expect(addedText('Call the vet', 'Call the vet\n\nBring her records')).toBe(
      'Bring her records',
    );
    expect(addedText('Call the vet  \n', 'Call the vet\n\nBring her records')).toBe(
      'Bring her records',
    );
    expect(addedText('', 'Bring her records')).toBe('Bring her records');
  });

  it('is nothing when the text changed any other way', () => {
    expect(addedText('Call the vet', 'Ring the vet\n\nBring her records')).toBeNull();
    expect(addedText('Call the vet', 'Call the vet')).toBeNull();
    expect(addedText('Call the vet', 'Call')).toBeNull();
    expect(addedText('Call the vet', 'Call the vet   ')).toBeNull();
  });
});

describe('refreshedDraft', () => {
  const was = {
    compactTitle: 'Vet visit',
    itemReminders: [],
    tagsDirty: false,
    todo: { title: 'Vet visit', details: 'Call the vet', due_day: '2026-10-08' },
    log: { body: 'Call the vet' },
  };
  const now = {
    ...was,
    todo: { ...was.todo, details: 'Call the vet\n\nBring her records' },
    log: { body: 'Call the vet\n\nBring her records' },
  };
  const ADDED = 'Bring her records';

  it('gives the notes the new text when the person has not touched them', () => {
    const out = refreshedDraft(was, was, now, ADDED);
    expect(out.todo.details).toBe('Call the vet\n\nBring her records');
    expect(out.log.body).toBe('Call the vet\n\nBring her records');
    // nothing else is replaced
    expect(Object.keys(out).sort()).toEqual(['log', 'todo']);
    expect(out.todo.due_day).toBe('2026-10-08');
  });

  it('keeps what they typed, with what was added on the end of it', () => {
    const draft = { ...was, todo: { ...was.todo, details: 'Call the vet before 9' } };
    const out = refreshedDraft(draft, was, now, ADDED);
    expect(out.todo.details).toBe('Call the vet before 9\n\nBring her records');
  });

  it('takes the addition off the end of theirs again when it is taken back', () => {
    // they typed, Gremly added, and then the card's Undo put the item's notes back
    const draft = {
      ...was,
      todo: { ...was.todo, details: 'Call the vet before 9\n\nBring her records' },
    };
    const out = refreshedDraft(draft, now, was, null, ADDED);
    expect(out.todo.details).toBe('Call the vet before 9');
    // what they typed is left alone when it does not end with what was taken back
    const other = { ...was, todo: { ...was.todo, details: 'Call the vet before 9' } };
    expect(refreshedDraft(other, now, was, null, ADDED)).toEqual({});
  });

  it('keeps what they typed as it is when the notes changed some other way', () => {
    const draft = { ...was, todo: { ...was.todo, details: 'Call the vet before 9' } };
    const rewritten = { ...was, todo: { ...was.todo, details: 'Ring the surgery' } };
    expect(refreshedDraft(draft, was, rewritten, null)).toEqual({});
  });

  it('brings in every part that changed and that they left alone', () => {
    const moved = {
      ...was,
      compactTitle: 'Vet visit for Bella',
      itemReminders: [{ id: 'r1' }],
      todo: { ...was.todo, title: 'Vet visit for Bella', due_day: '2026-10-09' },
    };
    const out = refreshedDraft(was, was, moved, null);
    expect(out.compactTitle).toBe('Vet visit for Bella');
    expect(out.itemReminders).toEqual([{ id: 'r1' }]);
    expect(out.todo).toEqual({ ...was.todo, title: 'Vet visit for Bella', due_day: '2026-10-09' });
  });

  it('leaves a part they changed, even when the item changed it too', () => {
    const draft = { ...was, todo: { ...was.todo, due_day: '2026-10-12' }, compactTitle: 'Vet' };
    const moved = {
      ...was,
      compactTitle: 'Vet visit for Bella',
      todo: { ...was.todo, due_day: '2026-10-09' },
    };
    expect(refreshedDraft(draft, was, moved, null)).toEqual({});
  });

  it('changes nothing when the item reads the same as before', () => {
    expect(refreshedDraft(was, was, { ...was }, null)).toEqual({});
  });
});

describe('changedFields', () => {
  it('is the fields of the record that changed', () => {
    expect(
      changedFields(
        { id: 't1', body: 'a', views: { x: 1 }, due_day: '2026-10-08' },
        { id: 't1', body: 'a\n\nb', views: { x: 1, change_log: [1] }, due_day: '2026-10-08' },
      ),
    ).toEqual({ body: 'a\n\nb', views: { x: 1, change_log: [1] } });
  });
});
