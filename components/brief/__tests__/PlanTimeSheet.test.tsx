import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import { PlanTimeSheet } from '../PlanTimeSheet';

describe('changing a time on the plan', () => {
  it('moves an item a quarter of an hour at a time, never before it can start, and changes its length', () => {
    const onSave = jest.fn();
    const r = render(
      <PlanTimeSheet
        visible
        mode="item"
        name="Do taxes"
        start={1020}
        minutes={60}
        earliest={1005}
        onSave={onSave}
        onRemove={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    expect(r.getByText('5pm to 6pm')).toBeTruthy();
    fireEvent.press(r.getByTestId('plan-time-earlier'));
    fireEvent.press(r.getByTestId('plan-time-earlier'));
    expect(r.getByText('4:45pm to 5:45pm')).toBeTruthy();
    fireEvent.press(r.getByTestId('plan-time-later'));
    fireEvent.press(r.getByTestId('plan-time-later'));
    fireEvent.press(r.getByTestId('plan-time-length-90'));
    expect(r.getByText('5:15pm to 6:45pm')).toBeTruthy();
    fireEvent.press(r.getByTestId('plan-time-save'));
    expect(onSave).toHaveBeenCalledWith({ start: 1035, minutes: 90, title: 'Busy' });
  });

  it('takes an item out of the plan', () => {
    const onRemove = jest.fn();
    const r = render(
      <PlanTimeSheet
        visible
        mode="item"
        name="Do taxes"
        start={1020}
        minutes={60}
        earliest={900}
        onSave={jest.fn()}
        onRemove={onRemove}
        onClose={jest.fn()}
      />,
    );
    fireEvent.press(r.getByTestId('plan-time-remove'));
    expect(onRemove).toHaveBeenCalled();
  });

  it('adds busy time with a name, or as Busy', () => {
    const onSave = jest.fn();
    const r = render(
      <PlanTimeSheet
        visible
        mode="busy"
        start={840}
        minutes={60}
        earliest={840}
        onSave={onSave}
        onClose={jest.fn()}
      />,
    );
    expect(r.getByText('Add busy time')).toBeTruthy();
    fireEvent.changeText(r.getByTestId('plan-time-title'), 'Client lunch');
    fireEvent.press(r.getByTestId('plan-time-save'));
    expect(onSave).toHaveBeenCalledWith({ start: 840, minutes: 60, title: 'Client lunch' });
  });
});
