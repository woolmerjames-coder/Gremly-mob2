/**
 * Entity card helpers: what the card and the Save items pill say, how cards
 * fold into the reply they came with, and which item carries into the next turn.
 */
import {
  formatDay,
  formatTime,
  entitySubtitle,
  entityWhen,
  describeChange,
  primaryLabel,
  editPillTitle,
  entityAfterChange,
  foldEntityCards,
  recentEntityFor,
} from '../../../lib/chat/entityCards';
import type { SpaceChatMessage } from '../../../lib/types';

const dentist = {
  id: 't1',
  type: 'todo' as const,
  title: 'Dentist',
  due_day: '2031-10-01',
  due_time: '14:00',
};

const vet = {
  id: 'n1',
  type: 'note' as const,
  title: 'Bella Vet Appointment',
  due_day: null,
  due_time: null,
};

function msg(
  id: string,
  role: SpaceChatMessage['role'],
  metadata_json: SpaceChatMessage['metadata_json'] = null,
): SpaceChatMessage {
  return {
    id,
    chat_id: 'c',
    scope_id: null,
    user_id: 'u',
    role,
    content: id,
    metadata_json,
    created_at: '2031-10-01T10:00:00Z',
  } as SpaceChatMessage;
}

describe('entity card wording', () => {
  test('formatDay and formatTime read like the mockup', () => {
    expect(formatDay('2031-10-01')).toBe('Wed 1 Oct');
    expect(formatDay(null)).toBe('');
    expect(formatTime('14:00')).toBe('2:00pm');
    expect(formatTime('14:00:00')).toBe('2:00pm');
    expect(formatTime('09:05')).toBe('9:05am');
    expect(formatTime('00:30')).toBe('12:30am');
    expect(formatTime(null)).toBe('');
  });

  test('subtitle per type, with the Space when known, short on an edit card', () => {
    expect(entitySubtitle(dentist)).toBe('Todo · Wed 1 Oct, 2:00pm');
    expect(entitySubtitle(dentist, { spaceName: 'Health' })).toBe(
      'Todo · Health · Wed 1 Oct, 2:00pm',
    );
    expect(entitySubtitle(dentist, { spaceName: 'Health', withWhen: false })).toBe('Todo · Health');
    expect(entitySubtitle({ id: 'h', type: 'habit', title: 'Run', frequency: 'weekdays' })).toBe(
      'Habit · weekdays',
    );
    expect(entitySubtitle({ id: 'n', type: 'note', title: 'Packing' })).toBe('Note');
    expect(entitySubtitle({ ...vet, due_day: '2031-10-03', due_time: '15:00' })).toBe(
      'Note · Fri 3 Oct, 3:00pm',
    );
    expect(entityWhen(vet)).toBe('');
  });

  test('describeChange keeps the day and time together in the change row', () => {
    expect(
      describeChange(dentist, { field: 'due_day', from: '2031-10-01', to: '2031-10-02' }),
    ).toEqual({ from: 'Wed 1 Oct, 2:00pm', to: 'Thu 2 Oct, 2:00pm', label: 'Change to' });
    expect(describeChange(dentist, { field: 'due_time', from: null, to: '15:30' })).toEqual({
      from: 'No time',
      to: 'Wed 1 Oct, 3:30pm',
      label: 'Change to',
    });
    expect(describeChange(vet, { field: 'due_day', from: null, to: '2031-10-03' })).toEqual({
      from: 'No day',
      to: 'Fri 3 Oct',
      label: 'Change to',
    });
    expect(
      describeChange(dentist, { field: 'name', from: 'Dentist', to: 'Dentist checkup' }),
    ).toEqual({ from: 'Dentist', to: 'Dentist checkup', label: 'Rename to' });
    expect(describeChange(dentist, { field: 'completed', from: null, to: 'done' })).toEqual({
      from: 'Open',
      to: 'Done',
      label: 'Mark as',
    });
  });

  test('the primary button says what the tap does', () => {
    expect(primaryLabel({ field: 'due_day', from: null, to: '2031-10-02' })).toBe('Yes, move it');
    expect(primaryLabel({ field: 'due_time', from: null, to: '15:00' })).toBe(
      'Yes, change the time',
    );
    expect(primaryLabel({ field: 'name', from: null, to: 'x' })).toBe('Yes, rename it');
    expect(primaryLabel({ field: 'completed', from: null, to: 'done' })).toBe('Yes, mark it done');
    expect(primaryLabel({ field: 'frequency', from: null, to: 'daily' })).toBe('Yes, change it');
  });

  test('the pill wording for an edit, notes included', () => {
    expect(editPillTitle({ entity_title: 'Dentist', field: 'due_day', to: '2031-10-02' })).toBe(
      'Update Dentist to Thu 2 Oct',
    );
    expect(
      editPillTitle({
        entity_title: 'Bella Vet Appointment',
        entity_type: 'note',
        field: 'due_day',
        to: '2031-10-03',
      }),
    ).toBe('Update Bella Vet Appointment to Fri 3 Oct');
    expect(
      editPillTitle({ entity_title: 'Morning run', field: 'frequency', to: 'three days a week' }),
    ).toBe('Update Morning run to three days a week');
  });

  test('an applied card reads as the item now is', () => {
    expect(
      entityAfterChange(vet, { field: 'due_day', from: null, to: '2031-10-03' }),
    ).toMatchObject({ due_day: '2031-10-03', target_date: '2031-10-03' });
    expect(entityAfterChange(dentist, { field: 'name', from: null, to: 'Teeth' }).title).toBe(
      'Teeth',
    );
  });
});

