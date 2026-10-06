/**
 * The weekly review's cards (components/week), drawn from a made up person's
 * week as the session holds it: what each shows, which taps reach the review,
 * and what a card shows once the review has moved on from it.
 */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import type { WeekCardMeta } from '../../../lib/brief/types';
import { reviewOn, reviewWith } from '../../../lib/week/model';
import { resetWeekSession, setReview, useWeekSession } from '../../../lib/week/review/session';
import { useThisWeek } from '../../../lib/week/thisWeek';
import type { WeekReview } from '../../../lib/week/useWeekReview';
import {
  ID,
  SUN,
  THU,
  TUE,
  WED,
  WEEK_START,
  madeUpRead,
  madeUpRow,
} from '../../../lib/week/review/__tests__/madeUpWeek';
import { WeekCard } from '../WeekCard';
import { WeekFooter, WeekOfferButton } from '../WeekFooter';

jest.mock('lucide-react-native', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { View } = require('react-native');
  const icon = (name: string) => () => <View testID={`icon-${name}`} />;
  return {
    Star: icon('star'),
    X: icon('x'),
    Minus: icon('minus'),
    Plus: icon('plus'),
    Check: icon('check'),
    CalendarRange: icon('calendar-range'),
  };
});
jest.mock('../../../lib/repo/weekReviewRepo', () => ({
  getWeekReview: jest.fn(),
  getWeekSettings: jest.fn(),
  saveDaysOff: jest.fn(),
  saveWeeklyDay: jest.fn(),
}));
jest.mock('../../../lib/store/useGremlyStore', () => ({
  useGremlyStore: { getState: () => ({ userId: 'maya' }) },
}));

/** A review whose every action is a spy; live says whether the card is the one to act on. */
function fakeReview(live = true): WeekReview {
  return {
    open: jest.fn(),
    handleButton: jest.fn(),
    takeTyped: jest.fn(),
    carryOn: jest.fn(),
    onApplied: jest.fn(),
    context: jest.fn(),
    underWay: true,
    canCarryOn: false,
    loading: false,
    placeholder: null,
    busy: false,
    isLive: () => live,
    challenge: { agree: jest.fn(), disagree: jest.fn() },
    priorities: { toggle: jest.fn(), done: jest.fn() },
    shape: {
      toggleBusy: jest.fn(),
      stepHours: jest.fn(),
      removeDate: jest.fn(),
      addDate: jest.fn(),
      done: jest.fn(),
    },
    intention: { pick: jest.fn(), write: jest.fn(), done: jest.fn() },
    ahead: { toggleStep: jest.fn(), setUp: jest.fn(), undo: jest.fn(), done: jest.fn() },
    needsYou: { talk: jest.fn(), done: jest.fn() },
    edit: jest.fn(),
    justPlan: jest.fn(),
  } as unknown as WeekReview;
}

const meta = (card: WeekCardMeta['card'], over: Partial<WeekCardMeta> = {}): WeekCardMeta => ({
  type: 'week-card',
  card,
  week_start: WEEK_START,
  week: true,
  ...over,
});

/** The review under way on a step, as the session holds it on Maya's weekly day. */
function underWay(step: string, answers: Record<string, unknown> = {}, today = SUN) {
  const row = madeUpRow({ status: 'started', answers: { step, ...answers } as any });
  setReview(row, reviewWith(today, 0, row), null);
  return row;
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date(2026, 9, 4, 19, 40, 0));
  resetWeekSession();
  useWeekSession.setState({ threadId: 't1' });
  useThisWeek.setState({ weeklyDay: 0, daysOff: [0, 6], review: null, loaded: true });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('the opening and the end', () => {
  it('shows the review’s mark with when it was opened', () => {
    const { getByText } = render(
      <WeekCard
        messageId="m1"
        meta={meta('opening', { at: 'Sunday, 7:40 PM' })}
        review={fakeReview()}
      />,
    );
    expect(getByText('YOUR WEEKLY REVIEW')).toBeTruthy();
    expect(getByText('Sunday, 7:40 PM')).toBeTruthy();
  });

  it('shows the week in short from what the card keeps, with no row in hand', () => {
    const summary = {
      intention: 'Fewer things, finished.',
      tiles: [
        { num: '2', label: 'things that matter most' },
        { num: '3', label: "steps set up for what's coming" },
        { num: '1', label: 'thing talked through' },
      ],
    };
    const { getByText } = render(
      <WeekCard messageId="m9" meta={meta('done', { summary })} review={fakeReview(false)} />,
    );
    expect(getByText('YOUR WEEK')).toBeTruthy();
    expect(getByText('“Fewer things, finished.”')).toBeTruthy();
    expect(getByText('things that matter most')).toBeTruthy();
    expect(getByText('thing talked through')).toBeTruthy();
  });
});

