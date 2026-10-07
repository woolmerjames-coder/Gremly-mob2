/**
 * Their own days on the board's step (components/week/KeepCards): the
 * question with each day's load, picking which to keep with pins, and the
 * card for one over-full day with Gremly's suggested moves. Each draws what
 * it is given and says what was tapped.
 */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { FitCard, KeepPick, KeepQuestion, OverfullCard, type DayLoad } from '../KeepCards';

jest.mock('lucide-react-native', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { View } = require('react-native');
  const icon = (name: string) => () => <View testID={`icon-${name}`} />;
  return {
    ArrowRight: icon('arrow-right'),
    Clock: icon('clock'),
    Pin: icon('pin'),
    PinOff: icon('pin-off'),
    ChevronRight: icon('chevron-right'),
  };
});

const [TUE, WED, THU] = ['2026-10-06', '2026-10-07', '2026-10-08'];
const TODAY = '2026-10-04';
const LOAD: DayLoad[] = [
  { day: TUE, minutes: 120, load: 60, count: 1, over: 0 },
  { day: WED, minutes: 120, load: 200, count: 5, over: 80 },
  { day: THU, minutes: 60, load: 0, count: 0, over: 0 },
];

describe('the question about their own days', () => {
  it('shows each day’s load against its hours, the over-full day marked, and takes their answer', () => {
    const onKeep = jest.fn();
    const { getByText, getByTestId, getByLabelText } = render(
      <KeepQuestion
        line="You've already put six todos on days this week."
        days={LOAD}
        onKeep={onKeep}
      />,
    );
    expect(getByText("You've already put six todos on days this week.")).toBeTruthy();
    // an hour on Tuesday; Wednesday is over by an hour and twenty
    expect(getByText('1h')).toBeTruthy();
    expect(getByText('+1h 20m')).toBeTruthy();
    expect(getByLabelText('Wednesday, over by 1h 20m')).toBeTruthy();
    expect(getByLabelText('Tuesday, 1h of 2h')).toBeTruthy();
    for (const [id, label] of [
      ['all', 'Keep my days'],
      ['some', 'Keep some'],
      ['none', 'Rearrange it all'],
    ]) {
      expect(getByText(label)).toBeTruthy();
      fireEvent.press(getByTestId(`week-keep-${id}`));
      expect(onKeep).toHaveBeenLastCalledWith(id);
    }
  });

  it('takes no tap while the review is busy', () => {
    const onKeep = jest.fn();
    const { getByTestId } = render(
      <KeepQuestion line="A line." days={LOAD} disabled onKeep={onKeep} />,
    );
    fireEvent.press(getByTestId('week-keep-none'));
    expect(onKeep).not.toHaveBeenCalled();
  });
});