describe('cards in the chat list', () => {
  const card = (id: string, status = 'pending', kind: 'edit' | 'view' | 'choose' = 'edit') =>
    msg(id, 'system', {
      type: 'entity-card',
      status,
      card:
        kind === 'choose'
          ? { kind, candidates: [dentist, vet] }
          : kind === 'view'
            ? { kind, entity: vet, intent: 'edit' }
            : { kind, entity: dentist, change: { field: 'due_day', from: null, to: '2031-10-02' } },
    });

  test('a card folds into the reply before it; anything else stays a row', () => {
    const messages = [msg('u1', 'user'), msg('a1', 'assistant'), card('c1'), msg('u2', 'user')];
    const { rows, cardFor } = foldEntityCards(messages);
    expect(rows.map((m) => m.id)).toEqual(['u1', 'a1', 'u2']);
    expect(cardFor.get('a1')?.id).toBe('c1');
    // a card with no reply before it is kept as its own row, never dropped
    const orphan = foldEntityCards([msg('u1', 'user'), card('c1')]);
    expect(orphan.rows.map((m) => m.id)).toEqual(['u1', 'c1']);
    expect(orphan.cardFor.size).toBe(0);
    // two cards after one reply: the second is not lost either
    const two = foldEntityCards([msg('a1', 'assistant'), card('c1'), card('c2')]);
    expect(two.rows.map((m) => m.id)).toEqual(['a1', 'c2']);
  });

  test('the last card shown is the item the next turn can mean', () => {
    expect(recentEntityFor([msg('u1', 'user')])).toBeNull();
    const shown = recentEntityFor([msg('a1', 'assistant'), card('c1'), msg('u2', 'user')]);
    expect(shown).toEqual({
      id: 't1',
      type: 'todo',
      title: 'Dentist',
      due_day: '2031-10-01',
      due_time: '14:00',
      frequency: null,
      space_id: null,
    });
    expect(recentEntityFor([msg('a1', 'assistant'), card('c1', 'applied')])?.id).toBe('t1');
    expect(recentEntityFor([msg('a1', 'assistant'), card('c1', 'pending', 'view')])?.id).toBe('n1');
    // turned down, or a list not yet picked from: nothing carries over
    expect(recentEntityFor([msg('a1', 'assistant'), card('c1', 'declined')])).toBeNull();
    expect(recentEntityFor([msg('a1', 'assistant'), card('c1', 'pending', 'choose')])).toBeNull();
    // the newest card wins
    expect(
      recentEntityFor([
        card('c1', 'applied'),
        msg('a2', 'assistant'),
        card('c2', 'pending', 'view'),
      ])?.id,
    ).toBe('n1');
  });
});