describe('the challenge', () => {
  it('shows Gremly’s read, the figures behind it and what is coming up, and takes their answer', () => {
    underWay('challenge');
    const review = fakeReview();
    const { getByText, getByTestId } = render(
      <WeekCard messageId="m2" meta={meta('challenge')} review={review} />,
    );
    expect(getByText('Reports are due while the week is already full.')).toBeTruthy();
    expect(getByText('things waiting')).toBeTruthy();
    expect(getByText('A short week with the school trip in it.')).toBeTruthy();
    // inside the week a day's name; beyond it, the date
    expect(getByText('Thu')).toBeTruthy();
    expect(getByText('23 Oct')).toBeTruthy();
    expect(getByText('Parents evening')).toBeTruthy();
    fireEvent.press(getByTestId('week-challenge-agree'));
    expect(review.challenge.agree).toHaveBeenCalledTimes(1);
    fireEvent.press(getByTestId('week-challenge-disagree'));
    expect(review.challenge.disagree).toHaveBeenCalledTimes(1);
    fireEvent.press(getByTestId('week-just-plan'));
    expect(review.justPlan).toHaveBeenCalledTimes(1);
  });

  it('waits for their words, not a tap, once they have said not quite, and shows what they added', () => {
    underWay('challenge', { challenge: { agreed: false, note: 'The reports moved to November' } });
    useWeekSession.setState({ fixing: true });
    const { getByText, queryByTestId } = render(
      <WeekCard messageId="m2" meta={meta('challenge')} review={fakeReview()} />,
    );
    expect(queryByTestId('week-challenge-agree')).toBeNull();
    expect(getByText('YOU ADDED')).toBeTruthy();
    expect(getByText('The reports moved to November')).toBeTruthy();
  });

  it('keeps showing the read once it is settled, with their answer under it and no buttons', () => {
    underWay('priorities', { challenge: { agreed: true } });
    const { getByText, queryByTestId, getByTestId } = render(
      <WeekCard
        messageId="m2"
        meta={meta('challenge', { settled: "That's about right" })}
        review={fakeReview()}
      />,
    );
    expect(getByText('Reports are due while the week is already full.')).toBeTruthy();
    expect(queryByTestId('week-challenge-agree')).toBeNull();
    expect(getByTestId('week-settled')).toBeTruthy();
    expect(getByText("That's about right")).toBeTruthy();
  });
});