describe('picking which of their days to keep', () => {
  const TODOS = [
    {
      id: 'marking',
      title: 'The Year 9 marking',
      minutes: 60,
      day: TUE,
      timed: false,
      freed: false,
    },
    {
      id: 'prep',
      title: 'Prepare for the review',
      minutes: 60,
      day: WED,
      timed: false,
      freed: false,
    },
    { id: 'paint', title: 'Order the paint', minutes: 45, day: WED, timed: false, freed: false },
    { id: 'dentist', title: 'The dentist', minutes: 30, day: WED, timed: true, freed: false },
  ];

  it('lists their todos by day with a pin each, and frees or keeps the one tapped', () => {
    const onToggle = jest.fn();
    const onDone = jest.fn();
    const { getByText, getByTestId, queryByTestId, queryByText } = render(
      <KeepPick days={LOAD} todos={TODOS} freed={['paint']} onToggle={onToggle} onDone={onDone} />,
    );
    expect(
      getByText('Tap a pin to free one for me to place. The rest stay where you put them.'),
    ).toBeTruthy();
    expect(getByText('Tuesday')).toBeTruthy();
    expect(getByText('Wednesday')).toBeTruthy();
    // a day with nothing of theirs on it is left out
    expect(queryByText('Thursday')).toBeNull();
    expect(getByText('3h 20m of 2h')).toBeTruthy();
    expect(getByTestId('week-keep-pin-prep').props.accessibilityState.selected).toBe(true);
    expect(getByTestId('week-keep-pin-paint').props.accessibilityState.selected).toBe(false);
    fireEvent.press(getByTestId('week-keep-pin-prep'));
    expect(onToggle).toHaveBeenLastCalledWith('prep');
    // a todo with a time of day stays on its day: it says so, and has no pin
    expect(getByText('30m · Has a time')).toBeTruthy();
    expect(queryByTestId('week-keep-pin-dentist')).toBeNull();
    fireEvent.press(getByTestId('week-keep-pick-done'));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe('the card for an over-full day', () => {
  const MOVES = [
    { id: 'paint', title: 'Order the paint', minutes: 45, to: THU, backOn: null },
    { id: 'forms', title: 'Fill in the forms', minutes: 30, to: null, backOn: '2026-10-13' },
  ];
  function card(over: Record<string, unknown> = {}) {
    const spies = { onTake: jest.fn(), onChange: jest.fn(), onLeave: jest.fn() };
    const screen = render(
      <OverfullCard
        day={WED}
        line="Wednesday holds 1h 20m more than it has room for."
        today={TODAY}
        fitting={false}
        moves={MOVES}
        note="The review prep stays."
        still={5}
        none="Nothing to move."
        {...spies}
        {...over}
      />,
    );
    return { ...screen, ...spies };
  }

  it('shows what Gremly would move and where to, and takes, changes or leaves it', () => {
    const { getByText, getByTestId, queryByText, onTake, onChange, onLeave } = card();
    expect(getByText('Wednesday holds 1h 20m more than it has room for.')).toBeTruthy();
    expect(getByText('Order the paint')).toBeTruthy();
    expect(getByText('Thu')).toBeTruthy();
    expect(getByText('Later, back Tue 13')).toBeTruthy();
    expect(getByText('The review prep stays.')).toBeTruthy();
    expect(getByText('That would still leave it 5m over.')).toBeTruthy();
    expect(queryByText('Nothing to move.')).toBeNull();
    fireEvent.press(getByTestId('week-overfull-take'));
    fireEvent.press(getByTestId('week-overfull-change'));
    fireEvent.press(getByTestId('week-overfull-leave'));
    expect(onTake).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it('says so when there is nothing to offer, and still lets them change the day or leave it', () => {
    const { getByText, getByTestId, queryByTestId, onChange, onLeave } = card({
      moves: [],
      note: '',
      still: 0,
    });
    expect(getByText('Nothing to move.')).toBeTruthy();
    expect(queryByTestId('week-overfull-take')).toBeNull();
    fireEvent.press(getByTestId('week-overfull-change'));
    fireEvent.press(getByTestId('week-overfull-leave'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it('says the suggestions are on their way while they are, with nothing to tap yet', () => {
    const { getByTestId, getByText, queryByTestId } = card({ fitting: true });
    expect(getByTestId('week-overfull-fitting')).toBeTruthy();
    expect(getByText('Gremly is working out what could move')).toBeTruthy();
    expect(queryByTestId('week-overfull-take')).toBeNull();
    expect(queryByTestId('week-overfull-leave')).toBeNull();
  });

  it('takes no tap while the review is busy', () => {
    const { getByTestId, onTake, onLeave } = card({ disabled: true });
    fireEvent.press(getByTestId('week-overfull-take'));
    fireEvent.press(getByTestId('week-overfull-leave'));
    expect(onTake).not.toHaveBeenCalled();
    expect(onLeave).not.toHaveBeenCalled();
  });
});

describe('the card for a todo that matters most and is on no day', () => {
  function card(over: Record<string, unknown> = {}) {
    const spies = { onDay: jest.fn(), onSplit: jest.fn(), onOpen: jest.fn(), onLeave: jest.fn() };
    const screen = render(
      <FitCard
        id="talk"
        line="“Write the talk” is one of the things that matter most this week, and at 5h it fits on no day as the week stands."
        dayLabel="Put it on Saturday"
        splitLabel="Split it in two"
        partsLine="2h 30m on Saturday and 2h 30m on Sunday"
        {...spies}
        {...over}
      />,
    );
    return { ...screen, ...spies };
  }

  it('says so, and offers the day with room, the split with its parts, the board or later', () => {
    const { getByText, getByTestId, queryByText, onDay, onSplit, onOpen, onLeave } = card();
    expect(getByText(/fits on no day as the week stands/)).toBeTruthy();
    expect(getByText('2h 30m on Saturday and 2h 30m on Sunday')).toBeTruthy();
    expect(queryByText(/No day has room for it/)).toBeNull();
    fireEvent.press(getByText('Put it on Saturday'));
    fireEvent.press(getByText('Split it in two'));
    fireEvent.press(getByTestId('week-fit-open'));
    fireEvent.press(getByText('Leave it for later'));
    expect(onDay).toHaveBeenCalledTimes(1);
    expect(onSplit).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it('offers only what there is: a split alone, or the board when nothing fits', () => {
    const split = card({ dayLabel: null });
    expect(split.queryByTestId('week-fit-day')).toBeNull();
    expect(split.getByTestId('week-fit-split')).toBeTruthy();
    split.unmount();
    const none = card({ dayLabel: null, splitLabel: null, partsLine: '' });
    expect(none.queryByTestId('week-fit-day')).toBeNull();
    expect(none.queryByTestId('week-fit-split')).toBeNull();
    expect(none.getByText(/No day has room for it, whole or in parts/)).toBeTruthy();
    expect(none.getByTestId('week-fit-open')).toBeTruthy();
    expect(none.getByTestId('week-fit-leave')).toBeTruthy();
  });
});
