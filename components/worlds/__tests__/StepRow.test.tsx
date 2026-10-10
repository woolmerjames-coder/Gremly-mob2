/**
 * A step's day, by the shared rule (final check item 17): the day planned,
 * else its deadline.
 */
import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => () => <View /> });
});

import { StepRow } from '../Steps';

const step = (over: Record<string, unknown>) =>
  ({ id: 's1', name: 'Send the forms', title: 'Send the forms', ...over }) as any;

it('shows a deadline only step by its deadline', () => {
  const r = render(
    <StepRow step={step({ target_date: '2026-10-17' })} today="2026-10-10" onToggle={() => {}} />,
  );
  expect(r.getByText('by Sat 17 Oct')).toBeTruthy();
});

it('shows the day planned before the deadline', () => {
  const r = render(
    <StepRow
      step={step({ due_day: '2026-10-11', target_date: '2026-10-17' })}
      today="2026-10-10"
      onToggle={() => {}}
    />,
  );
  expect(r.getByText('tomorrow')).toBeTruthy();
});

it('says a passed deadline was late', () => {
  const r = render(
    <StepRow step={step({ target_date: '2026-10-03' })} today="2026-10-10" onToggle={() => {}} />,
  );
  expect(r.getByText('was 3 Oct')).toBeTruthy();
});