describe('what matters most', () => {
  it('shows every option with Gremly’s picks marked, and says how many are picked', () => {
    underWay('priorities');
    const review = fakeReview();
    const first = render(<WeekCard messageId="m3" meta={meta('priorities')} review={review} />);
    expect(first.getByLabelText("Get the reports started, Gremly's pick")).toBeTruthy();
    expect(first.getByLabelText('Sort the boiler')).toBeTruthy();
    expect(first.getByText('Skip this')).toBeTruthy();
    fireEvent.press(first.getByTestId('week-priority-2'));
    expect(review.priorities.toggle).toHaveBeenCalledWith(2);
    first.unmount();

    useWeekSession.setState((s) => ({ draft: { ...s.draft!, priorities: [0, 2] } }));
    const picked = render(<WeekCard messageId="m3" meta={meta('priorities')} review={review} />);
    expect(picked.getByText('These two')).toBeTruthy();
    expect(picked.getByTestId('week-priority-0').props.accessibilityState.selected).toBe(true);
    expect(picked.getByTestId('week-priority-1').props.accessibilityState.selected).toBe(false);
    fireEvent.press(picked.getByTestId('week-priorities-done'));
    expect(review.priorities.done).toHaveBeenCalledTimes(1);
  });

  it('shows what was kept once settled, with Change to open it again', () => {
    underWay('shape', { priorities: [{ text: 'Two swims', item_ids: [] }] });
    const review = fakeReview();
    const { getByTestId, queryByTestId, getByText } = render(
      <WeekCard
        messageId="m3"
        meta={meta('priorities', { settled: 'Two swims' })}
        review={review}
      />,
    );
    expect(getByTestId('week-priority-3').props.accessibilityState.selected).toBe(true);
    expect(queryByTestId('week-priorities-done')).toBeNull();
    expect(getByText('Change')).toBeTruthy();
    fireEvent.press(getByTestId('week-priorities-change'));
    expect(review.edit).toHaveBeenCalledWith('priorities');
  });

  it('says Save while a settled card is open again', () => {
    underWay('shape', { priorities: [{ text: 'Two swims', item_ids: [] }] });
    useWeekSession.setState({ editing: 'priorities' });
    const { getByText, queryByTestId } = render(
      <WeekCard messageId="m3" meta={meta('priorities')} review={fakeReview()} />,
    );
    expect(getByText('Save')).toBeTruthy();
    expect(queryByTestId('week-priorities-change')).toBeNull();
  });
});

describe('the shape of the week', () => {
  it('shows the deadlines, the busy days and the hours, each to change', () => {
    underWay('shape');
    const review = fakeReview();
    const { getByText, getByTestId, getByLabelText } = render(
      <WeekCard messageId="m4" meta={meta('shape')} review={review} />,
    );
    expect(getByText('School fair')).toBeTruthy();
    expect(getByText('Reports due')).toBeTruthy();
    fireEvent.press(getByLabelText('Remove School fair'));
    expect(review.shape.removeDate).toHaveBeenCalledWith(`note:${ID.fair}`);

    // Gremly's busy days, among the days being planned
    expect(getByTestId(`week-busy-${TUE}`).props.accessibilityState.selected).toBe(true);
    expect(getByTestId(`week-busy-${WED}`).props.accessibilityState.selected).toBe(false);
    fireEvent.press(getByTestId(`week-busy-${WED}`));
    expect(review.shape.toggleBusy).toHaveBeenCalledWith(WED);

    // his guess, in half hour steps
    expect(getByTestId('week-hours-normal_day').props.children).toBe('2h');
    expect(getByTestId('week-hours-busy_day').props.children).toBe('30m');
    expect(getByTestId('week-hours-weekend_day').props.children).toBe('4h');
    expect(getByText('Mon, Wed, Fri')).toBeTruthy();
    expect(getByText('Tue, Thu')).toBeTruthy();
    expect(getByText('A weekend day')).toBeTruthy();
    expect(getByText('About 15h this week')).toBeTruthy();
    // why he guessed what he did, while it is still his guess
    expect(getByText('Three evenings are taken this week.')).toBeTruthy();
    fireEvent.press(getByTestId('week-hours-more-normal_day'));
    expect(review.shape.stepHours).toHaveBeenCalledWith('normal_day', 0.5);
    fireEvent.press(getByTestId('week-hours-less-busy_day'));
    expect(review.shape.stepHours).toHaveBeenCalledWith('busy_day', -0.5);

    fireEvent.changeText(getByTestId('week-shape-add-input'), ' Passport renewal ');
    fireEvent.press(getByTestId('week-shape-add'));
    expect(review.shape.addDate).toHaveBeenCalledWith('Passport renewal');
    fireEvent.press(getByTestId('week-shape-done'));
    expect(review.shape.done).toHaveBeenCalledTimes(1);
  });

  it('leaves out a deadline they took off, and says a day off when their days off are not the weekend', () => {
    underWay('shape');
    useThisWeek.setState({ daysOff: [1, 2] });
    useWeekSession.setState((s) => ({
      draft: { ...s.draft!, datesOut: [`note:${ID.fair}`], busy: [] },
    }));
    const { queryByText, getByText } = render(
      <WeekCard messageId="m4" meta={meta('shape')} review={fakeReview()} />,
    );
    expect(queryByText('School fair')).toBeNull();
    expect(getByText('A day off')).toBeTruthy();
    expect(getByText('Mon, Tue')).toBeTruthy();
    expect(getByText('Mark busy days above')).toBeTruthy();
  });

  it('plans only the days left when it is picked up part way through the week', () => {
    underWay('shape', {}, WED);
    jest.setSystemTime(new Date(2026, 9, 7, 12, 0, 0));
    const { queryByTestId, getByTestId, queryByText } = render(
      <WeekCard messageId="m4" meta={meta('shape')} review={fakeReview()} />,
    );
    expect(queryByTestId(`week-busy-${TUE}`)).toBeNull();
    expect(getByTestId(`week-busy-${WED}`)).toBeTruthy();
    expect(getByTestId(`week-busy-${THU}`).props.accessibilityState.selected).toBe(true);
    // Wednesday to Sunday: two normal days, one busy, two days off
    expect(queryByText('About 12h 30m this week')).not.toBeNull();
  });
});

