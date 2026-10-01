/**
 * The Gremly home renders the shared box from an element the Drop page hands
 * over after each change, so the value reaches the box a render late.
 *
 * NativeBox stands in for React Native's TextInput, which keeps the last text
 * the native box reported and, after each render, pushes the value prop into
 * the native box when the two differ. A push of older text than was typed is
 * what moved the caret back and lost letters.
 */
import React, { useLayoutEffect, useState } from 'react';
import { TextInput } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { useEchoSafeText } from '../useEchoSafeText';

const mockPushes: string[] = [];

function NativeBox({ value, onChangeText }: { value: string; onChangeText: (t: string) => void }) {
  const [lastNativeText, setLastNativeText] = useState(value);
  useLayoutEffect(() => {
    if (lastNativeText !== value) {
      mockPushes.push(value);
      setLastNativeText(value);
    }
  }, [lastNativeText, value]);
  return (
    <TextInput
      testID="box"
      value={value}
      onChangeText={(text) => {
        setLastNativeText(text);
        onChangeText(text);
      }}
    />
  );
}

function Box({
  value,
  onChangeText,
  echoSafe,
}: {
  value: string;
  onChangeText: (t: string) => void;
  echoSafe: boolean;
}) {
  const [text, handleChange] = useEchoSafeText(value, onChangeText);
  return echoSafe ? (
    <NativeBox value={text} onChangeText={handleChange} />
  ) : (
    <NativeBox value={value} onChangeText={onChangeText} />
  );
}

// memo, like the Drop page: the home re-rendering with the new element does not re-render it
const Page = React.memo(function Page({
  setDock,
  echoSafe,
  clearRef,
}: {
  setDock: (node: React.ReactNode) => void;
  echoSafe: boolean;
  clearRef: { current: (() => void) | null };
}) {
  const [note, setNote] = useState('');
  const element = <Box value={note} onChangeText={setNote} echoSafe={echoSafe} />;
  useLayoutEffect(() => {
    clearRef.current = () => setNote('');
    setDock(element);
  });
  return null;
});

function Home({
  echoSafe,
  clearRef,
}: {
  echoSafe: boolean;
  clearRef: { current: (() => void) | null };
}) {
  const [dock, setDock] = useState<React.ReactNode>(null);
  return (
    <>
      <Page setDock={setDock} echoSafe={echoSafe} clearRef={clearRef} />
      {dock}
    </>
  );
}

function typeInto(text: string) {
  for (let i = 1; i <= text.length; i += 1) {
    act(() => {
      fireEvent.changeText(screen.getByTestId('box'), text.slice(0, i));
    });
  }
}

describe('shared box rendered through the home dock', () => {
  beforeEach(() => {
    mockPushes.length = 0;
  });

  it('never pushes older text into the box while typing', () => {
    render(<Home echoSafe clearRef={{ current: null }} />);
    typeInto('milk');
    expect(mockPushes).toEqual([]);
    expect(screen.getByTestId('box').props.value).toBe('milk');
  });

  it('still clears the box after a send', () => {
    const clearRef = { current: null as (() => void) | null };
    render(<Home echoSafe clearRef={clearRef} />);
    typeInto('milk');
    act(() => clearRef.current?.());
    expect(mockPushes).toEqual(['']);
    expect(screen.getByTestId('box').props.value).toBe('');
  });

  it('the value on its own pushes older text back (what made typing jump)', () => {
    render(<Home echoSafe={false} clearRef={{ current: null }} />);
    typeInto('milk');
    expect(mockPushes).toContain('mil');
  });
});
