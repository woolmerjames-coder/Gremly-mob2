/**
 * Your week, drawn (components/week/YourWeekView): the week it is given, each
 * day opened to what was planned and how it went, and the taps that leave the
 * screen. The person is made up (Maya): Monday 5 to Sunday 11 October 2026,
 * read on the Wednesday.
 */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { yourWeekOf } from '../../../lib/week/yourWeek';
import { YourWeekView, type YourWeekViewProps } from '../YourWeekView';

jest.mock('lucide-react-native', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { View } = require('react-native');
  const icon = (name: string) => () => <View testID={`icon-${name}`} />;
  return {
    ArrowRight: icon('arrow-right'),
    Check: icon('check'),
    ChevronDown: icon('chevron-down'),
    ChevronUp: icon('chevron-up'),
    Clock: icon('clock'),
    MessageCircle: icon('message-circle'),
    Star: icon('star'),
    X: icon('x'),
  };
});

const [MON, TUE, WED, THU, SAT] = [
  '2026-10-05',
  '2026-10-06',
  '2026-10-07',
  '2026-10-08',
  '2026-10-10',
];

function madeUpWeek(answers: Record<string, unknown> = {}, today = WED) {
  return yourWeekOf({
    today,
    row: {
      week_start: MON,
      answers: {
        intention: 'Fewer things, finished.',
        priorities: [
          { text: 'Get the reports started', item_ids: [] },
          { text: 'Two swims', item_ids: [] },
        ],
        planned: {
          todos: 6,
          later: 1,
          habit_days: 2,
          days: {
            [MON]: { todos: ['reports', 'boiler', 'desk', 'forms'], habits: ['swim'] },
            [TUE]: { todos: ['marking'], habits: ['read'] },
            [WED]: { todos: ['present'], habits: [] },
            [SAT]: { todos: [], habits: ['swim'] },
          },
        },
        ...answers,
      },
    },
    todos: [
      { id: 'reports', name: 'Gather the grades', completed_at: `${MON}T17:00:00Z` },
      { id: 'boiler', name: 'Sort the boiler', due_day: THU },
      { id: 'desk', name: 'Look at standing desks', resurface_at: '2026-10-13' },
      { id: 'forms', name: 'Dentist forms', archived: true },
      { id: 'marking', name: 'The Year 9 marking', due_day: TUE },
      { id: 'present', name: 'Find a present', due_day: WED },
      { id: 'call', name: 'Call the plumber', completed_at: `${MON}T12:00:00Z` },
    ],
    habits: [
      { id: 'swim', name: 'Swim' },
      { id: 'read', name: 'Read' },
    ],
    habitPlans: [],
    habitProgress: [{ habit_id: 'swim', occurred_day: MON, count: 1 }],
    dayOf: (ts) => ts.slice(0, 10),
  });
}

function view(over: Partial<YourWeekViewProps> = {}) {
  const onChange = jest.fn();
  const screen = render(
    <YourWeekView week={madeUpWeek()} today={WED} onChange={onChange} {...over} />,
  );
  return { ...screen, onChange };
}

describe('your week, drawn', () => {
  it('shows the intention, what matters most, and each day with how it went', () => {
    const { getByText, getAllByText } = view();
    expect(getByText('YOUR INTENTION')).toBeTruthy();
    expect(getByText('“Fewer things, finished.”')).toBeTruthy();
    expect(getByText('What matters most')).toBeTruthy();
    expect(getByText('Get the reports started')).toBeTruthy();
    expect(getByText('Two swims')).toBeTruthy();
    // four todos and the swim were planned for Monday; one more thing was done
    expect(getByText('Mon 5')).toBeTruthy();
    expect(getByText('2 of 5 done, and 1 more')).toBeTruthy();
    expect(getByText('0 of 2 done')).toBeTruthy();
    expect(getByText('Today, Wed 7')).toBeTruthy();
    expect(getByText('0 of 1 done')).toBeTruthy();
    expect(getByText('Thu 8')).toBeTruthy();
    // the boiler, moved to Thursday since; and Saturday's swim
    expect(getAllByText('1 planned')).toHaveLength(2);
    expect(getByText('One thing is waiting in Later. It comes back Tue 13.')).toBeTruthy();
  });

  it('opens on today, and opens another day on a tap with what became of each thing', () => {
    const { getByText, getAllByText, getByTestId, queryByText } = view();
    // today is open: its one todo, still to do
    expect(getByText('Find a present')).toBeTruthy();
    expect(getByTestId(`your-week-day-${WED}`).props.accessibilityState.expanded).toBe(true);
    expect(queryByText('Gather the grades')).toBeNull();
    fireEvent.press(getByTestId(`your-week-day-${MON}`));
    expect(getByText('Gather the grades')).toBeTruthy();
    expect(getByText('Moved to Thu')).toBeTruthy();
    expect(getByText('In Later, back Tue 13')).toBeTruthy();
    expect(getByText('Let go')).toBeTruthy();
    expect(getByText('Call the plumber')).toBeTruthy();
    expect(getByText('Swim')).toBeTruthy();
    // a day gone by says what was not done on it
    fireEvent.press(getByTestId(`your-week-day-${TUE}`));
    expect(getByText('The Year 9 marking')).toBeTruthy();
    // the marking, and the reading planned for that day
    expect(getAllByText('Not done')).toHaveLength(2);
    // and closes again on a second tap
    fireEvent.press(getByTestId(`your-week-day-${MON}`));
    expect(queryByText('Gather the grades')).toBeNull();
  });

  it('says so on a day with nothing on it', () => {
    const { getByTestId, getByText } = view();
    fireEvent.press(getByTestId('your-week-day-2026-10-09'));
    expect(getByText('Nothing on this day yet.')).toBeTruthy();
  });

  it('leaves out the intention and what matters most when the week kept none', () => {
    const { queryByText } = view({
      week: madeUpWeek({ intention: null, priorities: [] }),
    });
    expect(queryByText('YOUR INTENTION')).toBeNull();
    expect(queryByText('What matters most')).toBeNull();
  });

  it('opens the first day when today is not in the week', () => {
    const { getByTestId } = view({ week: madeUpWeek({}, '2026-10-04'), today: '2026-10-04' });
    expect(getByTestId(`your-week-day-${MON}`).props.accessibilityState.expanded).toBe(true);
  });
});