describe('the intention', () => {
  it('offers Gremly’s drafts and their own words', () => {
    underWay('intention');
    const review = fakeReview();
    const { getByText, getByTestId } = render(
      <WeekCard messageId="m5" meta={meta('intention')} review={review} />,
    );
    expect(getByText('Leave school by five twice.')).toBeTruthy();
    expect(getByText('Skip this')).toBeTruthy();
    fireEvent.press(getByTestId('week-intention-1'));
    expect(review.intention.pick).toHaveBeenCalledWith(1);
    fireEvent.changeText(getByTestId('week-intention-own'), 'Sleep more');
    expect(review.intention.write).toHaveBeenCalledWith('Sleep more');
  });

  it('says Keep this one once there is one to keep', () => {
    underWay('intention');
    useWeekSession.setState((s) => ({ draft: { ...s.draft!, intention: { pick: 2, own: '' } } }));
    const { getByText, getByTestId } = render(
      <WeekCard messageId="m5" meta={meta('intention')} review={fakeReview()} />,
    );
    expect(getByText('Keep this one')).toBeTruthy();
    expect(getByTestId('week-intention-2').props.accessibilityState.selected).toBe(true);
  });
});

describe('what is ahead', () => {
  it('shows each milestone with its steps to tap in or out, then sets it up', () => {
    underWay('ahead');
    const review = fakeReview();
    const { getByText, getByTestId, getByLabelText } = render(
      <WeekCard messageId="m6" meta={meta('ahead')} review={review} />,
    );
    expect(getByText('Reports handed in')).toBeTruthy();
    expect(getByText('23 Oct')).toBeTruthy();
    expect(getByText('Mon 5')).toBeTruthy();
    expect(getByText('Set up these three steps')).toBeTruthy();
    expect(getByText('Not now')).toBeTruthy();
    fireEvent.press(getByLabelText('Leave out Draft the first ten'));
    expect(review.ahead.toggleStep).toHaveBeenCalledWith(ID.reports, 1);
    fireEvent.press(getByTestId(`week-milestone-setup-${ID.reports}`));
    expect(review.ahead.setUp).toHaveBeenCalledWith(ID.reports);
  });

  it('counts the steps kept, and once set up offers the undo and Next', () => {
    underWay('ahead');
    useWeekSession.setState((s) => ({
      draft: { ...s.draft!, stepsOut: { [ID.reports]: [2] } },
    }));
    const one = render(<WeekCard messageId="m6" meta={meta('ahead')} review={fakeReview()} />);
    expect(one.getByText('Set up these two steps')).toBeTruthy();
    expect(one.getByLabelText('Keep How are the reports going?')).toBeTruthy();
    one.unmount();

    underWay('ahead', { milestones: [{ about: ID.reports, goal: 'Reports handed in', steps: 2 }] });
    useWeekSession.setState({ undoable: { [`milestone:${ID.reports}`]: true } });
    const review = fakeReview();
    const set = render(<WeekCard messageId="m6" meta={meta('ahead')} review={review} />);
    expect(set.getByText('Set up. Tap to undo')).toBeTruthy();
    expect(set.getByText('Next')).toBeTruthy();
    fireEvent.press(set.getByTestId(`week-milestone-undo-${ID.reports}`));
    expect(review.ahead.undo).toHaveBeenCalledWith(ID.reports);
  });
});

