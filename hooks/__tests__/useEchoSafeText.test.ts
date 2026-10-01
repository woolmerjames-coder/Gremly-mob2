import { act, renderHook } from '@testing-library/react-native';

import { useEchoSafeText } from '../useEchoSafeText';

type Props = { value: string; onChangeText: (text: string) => void };

function setup(initial = '') {
  const onChangeText = jest.fn();
  const view = renderHook(({ value, onChangeText: report }: Props) => useEchoSafeText(value, report), {
    initialProps: { value: initial, onChangeText },
  });
  const type = (next: string) => act(() => view.result.current[1](next));
  const parent = (value: string) => view.rerender({ value, onChangeText });
  return { view, onChangeText, type, parent };
}

describe('useEchoSafeText', () => {
  it('shows what was typed straight away, before the parent passes it back', () => {
    const { view, onChangeText, type } = setup();
    type('h');
    expect(view.result.current[0]).toBe('h');
    expect(onChangeText).toHaveBeenCalledWith('h');
  });

  it('keeps the latest typing when the parent passes back an earlier value', () => {
    const { view, type, parent } = setup();
    type('h');
    type('he');
    type('hel');
    parent('h');
    expect(view.result.current[0]).toBe('hel');
    parent('he');
    expect(view.result.current[0]).toBe('hel');
    parent('hel');
    expect(view.result.current[0]).toBe('hel');
  });

  it('takes the parent clearing the box after a send', () => {
    const { view, type, parent } = setup();
    type('call mum');
    parent('call mum');
    parent('');
    expect(view.result.current[0]).toBe('');
  });

  it('takes a prompt the parent puts into the box', () => {
    const { view, parent } = setup();
    parent('What is the next step for the garden?');
    expect(view.result.current[0]).toBe('What is the next step for the garden?');
  });

  it('takes the parent changing what was typed', () => {
    const { view, type, parent } = setup('1. milk');
    type('1. milk\n');
    parent('1. milk\n2. ');
    expect(view.result.current[0]).toBe('1. milk\n2. ');
  });

  it('takes the parent clearing the box even before it caught up', () => {
    const { view, type, parent } = setup();
    type('a');
    type('ab');
    parent('a');
    parent('');
    expect(view.result.current[0]).toBe('');
    type('c');
    expect(view.result.current[0]).toBe('c');
  });

  it('reports to the latest handler the parent gave', () => {
    const first = jest.fn();
    const second = jest.fn();
    const view = renderHook(({ value, onChangeText }: Props) => useEchoSafeText(value, onChangeText), {
      initialProps: { value: '', onChangeText: first },
    });
    view.rerender({ value: '', onChangeText: second });
    act(() => view.result.current[1]('x'));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith('x');
  });
});