describe('the ways on from your week', () => {
  it('changes the week, and offers more planning and the conversation only when given', () => {
    const bare = view();
    fireEvent.press(bare.getByTestId('your-week-change'));
    expect(bare.onChange).toHaveBeenCalledTimes(1);
    expect(bare.queryByTestId('your-week-plan-more')).toBeNull();
    expect(bare.queryByTestId('your-week-conversation')).toBeNull();
    bare.unmount();
    const onPress = jest.fn();
    const onConversation = jest.fn();
    const full = view({
      planMore: { label: 'Plan the rest of it again', onPress },
      onConversation,
    });
    expect(full.getByText('Plan the rest of it again')).toBeTruthy();
    fireEvent.press(full.getByTestId('your-week-plan-more'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(full.getByText('Open the conversation')).toBeTruthy();
    fireEvent.press(full.getByTestId('your-week-conversation'));
    expect(onConversation).toHaveBeenCalledTimes(1);
  });

  it('says what was just saved, with its Undo while there is one', () => {
    const onUndo = jest.fn();
    const saved = view({ notice: { text: 'Saved. Your week is changed.', onUndo } });
    expect(saved.getByText('Saved. Your week is changed.')).toBeTruthy();
    // it sits by the button that made it, under the days, where they are looking
    const drawn = JSON.stringify(saved.toJSON());
    expect(drawn.indexOf('your-week-notice')).toBeGreaterThan(drawn.indexOf(`your-week-${SAT}`));
    expect(drawn.indexOf('your-week-notice')).toBeLessThan(drawn.indexOf('your-week-change'));
    fireEvent.press(saved.getByTestId('your-week-undo'));
    expect(onUndo).toHaveBeenCalledTimes(1);
    saved.unmount();
    const undone = view({ notice: { text: 'Taken back. Your week is as it was.' } });
    expect(undone.getByTestId('your-week-notice')).toBeTruthy();
    expect(undone.queryByTestId('your-week-undo')).toBeNull();
  });

  it('says of a todo put off until a day that it is back from Later, or comes back, on that day', () => {
    const week = madeUpWeek();
    const withBack = {
      ...week,
      days: week.days.map((d) =>
        d.day === WED || d.day === THU
          ? {
              ...d,
              todos: [
                ...d.todos,
                {
                  id: `paint-${d.day}`,
                  title: `Order the paint ${d.day === WED ? 'today' : 'ahead'}`,
                  state: 'back' as const,
                  planned: false,
                  to: null,
                },
              ],
            }
          : d,
      ),
    };
    const { getByText, getByTestId } = view({ week: withBack });
    expect(getByText('Order the paint today')).toBeTruthy();
    expect(getByText('Back from Later')).toBeTruthy();
    fireEvent.press(getByTestId(`your-week-day-${THU}`));
    expect(getByText('Order the paint ahead')).toBeTruthy();
    expect(getByText('Comes back from Later')).toBeTruthy();
  });

  it('takes no tap while a change is being saved', () => {
    const onUndo = jest.fn();
    const onPress = jest.fn();
    const { getByTestId, onChange } = view({
      busy: true,
      notice: { text: 'Saved. Your week is changed.', onUndo },
      planMore: { label: 'Plan next week', onPress },
    });
    fireEvent.press(getByTestId('your-week-change'));
    fireEvent.press(getByTestId('your-week-undo'));
    fireEvent.press(getByTestId('your-week-plan-more'));
    expect(onChange).not.toHaveBeenCalled();
    expect(onUndo).not.toHaveBeenCalled();
    expect(onPress).not.toHaveBeenCalled();
  });
});