describe('what needs them', () => {
  it('shows each one with why it is stuck, to open and talk through or leave', () => {
    underWay('needs_you', {
      needs_you: [
        { title: 'Sort the boiler', item_ids: [ID.boiler], decision: 'Later, back 12 Oct' },
      ],
    });
    const review = fakeReview();
    const { getByText, getByTestId } = render(
      <WeekCard messageId="m7" meta={meta('needs_you')} review={review} />,
    );
    expect(getByText('It keeps slipping to the weekend.')).toBeTruthy();
    // what was decided on one shows on it, and it can be opened again
    expect(getByText('Later, back 12 Oct')).toBeTruthy();
    expect(getByText('Change')).toBeTruthy();
    expect(getByText('Talk it through')).toBeTruthy();
    fireEvent.press(getByTestId('week-needs-talk-1'));
    expect(review.needsYou.talk).toHaveBeenCalledWith(1);
    fireEvent.press(getByTestId('week-needs-done'));
    expect(review.needsYou.done).toHaveBeenCalledTimes(1);
  });
});

describe('a card that is not the one to act on', () => {
  it('shows only what was settled on it: a copy the review moved on from, or another week’s', () => {
    underWay('shape');
    const old = render(
      <WeekCard
        messageId="m3"
        meta={meta('priorities', { settled: 'Two swims' })}
        review={fakeReview(false)}
      />,
    );
    expect(old.getByText('Two swims')).toBeTruthy();
    expect(old.queryByTestId('week-priorities')).toBeNull();
    old.unmount();
    // a thread read back before its week is in hand
    resetWeekSession();
    const cold = render(<WeekCard messageId="m4" meta={meta('shape')} review={fakeReview()} />);
    expect(cold.toJSON()).toBeNull();
  });

  it('cannot be changed once the week is planned', () => {
    const row = madeUpRow({
      status: 'done',
      answers: { step: 'done', priorities: [{ text: 'Two swims', item_ids: [] }] },
    });
    setReview(row, reviewOn(SUN, 0), null);
    const { queryByTestId, getByTestId } = render(
      <WeekCard messageId="m3" meta={meta('priorities')} review={fakeReview()} />,
    );
    expect(getByTestId('week-priorities')).toBeTruthy();
    expect(queryByTestId('week-priorities-change')).toBeNull();
    expect(queryByTestId('week-priorities-done')).toBeNull();
  });
});

describe('under the thread', () => {
  it('shows the loading card while Gremly makes his read', () => {
    const { getByTestId, getByText, queryByTestId } = render(
      <WeekFooter loading canCarryOn={false} onCarryOn={jest.fn()} />,
    );
    expect(getByTestId('week-loading')).toBeTruthy();
    expect(getByText('Gremly is reading your week')).toBeTruthy();
    expect(queryByTestId('week-carry-on')).toBeNull();
  });

  it('shows Carry on when the review is waiting for it, and nothing otherwise', () => {
    const onCarryOn = jest.fn();
    const on = render(<WeekFooter loading={false} canCarryOn onCarryOn={onCarryOn} />);
    fireEvent.press(on.getByTestId('week-carry-on'));
    expect(onCarryOn).toHaveBeenCalledTimes(1);
    on.unmount();
    const off = render(<WeekFooter loading={false} canCarryOn={false} onCarryOn={onCarryOn} />);
    expect(off.toJSON()).toBeNull();
  });

  it('draws the button to their week with what it opens', () => {
    const onPress = jest.fn();
    const { getByText, getByTestId } = render(
      <WeekOfferButton label="Plan your week" onPress={onPress} />,
    );
    expect(getByText('Plan your week')).toBeTruthy();
    fireEvent.press(getByTestId('week-offer'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
