import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { PlanCard, planRows } from '../PlanCard';
import type { BriefPlanMeta } from '../../../lib/brief/types';

jest.mock('../../../lib/date/DateService', () => ({
  getDateService: () => ({ today: () => '2026-09-30' }),
}));

const MEETINGS = [{ id: 'm1', title: 'Search connect', start: 900, end: 930 }];
const META: BriefPlanMeta = {
  type: 'brief-plan',
  version: 1,
  status: 'proposal',
  date: '2026-09-30',
  from: 795,
  items: [
    {
      id: 'social',
      kind: 'habit',
      title: 'Social posts',
      start: 810,
      end: 840,
      reason: 'Behind this week',
    },
    { id: 'run', kind: 'habit', title: 'Run', start: 1080, end: 1125, reason: 'Weekly' },
  ],
  unplaced: [],
};

describe('the plan card', () => {
  it('shows the summary, meetings, items and free gaps in time order', () => {
    const rows = planRows(META, MEETINGS);
    expect(rows.map((r) => r.type)).toEqual(['item', 'gap', 'meet', 'gap', 'item', 'gap']);
    expect(rows[1]).toMatchObject({ type: 'gap', start: 840, end: 900 });
    const { getByText } = render(<PlanCard meta={META} meetings={MEETINGS} />);
    expect(getByText('Your afternoon')).toBeTruthy();
    expect(getByText('2 things, 1h 15m, still 7h free')).toBeTruthy();
    expect(getByText('Proposal')).toBeTruthy();
    expect(getByText('Meeting, 30m')).toBeTruthy();
    expect(getByText('2h 30m free')).toBeTruthy();
    expect(getByText('Free until 10pm')).toBeTruthy();
  });

  it('on a travel day, ends at setting off and flags a meeting after it', () => {
    const meta: BriefPlanMeta = {
      ...META,
      from: 510,
      items: [{ id: 'mum', kind: 'todo', title: 'Call Mum', start: 720, end: 740 }],
    };
    const meetings = [
      { id: 'h', title: 'Team huddle', start: 480, end: 510 },
      { id: 't', title: 'Timesheets', start: 960, end: 990 },
    ];
    const blocks = [
      {
        id: 'b',
        title: 'Leave for the airport',
        start: 750,
        end: null,
        travel: true,
        source: 'chat' as const,
      },
    ];
    const rows = planRows(meta, meetings, blocks, 750);
    expect(rows.map((r) => r.type)).toEqual(['gap', 'item', 'fixed', 'meet']);
    expect(rows[3]).toMatchObject({ title: 'Timesheets', during: true });
    const { getByText, queryByText } = render(
      <PlanCard meta={meta} meetings={meetings} blocks={blocks} planEnd={750} />,
    );
    expect(getByText('Leave for the airport')).toBeTruthy();
    expect(getByText('Set time, travel')).toBeTruthy();
    expect(getByText("Meeting, while you're travelling")).toBeTruthy();
    expect(getByText('Free, 8:30am to 12:30pm')).toBeTruthy();
    expect(queryByText('Free until 10pm')).toBeNull();
  });

  it('removes, adds, locks in and puts aside', () => {
    const onRemove = jest.fn();
    const onAdd = jest.fn();
    const onLock = jest.fn();
    const onDismiss = jest.fn();
    const { getByTestId } = render(
      <PlanCard
        meta={META}
        meetings={MEETINGS}
        onRemove={onRemove}
        onAdd={onAdd}
        onLock={onLock}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.press(getByTestId('plan-remove-run'));
    fireEvent.press(getByTestId('plan-add'));
    fireEvent.press(getByTestId('plan-lock'));
    fireEvent.press(getByTestId('plan-dismiss'));
    expect(onRemove).toHaveBeenCalledWith('run');
    expect(onAdd).toHaveBeenCalled();
    expect(onLock).toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalled();
  });

  it('points a locked plan to Today, with no remove buttons', () => {
    const onSeeToday = jest.fn();
    const { getByText, queryByTestId, getByTestId } = render(
      <PlanCard meta={{ ...META, status: 'locked' }} meetings={MEETINGS} onSeeToday={onSeeToday} />,
    );
    expect(getByText('Locked in')).toBeTruthy();
    expect(queryByTestId('plan-remove-run')).toBeNull();
    fireEvent.press(getByTestId('plan-see-today'));
    expect(onSeeToday).toHaveBeenCalled();
  });

  it('names a plan made for tomorrow', () => {
    const { getByText } = render(
      <PlanCard meta={{ ...META, date: '2026-10-01', from: 480 }} meetings={[]} />,
    );
    expect(getByText('Tomorrow')).toBeTruthy();
  });

  it('folds earlier and put-aside plans to one line', () => {
    expect(
      render(<PlanCard meta={{ ...META, status: 'replaced' }} meetings={[]} />).getByText(
        'Earlier plan, replaced by the one below',
      ),
    ).toBeTruthy();
    const onShowAgain = jest.fn();
    const r = render(
      <PlanCard meta={{ ...META, status: 'dismissed' }} meetings={[]} onShowAgain={onShowAgain} />,
    );
    fireEvent.press(r.getByTestId('plan-show-again'));
    expect(onShowAgain).toHaveBeenCalled();
  });
});
