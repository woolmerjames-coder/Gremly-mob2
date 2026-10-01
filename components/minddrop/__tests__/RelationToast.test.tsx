/**
 * RelationToast: the toast after a yes says what happened, offers Undo, and
 * can be closed.
 */
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { RelationToastHost } from '../RelationToast';
import { eventBus } from '../../../lib/events/EventBus';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('lucide-react-native', () => {
  const icon = () => null;
  return new Proxy({}, { get: () => icon });
});
jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View },
    useSharedValue: (v: any) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withTiming: (v: any, _c?: any, cb?: (done: boolean) => void) => {
      if (cb) cb(true);
      return v;
    },
    runOnJS: (fn: any) => fn,
    Easing: { in: (f: any) => f, out: (f: any) => f, cubic: (x: number) => x },
  };
});

const payload = (
  undo = jest.fn(async () => {}),
  target: { id: string; type: 'todo' | 'habit' | 'note' } | null = { id: 'n1', type: 'note' },
) => ({
  icon: 'moved' as const,
  title: 'Moved “Bella Vet Appointment” to Thu 1 Oct, 4:00pm',
  detail: 'Drop archived',
  undo,
  target,
});

describe('RelationToast', () => {
  it('shows what happened and puts it back on Undo', async () => {
    const undo = jest.fn(async () => {});
    const { findByText, getByTestId } = render(<RelationToastHost />);
    act(() => eventBus.emit('minddrop:relation_done', payload(undo)));
    await findByText('Moved “Bella Vet Appointment” to Thu 1 Oct, 4:00pm');
    await findByText('Drop archived');
    fireEvent.press(getByTestId('relation-toast-undo'));
    await waitFor(() => expect(undo).toHaveBeenCalledTimes(1));
    await findByText('Put back the way it was');
  });

  it('goes when closed', async () => {
    const { findByText, getByTestId, queryByTestId } = render(<RelationToastHost />);
    act(() => eventBus.emit('minddrop:relation_done', payload()));
    await findByText('Drop archived');
    fireEvent.press(getByTestId('relation-toast-close'));
    await waitFor(() => expect(queryByTestId('relation-toast')).toBeNull());
  });

  it('says so when the Undo did not go through', async () => {
    const undo = jest.fn(async () => {
      throw new Error('offline');
    });
    const { findByText, getByTestId } = render(<RelationToastHost />);
    act(() => eventBus.emit('minddrop:relation_done', payload(undo)));
    fireEvent.press(await findByText('Undo'));
    await findByText('Could not undo that');
    expect(getByTestId('relation-toast')).toBeTruthy();
  });

  it('opens the item when its words are tapped, and Undo stays separate', async () => {
    const undo = jest.fn(async () => {});
    const onOpen = jest.fn();
    const { findByText, getByTestId, queryByTestId } = render(
      <RelationToastHost onOpen={onOpen} />,
    );
    act(() => eventBus.emit('minddrop:relation_done', payload(undo)));
    await findByText('Drop archived');
    fireEvent.press(getByTestId('relation-toast-open'));
    expect(onOpen).toHaveBeenCalledWith({ id: 'n1', type: 'note' });
    expect(undo).not.toHaveBeenCalled();
    await waitFor(() => expect(queryByTestId('relation-toast')).toBeNull());
  });

  it('has nothing to open when the item was removed', async () => {
    const onOpen = jest.fn();
    const { findByText, getByTestId } = render(<RelationToastHost onOpen={onOpen} />);
    act(() => eventBus.emit('minddrop:relation_done', payload(undefined, null)));
    await findByText('Drop archived');
    fireEvent.press(getByTestId('relation-toast-open'));
    expect(onOpen).not.toHaveBeenCalled();
  });
});
