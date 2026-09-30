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
  pendingTwinOf,
  lateCardAlreadyShown,
} from '../../../lib/chat/entityCards';
import type { EntityCard, SpaceChatMessage } from '../../../lib/types';

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

  test('adding to a note reads as an addition, on the card and in the pill', () => {
    expect(
      describeChange(vet, { field: 'body_add', from: null, to: 'Bring the stool sample' }),
    ).toEqual({ from: 'Current note', to: 'Bring the stool sample', label: 'Add to note' });
    expect(primaryLabel({ field: 'body_add', from: null, to: 'x' })).toBe('Yes, add it');
    expect(
      editPillTitle({
        entity_title: 'Clarify Mexico trip plans',
        entity_type: 'note',
        field: 'body_add',
        to: 'x',
      }),
    ).toBe('Add to Clarify Mexico trip plans');
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
      status: 'pending',
      summary: null,
      turns_ago: 1,
      card: { kind: 'edit' },
    });
    expect(recentEntityFor([msg('a1', 'assistant'), card('c1', 'applied')])).toMatchObject({
      id: 't1',
      status: 'applied',
      turns_ago: 0,
    });
    expect(recentEntityFor([msg('a1', 'assistant'), card('c1', 'pending', 'view')])).toMatchObject({
      id: 'n1',
      // a card that only showed the item is not waiting on a tap
      card: { kind: 'view', intent: 'edit', already: false },
    });
    // turned down carries over with its status, so the next turn excludes it;
    // a list not yet picked from gives nothing
    expect(recentEntityFor([msg('a1', 'assistant'), card('c1', 'declined')])).toMatchObject({
      id: 't1',
      status: 'declined',
    });
    expect(recentEntityFor([msg('a1', 'assistant'), card('c1', 'pending', 'choose')])).toBeNull();
    // how many messages ago the card was
    expect(
      recentEntityFor([card('c1'), msg('u2', 'user'), msg('a2', 'assistant'), msg('u3', 'user')])
        ?.turns_ago,
    ).toBe(2);
    // the newest card wins
    expect(
      recentEntityFor([
        card('c1', 'applied'),
        msg('a2', 'assistant'),
        card('c2', 'pending', 'view'),
      ])?.id,
    ).toBe('n1');
  });

  test('the same change offered again means the card still waiting for a tap', () => {
    const edit = card('c1');
    const meta = edit.metadata_json as { card: EntityCard };
    const same = meta.card as Extract<EntityCard, { kind: 'edit' }>;
    expect(pendingTwinOf([msg('a1', 'assistant'), edit, msg('u2', 'user')], same)?.id).toBe('c1');
    // a different change, an already tapped card, or a newer card in between: no twin
    const other = { ...same, change: { ...same.change, to: '2031-10-03' } };
    expect(pendingTwinOf([edit], other)).toBeNull();
    expect(pendingTwinOf([card('c1', 'applied')], same)).toBeNull();
    expect(pendingTwinOf([edit, card('c2', 'pending', 'view')], same)).toBeNull();
    expect(pendingTwinOf([], same)).toBeNull();
  });

  test('a late add-to or check-in shows once per item in a chat; an asked-for one always shows', () => {
    const meta = card('c1').metadata_json as { card: EntityCard };
    const dentist = (meta.card as Extract<EntityCard, { kind: 'edit' }>).entity;
    const addTo = (late: boolean, to = 'Porto') =>
      ({
        kind: 'edit',
        entity: dentist,
        change: { field: 'body_add', from: null, to },
        late,
      }) as EntityCard;
    const shown = [
      msg('a1', 'assistant'),
      msg('c9', 'system', { type: 'entity-card', status: 'declined', card: addTo(true) }),
    ];
    expect(lateCardAlreadyShown(shown, addTo(true, 'Lisbon'))).toBe(true);
    expect(lateCardAlreadyShown(shown, addTo(false, 'Lisbon'))).toBe(false);
    expect(lateCardAlreadyShown([], addTo(true))).toBe(false);
    const log = (late: boolean, to: string) =>
      ({
        kind: 'edit',
        entity: { ...dentist, type: 'habit' },
        change: { field: 'logged', from: null, to },
        late,
      }) as EntityCard;
    const logged = [
      msg('c8', 'system', {
        type: 'entity-card',
        status: 'applied',
        card: log(true, '2031-10-01'),
      }),
    ];
    expect(lateCardAlreadyShown(logged, log(true, '2031-10-01'))).toBe(true);
    expect(lateCardAlreadyShown(logged, log(true, '2031-10-02'))).toBe(false);
    // a day change the chat already offered and the user turned down is not offered again late
    const move = (late: boolean, to: string) =>
      ({
        kind: 'edit',
        entity: dentist,
        change: { field: 'due_day', from: null, to },
        late,
      }) as EntityCard;
    const declinedMove = [
      msg('c7', 'system', {
        type: 'entity-card',
        status: 'declined',
        card: move(false, '2031-10-02'),
      }),
    ];
    expect(lateCardAlreadyShown(declinedMove, move(true, '2031-10-02'))).toBe(true);
    expect(lateCardAlreadyShown(declinedMove, move(true, '2031-10-03'))).toBe(false);
    expect(lateCardAlreadyShown(declinedMove, move(false, '2031-10-02'))).toBe(false);
    // the check-in card's words
    const words = describeChange(
      { ...dentist, type: 'habit' },
      { field: 'logged', from: null, to: '2031-10-01' },
    );
    expect(words).toMatchObject({ from: 'Not logged', label: 'Log for' });
    expect(words.to).toMatch(/1 Oct|Today|Tomorrow/);
    expect(primaryLabel({ field: 'logged', from: null, to: '2031-10-01' })).toBe('Yes, log it');
  });
});
